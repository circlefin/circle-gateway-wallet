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

import { NextRequest } from "next/server";
import {
  createPublicClient,
  decodeEventLog,
  erc20Abi,
  getAddress,
  http,
  isAddress,
  isHash,
  recoverMessageAddress,
  type Hash,
  type Hex,
} from "viem";
import { supabaseAdminClient } from "@/lib/supabase/admin-client";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { getUsdcAddress } from "@/lib/wagmi/usdcAddresses";
import {
  buildTopupClaimMessage,
  USDC_MICRO_PER_CREDIT,
} from "@/lib/credits/topup-claim";

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

/** Exchange rate stored on the row; 1 USDC = 1 credit (see USDC_MICRO_PER_CREDIT). */
const EXCHANGE_RATE_USDC_PER_CREDIT = 1;

const RPC_BY_CHAIN: Record<number, string | undefined> = {
  1: process.env.RPC_URL_1,
  137: process.env.RPC_URL_137,
  8453: process.env.RPC_URL_8453,
  42161: process.env.RPC_URL_42161,
  10: process.env.RPC_URL_10,
  11155111: process.env.RPC_URL_11155111,
  84532: process.env.RPC_URL_84532,
  80002: process.env.RPC_URL_80002,
  421614: process.env.RPC_URL_421614,
  11155420: process.env.RPC_URL_11155420,
  // Arc Testnet — primary demo chain in this sample app.
  5042002: process.env.RPC_URL_5042002 || "https://rpc.testnet.arc.network",
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function resolveAdminWalletAddress(): Promise<`0x${string}` | null> {
  const fromEnv = process.env.ADMIN_WALLET_ADDRESS;
  if (fromEnv && isAddress(fromEnv)) {
    return getAddress(fromEnv);
  }

  const { data, error } = await supabaseAdminClient
    .from("admin_wallets")
    .select("address")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.address || !isAddress(data.address)) {
    return null;
  }
  return getAddress(data.address);
}

/**
 * POST /api/transactions
 * Records a credit top-up after on-chain USDC settlement.
 *
 * Client-supplied `credits` / `usdcAmount` / `destinationAddress` are ignored.
 * Amounts come from the Transfer log; the recipient is the server-side admin
 * wallet; the payer must sign `buildTopupClaimMessage` so another session
 * cannot claim the payment.
 *
 * Body:
 * {
 *   "txHash": "0x...",
 *   "chainId": number,
 *   "claimSignature": "0x..."  // personal_sign of buildTopupClaimMessage
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { txHash, chainId, claimSignature } = body || {};

    if (
      typeof txHash !== "string" ||
      !isHash(txHash) ||
      typeof chainId !== "number" ||
      typeof claimSignature !== "string" ||
      !claimSignature.startsWith("0x")
    ) {
      return json({ error: "Invalid payload" }, 400);
    }

    const rpcUrl = RPC_BY_CHAIN[chainId];
    const usdcAddress = getUsdcAddress(chainId);
    if (!rpcUrl || !usdcAddress) {
      return json({ error: "Unsupported chain" }, 400);
    }

    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const admin = await resolveAdminWalletAddress();
    if (!admin) {
      console.error("[transactions] No admin destination wallet configured");
      return json({ error: "Configuration error" }, 500);
    }

    const claimMessage = buildTopupClaimMessage(chainId, txHash);
    let claimant: `0x${string}`;
    try {
      claimant = await recoverMessageAddress({
        message: claimMessage,
        signature: claimSignature as Hex,
      });
    } catch {
      return json({ error: "Invalid claim signature" }, 401);
    }

    const client = createPublicClient({ transport: http(rpcUrl) });

    let receipt;
    try {
      receipt = await client.waitForTransactionReceipt({
        hash: txHash as Hash,
        timeout: 60_000,
      });
    } catch (err) {
      console.error("[transactions] Receipt wait failed:", err);
      return json(
        { error: "Transaction receipt not available yet; retry shortly" },
        408,
      );
    }

    if (receipt.status !== "success") {
      return json({ error: "Transaction not successful" }, 422);
    }

    const usdc = getAddress(usdcAddress);
    const transfer = receipt.logs
      .filter((log) => {
        try {
          return getAddress(log.address) === usdc;
        } catch {
          return false;
        }
      })
      .map((log) => {
        try {
          return decodeEventLog({
            abi: erc20Abi,
            data: log.data,
            topics: log.topics,
          });
        } catch {
          return null;
        }
      })
      .find((event) => {
        if (!event || event.eventName !== "Transfer") return false;
        try {
          const to = getAddress(event.args.to as string);
          const from = getAddress(event.args.from as string);
          return to === admin && from === claimant;
        } catch {
          return false;
        }
      });

    if (!transfer || transfer.eventName !== "Transfer") {
      return json(
        {
          error:
            "No matching USDC transfer from the claiming wallet to the app wallet",
        },
        422,
      );
    }

    const value = transfer.args.value as bigint;
    if (value < USDC_MICRO_PER_CREDIT) {
      return json({ error: "Amount below minimum required for credit" }, 422);
    }

    const credits = Number(value / USDC_MICRO_PER_CREDIT);
    const verifiedUsdc =
      Number(value / 1_000_000n) + Number(value % 1_000_000n) / 1_000_000;

    const idempotencyKey = `${chainId}:${txHash.toLowerCase()}`;

    const { data: insertedTransaction, error: insertError } =
      await supabaseAdminClient
        .from("transactions")
        .insert({
          transaction_type: "USER",
          user_id: user.id,
          wallet_id: claimant,
          destination_address: admin,
          direction: "credit",
          amount_usdc: verifiedUsdc,
          fee_usdc: 0,
          credit_amount: credits,
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
          // Only the original claimant's session may read back the row as ok.
          if (existingTx.user_id !== user.id) {
            return json({ error: "Transaction already claimed" }, 409);
          }
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
            200,
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
      201,
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[transactions] Server error:", message);
    return json({ error: "Server error" }, 500);
  }
}

export async function GET(req: NextRequest) {
  try {
    const includeWebhook =
      req.nextUrl.searchParams.get("includeWebhook") === "1";
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }

    // Fetch user transactions (filter by USER type)
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("transaction_type", "USER")
      .order("created_at", { ascending: false });

    if (txError) {
      return new Response(
        JSON.stringify({ error: "Fetch failed", details: txError.message }),
        {
          status: 500,
        },
      );
    }

    if (!transactions || transactions.length === 0) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }

    const ids = transactions.map((t) => t.id);

    // Status change events
    const { data: statusEvents, error: seError } = await supabase
      .from("transaction_events")
      .select("*")
      .in("transaction_id", ids)
      .order("created_at", { ascending: true });

    if (seError) {
      return new Response(
        JSON.stringify({
          error: "Events fetch failed",
          details: seError.message,
        }),
        { status: 500 },
      );
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
        return new Response(
          JSON.stringify({
            error: "Webhook events fetch failed",
            details: weError.message,
          }),
          { status: 500 },
        );
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

    return new Response(JSON.stringify({ data: enriched }), { status: 200 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Server error", details: message }),
      {
        status: 500,
      },
    );
  }
}
