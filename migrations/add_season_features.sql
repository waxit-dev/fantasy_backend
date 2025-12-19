-- Migration: Add season features (snapshots, rewards, notifications)
-- This extends the seasons functionality with additional features

-- Table to store leaderboard snapshots at season end
CREATE TABLE IF NOT EXISTS season_snapshots (
    id SERIAL PRIMARY KEY,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    team_name VARCHAR(255) NOT NULL,
    leaderboard_score DECIMAL(10, 2) NOT NULL,
    total_points DECIMAL(10, 2) NOT NULL,
    weekly_points DECIMAL(10, 2) NOT NULL,
    avg_team_rating DECIMAL(10, 2),
    position INTEGER NOT NULL,
    snapshot_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_season_snapshots_season ON season_snapshots(season_id);
CREATE INDEX IF NOT EXISTS idx_season_snapshots_team ON season_snapshots(team_id);
CREATE INDEX IF NOT EXISTS idx_season_snapshots_position ON season_snapshots(season_id, position);

-- Add reward columns to seasons table
ALTER TABLE seasons 
ADD COLUMN IF NOT EXISTS winner_reward_cash DECIMAL(10, 2) DEFAULT 50000,
ADD COLUMN IF NOT EXISTS winner_reward_points DECIMAL(10, 2) DEFAULT 1000,
ADD COLUMN IF NOT EXISTS rewards_distributed BOOLEAN DEFAULT FALSE;

-- Table for season notifications
CREATE TABLE IF NOT EXISTS season_notifications (
    id SERIAL PRIMARY KEY,
    season_id INTEGER REFERENCES seasons(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL, -- 'season_ending_soon', 'season_ended', 'winner_announced', 'rewards_distributed'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_read BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_season_notifications_season ON season_notifications(season_id);
CREATE INDEX IF NOT EXISTS idx_season_notifications_type ON season_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_season_notifications_read ON season_notifications(is_read);

-- Table for team notifications (user-specific)
CREATE TABLE IF NOT EXISTS team_notifications (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_read BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_team_notifications_team ON team_notifications(team_id);
CREATE INDEX IF NOT EXISTS idx_team_notifications_read ON team_notifications(team_id, is_read);

-- Table for season archives (optional data archiving)
CREATE TABLE IF NOT EXISTS season_archives (
    id SERIAL PRIMARY KEY,
    season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    archive_type VARCHAR(50) NOT NULL, -- 'team_data', 'player_data', 'task_completions'
    archive_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_season_archives_season ON season_archives(season_id);
CREATE INDEX IF NOT EXISTS idx_season_archives_type ON season_archives(archive_type);

