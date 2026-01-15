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

-- Add status and reason columns to transaction_history table

ALTER TABLE transaction_history
ADD COLUMN status text DEFAULT 'success' CHECK (status IN ('pending', 'success', 'failed')),
ADD COLUMN reason text;

-- Add index for better query performance
CREATE INDEX idx_transaction_history_user_status ON transaction_history(user_id, status);
CREATE INDEX idx_transaction_history_created_at ON transaction_history(created_at DESC);
