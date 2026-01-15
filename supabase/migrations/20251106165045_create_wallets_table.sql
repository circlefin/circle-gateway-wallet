-- Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.
--
-- SPDX-License-Identifier: Apache-2.0

-- Create the wallets table with a UUID primary key
CREATE TABLE public.wallets (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    circle_wallet_id TEXT NOT NULL UNIQUE,
    wallet_set_id TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for clarity
COMMENT ON TABLE public.wallets IS 'Stores Circle developer wallets created by users.';
COMMENT ON COLUMN public.wallets.id IS 'The unique identifier for the wallet record.';
COMMENT ON COLUMN public.wallets.user_id IS 'Foreign key to the authenticated user in auth.users.';
COMMENT ON COLUMN public.wallets.circle_wallet_id IS 'The unique ID of the wallet from Circle.';

-- 1. Enable Row Level Security (RLS) on the table
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- 2. Create a policy that allows users to read their own wallets
CREATE POLICY "Allow authenticated users to read their own wallets"
ON public.wallets
FOR SELECT
USING (auth.uid() = user_id);

-- 3. Create a policy that allows users to insert a wallet for themselves
CREATE POLICY "Allow authenticated users to create their own wallet"
ON public.wallets
FOR INSERT
WITH CHECK (auth.uid() = user_id);