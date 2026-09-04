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

/**
 * Shared claim-message format for credit top-ups.
 *
 * The paying wallet must sign this after the USDC transfer so credits cannot be
 * claimed against someone else's on-chain payment by a different session.
 */
export function buildTopupClaimMessage(chainId: number, txHash: string): string {
  return [
    "Arc Commerce credit claim",
    `chainId:${chainId}`,
    `txHash:${txHash.toLowerCase()}`,
  ].join("\n");
}

/** Matches `PurchaseCreditsCard`: 1 USDC = 1 credit (6-decimal USDC). */
export const USDC_MICRO_PER_CREDIT = 1_000_000n;
