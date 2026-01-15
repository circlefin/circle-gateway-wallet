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

"use client";
import { WagmiConfig, createConfig } from "wagmi";
import { http } from '@wagmi/core'
import {
  mainnet,
  polygon,
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  optimism,
  optimismSepolia,
  polygonAmoy,
  sepolia,
} from "wagmi/chains";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from "react";

const chains = [
  mainnet,
  polygon,
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  optimism,
  optimismSepolia,
  polygonAmoy,
  sepolia,
] as const;

const transports = {
  [mainnet.id]: http(),
  [polygon.id]: http(),
  [arbitrum.id]: http(),
  [arbitrumSepolia.id]: http(),
  [base.id]: http(),
  [baseSepolia.id]: http(),
  [optimism.id]: http(),
  [optimismSepolia.id]: http(),
  [polygonAmoy.id]: http(),
  [sepolia.id]: http(),
};

const wagmiConfig = createConfig({
  chains: chains, // Add chains to wagmiConfig
  transports: transports, // Add transports to wagmiConfig
});

export function WagmiProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiConfig config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiConfig>
  );
}
