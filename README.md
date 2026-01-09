# Circle Gateway Multichain USDC

A Next.js application demonstrating Circle's Gateway integration for unified USDC balances across multiple blockchains with cross-chain transfer capabilities.

## Features

- **Unified Balance**: View and manage USDC across multiple chains from a single interface
- **Multi-Wallet Support**: Connect via Circle wallets
- **Deposits**: Deposit USDC to Gateway Wallet on any supported testnet chain
- **Cross-Chain Transfers**: Transfer USDC between chains using Circle's CCTP technology
- **Transaction History**: Track all deposits and transfers

## Supported Chains (Testnet)

- Ethereum Sepolia
- Base Sepolia
- Avalanche Fuji

## Quick Start

### Prerequisites

- Node.js 18+ installed
- Testnet wallet with private key
- Testnet USDC from [Circle Faucet](https://faucet.circle.com/)
- Native tokens (ETH/AVAX) for gas fees

### Installation

```bash
# Install dependencies
pnpm install

# Configure environment variables
cp .env.example .env.local
```

Update `.env.local`:

```ini
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key

# Circle
CIRCLE_API_KEY=your-circle-api-key
CIRCLE_ENTITY_SECRET=your-circle-entity-secret
```

### Start Supabase

```bash
pnpx supabase start
```

### Run Development Server

```bash
pnpm run dev
```

Visit [http://localhost:3000/wallet](http://localhost:3000/wallet)

## How It Works

### Unified Balance

When you deposit USDC to the Gateway Wallet, it becomes part of your unified balance accessible from any supported chain. The Gateway Wallet uses the same address on all chains: `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`

### Deposit Flow

1. Approve Gateway Wallet to spend your USDC
2. Call `deposit()` to transfer USDC to Gateway
3. Balance becomes available across all chains after finalization

### Cross-Chain Transfer Flow

1. Create and sign burn intent (EIP-712)
2. Submit to Gateway API for attestation
3. Call `gatewayMint()` on destination chain
4. USDC minted on destination (typically 1-3 minutes)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/gateway/balance` | POST | Fetch Gateway and wallet balances |
| `/api/gateway/deposit` | POST | Deposit USDC to Gateway |
| `/api/gateway/transfer` | POST | Cross-chain USDC transfer |
| `/api/gateway/delegate/add` | POST | Add delegate for authorized transfers |
| `/api/gateway/delegate/remove` | POST | Remove delegate |
| `/api/gateway/info` | GET | Fetch Gateway configuration |

## Key Contract Addresses (Testnet)

**Gateway Contracts (same on all chains):**

- Gateway Wallet: `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`
- Gateway Minter: `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B`

**USDC Contracts:**

- Sepolia: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Avalanche Fuji: `0x5425890298aed601595a70ab815c96711a31bc65`

## Testing

### Basic Flow

1. Connect wallet at `/wallet`
2. Enter testnet private key (never use mainnet keys)
3. Deposit USDC on any chain
4. Transfer between chains

### Example: Cross-Chain Transfer

```bash
curl -X POST http://localhost:3000/api/gateway/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "privateKey": "your_private_key",
    "sourceChain": "sepolia",
    "destinationChain": "baseSepolia",
    "amount": "10.00"
  }'
```

## Security Notes

- This is a **testnet demonstration** only
- Private keys are processed server-side and never stored
- Never use mainnet private keys with this application
- Always use HTTPS in production
- Consider hardware wallet integration for production use

## Troubleshooting

**Balance not updating**: Wait 30-60 seconds for block finality, then refresh

**Transaction fails**: Ensure sufficient native tokens for gas and correct chain selection

**Transfer stuck**: Gateway attestation can take 5-10 minutes. Check Circle's status page

**Insufficient balance**: Verify you have enough USDC on the source chain

## Technology Stack

- **Frontend**: Next.js 15, React 18, TailwindCSS, shadcn/ui
- **Authentication**: Circle Wallets (wallet connection)
- **Database**: Supabase (transaction history)
- **Blockchain**: viem, wagmi (Ethereum interactions)
- **Gateway**: Circle SDK, Gateway API

## Resources

- [Circle Gateway Documentation](https://developers.circle.com/gateway)
- [Unified Balance Guide](https://developers.circle.com/gateway/howtos/create-unified-usdc-balance)
- [Circle Faucet](https://faucet.circle.com/)
- [Gateway API Testnet](https://gateway-api-testnet.circle.com)

## License

This is a demonstration project for educational purposes.
