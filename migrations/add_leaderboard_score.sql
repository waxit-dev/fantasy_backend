-- Migration: Add leaderboard_score column to teams table
-- This column will store: total_points + (average overall rating of team players * 0.25)

ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS leaderboard_score DECIMAL(10, 2) DEFAULT 0;

-- Update existing teams to calculate leaderboard_score
-- Note: This will be calculated dynamically in the application, but we set a default here
UPDATE teams 
SET leaderboard_score = COALESCE(total_points, 0) 
WHERE leaderboard_score IS NULL;

