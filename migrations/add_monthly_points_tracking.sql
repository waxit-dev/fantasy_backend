-- Migration: Add monthly points tracking columns
-- These columns track points earned by players for salary calculations

-- Add monthly_points_earned to team_players table (points earned this month)
ALTER TABLE team_players 
ADD COLUMN IF NOT EXISTS monthly_points_earned DECIMAL(10, 2) DEFAULT 0;

-- Add last_monthly_reset to track when points were last reset
ALTER TABLE team_players 
ADD COLUMN IF NOT EXISTS last_monthly_reset TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add attribute points tracking for each player
-- These track the raw points earned for each attribute (before conversion to attribute values)
ALTER TABLE team_players
ADD COLUMN IF NOT EXISTS attendance_points DECIMAL(10, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS social_points DECIMAL(10, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS productivity_points DECIMAL(10, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS intensity_points DECIMAL(10, 4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS specialist_points DECIMAL(10, 4) DEFAULT 0;

-- Update existing records to have 0 for new columns (only if NULL)
-- Note: ADD COLUMN with DEFAULT already sets defaults for existing rows,
-- but this ensures consistency if migration is run multiple times
UPDATE team_players 
SET monthly_points_earned = COALESCE(monthly_points_earned, 0),
    attendance_points = COALESCE(attendance_points, 0),
    social_points = COALESCE(social_points, 0),
    productivity_points = COALESCE(productivity_points, 0),
    intensity_points = COALESCE(intensity_points, 0),
    specialist_points = COALESCE(specialist_points, 0),
    last_monthly_reset = COALESCE(last_monthly_reset, NOW())
WHERE monthly_points_earned IS NULL 
   OR attendance_points IS NULL 
   OR social_points IS NULL 
   OR productivity_points IS NULL 
   OR intensity_points IS NULL 
   OR specialist_points IS NULL
   OR last_monthly_reset IS NULL;

