# Circle Gateway Multichain USDC

This sample app demonstrates how to integrate USDC as a payment method for purchasing credits on Arc.

### Install dependencies

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
4. USDC minted on destination

## Security Notes

- This is a **testnet demonstration** only
- Private keys are processed server-side and never stored
- Never use mainnet private keys with this application
- Always use HTTPS in production
- Consider hardware wallet integration for production use

## Resources

- [Circle Gateway Documentation](https://developers.circle.com/gateway)
- [Unified Balance Guide](https://developers.circle.com/gateway/howtos/create-unified-usdc-balance)
- [Circle Faucet](https://faucet.circle.com/)
