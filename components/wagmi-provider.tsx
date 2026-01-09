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
