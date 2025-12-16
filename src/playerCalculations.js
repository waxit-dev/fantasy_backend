const db = require('./db');

/**
 * Calculate overall rating as mean of 5 attributes, capped at 99
 * Formula: min(99, (attendance + social + productivity + intensity + specialty_rating) / 5)
 */
const calculateOverallRating = (attendance, social, productivity, intensity, specialtyRating) => {
    const mean = (attendance + social + productivity + intensity + specialtyRating) / 5;
    return Math.min(99, mean);
};

/**
 * Update a player's overall rating based on their current attributes
 */
const updatePlayerOverallRating = async (playerId, teamId = null) => {
    try {
        let query, params;
        
        if (teamId) {
            // Update team_players table
            query = `
                UPDATE team_players
                SET overall_rating = LEAST(99, (attendance + social + productivity + intensity + specialty_rating) / 5.0)
                WHERE player_id = $1 AND team_id = $2
                RETURNING overall_rating
            `;
            params = [playerId, teamId];
        } else {
            // Update players table (base player)
            query = `
                UPDATE players
                SET overall_rating = LEAST(99, (attendance + social + productivity + intensity + specialty_rating) / 5.0)
                WHERE id = $1
                RETURNING overall_rating
            `;
            params = [playerId];
        }
        
        const result = await db.query(query, params);
        return result.rows[0]?.overall_rating || null;
    } catch (error) {
        console.error('Error updating overall rating:', error);
        throw error;
    }
};

/**
 * Calculate player salary using dynamic formula:
 * Base: $100,000 × (Overall Rating / 80)
 * Demand: +$10,000 per team that owns the player
 * Performance: +$5,000 per 3 overall player points earned this month
 */
const calculatePlayerSalary = async (playerId) => {
    try {
        // Get player's overall rating from base players table
        const playerQuery = `SELECT overall_rating FROM players WHERE id = $1`;
        const playerResult = await db.query(playerQuery, [playerId]);
        
        if (playerResult.rows.length === 0) {
            return null;
        }
        
        const overallRating = parseFloat(playerResult.rows[0].overall_rating) || 0;
        
        // Base salary
        const baseSalary = 100000 * (overallRating / 80);
        
        // Demand multiplier: count teams that own this player
        const demandQuery = `SELECT COUNT(*) as team_count FROM team_players WHERE player_id = $1`;
        const demandResult = await db.query(demandQuery, [playerId]);
        const teamCount = parseInt(demandResult.rows[0].team_count) || 0;
        const demandBonus = teamCount * 10000;
        
        // Performance bonus: get monthly points from all team_players instances
        // We sum monthly_points_earned from all teams for this player
        const performanceQuery = `
            SELECT COALESCE(SUM(monthly_points_earned), 0) as total_monthly_points
            FROM team_players
            WHERE player_id = $1
        `;
        const performanceResult = await db.query(performanceQuery, [playerId]);
        const totalMonthlyPoints = parseFloat(performanceResult.rows[0].total_monthly_points) || 0;
        const performanceBonus = Math.floor(totalMonthlyPoints / 3) * 5000;
        
        const totalSalary = baseSalary + demandBonus + performanceBonus;
        
        // Update player's salary
        const updateQuery = `UPDATE players SET salary = $1::numeric WHERE id = $2`;
        await db.query(updateQuery, [totalSalary, playerId]);
        
        return totalSalary;
    } catch (error) {
        console.error('Error calculating player salary:', error);
        throw error;
    }
};

/**
 * Calculate team score using weighted formula:
 * (Average Overall Rating × 100) + (Budget Remaining / 1000) + (Total Team Points / 10)
 */
const calculateTeamScore = async (teamId) => {
    try {
        // Get team data
        const teamQuery = `SELECT cash, total_points FROM teams WHERE id = $1`;
        const teamResult = await db.query(teamQuery, [teamId]);
        
        if (teamResult.rows.length === 0) {
            return null;
        }
        
        const team = teamResult.rows[0];
        const budgetRemaining = parseFloat(team.cash) || 0;
        const totalPoints = parseFloat(team.total_points) || 0;
        
        // Get average overall rating of team players
        const avgRatingQuery = `
            SELECT COALESCE(AVG(overall_rating), 0) as avg_rating
            FROM team_players
            WHERE team_id = $1
        `;
        const avgRatingResult = await db.query(avgRatingQuery, [teamId]);
        const avgRating = parseFloat(avgRatingResult.rows[0].avg_rating) || 0;
        
        // Calculate weighted score
        const teamScore = (avgRating * 100) + (budgetRemaining / 1000) + (totalPoints / 10);
        
        // Update leaderboard_score
        const updateQuery = `UPDATE teams SET leaderboard_score = $1::numeric WHERE id = $2`;
        await db.query(updateQuery, [teamScore, teamId]);
        
        return teamScore;
    } catch (error) {
        console.error('Error calculating team score:', error);
        throw error;
    }
};

module.exports = {
    calculateOverallRating,
    updatePlayerOverallRating,
    calculatePlayerSalary,
    calculateTeamScore
};

