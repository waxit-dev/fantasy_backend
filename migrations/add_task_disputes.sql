-- Migration: Add task_disputes table
-- This table tracks which teams dispute which task completions

CREATE TABLE IF NOT EXISTS task_disputes (
    id SERIAL PRIMARY KEY,
    task_completion_id INTEGER NOT NULL REFERENCES task_completions(id) ON DELETE CASCADE,
    disputing_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(task_completion_id, disputing_team_id) -- Prevent duplicate disputes from same team
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_task_disputes_completion ON task_disputes(task_completion_id);
CREATE INDEX IF NOT EXISTS idx_task_disputes_team ON task_disputes(disputing_team_id);

-- Table to track resolved disputes (when penalties are applied)
CREATE TABLE IF NOT EXISTS task_dispute_resolutions (
    id SERIAL PRIMARY KEY,
    task_completion_id INTEGER NOT NULL REFERENCES task_completions(id) ON DELETE CASCADE,
    disputed_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    dispute_count INTEGER NOT NULL,
    fine_amount DECIMAL(10, 2) DEFAULT 15000,
    points_penalty INTEGER DEFAULT 50,
    resolved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_dispute_resolutions_completion ON task_dispute_resolutions(task_completion_id);
CREATE INDEX IF NOT EXISTS idx_task_dispute_resolutions_team ON task_dispute_resolutions(disputed_team_id);

