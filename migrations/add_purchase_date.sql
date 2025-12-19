-- Migration: Add purchase_date column to team_players table
-- This tracks when a player was purchased to enforce contract cooldown periods

ALTER TABLE team_players
ADD COLUMN IF NOT EXISTS purchase_date TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Initialize purchase_date to NOW() for existing records (they've already been purchased)
UPDATE team_players
SET purchase_date = NOW()
WHERE purchase_date IS NULL;

