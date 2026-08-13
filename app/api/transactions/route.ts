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
// [SECURITY PATCH]: Import viem utilities for on-chain verification
import { createPublicClient, http, decodeEventLog, erc20Abi, getAddress } from "viem";

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

// Server-authoritative exchange rate
const EXCHANGE_RATE_USDC_PER_CREDIT = 0.01;

// Define authorized networks and their USDC contracts
// Replace these dummy RPC URLs with actual SERVER-ONLY environment variables in production.
const RPC_BY_CHAIN: Record<number, string> = {
  1: process.env.RPC_URL_1 || "https://cloudflare-eth.com",
  137: process.env.RPC_URL_137 || "https://polygon-rpc.com",
  8453: process.env.RPC_URL_8453 || "https://mainnet.base.org",
  11155111: process.env.RPC_URL_11155111 || "https://rpc.sepolia.org", // Sepolia
  84532: process.env.RPC_URL_84532 || "https://sepolia.base.org", // Base Sepolia
};

const USDC_BY_CHAIN: Record<number, `0x${string}`> = {
  1: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  11155111: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Sepolia USDC
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia USDC
};

const json = (data: any, status: number) =>
  new NextResponse(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/**
 * POST /api/transactions
 * Records a (credit) top-up transaction after it has been broadcast on-chain.
 * NOTE: Client-provided credit/usdc amounts are ignored. Issuance is derived server-side
 * based on on-chain verification of the txHash.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    // NOTE: `credits` and `usdcAmount` are intentionally NOT trusted from the client.
    const { txHash, chainId, walletAddress, destinationAddress } = body || {};

    if (
      typeof txHash !== "string" ||
      !txHash.startsWith("0x") ||
      typeof chainId !== "number" ||
      !RPC_BY_CHAIN[chainId] ||
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

    // Fallback admin wallet if not provided by client.
    const EXPECTED_ADMIN_WALLET = process.env.ADMIN_WALLET_ADDRESS;
    const adminStr = destinationAddress || EXPECTED_ADMIN_WALLET;
    
    if (!adminStr || !adminStr.startsWith("0x")) {
      console.error("[transactions] Missing or invalid admin/destination address.");
      return json({ error: "Configuration error" }, 500);
    }

    // [SECURITY PATCH]: 1) Verify the transfer on-chain — do not trust the client's amount.
    const client = createPublicClient({ transport: http(RPC_BY_CHAIN[chainId]) });
    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    
    if (receipt.status !== "success") {
      return json({ error: "Transaction not successful" }, 422);
    }

    const admin = getAddress(adminStr);
    const usdc = getAddress(USDC_BY_CHAIN[chainId]);
    const sender = getAddress(walletAddress);

    // Decode logs to find the exact USDC transfer to our admin wallet
    const transfer = receipt.logs
      .filter((l) => getAddress(l.address) === usdc)
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
          getAddress(e.args.to as string) === admin &&
          getAddress(e.args.from as string) === sender
      );

    if (!transfer) {
      return json({ error: "No matching USDC transfer to app wallet found in transaction" }, 422);
    }

    // [SECURITY PATCH]: 2) Derive amounts server-side from the on-chain value (USDC has 6 decimals).
    const verifiedUsdc = Number(transfer.args.value as bigint) / 1_000_000;
    const credits = Math.floor(verifiedUsdc / EXCHANGE_RATE_USDC_PER_CREDIT);
    
    if (credits <= 0) {
      return json({ error: "Amount below minimum required for credit" }, 422);
    }

    // [SECURITY PATCH]: 3) Insert (idempotent on chain:txHash) with SERVER-COMPUTED credit_amount.
    const idempotencyKey = `${chainId}:${txHash}`;

    const { data: insertedTransaction, error: insertError } =
      await supabaseAdminClient
        .from("transactions")
        .insert({
          transaction_type: "USER",
          user_id: user.id,
          wallet_id: walletAddress,
          destination_address: admin,
          direction: "credit",
          amount_usdc: verifiedUsdc, // server-derived
          fee_usdc: 0,
          credit_amount: credits, // server-derived
          exchange_rate: EXCHANGE_RATE_USDC_PER_CREDIT,
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
      // Check if this is a duplicate transaction (idempotency)
      if (
        insertError.message.includes("idempotency") ||
        insertError.message.includes("duplicate") ||
        insertError.code === "23505"
      ) {
        // Try to find the existing transaction
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

      // [SECURITY PATCH]: Prevent Sensitive error disclosure. Log details server-side only.
      console.error("[transactions] Insert error:", {
        message: insertError.message,
        code: insertError.code,
      });

      return json({ error: "Insert failed" }, 500); // Opaque to client
    }

    return json(
      {
        ok: true,
        transactionId: insertedTransaction.id,
        credits: credits,
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
    // Hide details from client
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

    // Fetch user transactions (filter by USER type)
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

    // Status change events
    const { data: statusEvents, error: seError } = await supabase
      .from("transaction_events")
      .select("*")
      .in("transaction_id", ids)
      .order("created_at", { ascending: true });

    if (seError) {
      console.error("[transactions] GET Events fetch failed:", seError.message);
      return json({ error: "Events fetch failed" }, 500);
    }

    // Optional raw webhook events
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

    // Aggregate events by transaction_id
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