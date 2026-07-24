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

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminClient } from "@/lib/supabase/admin-client";

type CircleNotification = {
  id?: string;
  state?: string;
  txHash?: string;
  [k: string]: unknown;
};

interface CircleWebhookPayload {
  subscriptionId: string;
  notificationId: string;
  notificationType: string;
  notification: CircleNotification;
  timestamp: string;
  version: number;
  [k: string]: unknown;
}

function mapCircleStateToStatus(
  circleState: string | undefined
): "pending" | "confirmed" | "failed" | "complete" | null {
  if (!circleState) return null;
  const stateMap: Record<string, "pending" | "confirmed" | "failed" | "complete"> = {
    QUEUED: "pending",
    SENT: "pending",
    PENDING: "pending",
    CONFIRMED: "confirmed",
    COMPLETE: "complete",
    FAILED: "failed",
  };
  return stateMap[circleState] || null;
}

function generateDedupeHash(bodyString: string): string {
  return crypto.createHash("sha256").update(bodyString).digest("hex");
}

async function logWebhookEvent(
  bodyString: string,
  rawPayload: CircleWebhookPayload,
  circleEventId: string | undefined,
  circleTransactionId: string | undefined,
  mappedStatus: string | null,
  signatureValid: boolean
): Promise<void> {
  const dedupeHash = generateDedupeHash(bodyString);
  try {
    const { error } = await supabaseAdminClient
      .from("transaction_webhook_events")
      .insert({
        circle_event_id: circleEventId || null,
        circle_transaction_id: circleTransactionId || null,
        mapped_status: mappedStatus || null,
        raw_payload: rawPayload,
        signature_valid: signatureValid,
        dedupe_hash: dedupeHash,
      });

    if (error) {
      if (error.code === "23505") {
        console.log(`Webhook event already processed (dedupe hash: ${dedupeHash.substring(0, 8)})`);
      } else {
        console.error("Failed to log webhook event:", error);
      }
    }
  } catch (e) {
    console.error("Error logging webhook event:", e);
  }
}

/**
 * Updates USER credit-purchase transactions when Circle confirms the on-chain transfer.
 * ADMIN and bridge transactions are handled synchronously by App Kit and logged as
 * complete at submission time, so they do not need webhook updates here.
 */
async function updateUserTransactionStatus(notification: CircleNotification) {
  const mappedStatus = mapCircleStateToStatus(notification.state);
  if (!mappedStatus) return;

  const { data: creditTransactions, error: creditTxError } =
    await supabaseAdminClient
      .from("transactions")
      .select("id, status, user_id, credit_amount")
      .eq("tx_hash", notification.txHash)
      .eq("transaction_type", "USER")
      .eq("direction", "credit");

  if (creditTxError) {
    console.error("Credit transaction lookup error:", creditTxError);
    return;
  }

  const statusPriority: Record<string, number> = {
    pending: 1,
    confirmed: 2,
    complete: 3,
    failed: 0,
  };

  for (const transaction of creditTransactions || []) {
    if (transaction.status === mappedStatus) continue;

    const currentPriority = statusPriority[transaction.status] || 0;
    const newPriority = statusPriority[mappedStatus] || 0;

    if (mappedStatus !== "failed" && newPriority <= currentPriority) {
      console.log(
        `Skipping status downgrade for ${transaction.id}: '${transaction.status}' -> '${mappedStatus}'`
      );
      continue;
    }

    const isSuccessfulUpdate =
      mappedStatus === "confirmed" || mappedStatus === "complete";
    const wasAlreadyProcessed =
      transaction.status === "confirmed" || transaction.status === "complete";

    if (isSuccessfulUpdate && !wasAlreadyProcessed) {
      console.log(
        `Transaction ${transaction.id} confirmed. Crediting user ${transaction.user_id} with ${transaction.credit_amount} credits.`
      );

      const { error: creditsError } = await supabaseAdminClient.rpc(
        "increment_credits",
        {
          user_id_to_update: transaction.user_id,
          amount_to_add: transaction.credit_amount,
        }
      );

      if (creditsError) {
        console.error(
          `CRITICAL: Failed to increment credits for user ${transaction.user_id} on transaction ${transaction.id}. Error:`,
          creditsError
        );
      } else {
        console.log(`Successfully credited user ${transaction.user_id}.`);
      }
    }

    const { error: updateError } = await supabaseAdminClient
      .from("transactions")
      .update({ status: mappedStatus, updated_at: new Date().toISOString() })
      .eq("id", transaction.id);

    if (updateError) {
      console.error(
        `Failed updating transaction status for ${transaction.id}:`,
        updateError
      );
    } else {
      console.log(
        `Updated transaction ${transaction.id} status from '${transaction.status}' to '${mappedStatus}'`
      );
    }
  }
}

async function verifyCircleSignature(
  bodyString: string,
  signature: string,
  keyId: string
): Promise<boolean> {
  try {
    const publicKey = await getCirclePublicKey(keyId);
    const verifier = crypto.createVerify("SHA256");
    verifier.update(bodyString);
    verifier.end();
    const signatureUint8Array = Uint8Array.from(
      Buffer.from(signature, "base64")
    );
    return verifier.verify(publicKey, signatureUint8Array);
  } catch (e) {
    console.error("Signature verification failure:", e);
    return false;
  }
}

async function getCirclePublicKey(keyId: string) {
  if (!process.env.CIRCLE_API_KEY) {
    throw new Error("Circle API key is not set");
  }
  const response = await fetch(
    `https://api.circle.com/v2/notifications/publicKey/${keyId}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
      },
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch public key: ${response.statusText}`);
  }
  const data = await response.json();
  const rawPublicKey = data?.data?.publicKey;
  if (typeof rawPublicKey !== "string") {
    throw new Error("Invalid public key format");
  }
  return [
    "-----BEGIN PUBLIC KEY-----",
    ...(rawPublicKey.match(/.{1,64}/g) ?? []),
    "-----END PUBLIC KEY-----",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("x-circle-signature");
    const keyId = req.headers.get("x-circle-key-id");

    if (!signature || !keyId) {
      return NextResponse.json(
        { error: "Missing signature or keyId in headers" },
        { status: 400 }
      );
    }

    const rawBody = await req.text();
    let body: CircleWebhookPayload;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const isVerified = await verifyCircleSignature(rawBody, signature, keyId);
    if (!isVerified) {
      console.warn("Circle webhook: signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    console.log("Circle webhook notification:", body);

    if (!body.subscriptionId || !body.notificationId || !body.notificationType) {
      return NextResponse.json(
        { error: "Malformed webhook payload - missing required fields" },
        { status: 422 }
      );
    }

    const notification = body.notification;
    if (!notification) {
      return NextResponse.json(
        { error: "Malformed notification payload" },
        { status: 422 }
      );
    }

    const mappedStatus = mapCircleStateToStatus(notification.state);
    await logWebhookEvent(
      rawBody,
      body,
      body.notificationId,
      notification.id,
      mappedStatus,
      isVerified
    );

    if (body.notificationType === "webhooks.test") {
      console.log("Received test webhook notification - validation successful");
      return NextResponse.json({ received: true }, { status: 200 });
    }

    await updateUserTransactionStatus(notification);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to process Circle webhook:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to process notification: ${message}` },
      { status: 500 }
    );
  }
}

export async function HEAD() {
  return NextResponse.json({}, { status: 200 });
}
