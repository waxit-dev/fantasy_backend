-- Migration: Add task_delegations table
-- This table tracks which teams were delegated items during task completion

CREATE TABLE IF NOT EXISTS task_delegations (
    id SERIAL PRIMARY KEY,
    task_completion_id INTEGER NOT NULL REFERENCES task_completions(id) ON DELETE CASCADE,
    delegated_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    delegating_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    task_item_id VARCHAR(255), -- The ID of the checklist item that was delegated
    points_awarded DECIMAL(10, 2) DEFAULT 0, -- Points awarded to the delegated team
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_task_delegations_completion ON task_delegations(task_completion_id);
CREATE INDEX IF NOT EXISTS idx_task_delegations_delegated_team ON task_delegations(delegated_team_id);
CREATE INDEX IF NOT EXISTS idx_task_delegations_delegating_team ON task_delegations(delegating_team_id);

