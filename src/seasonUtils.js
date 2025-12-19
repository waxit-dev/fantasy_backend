const db = require('./db');

/**
 * Get the current active season based on today's date
 * @returns {Promise<Object|null>} Current season object or null if no active season
 */
const getCurrentSeason = async () => {
    try {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD
        
        const query = `
            SELECT * FROM seasons 
            WHERE start_date <= $1::date 
            AND end_date >= $1::date 
            AND status = 'active'
            ORDER BY season_number ASC
            LIMIT 1
        `;
        
        const result = await db.query(query, [todayStr]);
        
        if (result.rows.length === 0) {
            // Check if we need to activate the next season
            const nextSeasonQuery = `
                SELECT * FROM seasons 
                WHERE start_date <= $1::date 
                AND status = 'pending'
                ORDER BY season_number ASC
                LIMIT 1
            `;
            const nextResult = await db.query(nextSeasonQuery, [todayStr]);
            
            if (nextResult.rows.length > 0) {
                // Activate the next season
                const nextSeason = nextResult.rows[0];
                await db.query(
                    `UPDATE seasons SET status = 'active' WHERE id = $1`,
                    [nextSeason.id]
                );
                return nextSeason;
            }
            
            return null;
        }
        
        return result.rows[0];
    } catch (error) {
        console.error('Error getting current season:', error);
        throw error;
    }
};

/**
 * Get all seasons (for history/display)
 * @returns {Promise<Array>} Array of all seasons
 */
const getAllSeasons = async () => {
    try {
        const query = `
            SELECT * FROM seasons 
            ORDER BY season_number ASC
        `;
        const result = await db.query(query);
        return result.rows;
    } catch (error) {
        console.error('Error getting all seasons:', error);
        throw error;
    }
};

/**
 * Calculate time remaining until season end
 * @param {Date} endDate - Season end date
 * @returns {Object} Object with days, hours, minutes, seconds remaining
 */
const calculateTimeRemaining = (endDate) => {
    const now = new Date();
    const end = new Date(endDate);
    const diff = end - now;
    
    if (diff <= 0) {
        return {
            days: 0,
            hours: 0,
            minutes: 0,
            seconds: 0,
            totalSeconds: 0,
            isExpired: true
        };
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return {
        days,
        hours,
        minutes,
        seconds,
        totalSeconds: Math.floor(diff / 1000),
        isExpired: false
    };
};

/**
 * Create leaderboard snapshot for a season
 * @param {number} seasonId - Season ID
 * @returns {Promise<Array>} Array of snapshot records
 */
const createLeaderboardSnapshot = async (seasonId) => {
    try {
        // Get all teams with their current scores and ratings
        const teamsQuery = `
            SELECT 
                t.id,
                t.name,
                t.leaderboard_score,
                t.total_points,
                t.weekly_points,
                COALESCE(AVG(tp.overall_rating), 0) as avg_team_rating
            FROM teams t
            LEFT JOIN team_players tp ON t.id = tp.team_id
            GROUP BY t.id, t.name, t.leaderboard_score, t.total_points, t.weekly_points
            ORDER BY t.leaderboard_score DESC
        `;
        const teamsResult = await db.query(teamsQuery);
        
        const snapshots = [];
        let position = 1;
        
        for (const team of teamsResult.rows) {
            const snapshotQuery = `
                INSERT INTO season_snapshots 
                (season_id, team_id, team_name, leaderboard_score, total_points, weekly_points, avg_team_rating, position)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
            `;
            const snapshotResult = await db.query(snapshotQuery, [
                seasonId,
                team.id,
                team.name,
                parseFloat(team.leaderboard_score) || 0,
                parseFloat(team.total_points) || 0,
                parseFloat(team.weekly_points) || 0,
                parseFloat(team.avg_team_rating) || 0,
                position
            ]);
            
            snapshots.push(snapshotResult.rows[0]);
            position++;
        }
        
        return snapshots;
    } catch (error) {
        console.error('Error creating leaderboard snapshot:', error);
        throw error;
    }
};

/**
 * Distribute rewards to season winner
 * @param {number} seasonId - Season ID
 * @param {number} winnerTeamId - Winner team ID
 * @returns {Promise<Object>} Reward distribution result
 */
const distributeSeasonRewards = async (seasonId, winnerTeamId) => {
    try {
        // Get season reward amounts
        const seasonQuery = `SELECT winner_reward_cash, winner_reward_points, rewards_distributed FROM seasons WHERE id = $1`;
        const seasonResult = await db.query(seasonQuery, [seasonId]);
        
        if (seasonResult.rows.length === 0) {
            throw new Error('Season not found');
        }
        
        const season = seasonResult.rows[0];
        
        if (season.rewards_distributed) {
            return {
                alreadyDistributed: true,
                cashReward: parseFloat(season.winner_reward_cash) || 0,
                pointsReward: parseFloat(season.winner_reward_points) || 0
            };
        }
        
        const cashReward = parseFloat(season.winner_reward_cash) || 50000;
        const pointsReward = parseFloat(season.winner_reward_points) || 1000;
        
        // Get current team data
        const teamQuery = `SELECT cash, total_points FROM teams WHERE id = $1`;
        const teamResult = await db.query(teamQuery, [winnerTeamId]);
        
        if (teamResult.rows.length === 0) {
            throw new Error('Winner team not found');
        }
        
        const team = teamResult.rows[0];
        const newCash = parseFloat(team.cash || 0) + cashReward;
        const newTotalPoints = parseFloat(team.total_points || 0) + pointsReward;
        
        // Update team with rewards
        const updateTeamQuery = `
            UPDATE teams 
            SET cash = $1::numeric,
                total_points = $2::numeric
            WHERE id = $3
        `;
        await db.query(updateTeamQuery, [newCash, newTotalPoints, winnerTeamId]);
        
        // Mark rewards as distributed
        await db.query(
            `UPDATE seasons SET rewards_distributed = TRUE WHERE id = $1`,
            [seasonId]
        );
        
        return {
            alreadyDistributed: false,
            cashReward,
            pointsReward,
            newCash,
            newTotalPoints
        };
    } catch (error) {
        console.error('Error distributing season rewards:', error);
        throw error;
    }
};

/**
 * Create notification for all teams
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {number} seasonId - Optional season ID
 */
const createGlobalNotification = async (type, title, message, seasonId = null) => {
    try {
        const insertQuery = `
            INSERT INTO season_notifications (season_id, notification_type, title, message)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const result = await db.query(insertQuery, [seasonId, type, title, message]);
        return result.rows[0];
    } catch (error) {
        console.error('Error creating global notification:', error);
        throw error;
    }
};

/**
 * Create notification for a specific team
 * @param {number} teamId - Team ID
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 */
const createTeamNotification = async (teamId, type, title, message) => {
    try {
        const insertQuery = `
            INSERT INTO team_notifications (team_id, notification_type, title, message)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const result = await db.query(insertQuery, [teamId, type, title, message]);
        return result.rows[0];
    } catch (error) {
        console.error('Error creating team notification:', error);
        throw error;
    }
};

/**
 * Reset weekly points for all teams (called at season start)
 */
const resetWeeklyPoints = async () => {
    try {
        const updateQuery = `UPDATE teams SET weekly_points = 0`;
        await db.query(updateQuery);
        console.log('Weekly points reset for all teams');
    } catch (error) {
        console.error('Error resetting weekly points:', error);
        throw error;
    }
};

/**
 * Determine and store the winner of a completed season
 * @param {number} seasonId - Season ID
 * @returns {Promise<Object>} Winner information
 */
const determineSeasonWinner = async (seasonId) => {
    try {
        // Get the season
        const seasonQuery = `SELECT * FROM seasons WHERE id = $1`;
        const seasonResult = await db.query(seasonQuery, [seasonId]);
        
        if (seasonResult.rows.length === 0) {
            throw new Error('Season not found');
        }
        
        const season = seasonResult.rows[0];
        
        if (season.status === 'completed') {
            // Already completed, return existing winner
            return {
                seasonId: season.id,
                seasonNumber: season.season_number,
                winnerTeamId: season.winner_team_id,
                winnerTeamName: season.winner_team_name,
                winnerScore: season.winner_leaderboard_score
            };
        }
        
        // Create leaderboard snapshot BEFORE determining winner
        await createLeaderboardSnapshot(seasonId);
        
        // Get team with highest leaderboard_score at season end
        const winnerQuery = `
            SELECT id, name, leaderboard_score 
            FROM teams 
            ORDER BY leaderboard_score DESC 
            LIMIT 1
        `;
        const winnerResult = await db.query(winnerQuery);
        
        if (winnerResult.rows.length === 0) {
            throw new Error('No teams found');
        }
        
        const winner = winnerResult.rows[0];
        
        // Update season with winner
        const updateQuery = `
            UPDATE seasons 
            SET winner_team_id = $1,
                winner_team_name = $2,
                winner_leaderboard_score = $3,
                status = 'completed',
                completed_at = NOW()
            WHERE id = $4
            RETURNING *
        `;
        
        const updateResult = await db.query(updateQuery, [
            winner.id,
            winner.name,
            winner.leaderboard_score,
            seasonId
        ]);
        
        // Create global notification for season end
        await createGlobalNotification(
            'season_ended',
            `Season ${season.season_number} Ended!`,
            `Season ${season.season_number} has ended. ${winner.name} is the winner with a score of ${parseFloat(winner.leaderboard_score).toFixed(2)}!`,
            seasonId
        );
        
        // Create winner announcement notification
        await createGlobalNotification(
            'winner_announced',
            `🏆 Season ${season.season_number} Winner: ${winner.name}!`,
            `Congratulations to ${winner.name} for winning Season ${season.season_number} with a leaderboard score of ${parseFloat(winner.leaderboard_score).toFixed(2)}!`,
            seasonId
        );
        
        // Create notification for the winner team
        await createTeamNotification(
            winner.id,
            'season_winner',
            `🏆 You Won Season ${season.season_number}!`,
            `Congratulations! You are the winner of Season ${season.season_number} with a score of ${parseFloat(winner.leaderboard_score).toFixed(2)}. Rewards will be distributed shortly.`
        );
        
        // Distribute rewards
        await distributeSeasonRewards(seasonId, winner.id);
        
        // Create reward notification
        await createGlobalNotification(
            'rewards_distributed',
            `Season ${season.season_number} Rewards Distributed`,
            `Rewards have been distributed to ${winner.name} for winning Season ${season.season_number}!`,
            seasonId
        );
        
        return {
            seasonId: season.id,
            seasonNumber: season.season_number,
            winnerTeamId: winner.id,
            winnerTeamName: winner.name,
            winnerScore: parseFloat(winner.leaderboard_score) || 0
        };
    } catch (error) {
        console.error('Error determining season winner:', error);
        throw error;
    }
};

/**
 * Check if season is ending soon (within 7 days) and create notification
 */
const checkSeasonEndingSoon = async () => {
    try {
        const currentSeason = await getCurrentSeason();
        if (!currentSeason) return;
        
        const timeRemaining = calculateTimeRemaining(currentSeason.end_date);
        
        // Check if season ends in 7 days or less
        if (timeRemaining.days <= 7 && timeRemaining.days > 0 && !timeRemaining.isExpired) {
            // Check if we already created this notification today
            const today = new Date().toISOString().split('T')[0];
            const existingQuery = `
                SELECT id FROM season_notifications 
                WHERE season_id = $1 
                AND notification_type = 'season_ending_soon'
                AND DATE(created_at) = $2::date
            `;
            const existing = await db.query(existingQuery, [currentSeason.id, today]);
            
            if (existing.rows.length === 0) {
                await createGlobalNotification(
                    'season_ending_soon',
                    `Season ${currentSeason.season_number} Ending Soon!`,
                    `Only ${timeRemaining.days} day${timeRemaining.days !== 1 ? 's' : ''} remaining in Season ${currentSeason.season_number}! Make your final push to the top!`,
                    currentSeason.id
                );
            }
        }
    } catch (error) {
        console.error('Error checking season ending soon:', error);
    }
};

/**
 * Check if any seasons have ended and need to be completed
 * This should be called periodically (e.g., via cron job or scheduled task)
 */
const checkAndCompleteSeasons = async () => {
    try {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        // Check for season ending soon
        await checkSeasonEndingSoon();
        
        // Find active seasons that have ended
        const expiredSeasonsQuery = `
            SELECT * FROM seasons 
            WHERE status = 'active' 
            AND end_date < $1::date
        `;
        const expiredResult = await db.query(expiredSeasonsQuery, [todayStr]);
        
        const completed = [];
        
        for (const season of expiredResult.rows) {
            const winner = await determineSeasonWinner(season.id);
            completed.push(winner);
            
            // Activate next season if it exists
            const nextSeasonQuery = `
                SELECT * FROM seasons 
                WHERE season_number = $1 
                AND status = 'pending'
            `;
            const nextResult = await db.query(nextSeasonQuery, [season.season_number + 1]);
            
            if (nextResult.rows.length > 0) {
                const nextSeason = nextResult.rows[0];
                await db.query(
                    `UPDATE seasons SET status = 'active' WHERE id = $1`,
                    [nextSeason.id]
                );
                
                // Reset weekly points for new season
                await resetWeeklyPoints();
                
                // Create notification for new season
                await createGlobalNotification(
                    'season_started',
                    `Season ${nextSeason.season_number} Started!`,
                    `Season ${nextSeason.season_number} has begun! Good luck to all teams!`,
                    nextSeason.id
                );
            }
        }
        
        return completed;
    } catch (error) {
        console.error('Error checking and completing seasons:', error);
        throw error;
    }
};

/**
 * Get season snapshot (leaderboard at season end)
 * @param {number} seasonId - Season ID
 * @returns {Promise<Array>} Snapshot data
 */
const getSeasonSnapshot = async (seasonId) => {
    try {
        const query = `
            SELECT * FROM season_snapshots 
            WHERE season_id = $1 
            ORDER BY position ASC
        `;
        const result = await db.query(query, [seasonId]);
        return result.rows;
    } catch (error) {
        console.error('Error getting season snapshot:', error);
        throw error;
    }
};

/**
 * Get notifications for a team
 * @param {number} teamId - Team ID
 * @param {boolean} unreadOnly - Only get unread notifications
 * @returns {Promise<Array>} Notifications
 */
const getTeamNotifications = async (teamId, unreadOnly = false) => {
    try {
        let query = `
            SELECT * FROM team_notifications 
            WHERE team_id = $1
        `;
        const params = [teamId];
        
        if (unreadOnly) {
            query += ` AND is_read = FALSE`;
        }
        
        query += ` ORDER BY created_at DESC LIMIT 50`;
        
        const result = await db.query(query, params);
        return result.rows;
    } catch (error) {
        console.error('Error getting team notifications:', error);
        throw error;
    }
};

/**
 * Get global notifications
 * @param {number} limit - Limit number of notifications
 * @returns {Promise<Array>} Notifications
 */
const getGlobalNotifications = async (limit = 20) => {
    try {
        const query = `
            SELECT * FROM season_notifications 
            ORDER BY created_at DESC 
            LIMIT $1
        `;
        const result = await db.query(query, [limit]);
        return result.rows;
    } catch (error) {
        console.error('Error getting global notifications:', error);
        throw error;
    }
};

module.exports = {
    getCurrentSeason,
    getAllSeasons,
    calculateTimeRemaining,
    determineSeasonWinner,
    checkAndCompleteSeasons,
    createLeaderboardSnapshot,
    distributeSeasonRewards,
    createGlobalNotification,
    createTeamNotification,
    resetWeeklyPoints,
    checkSeasonEndingSoon,
    getSeasonSnapshot,
    getTeamNotifications,
    getGlobalNotifications
};

