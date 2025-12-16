-- Migration: Add task_completions table
-- This table tracks task completions with metadata needed for point calculations

CREATE TABLE IF NOT EXISTS task_completions (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) NOT NULL,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    task_tags TEXT[], -- Array of tags for the task (e.g., ['customer service', 'collaborative'])
    task_type VARCHAR(50), -- Type of task (e.g., 'customer service', 'collaborative', etc.)
    points_awarded DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient queries by team and date
CREATE INDEX IF NOT EXISTS idx_task_completions_team_date ON task_completions(team_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_task_completions_date ON task_completions(completed_at);

