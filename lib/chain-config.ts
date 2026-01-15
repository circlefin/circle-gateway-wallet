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

export type SupportedChain =
  | "arcTestnet"
  | "baseSepolia"
  | "avalancheFuji"

export const CHAIN_NAMES: Record<SupportedChain, string> = {
  arcTestnet: "Arc Testnet",
  avalancheFuji: "Avalanche Fuji",
  baseSepolia: "Base Sepolia",
};

export const NATIVE_TOKENS: Record<string, string> = {
  arcTestnet: "ARC",
  avalancheFuji: "AVAX",
  baseSepolia: "ETH",
};

export const SUPPORTED_CHAINS: Array<{ value: SupportedChain; label: string }> = [
  { value: "arcTestnet", label: "Arc Testnet" },
  { value: "baseSepolia", label: "Base Sepolia" },
  { value: "avalancheFuji", label: "Avalanche Fuji" },
];

export interface ChainBalance {
  chain: string;
  balance: number;
  address: string;
}
