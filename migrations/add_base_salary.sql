-- Migration: Add base_salary column to players table
-- This column tracks cumulative salary increases from purchases ($10,000 per purchase)

ALTER TABLE players
ADD COLUMN IF NOT EXISTS base_salary DECIMAL(10, 2) DEFAULT 0;

-- Initialize base_salary to 0 for all existing players
UPDATE players
SET base_salary = 0
WHERE base_salary IS NULL;

