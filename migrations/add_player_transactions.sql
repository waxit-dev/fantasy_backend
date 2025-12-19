-- Migration: Add player_transactions table
-- This table tracks purchase and sale history for profit/loss calculations

CREATE TABLE IF NOT EXISTS player_transactions (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('purchase', 'sale')),
    price DECIMAL(10, 2) NOT NULL,
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_player_transactions_player ON player_transactions(player_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_player_transactions_team ON player_transactions(team_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_player_transactions_type ON player_transactions(transaction_type, transaction_date);

