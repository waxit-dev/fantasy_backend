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
