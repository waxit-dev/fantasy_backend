-- Migration: Add task_player_assignments table
-- This table tracks which players are assigned to which task items

CREATE TABLE IF NOT EXISTS task_player_assignments (
    id SERIAL PRIMARY KEY,
    task_completion_id INTEGER NOT NULL REFERENCES task_completions(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    task_item_id VARCHAR(255) NOT NULL, -- The ID of the checklist item from the task
    points_earned DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient queries by player and date
CREATE INDEX IF NOT EXISTS idx_task_player_assignments_player ON task_player_assignments(player_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_player_assignments_team ON task_player_assignments(team_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_player_assignments_completion ON task_player_assignments(task_completion_id);

