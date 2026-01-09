-- Add status and reason columns to transaction_history table

ALTER TABLE transaction_history
ADD COLUMN status text DEFAULT 'success' CHECK (status IN ('pending', 'success', 'failed')),
ADD COLUMN reason text;

-- Add index for better query performance
CREATE INDEX idx_transaction_history_user_status ON transaction_history(user_id, status);
CREATE INDEX idx_transaction_history_created_at ON transaction_history(created_at DESC);
