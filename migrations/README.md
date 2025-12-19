# Database Migrations

## Migration: Add task_points column

### File: `add_task_points.sql`

This migration adds a `task_points` column to the `teams` table to track points earned from completing tasks.

### How to run:

1. Connect to your PostgreSQL database
2. Run the SQL script:

```bash
psql -d your_database_name -f migrations/add_task_points.sql
```

Or if using a connection string:

```bash
psql $DATABASE_URL -f migrations/add_task_points.sql
```

### What it does:

- Adds a `task_points` column of type `DECIMAL(10, 2)` to the `teams` table
- Sets default value to 0 for all existing teams
- The column will track points earned from task completions separately from other point sources

---

## Migration: Add leaderboard_score column

### File: `add_leaderboard_score.sql`

This migration adds a `leaderboard_score` column to the `teams` table to store the calculated leaderboard position score.

### How to run:

1. Connect to your PostgreSQL database
2. Run the SQL script:

```bash
psql -d your_database_name -f migrations/add_leaderboard_score.sql
```

Or if using a connection string:

```bash
psql $DATABASE_URL -f migrations/add_leaderboard_score.sql
```

### What it does:

- Adds a `leaderboard_score` column of type `DECIMAL(10, 2)` to the `teams` table
- Sets default value to 0 for all existing teams
- The column stores: `total_points + (average overall rating of team players * 0.25)`
- This score is calculated dynamically in the application, but stored for quick sorting

---

## Migration: Add task_completions table

### File: `add_task_completions.sql`

This migration creates a table to track task completions with metadata needed for point calculations.

### How to run:

```bash
psql $DATABASE_URL -f migrations/add_task_completions.sql
```

### What it does:

- Creates `task_completions` table to track when tasks are completed
- Stores task_id, team_id, completion date, tags, and task type
- Includes indexes for efficient queries by team and date

---

## Migration: Add task_player_assignments table

### File: `add_task_player_assignments.sql`

This migration creates a table to track which players are assigned to which task items.

### How to run:

```bash
psql $DATABASE_URL -f migrations/add_task_player_assignments.sql
```

### What it does:

- Creates `task_player_assignments` table to link players to task items
- Tracks which players worked on which items in completed tasks
- Includes indexes for efficient queries by player and team

---

## Migration: Add monthly points tracking

### File: `add_monthly_points_tracking.sql`

This migration adds columns to track monthly points earned by players for salary calculations.

### How to run:

```bash
psql $DATABASE_URL -f migrations/add_monthly_points_tracking.sql
```

### What it does:

- Adds `monthly_points_earned` column to `team_players` table
- Adds `last_monthly_reset` timestamp to track when points were last reset
- Adds attribute-specific point tracking columns (attendance_points, social_points, productivity_points, intensity_points, specialist_points)
- These columns track raw points earned for each attribute before conversion to attribute values

---

## Migration: Add purchase_date column

### File: `add_purchase_date.sql`

This migration adds a `purchase_date` column to track when players were purchased, enabling contract cooldown enforcement.

### How to run:

```bash
psql $DATABASE_URL -f migrations/add_purchase_date.sql
```

### What it does:

- Adds `purchase_date` column of type `TIMESTAMP WITH TIME ZONE` to `team_players` table
- Sets default value to `NOW()` for all existing records
- This date is used to enforce a 6-week (42 day) cooldown period before players can be sold
- After the cooldown, teams can sell players at current market value to profit from development

---

## Migration: Add task_disputes and task_dispute_resolutions tables

### File: `add_task_disputes.sql`

This migration creates tables to track disputes on task completions and their resolutions.

### How to run:

```bash
psql $DATABASE_URL -f migrations/add_task_disputes.sql
```

### What it does:

- Creates `task_disputes` table to track which teams dispute which task completions
- Prevents duplicate disputes from the same team using a UNIQUE constraint
- Creates `task_dispute_resolutions` table to track when penalties are applied
- When 3 or more teams dispute a task completion, the team that completed it is fined $15,000 and loses 50 total points
- Includes indexes for efficient queries by task completion and team

---

## Migration: Add seasons table

### File: `add_seasons.sql`

This migration creates a table to track seasons, their dates, and winners.

### How to run:

```bash
psql $DATABASE_URL -f migrations/add_seasons.sql
```

### What it does:

- Creates `seasons` table to track seasons, their start/end dates, and winners
- Pre-inserts 4 seasons:
  - Season 1: Jan 23, 2026 - Apr 23, 2026
  - Season 2: Apr 23, 2026 - Jul 23, 2026
  - Season 3: Jul 23, 2026 - Oct 23, 2026
  - Season 4: Oct 23, 2026 - Dec 18, 2026
- Tracks winner team ID, name, and leaderboard score when season ends
- Includes status field ('active', 'completed', 'pending')
- Includes indexes for efficient queries by status and dates

---

## Migration: Add season features (snapshots, rewards, notifications)

### File: `add_season_features.sql`

This migration extends the seasons functionality with additional features for snapshots, rewards, and notifications.

### How to run:

```bash
psql $DATABASE_URL -f migrations/add_season_features.sql
```

### What it does:

- Creates `season_snapshots` table to store leaderboard positions at season end
- Adds reward columns to `seasons` table (winner_reward_cash, winner_reward_points, rewards_distributed)
- Creates `season_notifications` table for global season-related notifications
- Creates `team_notifications` table for team-specific notifications
- Creates `season_archives` table for optional data archiving
- Includes indexes for efficient queries on all new tables
- Default rewards: $50,000 cash and 1,000 points for season winners
