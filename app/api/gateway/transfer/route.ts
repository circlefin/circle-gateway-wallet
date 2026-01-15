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
  transferUnifiedBalanceCircle,
  type SupportedChain,
} from "@/lib/circle/gateway-sdk";
import { createClient } from "@/lib/supabase/server";
import type { Address } from "viem";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sourceChain, destinationChain, amount, recipientAddress } =
    await req.json();

  try {
    if (!sourceChain || !destinationChain || !amount) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: sourceChain, destinationChain, amount",
        },
        { status: 400 }
      );
    }

    // Validate chains
    const validChains: SupportedChain[] = [
      "baseSepolia",
      "avalancheFuji",
      "arcTestnet"
    ];
    if (
      !validChains.includes(sourceChain) ||
      !validChains.includes(destinationChain)
    ) {
      return NextResponse.json(
        { error: `Invalid chain. Must be one of: ${validChains.join(", ")}` },
        { status: 400 }
      );
    }

    if (sourceChain === destinationChain) {
      return NextResponse.json(
        { error: "Source and destination chains must be different" },
        { status: 400 }
      );
    }

    const amountInAtomicUnits = BigInt(Math.floor(parseFloat(amount) * 1_000_000));

    // Custodial flow (Circle Wallet)
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("circle_wallet_id")
      .eq("user_id", user.id)
      .single();

    if (walletError || !wallet?.circle_wallet_id) {
      return NextResponse.json(
        { error: "No Circle wallet found for this user." },
        { status: 404 }
      );
    }

    const transferResult = await transferUnifiedBalanceCircle(
      wallet.circle_wallet_id,
      amountInAtomicUnits,
      sourceChain as SupportedChain,
      destinationChain as SupportedChain,
      recipientAddress as Address | undefined
    );

    const { burnTxHash, attestation, mintTxHash } = transferResult;

    // Store transaction in database
    await supabase.from("transaction_history").insert([
      {
        user_id: user.id,
        chain: sourceChain,
        tx_type: "transfer",
        amount: parseFloat(amount),
        tx_hash: mintTxHash,
        gateway_wallet_address: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
        destination_chain: destinationChain,
        status: "success",
        created_at: new Date().toISOString(),
      },
    ]);

    return NextResponse.json({
      success: true,
      burnTxHash,
      attestation,
      mintTxHash,
      sourceChain,
      destinationChain,
      amount: parseFloat(amount),
    });
  } catch (error: any) {
    console.error("Error in transfer:", error);

    // Log failed transaction to database
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase.from("transaction_history").insert([
          {
            user_id: user.id,
            chain: sourceChain,
            tx_type: "transfer",
            amount: parseFloat(amount || 0),
            destination_chain: destinationChain,
            status: "failed",
            reason: error.message || "Unknown error",
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (dbError) {
      console.error("Error logging failed transaction:", dbError);
    }

    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}