-- Migration: Add seasons table
-- This table tracks seasons, their dates, and winners

CREATE TABLE IF NOT EXISTS seasons (
    id SERIAL PRIMARY KEY,
    season_number INTEGER NOT NULL UNIQUE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    winner_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    winner_team_name VARCHAR(255),
    winner_leaderboard_score DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'pending')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_seasons_status ON seasons(status);
CREATE INDEX IF NOT EXISTS idx_seasons_dates ON seasons(start_date, end_date);

-- Insert the predefined seasons
INSERT INTO seasons (season_number, start_date, end_date, status) VALUES
    (1, '2026-01-23', '2026-04-23', 'active'),
    (2, '2026-04-23', '2026-07-23', 'pending'),
    (3, '2026-07-23', '2026-10-23', 'pending'),
    (4, '2026-10-23', '2026-12-18', 'pending')
ON CONFLICT (season_number) DO NOTHING;

