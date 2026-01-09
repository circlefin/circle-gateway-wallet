import {
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  mainnet,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  sepolia,
} from "wagmi/chains";
import { type Address } from "viem";

const USDC_ADDRESSES: Record<number, Address> = {
  [mainnet.id]: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  [sepolia.id]: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  [polygon.id]: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  [polygonAmoy.id]: "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582",
  [arbitrum.id]: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  [arbitrumSepolia.id]: "0x75faf114e59ef0dcf08a42114540d75edb2a072d",

  [optimism.id]: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  [optimismSepolia.id]: "0x5fd84259d66Cd46123540776Be934041f3606881",
  [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  [baseSepolia.id]: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

export function getUsdcAddress(chainId: number): Address | undefined {
  return USDC_ADDRESSES[chainId];
}
