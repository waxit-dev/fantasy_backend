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
            // Award +0.01 attendance points (will convert to attribute when reaching 25)
            const updateQuery = `
                UPDATE team_players
                SET attendance_points = attendance_points + 0.01,
                    monthly_points_earned = monthly_points_earned + 0.01
                WHERE team_id = $1
            `;
            await db.query(updateQuery, [teamId]);
            
            // Convert points to attributes if any player reached 25
            await convertAttributePointsToAttributes(teamId);
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
                SET social_points = social_points + 0.01,
                    monthly_points_earned = monthly_points_earned + 0.01
                WHERE player_id = $1 AND team_id = $2
            `;
            await db.query(updateQuery, [playerId, teamId]);
            
            // Convert points to attributes if player reached 25
            await convertAttributePointsToAttributes(teamId);
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
                SET productivity_points = productivity_points + 0.01,
                    monthly_points_earned = monthly_points_earned + 0.01
                WHERE player_id = $1 AND team_id = $2
            `;
            await db.query(updateQuery, [playerId, teamId]);
            
            // Convert points to attributes if player reached 25
            await convertAttributePointsToAttributes(teamId);
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
                SET intensity_points = intensity_points + 0.02,
                    monthly_points_earned = monthly_points_earned + 0.02
                WHERE player_id = $1 AND team_id = $2
            `;
            await db.query(updateQuery, [playerId, teamId]);
            
            // Convert points to attributes if player reached 25
            await convertAttributePointsToAttributes(teamId);
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
                SET specialist_points = specialist_points + 0.02,
                    monthly_points_earned = monthly_points_earned + 0.02
                WHERE player_id = $1 AND team_id = $2
            `;
            await db.query(updateQuery, [playerId, teamId]);
            
            // Convert points to attributes if player reached 25
            await convertAttributePointsToAttributes(teamId);
        }
    } catch (error) {
        console.error('Error awarding specialist bonus:', error);
    }
};

/**
 * Award attribute points to all players on a team whose attribute matches the task item attribute
 * taskItems: Array of { itemId, attribute, attributePoints }
 */
const awardAttributePoints = async (teamId, taskItems, taskCompletionId) => {
    try {
        // Get all players on the team
        const playersQuery = `SELECT player_id FROM team_players WHERE team_id = $1`;
        const playersResult = await db.query(playersQuery, [teamId]);
        const teamPlayerIds = playersResult.rows.map(row => row.player_id);

        if (teamPlayerIds.length === 0) {
            return; // No players on team
        }

        // Get player specialties from players table
        const playerDetailsQuery = `
            SELECT id, specialty 
            FROM players 
            WHERE id = ANY($1::int[])
        `;
        const playerDetailsResult = await db.query(playerDetailsQuery, [teamPlayerIds]);
        const playerSpecialties = {};
        playerDetailsResult.rows.forEach(row => {
            playerSpecialties[row.id] = row.specialty?.toLowerCase();
        });

        // Process each task item that has an attribute
        for (const taskItem of taskItems) {
            const { itemId, attribute, attributePoints } = taskItem;
            
            if (!attribute || !attributePoints || attributePoints <= 0) {
                continue; // Skip items without attributes or points
            }

            // Award points to all players whose attribute matches
            // For 'specialist', we need to check if the player's specialty matches the task context
            // For other attributes, we award to all players (they all have these attributes)
            
            if (attribute === 'specialist') {
                // For specialist, we'd need task context to match specialties
                // For now, we'll award to all players and let the specialist bonus system handle matching
                // This could be enhanced later to match specific specialties
                continue; // Skip specialist here, handled by specialist bonus system
            }

            // Award attribute points to all players on the team
            // Map attribute names to column names (whitelist for safety)
            let columnName, pointsColumnName;
            switch (attribute) {
                case 'attendance':
                    columnName = 'attendance';
                    pointsColumnName = 'attendance_points';
                    break;
                case 'social':
                    columnName = 'social';
                    pointsColumnName = 'social_points';
                    break;
                case 'productivity':
                    columnName = 'productivity';
                    pointsColumnName = 'productivity_points';
                    break;
                case 'intensity':
                    columnName = 'intensity';
                    pointsColumnName = 'intensity_points';
                    break;
                case 'specialist':
                    columnName = 'specialty_rating';
                    pointsColumnName = 'specialist_points';
                    break;
                default:
                    console.warn(`Unknown attribute: ${attribute}`);
                    continue;
            }

            // Only add to points column, not directly to attribute
            // Attributes will be increased when points reach 25
            const updateQuery = `
                UPDATE team_players
                SET ${pointsColumnName} = ${pointsColumnName} + $1,
                    monthly_points_earned = monthly_points_earned + $1
                WHERE team_id = $2
            `;
            await db.query(updateQuery, [attributePoints, teamId]);

            // Record the attribute point awards in task_player_assignments for tracking
            // We'll create a record for each player (even though they all get the same points)
            const insertAttributeAssignments = teamPlayerIds.map(async (playerId) => {
                const insertQuery = `
                    INSERT INTO task_player_assignments 
                    (task_completion_id, player_id, team_id, task_item_id, points_earned)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT DO NOTHING
                `;
                return db.query(insertQuery, [
                    taskCompletionId,
                    playerId,
                    teamId,
                    itemId,
                    attributePoints
                ]);
            });
            await Promise.all(insertAttributeAssignments);
        }

        // After awarding all points, convert points to attributes (25 points = +0.01 attribute)
        await convertAttributePointsToAttributes(teamId);
    } catch (error) {
        console.error('Error awarding attribute points:', error);
        throw error;
    }
};

/**
 * Convert attribute points to attribute increases
 * When a player has 25+ points in an attribute, add 0.01 to that attribute
 * and subtract 25 from the points counter
 */
const convertAttributePointsToAttributes = async (teamId) => {
    try {
        // Get all players on the team with their current attribute points
        const playersQuery = `
            SELECT player_id, 
                   attendance_points, 
                   social_points, 
                   productivity_points, 
                   intensity_points, 
                   specialist_points,
                   attendance,
                   social,
                   productivity,
                   intensity,
                   specialty_rating
            FROM team_players
            WHERE team_id = $1
        `;
        const playersResult = await db.query(playersQuery, [teamId]);

        for (const player of playersResult.rows) {
            const playerId = player.player_id;
            let needsUpdate = false;
            const updates = [];

            // Check each attribute and convert points if >= 25 (specialty uses 10)
            const attributes = [
                { points: 'attendance_points', attr: 'attendance', currentAttr: 'attendance', threshold: 25 },
                { points: 'social_points', attr: 'social', currentAttr: 'social', threshold: 25 },
                { points: 'productivity_points', attr: 'productivity', currentAttr: 'productivity', threshold: 25 },
                { points: 'intensity_points', attr: 'intensity', currentAttr: 'intensity', threshold: 25 },
                { points: 'specialist_points', attr: 'specialty_rating', currentAttr: 'specialty_rating', threshold: 10 } // Specialty uses 10 points = 0.01
            ];

            for (const { points, attr, currentAttr, threshold } of attributes) {
                const currentPoints = parseFloat(player[points]) || 0;
                
                if (currentPoints >= threshold) {
                    // Calculate how many full conversions
                    const conversions = Math.floor(currentPoints / threshold);
                    const attributeIncrease = conversions * 0.01;
                    const remainingPoints = currentPoints - (conversions * threshold);

                    // Update attribute (capped at 99)
                    const newAttributeValue = Math.min(99, parseFloat(player[currentAttr]) + attributeIncrease);
                    
                    updates.push({
                        pointsColumn: points,
                        attributeColumn: currentAttr,
                        newPoints: remainingPoints,
                        newAttribute: newAttributeValue
                    });
                    
                    needsUpdate = true;
                }
            }

            // Apply all updates for this player
            if (needsUpdate) {
                let updateQuery = 'UPDATE team_players SET ';
                const updateParts = [];
                const params = [];
                let paramIndex = 1;

                for (const update of updates) {
                    updateParts.push(`${update.attributeColumn} = $${paramIndex}`);
                    params.push(update.newAttribute);
                    paramIndex++;
                    
                    updateParts.push(`${update.pointsColumn} = $${paramIndex}`);
                    params.push(update.newPoints);
                    paramIndex++;
                }

                updateQuery += updateParts.join(', ');
                updateQuery += ` WHERE player_id = $${paramIndex} AND team_id = $${paramIndex + 1}`;
                params.push(playerId, teamId);

                await db.query(updateQuery, params);

                // Update overall rating and salary after attribute changes
                await updatePlayerOverallRating(playerId, teamId);
                await calculatePlayerSalary(playerId);
            }
        }
    } catch (error) {
        console.error('Error converting attribute points to attributes:', error);
        throw error;
    }
};

/**
 * Award specialty points to players whose specialty matches the task item specialty
 * taskItems: Array of { itemId, specialty, specialtyPoints }
 */
const awardSpecialtyPoints = async (teamId, taskItems, taskCompletionId) => {
    try {
        // Get all players on the team with their specialties
        const playersQuery = `
            SELECT tp.player_id, p.specialty
            FROM team_players tp
            INNER JOIN players p ON tp.player_id = p.id
            WHERE tp.team_id = $1
        `;
        const playersResult = await db.query(playersQuery, [teamId]);

        if (playersResult.rows.length === 0) {
            return; // No players on team
        }

        // Create a map of player specialties (normalized to lowercase for matching)
        const playerSpecialties = {};
        playersResult.rows.forEach(row => {
            playerSpecialties[row.player_id] = row.specialty?.toLowerCase().trim();
        });

        // Process each task item that has a specialty
        for (const taskItem of taskItems) {
            const { itemId, specialty, specialtyPoints } = taskItem;
            
            if (!specialty || !specialtyPoints || specialtyPoints <= 0) {
                continue; // Skip items without specialties or points
            }

            const taskSpecialty = specialty.toLowerCase().trim();

            // Award points to players whose specialty matches
            for (const playerId in playerSpecialties) {
                const playerSpecialty = playerSpecialties[playerId];
                
                // Match specialty (case-insensitive, flexible matching)
                // Check if player specialty contains task specialty or vice versa
                const matches = playerSpecialty && (
                    playerSpecialty === taskSpecialty ||
                    playerSpecialty.includes(taskSpecialty) ||
                    taskSpecialty.includes(playerSpecialty)
                );

                if (matches) {
                    // Award specialty points to this player
                    const updateQuery = `
                        UPDATE team_players
                        SET specialist_points = specialist_points + $1,
                            monthly_points_earned = monthly_points_earned + $1
                        WHERE player_id = $2 AND team_id = $3
                    `;
                    await db.query(updateQuery, [specialtyPoints, parseInt(playerId), teamId]);

                    // Record in task_player_assignments for tracking
                    const insertQuery = `
                        INSERT INTO task_player_assignments 
                        (task_completion_id, player_id, team_id, task_item_id, points_earned)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT DO NOTHING
                    `;
                    await db.query(insertQuery, [
                        taskCompletionId,
                        parseInt(playerId),
                        teamId,
                        itemId,
                        specialtyPoints
                    ]);
                }
            }
        }

        // After awarding all specialty points, convert points to attributes (10 points = 0.01 for specialty)
        await convertAttributePointsToAttributes(teamId);
    } catch (error) {
        console.error('Error awarding specialty points:', error);
        throw error;
    }
};

/**
 * Award overall task productivity bonus to all players on the team
 */
const awardTaskProductivityBonus = async (teamId, bonusPoints) => {
    try {
        // Award productivity points to all players on the team
        const updateQuery = `
            UPDATE team_players
            SET productivity_points = productivity_points + $1,
                monthly_points_earned = monthly_points_earned + $1
            WHERE team_id = $2
        `;
        await db.query(updateQuery, [bonusPoints, teamId]);

        // Convert points to attributes if any player reached 25
        await convertAttributePointsToAttributes(teamId);
    } catch (error) {
        console.error('Error awarding task productivity bonus:', error);
        throw error;
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
    awardAttributePoints,
    awardSpecialtyPoints,
    awardTaskProductivityBonus,
    convertAttributePointsToAttributes,
    awardAttendanceBonus,
    awardSocialBonus,
    awardProductivityBonus,
    awardIntensityBonus,
    awardSpecialistBonus
};

