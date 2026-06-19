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
import { circleDeveloperSdk } from "@/lib/circle/developer-controlled-wallets-client";
import { convertToSmallestUnit } from "@/lib/utils/convert-to-smallest-unit";
import {
  CHAIN_IDS_TO_MESSAGE_TRANSMITTER,
  CHAIN_IDS_TO_TOKEN_MESSENGER,
  CHAIN_IDS_TO_USDC_ADDRESSES,
  DESTINATION_DOMAINS,
  SupportedChainId,
} from "@/lib/chains";

type CircleNotification = {
  id?: string;
  state?: string;
  walletId?: string;
  contractAddress?: string;
  blockchain?: string;
  amounts?: string[];
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

async function updateTransactionStatus(notification: CircleNotification) {
  const mappedStatus = mapCircleStateToStatus(notification.state);
  if (!mappedStatus) return;

  // Find the corresponding transaction in our database using the transaction hash.
  const { data: creditTransactions, error: creditTxError } = await supabaseAdminClient
    .from("transactions")
    // Select the fields needed to update credits
    .select("id, status, user_id, credit_amount")
    .eq("tx_hash", notification.txHash)
    .eq("transaction_type", "USER")
    .eq("direction", "credit");

  if (creditTxError) {
    console.error("Credit transaction lookup error:", creditTxError);
    return;
  }

  for (const transaction of creditTransactions || []) {
    // Skip if the status is already the one we want to set.
    if (transaction.status === mappedStatus) continue;

    const currentStatus = transaction.status;

    // Don't downgrade status: if already confirmed it ('complete' or 'confirmed'),
    // don't revert to 'pending' when Circle sends a pending notification
    const statusPriority: Record<string, number> = {
      pending: 1,
      confirmed: 2,
      complete: 3,
      failed: 0, // Failed can override any status
    };

    const currentPriority = statusPriority[currentStatus] || 0;
    const newPriority = statusPriority[mappedStatus] || 0;

    // Only update if new status has higher priority (or it's a failure)
    if (mappedStatus !== 'failed' && newPriority <= currentPriority) {
      console.log(`Skipping status update for ${transaction.id}: '${currentStatus}' (priority ${currentPriority}) -> '${mappedStatus}' (priority ${newPriority})`);
      continue;
    }

    const isSuccessfulUpdate = (mappedStatus === 'confirmed' || mappedStatus === 'complete');
    const wasAlreadyProcessed = (currentStatus === 'confirmed' || currentStatus === 'complete');

    if (isSuccessfulUpdate && !wasAlreadyProcessed) {
      // Atomic update: the WHERE status='pending' condition ensures only one concurrent
      // caller can transition this transaction. If the PATCH handler processed it first,
      // maybeSingle() returns null and we skip crediting.
      const { data: atomicResult, error: atomicError } = await supabaseAdminClient
        .from("transactions")
        .update({
          status: mappedStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", transaction.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (atomicError) {
        console.error(`Failed updating transaction status for ${transaction.id}:`, atomicError);
        continue;
      }

      if (!atomicResult) {
        // Another path (e.g. PATCH handler) already transitioned this transaction
        console.log(`Transaction ${transaction.id} already processed by another path, skipping credit`);
        continue;
      }

      // This path won the atomic race — safe to increment credits
      console.log(`Transaction ${transaction.id} confirmed. Crediting user ${transaction.user_id} with ${transaction.credit_amount} credits.`);

      const { error: creditsError } = await supabaseAdminClient.rpc("increment_credits", {
        user_id_to_update: transaction.user_id,
        amount_to_add: transaction.credit_amount,
      });

      if (creditsError) {
        console.error(`CRITICAL: Failed to increment credits for user ${transaction.user_id} on transaction ${transaction.id}. Error:`, creditsError);
      } else {
        console.log(`Successfully credited user ${transaction.user_id}.`);
      }

      console.log(`Updated transaction ${transaction.id} status from '${currentStatus}' to '${mappedStatus}'`);
    } else {
      // Non-credit status update (e.g. confirmed→complete, any→failed): no race risk
      const { error: updateError } = await supabaseAdminClient
        .from("transactions")
        .update({
          status: mappedStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", transaction.id);

      if (updateError) {
        console.error(`Failed updating transaction status for ${transaction.id}:`, updateError);
      } else {
        console.log(`Updated transaction ${transaction.id} status from '${currentStatus}' to '${mappedStatus}'`);
      }
    }
  }
}

async function updateAdminTransactionStatus(
  transactionId: string,
  notification: CircleNotification
) {
  if (notification.state !== "CONFIRMED" && notification.state !== "COMPLETE") {
    return;
  }

  // Prepare update object - include tx_hash if available
  const updateData: { status: string; updated_at: string; tx_hash?: string } = {
    status: notification.state.toLowerCase(),
    updated_at: new Date().toISOString()
  };

  if (notification.txHash) {
    updateData.tx_hash = notification.txHash;
  }

  const { data: transaction, error } = await supabaseAdminClient
    .from("transactions")
    .update(updateData)
    .eq("circle_transaction_id", transactionId)
    .neq("transaction_type", "USER")  // Only update admin transactions
    .select(`*, admin_wallets!source_wallet_id(circle_wallet_id, chain)`)
    .single();

  if (error) {
    return;
  }

  const adminWallet = Array.isArray(transaction.admin_wallets)
    ? transaction.admin_wallets[0]
    : transaction.admin_wallets;

  console.log(`Updated admin transaction ${transactionId} (type: ${transaction.transaction_type}) status to ${notification.state}`);

  if (notification.state === "COMPLETE" && notification.blockchain !== "ARC-TESTNET") {
    return;
  }

  // Only proceed with CCTP logic if the destination is an internal admin wallet
  const { data: destinationWallet, error: destinationWalletError } = await supabaseAdminClient
    .from("admin_wallets")
    .select("id, chain, address, circle_wallet_id")
    .eq("address", transaction.destination_address)
    .single();

  if (destinationWalletError || !destinationWallet) {
    // This is expected for external wallet transfers - not an error
    console.log(`External wallet transfer detected (destination: ${transaction.destination_address}). No CCTP bridging needed.`);
    return;
  }

  if (transaction.transaction_type === "CCTP_APPROVAL") {
    console.log("[CCTP] Approval confirmed. Now, burning USDC from source wallet...");

    const sourceChainKey = adminWallet.chain.replace(/-/g, '_');
    const sourceChainId = SupportedChainId[sourceChainKey as keyof typeof SupportedChainId];
    const destinationChainKey = destinationWallet.chain.replace(/-/g, '_');
    const destinationChainId = SupportedChainId[destinationChainKey as keyof typeof SupportedChainId];

    if (sourceChainId === undefined || destinationChainId === undefined) {
      throw new Error(`Unsupported chain. Source: ${adminWallet.chain}, Destination: ${destinationWallet.chain}`);
    }

    const tokenMessengerAddress = CHAIN_IDS_TO_TOKEN_MESSENGER[sourceChainId];
    const usdcContractAddress = CHAIN_IDS_TO_USDC_ADDRESSES[sourceChainId];
    const destinationDomain = DESTINATION_DOMAINS[destinationChainId];

    if (!tokenMessengerAddress || !usdcContractAddress || destinationDomain === undefined) {
      throw new Error("Could not find required CCTP configuration for the given chains.");
    }

    const finalDestinationAddress = destinationWallet.address;
    const mintRecipientBytes32 = `0x${'0'.repeat(24)}${finalDestinationAddress.substring(2)}`;
    const hookDataBytes32 = `0x${'0'.repeat(64)}`;
    const amount = BigInt(convertToSmallestUnit(transaction.amount_usdc.toString()));
    const maxFee = amount > 1n ? amount - 1n : 0n;

    const burnAbiParameters = [
      amount.toString(),
      destinationDomain.toString(),
      mintRecipientBytes32,
      usdcContractAddress,
      hookDataBytes32,
      maxFee.toString(),
      "1000"
    ];

    const burnResponse = await circleDeveloperSdk.createContractExecutionTransaction({
      walletId: adminWallet.circle_wallet_id,
      abiFunctionSignature: "depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)",
      abiParameters: burnAbiParameters,
      contractAddress: tokenMessengerAddress,
      fee: { type: "level", config: { feeLevel: "MEDIUM" } }
    });

    if (!burnResponse.data?.id) {
      throw new Error("Failed to initiate burn step of CCTP transfer.");
    }

    await supabaseAdminClient.from("transactions").insert({
      transaction_type: "CCTP_BURN",
      circle_transaction_id: burnResponse.data.id,
      source_wallet_id: transaction.source_wallet_id,
      destination_address: transaction.destination_address,
      amount_usdc: transaction.amount_usdc,
      asset: "USDC",
      chain: destinationWallet.chain,
      wallet_id: transaction.destination_address,
      idempotency_key: `admin:${burnResponse.data.id}`,
      status: "pending"
    });
    return;
  }

  if (transaction.transaction_type === "CCTP_BURN") {
    console.log("[CCTP] Burn confirmed. Fetching attestation via v2 API...");

    const transactionResponse = await circleDeveloperSdk.getTransaction({ id: transaction.circle_transaction_id });
    if (!transactionResponse.data?.transaction?.txHash) {
      throw new Error("Transaction hash is missing from the response.");
    }
    const transactionHash = transactionResponse.data.transaction.txHash as `0x${string}`;

    const sourceChainKey = transactionResponse.data.transaction.blockchain.replace(/_/g, '-');
    const sourceChainEnumKey = sourceChainKey.replace(/-/g, '_');
    const sourceChainId = SupportedChainId[sourceChainEnumKey as keyof typeof SupportedChainId];
    const sourceDomain = DESTINATION_DOMAINS[sourceChainId];

    if (sourceDomain === undefined) {
      throw new Error(`Unknown source chain for CCTP v2: ${sourceChainKey}`);
    }

    const irisUrl = `https://iris-api-sandbox.circle.com/v2/messages/${sourceDomain}?transactionHash=${transactionHash}`;
    let irisMessageObject: Record<string, `0x${string}`> | null = null;

    while (!irisMessageObject) {
      try {
        const response = await fetch(irisUrl);
        if (response.status === 404) {
          console.log("[CCTP] Waiting for message to be indexed by Iris...");
        } else if (response.ok) {
          const responseData = await response.json();
          if (responseData.messages && responseData.messages[0]?.status === 'complete') {
            irisMessageObject = responseData.messages[0];
            break;
          } else {
            console.log("[CCTP] Attestation is not yet complete. Waiting...");
          }
        } else {
          console.error(`[CCTP] Iris API returned an error: ${response.status}`);
        }
      } catch (error) {
        console.error("[CCTP] Error fetching from Iris API:", error);
      }
      await new Promise((r) => setTimeout(r, 5000));
    }

    if (!irisMessageObject) {
      throw new Error("Failed to retrieve a complete attestation from the Iris API.");
    }

    console.log("[CCTP] Attestation received successfully.");
    const messageBytes = irisMessageObject.message;
    const attestation = irisMessageObject.attestation;

    console.log("[CCTP] Relaying mint transaction via Circle Bridge Kit...");

    const destinationChainKey = destinationWallet.chain.replace(/-/g, '_');
    const destinationChainId = SupportedChainId[destinationChainKey as keyof typeof SupportedChainId];
    const messageTransmitterAddress = CHAIN_IDS_TO_MESSAGE_TRANSMITTER[destinationChainId];

    if (!messageTransmitterAddress) {
      throw new Error(`Could not find MessageTransmitter address for chain: ${destinationWallet.chain}`);
    }

    // Use Circle Wallets (Developer-Controlled Wallets) to execute receiveMessage on destination.
    // This follows the Circle Wallets adapter setup for Bridge Kit: execute via Circle Wallets API.
    const abiFunctionSignature = "receiveMessage(bytes,bytes)";
    const abiParameters = [messageBytes, attestation];

    // We execute on the destination admin wallet (internal wallet check already passed).
    const execResp = await circleDeveloperSdk.createContractExecutionTransaction({
      walletId: destinationWallet.circle_wallet_id ?? adminWallet.circle_wallet_id,
      contractAddress: messageTransmitterAddress,
      abiFunctionSignature,
      abiParameters,
      fee: { type: "level", config: { feeLevel: "MEDIUM" } }
    });

    if (!execResp.data?.id) {
      throw new Error("Failed to relay mint via Circle Wallets.");
    }

    const txHash = execResp.data.id;

    console.log(`[CCTP] Mint transaction submitted via Bridge Kit. txHash: ${txHash}`);

    // Dedupe: avoid creating multiple CCTP_MINT rows for the same burn or Circle tx.
    const { data: existingMintByTxId } = await supabaseAdminClient
      .from("transactions")
      .select("id")
      .eq("transaction_type", "CCTP_MINT")
      .eq("circle_transaction_id", txHash)
      .maybeSingle();

    const { data: existingMintByBurnMeta } = await supabaseAdminClient
      .from("transactions")
      .select("id")
      .eq("transaction_type", "CCTP_MINT")
      .contains("metadata", { cctp_burn_tx_id: transaction.id })
      .maybeSingle();

    if (existingMintByTxId || existingMintByBurnMeta) {
      console.log(`[CCTP] Mint transaction already recorded. Skipping duplicate insert. txId: ${txHash}, burnId: ${transaction.id}`);
      return;
    }

    const { error: insertError } = await supabaseAdminClient.from("transactions").insert({
      transaction_type: "CCTP_MINT",
      circle_transaction_id: txHash,
      source_wallet_id: transaction.source_wallet_id,
      destination_address: transaction.destination_address,
      amount_usdc: transaction.amount_usdc,
      asset: "USDC",
      chain: destinationWallet.chain,
      wallet_id: transaction.destination_address,
      idempotency_key: `admin:${txHash}`,
      status: "pending",
      metadata: { cctp_burn_tx_id: transaction.id }
    });

    if (insertError) {
      if ("code" in insertError && insertError.code === "23505") {
        // Unique constraint hit (e.g., idempotency_key). Treat as success and continue.
        console.log("[CCTP] Mint insert deduped by unique constraint.");
      } else {
        console.error(`[CCTP] Failed to insert CCTP_MINT record. Error: ${insertError.message}`);
        throw insertError;
      }
    }
    return;
  }
}

async function verifyCircleSignature(bodyString: string, signature: string, keyId: string): Promise<boolean> {
  try {
    const publicKey = await getCirclePublicKey(keyId);
    const verifier = crypto.createVerify("SHA256");
    verifier.update(bodyString);
    verifier.end();
    const signatureUint8Array = Uint8Array.from(Buffer.from(signature, "base64"));
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
  const response = await fetch(`https://api.circle.com/v2/notifications/publicKey/${keyId}`, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${process.env.CIRCLE_API_KEY}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch public key: ${response.statusText}`);
  }
  const data = await response.json();
  const rawPublicKey = data?.data?.publicKey;
  if (typeof rawPublicKey !== "string") {
    throw new Error("Invalid public key format");
  }
  return ["-----BEGIN PUBLIC KEY-----", ...(rawPublicKey.match(/.{1,64}/g) ?? []), "-----END PUBLIC KEY-----"].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("x-circle-signature");
    const keyId = req.headers.get("x-circle-key-id");

    if (!signature || !keyId) {
      return NextResponse.json({ error: "Missing signature or keyId in headers" }, { status: 400 });
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
      return NextResponse.json({ error: "Malformed webhook payload - missing required fields" }, { status: 422 });
    }

    const notification = body.notification;
    if (!notification) {
      return NextResponse.json({ error: "Malformed notification payload" }, { status: 422 });
    }

    const circleEventId = body.notificationId;
    const circleTransactionId = notification.id;
    const mappedStatus = mapCircleStateToStatus(notification.state);

    await logWebhookEvent(rawBody, body, circleEventId, circleTransactionId, mappedStatus, isVerified);

    if (body.notificationType === "webhooks.test") {
      console.log("Received test webhook notification - validation successful");
      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (circleTransactionId) {
      await updateTransactionStatus(notification);
      await updateAdminTransactionStatus(circleTransactionId, notification);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to process Circle webhook:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Failed to process notification: ${message}` }, { status: 500 });
  }
}

export async function HEAD() {
  return NextResponse.json({}, { status: 200 });
}
