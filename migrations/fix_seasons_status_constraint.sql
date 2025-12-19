-- Migration: Fix seasons status constraint to include 'pending'
-- This fixes the constraint if the table was already created with the old constraint

-- Drop the old constraint if it exists
ALTER TABLE seasons DROP CONSTRAINT IF EXISTS seasons_status_check;

-- Add the new constraint with 'pending' included
ALTER TABLE seasons ADD CONSTRAINT seasons_status_check 
    CHECK (status IN ('active', 'completed', 'pending'));

