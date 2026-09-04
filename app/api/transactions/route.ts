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
import { supabaseAdminClient } from "@/lib/supabase/admin-client";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

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

/**
 * POST /api/transactions
 * Records a (credit) top-up transaction after it has been broadcast on-chain.
 *
 * Expected JSON body:
 * {
 *   "credits": number,
 *   "usdcAmount": number,          // decimal USDC (e.g. 12.34)
 *   "txHash": string,              // 0x...
 *   "chainId": number,
 *   "walletAddress": string,       // sender wallet 0x...
 *   "destinationAddress": string   // admin wallet recipient 0x... (optional)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { credits, usdcAmount, txHash, chainId, walletAddress, destinationAddress } = body || {};

    if (
      typeof credits !== "number" ||
      credits <= 0 ||
      typeof usdcAmount !== "number" ||
      usdcAmount <= 0 ||
      typeof txHash !== "string" ||
      !txHash.startsWith("0x") ||
      typeof chainId !== "number" ||
      typeof walletAddress !== "string" ||
      !walletAddress.startsWith("0x")
    ) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
      });
    }

    // Get authenticated user via regular server client (anon key + cookies)
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }

    // Build insert row. The RLS policy only allows service_role inserts,
    // so we use the admin (service role) client here.
    // Exchange rate: 1 credit = X USDC (currently 0.01)
    const EXCHANGE_RATE_USDC_PER_CREDIT = 0.01;
    const idempotencyKey = `${chainId}:${txHash}`;

    const { data: insertedTransaction, error: insertError } =
      await supabaseAdminClient
        .from("transactions")
        .insert({
          transaction_type: "USER",
          user_id: user.id,
          wallet_id: walletAddress,
          destination_address: destinationAddress || null, // Capture admin wallet destination
          direction: "credit",
          amount_usdc: usdcAmount, // numeric(18,6)
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
      console.error("[transactions] Insert error:", {
        message: insertError.message,
        code: insertError.code,
        hint: insertError.hint,
        details: insertError.details,
      });
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
          return new Response(
            JSON.stringify({
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
            }),
            { status: 200 }
          );
        }
      }

      const rlsIndicator = /row-level security/i.test(insertError.message)
        ? "RLS_BLOCK"
        : undefined;

      return new Response(
        JSON.stringify({
          error: "Insert failed",
          details: insertError.message,
          code: insertError.code,
          rls: rlsIndicator,
        }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
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
      }),
      { status: 201 }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Server error", details: message }),
      {
        status: 500,
      }
    );
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

    // Fetch user transactions (filter by USER type and authenticated user)
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("transaction_type", "USER")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (txError) {
      return new Response(
        JSON.stringify({ error: "Fetch failed", details: txError.message }),
        {
          status: 500,
        }
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
        { status: 500 }
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
          { status: 500 }
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
      }
    );
  }
}
