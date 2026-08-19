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

import {
  mainnet,
  base,
  polygon,
  arbitrum,
  optimism,
  baseSepolia,
  sepolia,
  polygonAmoy,
  arbitrumSepolia,
  optimismSepolia,
} from "wagmi/chains";

/**
 * Canonical USDC (or primary deployment) addresses (6 decimals).
 * Includes selected testnets for development.
 */
export const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  // Mainnets
  [mainnet.id]: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  [polygon.id]: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  [arbitrum.id]: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  [optimism.id]: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  // Testnets
  [baseSepolia.id]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  [sepolia.id]: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
  [polygonAmoy.id]: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  [arbitrumSepolia.id]: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  [optimismSepolia.id]: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
  5042002: "0x3600000000000000000000000000000000000000",
};

/**
 * Helper to get USDC address (returns undefined if unsupported).
 */
export function getUsdcAddress(chainId?: number) {
  return chainId ? USDC_ADDRESSES[chainId] : undefined;
}
