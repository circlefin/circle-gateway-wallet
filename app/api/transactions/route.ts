/**
 * Copyright 2025 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminClient } from "@/lib/supabase/admin-client";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import {
  createPublicClient,
  http,
  decodeEventLog,
  erc20Abi,
  getAddress,
  verifyMessage,
  type Hex,
} from "viem";

interface TransactionEvent {
  transaction_id: string;
  old_status: string | null;
  new_status: string;
  created_at: string;
  [k: string]: unknown;
}

interface TransactionWebhookEvent {
  transaction_id: string | null;
  circle_transaction_id?: string | null;
  mapped_status?: string | null;
  received_at: string;
  [k: string]: unknown;
}

// 0.01 USDC per credit = 10,000 micro-USDC (6 decimals) per credit
const MICRO_USDC_PER_CREDIT = 10_000n;

// Supported networks with server-overridable RPC endpoints (including Arc Testnet 5042002)
const RPC_BY_CHAIN: Record<number, string> = {
  1: process.env.RPC_URL_1 || "https://cloudflare-eth.com",
  137: process.env.RPC_URL_137 || "https://polygon-rpc.com",
  8453: process.env.RPC_URL_8453 || "https://mainnet.base.org",
  11155111: process.env.RPC_URL_11155111 || "https://rpc.sepolia.org",
  84532: process.env.RPC_URL_84532 || "https://sepolia.base.org",
  5042002: process.env.RPC_URL_5042002 || "https://rpc.testnet.arc.network",
};

// Authorized USDC contract addresses per supported chain
const USDC_BY_CHAIN: Record<number, `0x${string}`> = {
  1: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  5042002: "0x3600000000000000000000000000000000000000",
};

const json = (data: unknown, status: number) =>
  new NextResponse(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Resolves the authorized admin recipient wallet server-side.
 * Never trusts client input for destination routing.
 */
async function resolveAdminWallet(chainId: number): Promise<`0x${string}` | null> {
  const envAdmin = process.env.ADMIN_WALLET_ADDRESS;
  if (envAdmin && envAdmin.startsWith("0x")) {
    return getAddress(envAdmin);
  }

  const { data: adminRow } = await supabaseAdminClient
    .from("admin_wallets")
    .select("wallet_address")
    .eq("chain_id", chainId)
    .maybeSingle();

  if (adminRow?.wallet_address && adminRow.wallet_address.startsWith("0x")) {
    return getAddress(adminRow.wallet_address);
  }

  return null;
}

/**
 * POST /api/transactions
 * Records a credit top-up transaction strictly derived from on-chain receipts.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    // Note: destinationAddress and credit amounts are intentionally ignored from the payload.
    const { txHash, chainId, walletAddress, claimSignature } = body || {};

    if (
      typeof txHash !== "string" ||
      !txHash.startsWith("0x") ||
      typeof chainId !== "number" ||
      !RPC_BY_CHAIN[chainId] ||
      !USDC_BY_CHAIN[chainId] ||
      typeof walletAddress !== "string" ||
      !walletAddress.startsWith("0x")
    ) {
      return json({ error: "Invalid payload" }, 400);
    }

    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // 1) Bind claiming user to the paying wallet to prevent front-running / tx hijacking
    const sender = getAddress(walletAddress);
    const boundWallet = user.user_metadata?.wallet_address;
    let isPayerVerified = false;

    if (boundWallet && getAddress(boundWallet) === sender) {
      isPayerVerified = true;
    } else if (typeof claimSignature === "string" && claimSignature.startsWith("0x")) {
      const messageToSign = `Authorize credit claim for transaction ${txHash.toLowerCase()} on chain ${chainId}`;
      isPayerVerified = await verifyMessage({
        address: sender,
        message: messageToSign,
        signature: claimSignature as Hex,
      }).catch(() => false);
    }

    if (!isPayerVerified) {
      return json(
        { error: "Payer identity cannot be verified for the authenticated user session" },
        403
      );
    }

    // 2) Resolve the expected admin recipient wallet strictly server-side
    const expectedAdmin = await resolveAdminWallet(chainId);
    if (!expectedAdmin) {
      console.error("[transactions] Missing or invalid server-side admin recipient.");
      return json({ error: "Configuration error" }, 500);
    }

    // 3) Verify transaction receipt on-chain
    const client = createPublicClient({ transport: http(RPC_BY_CHAIN[chainId]) });
    const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });

    if (receipt.status !== "success") {
      return json({ error: "Transaction not successful" }, 422);
    }

    const usdcContract = getAddress(USDC_BY_CHAIN[chainId]);

    // Decode logs to locate matching Transfer(from: sender, to: expectedAdmin)
    const transfer = receipt.logs
      .filter((l) => getAddress(l.address) === usdcContract)
      .map((l) => {
        try {
          return decodeEventLog({ abi: erc20Abi, ...l });
        } catch {
          return null;
        }
      })
      .find(
        (e) =>
          e?.eventName === "Transfer" &&
          getAddress(e.args.to as string) === expectedAdmin &&
          getAddress(e.args.from as string) === sender
      );

    if (!transfer) {
      return json(
        { error: "No matching USDC transfer to authorized admin wallet found in transaction" },
        422
      );
    }

    // 4) Derive credits using exact BigInt integer math
    const microUsdcValue = transfer.args.value as bigint;
    const creditsBigInt = microUsdcValue / MICRO_USDC_PER_CREDIT;

    if (creditsBigInt <= 0n) {
      return json({ error: "Amount below minimum required for credit" }, 422);
    }

    const credits = Number(creditsBigInt);
    // Integer-division formatting for decimal DB presentation: whole and fraction parts
    const wholeUsdc = microUsdcValue / 1_000_000n;
    const fractionalPart = (microUsdcValue % 1_000_000n).toString().padStart(6, "0");
    const verifiedUsdcDecimal = Number(`${wholeUsdc}.${fractionalPart}`);

    // 5) Insert idempotent transaction record
    const idempotencyKey = `${chainId}:${txHash.toLowerCase()}`;

    const { data: insertedTransaction, error: insertError } =
      await supabaseAdminClient
        .from("transactions")
        .insert({
          transaction_type: "USER",
          user_id: user.id,
          wallet_id: sender,
          destination_address: expectedAdmin,
          direction: "credit",
          amount_usdc: verifiedUsdcDecimal,
          fee_usdc: 0,
          credit_amount: credits,
          exchange_rate: 0.01,
          chain: String(chainId),
          asset: "USDC",
          tx_hash: txHash,
          status: "pending",
          metadata: {},
          idempotency_key: idempotencyKey,
        })
        .select()
        .single();

    if (insertError) {
      if (
        insertError.message.includes("idempotency") ||
        insertError.message.includes("duplicate") ||
        insertError.code === "23505"
      ) {
        const { data: existingTx } = await supabaseAdminClient
          .from("transactions")
          .select("*")
          .eq("idempotency_key", idempotencyKey)
          .single();

        if (existingTx) {
          return json(
            {
              ok: true,
              transactionId: existingTx.id,
              message: "Transaction already exists",
              transaction: {
                id: existingTx.id,
                credits: Number(existingTx.credit_amount),
                usdcAmount: Number(existingTx.amount_usdc),
                txHash: existingTx.tx_hash,
                chainId: Number(existingTx.chain),
                status: existingTx.status,
                createdAt: existingTx.created_at,
                walletAddress: existingTx.wallet_id,
              },
            },
            200
          );
        }
      }

      console.error("[transactions] Insert error:", {
        message: insertError.message,
        code: insertError.code,
      });

      return json({ error: "Insert failed" }, 500);
    }

    return json(
      {
        ok: true,
        transactionId: insertedTransaction.id,
        credits,
        message: "Transaction recorded successfully",
        transaction: {
          id: insertedTransaction.id,
          credits: Number(insertedTransaction.credit_amount),
          usdcAmount: Number(insertedTransaction.amount_usdc),
          txHash: insertedTransaction.tx_hash,
          chainId: Number(insertedTransaction.chain),
          status: insertedTransaction.status,
          createdAt: insertedTransaction.created_at,
          walletAddress: insertedTransaction.wallet_id,
        },
      },
      201
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[transactions] Server error:", message);
    return json({ error: "Server error" }, 500);
  }
}

export async function GET(req: NextRequest) {
  try {
    const includeWebhook = req.nextUrl.searchParams.get("includeWebhook") === "1";
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("transaction_type", "USER")
      .order("created_at", { ascending: false });

    if (txError) {
      console.error("[transactions] GET Fetch failed:", txError.message);
      return json({ error: "Fetch failed" }, 500);
    }

    if (!transactions || transactions.length === 0) {
      return json({ data: [] }, 200);
    }

    const ids = transactions.map((t) => t.id);

    const { data: statusEvents, error: seError } = await supabase
      .from("transaction_events")
      .select("*")
      .in("transaction_id", ids)
      .order("created_at", { ascending: true });

    if (seError) {
      console.error("[transactions] GET Events fetch failed:", seError.message);
      return json({ error: "Events fetch failed" }, 500);
    }

    let webhookEvents: TransactionWebhookEvent[] | null = null;
    if (includeWebhook) {
      const { data: weData, error: weError } = await supabase
        .from("transaction_webhook_events")
        .select("*")
        .in("transaction_id", ids)
        .order("received_at", { ascending: true });

      if (weError) {
        console.error("[transactions] GET Webhook events fetch failed:", weError.message);
        return json({ error: "Webhook events fetch failed" }, 500);
      }
      webhookEvents = weData;
    }

    const statusByTx = new Map<string, TransactionEvent[]>();
    (statusEvents || []).forEach((e) => {
      const arr = statusByTx.get(e.transaction_id) || [];
      arr.push(e);
      statusByTx.set(e.transaction_id, arr);
    });

    const webhookByTx = new Map<string, TransactionWebhookEvent[]>();
    (webhookEvents || []).forEach((e) => {
      if (!e.transaction_id) return;
      const arr = webhookByTx.get(e.transaction_id) || [];
      arr.push(e);
      webhookByTx.set(e.transaction_id, arr);
    });

    const enriched = transactions.map((t) => ({
      ...t,
      status_events: statusByTx.get(t.id) || [],
      webhook_events: includeWebhook ? webhookByTx.get(t.id) || [] : undefined,
    }));

    return json({ data: enriched }, 200);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[transactions] GET Server error:", message);
    return json({ error: "Server error" }, 500);
  }
}
