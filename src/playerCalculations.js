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
 * Calculate average attributes across all teams for a player
 * Updates the players table with averaged attributes and recalculates overall_rating
 */
const updatePlayerAttributesFromTeams = async (playerId) => {
    try {
        // Get all team instances of this player
        const teamPlayersQuery = `
            SELECT attendance, social, productivity, intensity, specialty_rating
            FROM team_players
            WHERE player_id = $1
        `;
        const teamPlayersResult = await db.query(teamPlayersQuery, [playerId]);
        
        if (teamPlayersResult.rows.length === 0) {
            // No teams own this player, keep current attributes or set defaults
            return;
        }
        
        // Calculate averages
        let totalAttendance = 0;
        let totalSocial = 0;
        let totalProductivity = 0;
        let totalIntensity = 0;
        let totalSpecialtyRating = 0;
        const count = teamPlayersResult.rows.length;
        
        teamPlayersResult.rows.forEach(row => {
            totalAttendance += parseFloat(row.attendance) || 0;
            totalSocial += parseFloat(row.social) || 0;
            totalProductivity += parseFloat(row.productivity) || 0;
            totalIntensity += parseFloat(row.intensity) || 0;
            totalSpecialtyRating += parseFloat(row.specialty_rating) || 0;
        });
        
        const avgAttendance = Math.round(totalAttendance / count);
        const avgSocial = Math.round(totalSocial / count);
        const avgProductivity = Math.round(totalProductivity / count);
        const avgIntensity = Math.round(totalIntensity / count);
        const avgSpecialtyRating = Math.round(totalSpecialtyRating / count);
        
        // Calculate overall rating from averaged attributes
        const overallRating = calculateOverallRating(
            avgAttendance,
            avgSocial,
            avgProductivity,
            avgIntensity,
            avgSpecialtyRating
        );
        
        // Round overall rating to integer since it's stored as INTEGER
        const roundedOverallRating = Math.round(overallRating);
        
        // Get current baseline rating - if not set, use current rating as baseline
        const getBaselineQuery = `SELECT COALESCE(baseline_overall_rating, 0) as baseline FROM players WHERE id = $1`;
        const baselineResult = await db.query(getBaselineQuery, [playerId]);
        const currentBaseline = parseFloat(baselineResult.rows[0]?.baseline) || 0;
        
        // If baseline is 0 or not set, set it to the new overall_rating (first time tracking)
        const newBaseline = currentBaseline === 0 ? roundedOverallRating : currentBaseline;
        
        // Update players table with averaged attributes
        const updateQuery = `
            UPDATE players
            SET attendance = $1::INTEGER,
                social = $2::INTEGER,
                productivity = $3::INTEGER,
                intensity = $4::INTEGER,
                specialty_rating = $5::INTEGER,
                overall_rating = $6::INTEGER,
                baseline_overall_rating = CASE 
                    WHEN baseline_overall_rating IS NULL OR baseline_overall_rating = 0 
                    THEN $6::INTEGER 
                    ELSE baseline_overall_rating 
                END
            WHERE id = $7
        `;
        await db.query(updateQuery, [
            avgAttendance,
            avgSocial,
            avgProductivity,
            avgIntensity,
            avgSpecialtyRating,
            roundedOverallRating,
            playerId
        ]);
        
        console.log(`Updated player ${playerId} attributes from ${count} teams:`, {
            attendance: avgAttendance,
            social: avgSocial,
            productivity: avgProductivity,
            intensity: avgIntensity,
            specialty_rating: avgSpecialtyRating,
            overall_rating: roundedOverallRating
        });
        
        return {
            attendance: avgAttendance,
            social: avgSocial,
            productivity: avgProductivity,
            intensity: avgIntensity,
            specialty_rating: avgSpecialtyRating,
            overall_rating: roundedOverallRating
        };
    } catch (error) {
        console.error('Error updating player attributes from teams:', error);
        throw error;
    }
};

/**
 * Increase player's base salary by $10,000 when purchased
 * This creates a permanent price increase for future purchases
 */
const increasePlayerBaseSalary = async (playerId) => {
    try {
        const updateQuery = `
            UPDATE players
            SET base_salary = COALESCE(base_salary, salary, 0) + 10000
            WHERE id = $1
        `;
        await db.query(updateQuery, [playerId]);
        
        // Get updated base salary
        const getQuery = `SELECT base_salary FROM players WHERE id = $1`;
        const result = await db.query(getQuery, [playerId]);
        return parseFloat(result.rows[0]?.base_salary) || 0;
    } catch (error) {
        console.error('Error increasing player base salary:', error);
        throw error;
    }
};

/**
 * Calculate player salary using dynamic formula:
 * Base: $100,000 (flat starting salary) + base_salary increases from purchases
 * Demand: +$10,000 per team that owns the player
 * Performance: +$5,000 per 3 points of overall_rating increase (from baseline)
 */
const calculatePlayerSalary = async (playerId) => {
    try {
        // Get player's base_salary, overall_rating, and baseline_overall_rating
        const playerQuery = `
            SELECT 
                COALESCE(base_salary, 0) as base_salary,
                COALESCE(overall_rating, 0) as overall_rating,
                COALESCE(baseline_overall_rating, overall_rating, 0) as baseline_overall_rating
            FROM players 
            WHERE id = $1
        `;
        const playerResult = await db.query(playerQuery, [playerId]);
        
        if (playerResult.rows.length === 0) {
            return null;
        }
        
        const baseSalaryIncrease = parseFloat(playerResult.rows[0].base_salary) || 0;
        const currentRating = parseFloat(playerResult.rows[0].overall_rating) || 0;
        const baselineRating = parseFloat(playerResult.rows[0].baseline_overall_rating) || 0;
        
        // Base salary: flat $100,000 starting salary + increases from purchases
        const baseSalary = 100000 + baseSalaryIncrease;
        
        // Demand multiplier: count teams that own this player
        const demandQuery = `SELECT COUNT(*) as team_count FROM team_players WHERE player_id = $1`;
        const demandResult = await db.query(demandQuery, [playerId]);
        const teamCount = parseInt(demandResult.rows[0].team_count) || 0;
        const demandBonus = teamCount * 10000;
        
        // Performance bonus: +$5,000 per 3 points of overall_rating increase from baseline
        const ratingIncrease = Math.max(0, currentRating - baselineRating);
        const performanceBonus = Math.floor(ratingIncrease / 3) * 5000;
        
        const totalSalary = baseSalary + demandBonus + performanceBonus;
        
        // Update player's salary
        const updateQuery = `UPDATE players SET salary = $1::numeric WHERE id = $2`;
        await db.query(updateQuery, [totalSalary, playerId]);
        
        console.log(`Player ${playerId} salary calculation: base=${baseSalary}, demand=${demandBonus}, performance=${performanceBonus} (rating: ${baselineRating} -> ${currentRating}, increase: ${ratingIncrease})`);
        
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

/**
 * Recalculate overall_rating for all players in the players table
 * This ensures all players have correct overall_rating based on their current attributes
 */
const recalculateAllPlayerOverallRatings = async () => {
    try {
        // Get all players with their current attributes
        const playersQuery = `
            SELECT id, attendance, social, productivity, intensity, specialty_rating
            FROM players
        `;
        const playersResult = await db.query(playersQuery);
        
        let updatedCount = 0;
        
        for (const player of playersResult.rows) {
            const attendance = parseFloat(player.attendance) || 0;
            const social = parseFloat(player.social) || 0;
            const productivity = parseFloat(player.productivity) || 0;
            const intensity = parseFloat(player.intensity) || 0;
            const specialtyRating = parseFloat(player.specialty_rating) || 0;
            
            // Calculate overall rating
            const overallRating = calculateOverallRating(
                attendance,
                social,
                productivity,
                intensity,
                specialtyRating
            );
            
            // Round to integer
            const roundedOverallRating = Math.round(overallRating);
            
            // Update the player's overall_rating
            const updateQuery = `
                UPDATE players
                SET overall_rating = $1::INTEGER
                WHERE id = $2
            `;
            await db.query(updateQuery, [roundedOverallRating, player.id]);
            updatedCount++;
        }
        
        console.log(`Recalculated overall_rating for ${updatedCount} players`);
        return updatedCount;
    } catch (error) {
        console.error('Error recalculating all player overall ratings:', error);
        throw error;
    }
};

module.exports = {
    calculateOverallRating,
    updatePlayerOverallRating,
    calculatePlayerSalary,
    calculateTeamScore,
    updatePlayerAttributesFromTeams,
    increasePlayerBaseSalary,
    recalculateAllPlayerOverallRatings
};

