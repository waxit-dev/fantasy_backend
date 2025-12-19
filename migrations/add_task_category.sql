-- Migration: Add task_category column to task_completions table
-- This column stores whether a task is 'warehouse' or 'office' type

ALTER TABLE task_completions 
ADD COLUMN IF NOT EXISTS task_category VARCHAR(20) CHECK (task_category IN ('warehouse', 'office'));

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_task_completions_category ON task_completions(task_category);

