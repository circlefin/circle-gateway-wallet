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
import { fetchGatewayBalance, getUsdcBalance, CHAIN_BY_DOMAIN, type SupportedChain } from "@/lib/circle/gateway-sdk";
import { createClient } from "@/lib/supabase/server";
import type { Address } from "viem";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { addresses } = await req.json();

    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid addresses array" },
        { status: 400 }
      );
    }

    const supportedChains: SupportedChain[] = [
      "arcTestnet",
      "baseSepolia",
      "avalancheFuji",
    ];

    // Fetch balances for all addresses
    const balancePromises = addresses.map(async (address: string) => {
      try {
        // Fetch Gateway balance (available balance on Gateway contracts)
        let gatewayBalances: Array<{ domain: number; balance: number; chain: string }> = [];
        let gatewayTotal = 0;

        try {
          const gatewayResponse = await fetchGatewayBalance(address as Address);
          console.log(`Gateway API response for ${address}:`, JSON.stringify(gatewayResponse, null, 2));

          gatewayBalances = gatewayResponse.balances.map((b) => {
            // Gateway API returns balance as decimal string (e.g., "1.000000"), not atomic units
            const balance = parseFloat(b.balance);
            const chainName = CHAIN_BY_DOMAIN[b.domain] || "unknown";

            console.log(`Gateway balance on domain ${b.domain} (${chainName}): ${balance} USDC`);

            return {
              domain: b.domain,
              balance,
              chain: chainName,
              address,
            };
          });

          gatewayTotal = gatewayBalances.reduce((sum, b) => sum + b.balance, 0);
          console.log(`Total Gateway balance for ${address}: ${gatewayTotal} USDC`);
        } catch (error: any) {
          console.error(`Error fetching Gateway balance for ${address}:`, error.message);
          console.log(`Will fetch on-chain balances only`);
        }

        // Fetch on-chain USDC balances (wallet balances not yet deposited)
        const chainBalances = await Promise.all(
          supportedChains.map(async (chain) => {
            try {
              const balance = await getUsdcBalance(address as Address, chain);
              return {
                chain,
                balance: Number(balance) / 1_000_000, // Convert to USDC
                address,
              };
            } catch (error) {
              console.error(`Error fetching on-chain balance for ${chain}:`, error);
              return {
                chain,
                balance: 0,
                address,
              };
            }
          })
        );

        // Calculate total from on-chain balances (wallet balance)
        const walletTotal = chainBalances.reduce((sum, cb) => sum + cb.balance, 0);

        return {
          address,
          gatewayBalances,
          gatewayTotal,
          chainBalances,
          walletTotal,
          totalBalance: gatewayTotal + walletTotal,
        };
      } catch (error: any) {
        console.error(`Error fetching balance for ${address}:`, error);
        return {
          address,
          error: error.message,
          totalBalance: 0,
        };
      }
    });

    const balances = await Promise.all(balancePromises);

    // Calculate total unified balance from all addresses
    const totalUnified = balances.reduce((sum, b) => {
      return sum + (b.totalBalance || 0);
    }, 0);

    return NextResponse.json({
      success: true,
      totalUnified,
      balances,
    });
  } catch (error: any) {
    console.error("Error fetching balances:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
