-- Migration: Add purchase_price column to team_players table
-- This tracks what each team paid for a player (for profit/loss calculations)

ALTER TABLE team_players
ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10, 2) DEFAULT 0;

-- Initialize purchase_price to 0 for existing records
UPDATE team_players
SET purchase_price = 0
WHERE purchase_price IS NULL;

