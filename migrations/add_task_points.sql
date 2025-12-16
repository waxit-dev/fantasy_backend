-- Migration: Add task_points column to teams table
-- This column will track points earned from completing tasks

ALTER TABLE teams 
ADD COLUMN IF NOT EXISTS task_points DECIMAL(10, 2) DEFAULT 0;

-- Update existing teams to have 0 task_points if the column was just added
UPDATE teams 
SET task_points = 0 
WHERE task_points IS NULL;

