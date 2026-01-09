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
