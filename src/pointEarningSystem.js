const db = require('./db');
const { updatePlayerOverallRating, calculatePlayerSalary } = require('./playerCalculations');

/**
 * Convert AEDT timezone to check if a date is Monday-Friday in AEDT
 */
const isWeekdayAEDT = (date) => {
    // Convert to AEDT (UTC+11 or UTC+10 depending on DST)
    // For simplicity, we'll use UTC+11 (standard AEDT)
    // Note: In production, you'd want to use a proper timezone library like date-fns-tz
    const aedtDate = new Date(date);
    aedtDate.setHours(aedtDate.getUTCHours() + 11);
    const dayOfWeek = aedtDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    return dayOfWeek >= 1 && dayOfWeek <= 5; // Monday to Friday
};

/**
 * Award attendance bonus: +0.01 attendance for all players in a team
 * if the team completes a task on each day Monday to Friday (AEDT)
 */
const awardAttendanceBonus = async (teamId, completionDate) => {
    if (!isWeekdayAEDT(completionDate)) {
        return; // Not a weekday in AEDT
    }

    try {
        // Check if team completed a task on all weekdays this week
        const startOfWeek = new Date(completionDate);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1); // Monday
        startOfWeek.setHours(0, 0, 0, 0);
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 4); // Friday
        endOfWeek.setHours(23, 59, 59, 999);

        // Count unique days with task completions this week
        const completionDaysQuery = `
            SELECT DISTINCT DATE(completed_at AT TIME ZONE 'UTC' AT TIME ZONE 'Australia/Sydney') as completion_day
            FROM task_completions
            WHERE team_id = $1
            AND completed_at >= $2
            AND completed_at <= $3
        `;
        const result = await db.query(completionDaysQuery, [teamId, startOfWeek, endOfWeek]);
        
        // If team completed tasks on all 5 weekdays, award bonus
        if (result.rows.length >= 5) {
            // Award +0.01 attendance to all players on the team
            const updateQuery = `
                UPDATE team_players
                SET attendance = LEAST(99, attendance + 0.01),
                    attendance_points = attendance_points + 0.01,
                    monthly_points_earned = monthly_points_earned + 0.01
                WHERE team_id = $1
            `;
            await db.query(updateQuery, [teamId]);
            
            // Update overall ratings for all affected players
            const playersQuery = `SELECT player_id FROM team_players WHERE team_id = $1`;
            const playersResult = await db.query(playersQuery, [teamId]);
            for (const row of playersResult.rows) {
                await updatePlayerOverallRating(row.player_id, teamId);
                await calculatePlayerSalary(row.player_id);
            }
        }
    } catch (error) {
        console.error('Error awarding attendance bonus:', error);
    }
};

/**
 * Award social contribution bonus: +0.01 social for a player being used
 * four or more times in a task marked as 'customer service' or 'collaborative'
 */
const awardSocialBonus = async (taskCompletionId, playerId, teamId) => {
    try {
        // Check if this task is marked as 'customer service' or 'collaborative'
        const taskQuery = `
            SELECT task_type, task_tags
            FROM task_completions
            WHERE id = $1
        `;
        const taskResult = await db.query(taskQuery, [taskCompletionId]);
        
        if (taskResult.rows.length === 0) return;
        
        const task = taskResult.rows[0];
        const isSocialTask = task.task_type === 'customer service' || 
                            task.task_type === 'collaborative' ||
                            (task.task_tags && (
                                task.task_tags.includes('customer service') ||
                                task.task_tags.includes('collaborative')
                            ));
        
        if (!isSocialTask) return;

        // Count how many times this player was used in this task
        const usageCountQuery = `
            SELECT COUNT(*) as usage_count
            FROM task_player_assignments
            WHERE task_completion_id = $1 AND player_id = $2
        `;
        const usageResult = await db.query(usageCountQuery, [taskCompletionId, playerId]);
        const usageCount = parseInt(usageResult.rows[0].usage_count) || 0;

        // If used 4 or more times, award bonus
        if (usageCount >= 4) {
            const updateQuery = `
                UPDATE team_players
                SET social = LEAST(99, social + 0.01),
                    social_points = social_points + 0.01,
                    monthly_points_earned = monthly_points_earned + 0.01
                WHERE player_id = $1 AND team_id = $2
            `;
            await db.query(updateQuery, [playerId, teamId]);
            
            await updatePlayerOverallRating(playerId, teamId);
            await calculatePlayerSalary(playerId);
        }
    } catch (error) {
        console.error('Error awarding social bonus:', error);
    }
};

/**
 * Award productivity achievement: +0.01 productivity for a player
 * being used in 2 or more tasks within a day
 */
const awardProductivityBonus = async (playerId, teamId, completionDate) => {
    try {
        const startOfDay = new Date(completionDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(completionDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Count tasks this player was used in today
        const tasksTodayQuery = `
            SELECT COUNT(DISTINCT tpa.task_completion_id) as task_count
            FROM task_player_assignments tpa
            INNER JOIN task_completions tc ON tpa.task_completion_id = tc.id
            WHERE tpa.player_id = $1
            AND tpa.team_id = $2
            AND tc.completed_at >= $3
            AND tc.completed_at <= $4
        `;
        const result = await db.query(tasksTodayQuery, [playerId, teamId, startOfDay, endOfDay]);
        const taskCount = parseInt(result.rows[0].task_count) || 0;

        // If used in 2 or more tasks today, award bonus
        if (taskCount >= 2) {
            const updateQuery = `
                UPDATE team_players
                SET productivity = LEAST(99, productivity + 0.01),
                    productivity_points = productivity_points + 0.01,
                    monthly_points_earned = monthly_points_earned + 0.01
                WHERE player_id = $1 AND team_id = $2
            `;
            await db.query(updateQuery, [playerId, teamId]);
            
            await updatePlayerOverallRating(playerId, teamId);
            await calculatePlayerSalary(playerId);
        }
    } catch (error) {
        console.error('Error awarding productivity bonus:', error);
    }
};

/**
 * Award intensity streak: +0.02 intensity for each player included
 * in 5 or more tasks in a day
 */
const awardIntensityBonus = async (playerId, teamId, completionDate) => {
    try {
        const startOfDay = new Date(completionDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(completionDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Count tasks this player was used in today
        const tasksTodayQuery = `
            SELECT COUNT(DISTINCT tpa.task_completion_id) as task_count
            FROM task_player_assignments tpa
            INNER JOIN task_completions tc ON tpa.task_completion_id = tc.id
            WHERE tpa.player_id = $1
            AND tpa.team_id = $2
            AND tc.completed_at >= $3
            AND tc.completed_at <= $4
        `;
        const result = await db.query(tasksTodayQuery, [playerId, teamId, startOfDay, endOfDay]);
        const taskCount = parseInt(result.rows[0].task_count) || 0;

        // If used in 5 or more tasks today, award bonus
        if (taskCount >= 5) {
            const updateQuery = `
                UPDATE team_players
                SET intensity = LEAST(99, intensity + 0.02),
                    intensity_points = intensity_points + 0.02,
                    monthly_points_earned = monthly_points_earned + 0.02
                WHERE player_id = $1 AND team_id = $2
            `;
            await db.query(updateQuery, [playerId, teamId]);
            
            await updatePlayerOverallRating(playerId, teamId);
            await calculatePlayerSalary(playerId);
        }
    } catch (error) {
        console.error('Error awarding intensity bonus:', error);
    }
};

/**
 * Award specialist bonus: +0.02 Specialist if a task completed has
 * a task tag that matches the player's specialist role
 */
const awardSpecialistBonus = async (playerId, teamId, taskCompletionId) => {
    try {
        // Get player's specialty
        const playerQuery = `
            SELECT p.specialty
            FROM players p
            WHERE p.id = $1
        `;
        const playerResult = await db.query(playerQuery, [playerId]);
        
        if (playerResult.rows.length === 0) return;
        const playerSpecialty = playerResult.rows[0].specialty?.toLowerCase();

        // Get task tags
        const taskQuery = `
            SELECT task_tags, task_type
            FROM task_completions
            WHERE id = $1
        `;
        const taskResult = await db.query(taskQuery, [taskCompletionId]);
        
        if (taskResult.rows.length === 0) return;
        const task = taskResult.rows[0];
        
        // Check if any task tag matches player's specialty
        const taskTags = task.task_tags || [];
        const taskType = task.task_type?.toLowerCase() || '';
        const allTags = [...taskTags.map(t => t.toLowerCase()), taskType];
        
        const matchesSpecialty = allTags.some(tag => 
            tag.includes(playerSpecialty) || playerSpecialty?.includes(tag)
        );

        if (matchesSpecialty) {
            const updateQuery = `
                UPDATE team_players
                SET specialty_rating = LEAST(99, specialty_rating + 0.02),
                    specialist_points = specialist_points + 0.02,
                    monthly_points_earned = monthly_points_earned + 0.02
                WHERE player_id = $1 AND team_id = $2
            `;
            await db.query(updateQuery, [playerId, teamId]);
            
            await updatePlayerOverallRating(playerId, teamId);
            await calculatePlayerSalary(playerId);
        }
    } catch (error) {
        console.error('Error awarding specialist bonus:', error);
    }
};

/**
 * Process all point bonuses for a task completion
 */
const processPointBonuses = async (taskCompletionId, teamId, completionDate, playerAssignments) => {
    try {
        // Award attendance bonus (team-wide)
        await awardAttendanceBonus(teamId, completionDate);

        // Process bonuses for each player assignment
        for (const assignment of playerAssignments) {
            const { playerId } = assignment;
            
            // Social bonus
            await awardSocialBonus(taskCompletionId, playerId, teamId);
            
            // Productivity bonus
            await awardProductivityBonus(playerId, teamId, completionDate);
            
            // Intensity bonus
            await awardIntensityBonus(playerId, teamId, completionDate);
            
            // Specialist bonus
            await awardSpecialistBonus(playerId, teamId, taskCompletionId);
        }
    } catch (error) {
        console.error('Error processing point bonuses:', error);
        throw error;
    }
};

module.exports = {
    processPointBonuses,
    awardAttendanceBonus,
    awardSocialBonus,
    awardProductivityBonus,
    awardIntensityBonus,
    awardSpecialistBonus
};

