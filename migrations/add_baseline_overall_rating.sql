-- Migration: Add baseline_overall_rating column to players table
-- This tracks the starting overall_rating for calculating performance bonuses
-- Performance bonus: +$5,000 per 3 points of overall_rating increase

ALTER TABLE players
ADD COLUMN IF NOT EXISTS baseline_overall_rating INTEGER DEFAULT 0;

-- Initialize baseline_overall_rating to current overall_rating for existing players
UPDATE players
SET baseline_overall_rating = overall_rating
WHERE baseline_overall_rating IS NULL OR baseline_overall_rating = 0;

