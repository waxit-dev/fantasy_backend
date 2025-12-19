-- Migration: Set all player salaries to $100,000 as initial base
-- This ensures all players start at the same base salary before any purchases

-- Set all player salaries to $100,000 (flat starting salary)
UPDATE players
SET salary = 100000;

-- Also ensure base_salary is 0 for all players (no purchase increases yet)
UPDATE players
SET base_salary = 0
WHERE base_salary IS NULL;
