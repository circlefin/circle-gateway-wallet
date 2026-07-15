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

"use server";

import { revalidatePath } from "next/cache";
import { createPublicClient, http, erc20Abi } from "viem";
import { Database } from "@/types/supabase";
import { supabaseAdminClient } from "@/lib/supabase/admin-client";
import { Blockchain, BridgeChain } from "@circle-fin/app-kit";
import { getAppKit, createAdapter } from "@/lib/circle/app-kit-client";
import {
  SupportedChainId,
  CHAIN_IDS_TO_USDC_ADDRESSES,
  CHAIN_DB_TO_BRIDGE_CHAIN,
  CHAIN_DB_TO_RPC,
} from "@/lib/chains";

const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
  ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
  : "http://localhost:3000";

type WalletStatus = Database["public"]["Enums"]["admin_wallet_status"];

export interface TokenBalance {
  token: {
    blockchain: string;
    name: string;
    symbol: string;
    decimals: number;
  };
  amount: string;
}

/**
 * Creates a new Circle wallet via internal API routes and saves it to the database.
 */
export async function createAdminWallet(formData: FormData) {
  const label = formData.get("label") as string;
  const blockchain = formData.get("blockchain") as string;

  if (!label || label.trim().length < 3) {
    return { error: "Label must be at least 3 characters long." };
  }
  if (!blockchain) {
    return { error: "Blockchain is a required field." };
  }

  try {
    const createdWalletSetResponse = await fetch(`${baseUrl}/api/wallet-set`, {
      method: "POST",
      body: JSON.stringify({ entityName: `admin-wallet-${label}` }),
      headers: { "Content-Type": "application/json" },
    });
    if (!createdWalletSetResponse.ok)
      throw new Error("Failed to create wallet set.");
    const createdWalletSet = await createdWalletSetResponse.json();

    const createdWalletResponse = await fetch(`${baseUrl}/api/wallet`, {
      method: "POST",
      body: JSON.stringify({ walletSetId: createdWalletSet.id, blockchain }),
      headers: { "Content-Type": "application/json" },
    });
    if (!createdWalletResponse.ok) throw new Error("Failed to create wallet.");
    const newWallet = await createdWalletResponse.json();

    const { error: insertError } = await supabaseAdminClient
      .from("admin_wallets")
      .insert({
        circle_wallet_id: newWallet.id,
        label: label.trim(),
        address: newWallet.address,
        chain: newWallet.blockchain,
      });

    if (insertError) throw new Error(insertError.message);

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    console.error("Error creating admin wallet:", message);
    return { error: message };
  }
}

/**
 * Updates the status of an existing admin wallet.
 */
export async function updateAdminWalletStatus(
  id: string,
  status: WalletStatus
) {
  try {
    const { error } = await supabaseAdminClient
      .from("admin_wallets")
      .update({ status })
      .eq("id", id);

    if (error) throw new Error(error.message);

    revalidatePath("/dashboard");
    return { success: true };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    console.error(`Error updating wallet ${id} to status ${status}:`, message);
    return { error: message };
  }
}

/**
 * Fetches the USDC balance for an admin wallet by reading directly from the chain.
 */
export async function getWalletBalance(
  walletAddress: string,
  chainDbString: string
): Promise<{ balances?: TokenBalance[]; error?: string }> {
  try {
    const chainKey = chainDbString.replace(/-/g, "_");
    const chainId =
      SupportedChainId[chainKey as keyof typeof SupportedChainId];
    const usdcAddress = CHAIN_IDS_TO_USDC_ADDRESSES[chainId];
    const rpcUrl = CHAIN_DB_TO_RPC[chainDbString];

    if (!usdcAddress || !rpcUrl) {
      return { error: `Unsupported chain: ${chainDbString}` };
    }

    const client = createPublicClient({ transport: http(rpcUrl) });
    const rawBalance = await client.readContract({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress as `0x${string}`],
    });

    const decimals = 6;
    const amount = (Number(rawBalance) / 10 ** decimals).toString();

    return {
      balances: [
        {
          token: {
            blockchain: chainDbString,
            name: "USD Coin",
            symbol: "USDC",
            decimals,
          },
          amount,
        },
      ],
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    console.error(
      `Error fetching on-chain balance for ${walletAddress}:`,
      message
    );
    return { error: message };
  }
}

/**
 * Transfers USDC from an admin wallet to a destination address on the same chain
 * using App Kit Send.
 */
export async function transferFromAdminWallet(
  sourceCircleWalletId: string,
  destinationAddress: string,
  amount: string
) {
  try {
    const { data: sourceWallet, error: fetchError } = await supabaseAdminClient
      .from("admin_wallets")
      .select("id, chain, address")
      .eq("circle_wallet_id", sourceCircleWalletId)
      .single();

    if (fetchError || !sourceWallet) {
      throw new Error("Source wallet not found in the database.");
    }

    const bridgeChain = CHAIN_DB_TO_BRIDGE_CHAIN[sourceWallet.chain ?? ""];
    if (!bridgeChain) {
      throw new Error(
        `Unsupported source chain for transfer: ${sourceWallet.chain}`
      );
    }

    const kit = getAppKit();
    const adapter = createAdapter();

    const result = await kit.send({
      from: {
        adapter,
        chain: bridgeChain as Blockchain,
        address: sourceWallet.address,
      },
      to: destinationAddress,
      amount,
      token: "USDC",
    });

    const { error: insertError } = await supabaseAdminClient
      .from("transactions")
      .insert({
        transaction_type: "ADMIN",
        circle_transaction_id: result.txHash,
        tx_hash: result.txHash,
        source_wallet_id: sourceWallet.id,
        destination_address: destinationAddress,
        amount_usdc: Number(amount),
        asset: "USDC",
        chain: sourceWallet.chain ?? "UNKNOWN",
        wallet_id: sourceWallet.address,
        idempotency_key: `admin:${result.txHash}`,
        status: "complete",
      });

    if (insertError) {
      console.error(
        "CRITICAL: Failed to log transaction to database:",
        insertError.message
      );
    }

    revalidatePath("/dashboard");
    return { success: true, txHash: result.txHash };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    console.error(
      `Error transferring from wallet ${sourceCircleWalletId}:`,
      message
    );
    return { error: message };
  }
}

/**
 * Bridges USDC from an admin wallet to a destination address on a different chain
 * using App Kit Bridge (CCTPv2 Fast). Blocks until the full bridge is complete.
 */
export async function transferFromAdminWalletCCTP(
  sourceCircleWalletId: string,
  destinationAddress: string,
  amount: string
) {
  try {
    const { data: sourceWallet, error: fetchError } = await supabaseAdminClient
      .from("admin_wallets")
      .select("id, chain, address")
      .eq("circle_wallet_id", sourceCircleWalletId)
      .single();

    if (fetchError || !sourceWallet) {
      throw new Error("Source wallet not found in the database.");
    }

    const { data: destinationWallet, error: destFetchError } =
      await supabaseAdminClient
        .from("admin_wallets")
        .select("chain")
        .eq("address", destinationAddress)
        .single();

    if (destFetchError || !destinationWallet?.chain) {
      throw new Error(
        `Could not resolve destination chain for address: ${destinationAddress}`
      );
    }

    const sourceChain = CHAIN_DB_TO_BRIDGE_CHAIN[sourceWallet.chain ?? ""];
    const destinationChain =
      CHAIN_DB_TO_BRIDGE_CHAIN[destinationWallet.chain];

    if (!sourceChain) {
      throw new Error(
        `Unsupported source chain: ${sourceWallet.chain}`
      );
    }
    if (!destinationChain) {
      throw new Error(
        `Unsupported destination chain: ${destinationWallet.chain}`
      );
    }

    const kit = getAppKit();
    const adapter = createAdapter();

    const result = await kit.bridge({
      from: {
        adapter,
        chain: sourceChain as BridgeChain,
        address: sourceWallet.address,
      },
      to: {
        adapter,
        chain: destinationChain as BridgeChain,
        address: destinationAddress,
      },
      amount,
      token: "USDC",
      config: { transferSpeed: "FAST" },
    });

    const txHash =
      result.steps?.at(-1)?.txHash ?? result.steps?.[0]?.txHash ?? sourceCircleWalletId;
    const status = result.state === "success" ? "complete" : "pending";

    const { error: insertError } = await supabaseAdminClient
      .from("transactions")
      .insert({
        transaction_type: "ADMIN",
        circle_transaction_id: txHash,
        tx_hash: txHash,
        source_wallet_id: sourceWallet.id,
        destination_address: destinationAddress,
        amount_usdc: Number(amount),
        asset: "USDC",
        chain: sourceWallet.chain ?? "UNKNOWN",
        wallet_id: sourceWallet.address,
        idempotency_key: `admin:${txHash}`,
        status,
      });

    if (insertError) {
      console.error(
        "CRITICAL: Failed to log transaction to database:",
        insertError.message
      );
    }

    revalidatePath("/dashboard");
    return { success: true, txHash };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    console.error(
      `Error bridging from wallet ${sourceCircleWalletId}:`,
      message
    );
    return { error: message };
  }
}

/**
 * Fetches all admin wallet addresses for filtering realtime subscriptions.
 */
export async function getAdminWalletAddresses(): Promise<string[]> {
  try {
    const { data, error } = await supabaseAdminClient
      .from("admin_wallets")
      .select("address");

    if (error) {
      console.error(
        "[Server Action] Error fetching admin wallet addresses:",
        error
      );
      return [];
    }

    return data?.map((w) => w.address) || [];
  } catch (error) {
    console.error(
      "[Server Action] Unexpected error fetching admin wallet addresses:",
      error
    );
    return [];
  }
}
