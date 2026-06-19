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
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdminClient } from "@/lib/supabase/admin-client";

/**
 * GET /api/transactions/[id]
 * Fetches a single transaction by ID for the authenticated user
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Transaction ID is required" },
        { status: 400 }
      );
    }

    // Get authenticated user
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch transaction (RLS will ensure user can only see their own)
    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", id)
      .single();

    if (txError) {
      if (txError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Transaction not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Failed to fetch transaction", details: txError.message },
        { status: 500 }
      );
    }

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    // Fetch related status events
    const { data: statusEvents, error: eventsError } = await supabase
      .from("transaction_events")
      .select("*")
      .eq("transaction_id", id)
      .order("created_at", { ascending: true });

    if (eventsError) {
      console.error("Failed to fetch transaction events:", eventsError);
      // Continue without events rather than failing the request
    }

    // Transform the response to match our expected format
    const response = {
      id: transaction.id,
      credits: transaction.credit_amount,
      usdcAmount: transaction.amount_usdc,
      txHash: transaction.tx_hash,
      chainId: parseInt(transaction.chain),
      status: transaction.status,
      createdAt: transaction.created_at,
      updatedAt: transaction.updated_at,
      fee: transaction.fee_usdc,
      walletId: transaction.wallet_id,
      userId: transaction.user_id,
      direction: transaction.direction,
      asset: transaction.asset,
      exchangeRate: transaction.exchange_rate,
      metadata: transaction.metadata,
      idempotencyKey: transaction.idempotency_key,
      statusEvents: statusEvents || [],
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Transaction API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Server error", details: message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/transactions/[id]
 * Updates transaction status when MetaMask confirms the transaction on-chain.
 *
 * This provides faster feedback than waiting for Circle webhooks.
 * Only allows updating to 'completed' status to prevent abuse.
 *
 * Expected JSON body:
 * {
 *   "status": "completed",
 *   "txHash": string,      // Must match the transaction's tx_hash for security
 *   "blockNumber": number, // Optional: block number where tx was mined
 *   "blockHash": string    // Optional: block hash for verification
 * }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { status, txHash, blockNumber, blockHash } = body || {};

    // Validate transaction ID
    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "Invalid transaction ID" },
        { status: 400 }
      );
    }

    // Only allow updating to 'complete' from client
    if (status !== "complete") {
      return NextResponse.json(
        { error: "Only 'complete' status updates are allowed from client" },
        { status: 400 }
      );
    }

    // Require txHash for security - ensures caller actually has transaction details
    if (typeof txHash !== "string" || !txHash.startsWith("0x")) {
      return NextResponse.json(
        { error: "Valid txHash is required" },
        { status: 400 }
      );
    }

    // Get authenticated user
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch the transaction to verify ownership and current status
    const { data: transaction, error: fetchError } = await supabaseAdminClient
      .from("transactions")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !transaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (transaction.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify txHash matches (security check)
    if (transaction.tx_hash !== txHash) {
      return NextResponse.json(
        { error: "Transaction hash mismatch" },
        { status: 400 }
      );
    }

    // Fast path: if already past pending, no work needed (not a race guard — see atomic update below)
    if (transaction.status !== "pending") {
      return NextResponse.json(
        {
          ok: true,
          message: `Transaction already in '${transaction.status}' status, no update needed`,
          transaction: {
            id: transaction.id,
            status: transaction.status,
            updatedAt: transaction.updated_at,
          },
        },
        { status: 200 }
      );
    }

    // Build metadata with blockchain confirmation details
    const metadata = {
      ...(transaction.metadata || {}),
      metamask_confirmation: {
        confirmed_at: new Date().toISOString(),
        block_number: blockNumber,
        block_hash: blockHash,
      },
    };

    // Atomic update: the WHERE status='pending' condition ensures only one concurrent
    // caller can transition this transaction. If the Circle webhook processed it first,
    // maybeSingle() returns null and we skip crediting.
    const { data: updatedTransaction, error: updateError } =
      await supabaseAdminClient
        .from("transactions")
        .update({
          status: "complete",
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "pending")
        .select()
        .maybeSingle();

    if (updateError) {
      console.error("[transactions/PATCH] Update error:", updateError);
      return NextResponse.json(
        { error: "Update failed", details: updateError.message },
        { status: 500 }
      );
    }

    if (!updatedTransaction) {
      // Another path (e.g. Circle webhook) already transitioned this transaction
      return NextResponse.json(
        {
          ok: true,
          message: "Transaction already processed by another path, no update needed",
          transaction: {
            id: transaction.id,
            status: transaction.status,
            updatedAt: transaction.updated_at,
          },
        },
        { status: 200 }
      );
    }

    // This path won the atomic race — safe to increment credits
    if (transaction.direction === "credit" && transaction.credit_amount && transaction.user_id) {
      console.log(`Transaction ${transaction.id} completed. Crediting user ${transaction.user_id} with ${transaction.credit_amount} credits.`);

      const { error: creditsError } = await supabaseAdminClient.rpc("increment_credits", {
        user_id_to_update: transaction.user_id,
        amount_to_add: transaction.credit_amount,
      });

      if (creditsError) {
        console.error(`CRITICAL: Failed to increment credits for user ${transaction.user_id} on transaction ${transaction.id}. Error:`, creditsError);
      } else {
        console.log(`Successfully credited user ${transaction.user_id}.`);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Transaction status updated to complete",
        transaction: {
          id: updatedTransaction.id,
          status: updatedTransaction.status,
          credits: Number(updatedTransaction.credit_amount),
          usdcAmount: Number(updatedTransaction.amount_usdc),
          txHash: updatedTransaction.tx_hash,
          chainId: Number(updatedTransaction.chain),
          updatedAt: updatedTransaction.updated_at,
          metadata: updatedTransaction.metadata,
        },
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[transactions/PATCH] Server error:", e);
    return NextResponse.json(
      { error: "Server error", details: message },
      { status: 500 }
    );
  }
}
