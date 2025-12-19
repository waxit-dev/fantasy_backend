-- Migration: Add purchase_date column to team_players table
-- This tracks when a player was purchased to enforce 6-week cooldown before sale/trade

ALTER TABLE team_players
ADD COLUMN IF NOT EXISTS purchase_date TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Set purchase_date to NOW() for existing records (they've already been purchased)
UPDATE team_players
SET purchase_date = NOW()
WHERE purchase_date IS NULL;

