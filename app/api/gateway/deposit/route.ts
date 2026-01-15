/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
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
import {
  initiateDepositFromCustodialWallet,
  type SupportedChain,
} from "@/lib/circle/gateway-sdk";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { chain, amount } = await req.json();

    if (!chain || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: chain, amount" },
        { status: 400 }
      );
    }

    // Validate chain
    const validChains: SupportedChain[] = ["arcTestnet", "baseSepolia", "avalancheFuji"];
    if (!validChains.includes(chain)) {
      return NextResponse.json(
        { error: `Invalid chain. Must be one of: ${validChains.join(", ")}` },
        { status: 400 }
      );
    }

    // Convert amount to bigint (amount should be in USDC, multiply by 1_000_000)
    const parsedAmount = parseFloat(amount);

    // Validate if amount is positive
    if (parsedAmount <= 0) {
      return NextResponse.json(
        { error: "Amount must be greater than 0" },
        { status: 400 }
      );
    }

    // Validate amount is not too large (max 1 billion USDC for safety)
    if (parsedAmount > 1_000_000_000) {
      return NextResponse.json(
        { error: "Amount exceeds maximum allowed value" },
        { status: 400 }
      )
    }

    const amountInAtomicUnits = BigInt(Math.floor(parsedAmount * 1_000_000));

    // Custodial flow (Circle Wallet)
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("circle_wallet_id")
      .eq("user_id", user.id)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: "No Circle wallet found for this user." },
        { status: 404 }
      );
    }

    const txHash = await initiateDepositFromCustodialWallet(
      wallet.circle_wallet_id,
      chain as SupportedChain,
      amountInAtomicUnits
    );

    // Store transaction in database
    await supabase.from("transaction_history").insert([
      {
        user_id: user.id,
        chain,
        tx_type: "deposit",
        amount: parseFloat(amount),
        tx_hash: txHash,
        // This should probably be dynamic if you support multiple gateways
        gateway_wallet_address: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
        status: "success",
        created_at: new Date().toISOString(),
      },
    ]);

    return NextResponse.json({
      success: true,
      txHash,
      chain,
      amount: parseFloat(amount),
    });
  } catch (error: any) {
    console.error("Error in deposit:", error);

    // Log failed transaction to database
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const body = await req.json();
        await supabase.from("transaction_history").insert([
          {
            user_id: user.id,
            chain: body.chain,
            tx_type: "deposit",
            amount: parseFloat(body.amount || 0),
            status: "failed",
            reason: error.message || "Unknown error",
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (dbError) {
      console.error("Error logging failed transaction:", dbError);
    }

    // Handle specific error types for better user feedback

    let errorMessage = "Internal server error";
    let statusCode = 500;

    if (error.message) {
      const msg = error.message.toLowerCase();
      if (msg.includes("gas") || msg.includes("intrinsic") || msg.includes("fee")) {
        errorMessage = "Insufficient gas or gas estimation failed. Please ensure you have enough native tokens for gas fees.";
        statusCode = 400;
      }
      // Insufficient balance - check for multiple variations
      else if (
        msg.includes("insufficient funds") ||
        msg.includes("insufficient balance") ||
        msg.includes("transfer amount exceeds balance") ||
        msg.includes("exceeds balance")
      ) {
        errorMessage = "Insufficient USDC balance for this deposit. Please check your wallet balance and try again.";
        statusCode = 400;
      } else if (msg.includes("allowance") || msg.includes("approve")) {
        errorMessage = "Token approval failed. Please try again.";
        statusCode = 400;
      } else if (msg.includes("network") || msg.includes("rpc") || msg.includes("timeout")) {
        errorMessage = "Network error. Please check your connection and try again.";
        statusCode = 503;
      } else if (msg.includes("user rejected") || msg.includes("user denied")) {
        errorMessage = "Transaction was rejected.";
        statusCode = 400;
      } else if (error.message.length < 200) {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}