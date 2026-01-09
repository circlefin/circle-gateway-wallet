-- Supabase Transaction History Table Schema

CREATE TABLE transaction_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  chain text NOT NULL,
  tx_type text NOT NULL, -- 'deposit', 'transfer', or 'unify'
  amount numeric NOT NULL,
  tx_hash text,
  gateway_wallet_address text,
  destination_chain text,
  created_at timestamptz DEFAULT now()
);
