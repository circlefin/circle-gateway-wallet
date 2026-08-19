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

"use client";

import { useMemo } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { SUPPORTED_CHAINS } from "@/lib/wagmi/config";

const isTestnetChain = (c: (typeof SUPPORTED_CHAINS)[number]): boolean =>
  Boolean((c as { testnet?: boolean }).testnet || /testnet|sepolia|amoy/i.test(c.name));

const MAINNET_CHAINS = SUPPORTED_CHAINS.filter((c) => !isTestnetChain(c));
const TESTNET_CHAINS = SUPPORTED_CHAINS.filter((c) => isTestnetChain(c));

export interface NetworkStatus {
  isConnected: boolean;
  currentChainId: number | null;
  currentChainName: string | null;
  isSupported: boolean;
  supportedChainIds: number[];
  unsupportedReason?: string;
  isSwitching: boolean;
  canSwitch: boolean;
  trySwitch: (chainId: number) => Promise<{ ok: boolean; error?: string }>;
  mainnets: typeof MAINNET_CHAINS;
  testnets: typeof TESTNET_CHAINS;
}

export function useNetworkSupport(): NetworkStatus {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();

  const supportedChainIds = useMemo(
    () => SUPPORTED_CHAINS.map((c) => c.id),
    []
  );

  const isConfiguredChainId = (id: number): boolean =>
    (supportedChainIds as number[]).includes(id);

  const isSupported = chainId != null && isConfiguredChainId(chainId);

  const currentChainName =
    chainId != null
      ? SUPPORTED_CHAINS.find((c) => c.id === chainId)?.name || "Unknown"
      : null;

  const unsupportedReason =
    !isSupported && chainId != null
      ? "This network is not supported."
      : undefined;

  const canSwitch = !!switchChainAsync;

  const trySwitch = async (chainId: number) => {
    if (!switchChainAsync) {
      return {
        ok: false,
        error:
          "Programmatic network switching disabled. Please switch networks in your wallet.",
      };
    }
    try {
      await switchChainAsync({ chainId });
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: (e as Error)?.message || "Error switching network.",
      };
    }
  };

  return {
    isConnected,
    currentChainId: chainId ?? null,
    currentChainName,
    isSupported,
    supportedChainIds,
    unsupportedReason,
    isSwitching,
    canSwitch,
    trySwitch,
    mainnets: MAINNET_CHAINS,
    testnets: TESTNET_CHAINS,
  };
}
