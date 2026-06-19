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
import { checkSignature } from "./verify-signature";

// This interface is a simplified version of the relayer's payload.
interface RelayerNotificationPayload {
  payload_type: "transaction";
  id: string; // This is the relayer's transaction ID
  status: "sent" | "confirmed" | "failed";
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = Buffer.from(await req.arrayBuffer());
    const sigHeader = req.headers.get("x-signature") ?? "";
    const signingKey = process.env.WEBHOOK_SIGNING_KEY ?? "";

    if (!checkSignature(rawBody, signingKey, sigHeader)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody.toString("utf8"));
    const notification = body.payload as RelayerNotificationPayload;

    console.log("Received notification from OpenZeppelin Relayer:", notification);

    // We only care about the final states: 'confirmed' or 'failed'.
    if (notification.status !== "confirmed" && notification.status !== "failed") {
      return NextResponse.json({ received: true });
    }

    // Find the CCTP_MINT transaction that corresponds to this relayer transaction ID.
    const { data: transaction, error } = await supabaseAdminClient
      .from("transactions")
      .select("id, status")
      .eq("circle_transaction_id", notification.id)
      .eq("transaction_type", "CCTP_MINT")
      .single();

    if (error || !transaction) {
      console.warn(`No matching CCTP_MINT transaction found for relayer txId: ${notification.id}`);
      return NextResponse.json({ received: true });
    }

    // Determine the new status (lowercase to match transaction_status enum)
    const newStatus = notification.status === "confirmed" ? "complete" : "failed";

    // Idempotency check: If the status is already correct, do nothing.
    if (transaction.status === newStatus) {
      return NextResponse.json({ received: true });
    }

    // Update the transaction status to complete or failed.
    const { error: updateError } = await supabaseAdminClient
      .from("transactions")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", transaction.id);

    if (updateError) {
      throw new Error(`Failed to update admin transaction ${transaction.id}: ${updateError.message}`);
    }

    console.log(`[CCTP] Finalized transaction ${transaction.id} with status ${newStatus}`);

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error("Failed to process OpenZeppelin webhook:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}