# arc-commerce Architecture

This document provides a comprehensive overview of the arc-commerce system architecture, explaining how components interact to enable USDC-based credit purchases on Arc testnet.

## Table of Contents
- [System Overview](#system-overview)
- [Technology Stack](#technology-stack)
- [Architecture Diagram](#architecture-diagram)
- [Core Components](#core-components)
- [Credit Purchase Flow](#credit-purchase-flow)
- [Admin Dashboard](#admin-dashboard)
- [Circle Wallets Integration](#circle-wallets-integration)
- [Database Schema](#database-schema)
- [Webhook System](#webhook-system)
- [Security Model](#security-model)

---

## System Overview

arc-commerce is a Next.js application that demonstrates USDC payment integration for purchasing credits on Arc testnet. It showcases:

- **Credit purchase system** with USDC payments
- **Dual dashboard experience** (User vs Admin)
- **Circle Developer Controlled Wallets** for payment processing
- **Webhook-based transaction notifications**
- **Real-time balance updates** via Supabase

### Key Features

- Users can purchase credits with USDC
- Admin dashboard for system oversight
- Automated admin wallet creation on first startup
- Transaction history tracking
- Webhook verification for security

---

## Technology Stack

### Frontend
- **Next.js 14+** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **React** - UI components

### Backend
- **Next.js API Routes** - Server-side logic
- **Supabase** - Database and authentication
- **PostgreSQL** - Database (via Supabase)

### Blockchain & Payments
- **Circle Developer Controlled Wallets** - Wallet management
- **Arc Testnet** - Layer 2 blockchain
- **USDC** - Payment token
- **@circle-fin/developer-controlled-wallets** - Circle SDK

### Development Tools
- **Docker** - Local Supabase
- **ngrok** - Webhook testing
- **ESLint** - Code linting
- **TypeScript Compiler** - Type checking

---

## Architecture Diagram
┌─────────────────────────────────────────────────────────────┐
│                         User Flow                            │
└─────────────────────────────────────────────────────────────┘
User Dashboard
│
├── View Credits Balance
├── Purchase Credits Form
│         │
│         └──> Enter Amount
│                   │
│                   └──> Submit Purchase
│                             │
└─────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend Processing                        │
└─────────────────────────────────────────────────────────────┘
Next.js API Route: /api/purchase
│
├──> Validate Request
├──> Get User Wallet (create if needed)
├──> Initiate USDC Transfer
│         │
│         └──> Circle SDK
│                   │
│                   └──> Arc Testnet
│                             │
│                             └──> USDC Transfer
│                                       │
└───────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────┐
│                      Webhook Flow                            │
└─────────────────────────────────────────────────────────────┘
Circle Webhook
│
└──> POST /api/circle/webhook
│
├──> Verify Signature
├──> Parse Event (transfer.completed)
├──> Update Transaction Status
└──> Credit User Account
│
└──> Supabase Update
│
└──> User sees credits!
┌─────────────────────────────────────────────────────────────┐
│                     Admin Dashboard                          │
└─────────────────────────────────────────────────────────────┘
Admin View
│
├── All Users
├── All Wallets
├── All Transactions
└── System Statistics

---

## Core Components

### 1. User Dashboard (`/dashboard`)

**Purpose:** Allow users to view and purchase credits

**Features:**
- Display current credit balance
- Credit purchase form
- Transaction history
- Real-time updates

**Location:** `app/dashboard/page.tsx`

### 2. Admin Dashboard (`/admin`)

**Purpose:** System oversight and management

**Features:**
- View all users
- View all wallets
- View all transactions
- System statistics

**Access:** Restricted to `admin@admin.com` (configured via `ADMIN_EMAIL`)

**Location:** `app/admin/page.tsx`

### 3. Purchase API Route (`/api/purchase`)

**Purpose:** Process credit purchases

**Flow:**
1. Authenticate user
2. Validate purchase amount
3. Get or create user wallet
4. Initiate USDC transfer from user to admin wallet
5. Create transaction record (pending)
6. Return transaction ID

**Location:** `app/api/purchase/route.ts`

### 4. Webhook Handler (`/api/circle/webhook`)

**Purpose:** Receive and process Circle transaction events

**Flow:**
1. Verify webhook signature
2. Parse event payload
3. Update transaction status
4. Credit user account (if completed)
5. Handle failures

**Location:** `app/api/circle/webhook/route.ts`

---

## Credit Purchase Flow

### Step-by-Step Process

User Initiates Purchase
└─> User enters credit amount
└─> Clicks "Purchase Credits"
Frontend Validation
└─> Validates amount > 0
└─> Calculates USDC cost
└─> Confirms with user
API Request
POST /api/purchase
Body: { amount: 100, usdcCost: 10 }
Backend Processing
├─> Authenticate user (Supabase)
├─> Validate request
├─> Get user wallet ID (or create)
├─> Call Circle SDK to initiate transfer:
│      transferUSDC({
│        from: userWalletId,
│        to: adminWalletId,
│        amount: usdcCost
│      })
└─> Create transaction record:
{
user_id,
amount: 100 credits,
usdc_cost: 10,
status: 'pending',
circle_transfer_id
}
USDC Transfer (On-Chain)
└─> Circle executes transfer on Arc testnet
└─> User wallet → Admin wallet
Webhook Notification
└─> Circle sends webhook: transfer.completed
└─> Signature verified
└─> Transaction updated: status = 'completed'
└─> User credits incremented by 100
User Dashboard Update
└─> Real-time update via Supabase subscription
└─> New balance displayed


### Transaction States

```typescript
type TransactionStatus = 
  | 'pending'    // Transfer initiated
  | 'completed'  // Transfer confirmed, credits added
  | 'failed'     // Transfer failed
```

---

## Admin Dashboard

### Purpose

Provides system administrators with oversight of:
- User accounts
- Wallet addresses
- Transaction history
- System health

### Access Control

```typescript
// Middleware checks if user email matches ADMIN_EMAIL
const isAdmin = user.email === process.env.ADMIN_EMAIL

if (!isAdmin) {
  redirect('/dashboard')
}
```

### Admin Features

**1. User Management**
- View all registered users
- See user credit balances
- Track user activity

**2. Wallet Overview**
- List all user wallets
- View wallet addresses
- Monitor wallet creation

**3. Transaction History**
- All system transactions
- Filter by status
- Export capabilities (future)

**4. System Statistics**
- Total users
- Total transactions
- Total USDC processed
- Credit circulation

### Admin Wallet

**Purpose:** Receives all USDC payments from users

**Creation:** Automatically generated on first app startup

**Management:** 
- Stored in database (wallets table)
- Address accessible to all API routes
- Used as destination for all purchases

---

## Circle Wallets Integration

### Wallet Types

**1. Admin Wallet**
- Single wallet for entire system
- Receives all user payments
- Created automatically on startup

**2. User Wallets**
- One wallet per user
- Created on first purchase
- Stored with user ID

### Wallet Creation Flow

```typescript
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
})

// Create wallet
const response = await client.createWallets({
  blockchains: ['ARC-TESTNET'],
  count: 1,
  walletSetId: 'default',
})

const wallet = response.data?.wallets?.[0]
// Store wallet.id and wallet.address in database
```

### USDC Transfer Flow

```typescript
// Transfer USDC from user to admin
const transfer = await client.createTransaction({
  walletId: userWalletId,
  blockchain: 'ARC-TESTNET',
  tokenAddress: process.env.CIRCLE_USDC_TOKEN_ID,
  destinationAddress: adminWalletAddress,
  amounts: [usdcAmount.toString()],
  fee: {
    type: 'level',
    config: { feeLevel: 'MEDIUM' },
  },
})

// Returns transfer ID for tracking
const transferId = transfer.data?.id
```

### SDK Configuration

```typescript
const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
})
```

**Environment Variables:**
- `CIRCLE_API_KEY` - Circle API authentication
- `CIRCLE_ENTITY_SECRET` - Entity secret for wallet operations
- `CIRCLE_BLOCKCHAIN` - Target blockchain (ARC-TESTNET)
- `CIRCLE_USDC_TOKEN_ID` - USDC token address

---

## Database Schema

### Tables

**1. users**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  credits INTEGER DEFAULT 0,
  wallet_id TEXT, -- Circle wallet ID
  wallet_address TEXT -- On-chain address
);
```

**2. transactions**
```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  credit_amount INTEGER NOT NULL,
  usdc_cost NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL, -- 'pending' | 'completed' | 'failed'
  circle_transfer_id TEXT, -- Circle transaction ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

**3. wallets**
```sql
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  wallet_id TEXT NOT NULL, -- Circle wallet ID
  wallet_address TEXT NOT NULL, -- On-chain address
  blockchain TEXT DEFAULT 'ARC-TESTNET',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_admin BOOLEAN DEFAULT FALSE
);
```

### Row-Level Security (RLS)

**Users Table:**
```sql
-- Users can only see their own data
CREATE POLICY "Users can view own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- Admins can see all users
CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  USING (
    (SELECT email FROM users WHERE id = auth.uid()) = 'admin@admin.com'
  );
```

**Transactions Table:**
```sql
-- Users can view their own transactions
CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  USING (user_id = auth.uid());

-- Admins can view all transactions
CREATE POLICY "Admins can view all transactions"
  ON transactions FOR SELECT
  USING (
    (SELECT email FROM users WHERE id = auth.uid()) = 'admin@admin.com'
  );
```

---

## Webhook System

### Purpose

Receive real-time notifications from Circle when transactions complete

### Endpoint
POST /api/circle/webhook

### Signature Verification

```typescript
import crypto from 'crypto'

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  const digest = hmac.update(payload).digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  )
}
```

### Event Types

**transfer.completed**
```json
{
  "type": "transfer.completed",
  "data": {
    "id": "transfer-id",
    "from": "user-wallet-address",
    "to": "admin-wallet-address",
    "amount": "10.00",
    "status": "completed"
  }
}
```

**transfer.failed**
```json
{
  "type": "transfer.failed",
  "data": {
    "id": "transfer-id",
    "error": "insufficient_balance"
  }
}
```

### Processing Flow

1. Receive webhook POST request
2. Verify signature using Circle's public key
3. Parse event type and data
4. Match transfer ID to pending transaction
5. Update transaction status
6. If completed: credit user account
7. Return 200 OK to acknowledge receipt

---

## Security Model

### Authentication

- **Supabase Auth** - User authentication
- **JWT tokens** - Session management
- **Email verification** - Account security

### Authorization

- **RLS policies** - Database access control
- **Admin checks** - Admin-only routes
- **User isolation** - Users can only access their own data

### API Security

- **Environment variables** - Secrets never committed
- **Webhook signatures** - Verify Circle events
- **Input validation** - Sanitize all inputs
- **Error handling** - No sensitive data in errors

### Wallet Security

- **Server-side only** - Wallet operations in API routes
- **Entity secret** - Required for wallet operations
- **No private key storage** - Circle manages keys

### Rate Limiting

**Supabase:**
- Email signups: 2 per hour (default)
- Can be configured via Supabase dashboard

**Future:**
- API route rate limiting
- Purchase limits per user

---

## Deployment Considerations

### Environment Variables

All sensitive configuration via environment variables:
- Circle credentials
- Supabase credentials
- Admin email
- Webhook secrets

### Database Migrations

- Use Supabase migrations for schema changes
- Test migrations in dev before production
- Keep migration files in version control

### Webhook Configuration

- Use HTTPS in production
- Configure webhook URL in Circle Console
- Test with ngrok in development

### Monitoring

- Log all transactions
- Monitor webhook delivery
- Track failed purchases
- Alert on errors

---

## Further Reading

- [Circle Developer Controlled Wallets](https://developers.circle.com/wallets/dev-controlled)
- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Arc Testnet](https://developers.circle.com/arc)

---

**This architecture enables seamless USDC credit purchases with real-time updates and comprehensive admin oversight.**
