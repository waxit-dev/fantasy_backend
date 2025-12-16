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
- This score is calculated dynamically when teams are fetched, but stored for quick sorting

