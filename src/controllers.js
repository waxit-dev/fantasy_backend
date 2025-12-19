const db = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { updatePlayerOverallRating, calculatePlayerSalary, calculateTeamScore } = require('./playerCalculations');
const { getPlayerValuation, getPlayerTransactionHistory, getMarketAnalytics } = require('./playerValuation');


// Controllers
const getAllPlayers = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM players');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Could not get players from db.' });
    }
};

const getPlayerById = (req, res) => {

};

const updatePlayerAttributeByPosition = async (req, res) => {
    const { playerId, attribute, position } = req.body;

    try {
        // Validate the attribute is one of the allowed fields
        const validAttributes = ['attendance', 'social', 'productivity', 'intensity', 'specialty_rating'];
        if (!validAttributes.includes(attribute)) {
            return res.status(400).json({ message: 'Invalid attribute to update' });
        }

        // Find all players in the specified position
        const findPlayersQuery = `
            SELECT * FROM team_players WHERE position = $1
        `;
        const playersResult = await db.query(findPlayersQuery, [position]);

        if (playersResult.rows.length === 0) {
            return res.status(400).json({ message: 'No players found for this position' });
        }

        // Loop through players and update their attributes and overall rating
        const updatePromises = playersResult.rows.map(async (player) => {
            const newAttributeValue = player[attribute] + 5;

            // Update the attribute first
            const updateAttributeQuery = `
                UPDATE team_players
                SET ${attribute} = $1
                WHERE player_id = $2 AND position = $3
            `;
            await db.query(updateAttributeQuery, [newAttributeValue, player.player_id, position]);

            // Recalculate overall rating using new formula (mean of 5 attributes, capped at 99)
            await updatePlayerOverallRating(player.player_id, player.team_id);
            
            // Update player attributes in players table to average across all teams
            const { updatePlayerAttributesFromTeams, calculatePlayerSalary } = require('./playerCalculations');
            await updatePlayerAttributesFromTeams(player.player_id);
            await calculatePlayerSalary(player.player_id);
        });

        await Promise.all(updatePromises);

        // Fetch the updated players for the response
        const updatedPlayersQuery = `SELECT * FROM team_players WHERE position = $1`;
        const updatedPlayersResult = await db.query(updatedPlayersQuery, [position]);

        // Respond with success and the updated players in the specified position
        res.status(200).json({ message: 'Player attributes and overall rating updated successfully', updatedPlayers: updatedPlayersResult.rows });
    } catch (error) {
        console.error('Error updating player attributes:', error);
        res.status(500).json({ message: 'Error updating player attributes' });
    }
};

const createPlayer = (req, res) => {

};

const getAllTeams = async (req, res) => {
     try {
        // Get all teams
        const teamsResult = await db.query('SELECT * FROM teams ORDER BY id');
        const teams = teamsResult.rows;

        // For each team, calculate leaderboard score using new formula
        const teamsWithScores = await Promise.all(teams.map(async (team) => {
            // Calculate team score using new weighted formula
            const teamScore = await calculateTeamScore(team.id);

            // Get average overall rating for display
            const avgRatingQuery = `
                SELECT COALESCE(AVG(overall_rating), 0) as avg_rating
                FROM team_players
                WHERE team_id = $1
            `;
            const avgRatingResult = await db.query(avgRatingQuery, [team.id]);
            const avgRating = parseFloat(avgRatingResult.rows[0].avg_rating) || 0;

            return {
                ...team,
                leaderboard_score: teamScore || 0,
                avg_team_rating: avgRating
            };
        }));

        // Sort by leaderboard_score descending
        teamsWithScores.sort((a, b) => b.leaderboard_score - a.leaderboard_score);

        res.json(teamsWithScores);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Could not get teams from db.' });
    }
};

const getTeamById = async (req, res) => {
    const { id } = req.params; // Team ID or slug from URL params

    try {
        // Check if id is numeric (ID) or string (slug)
        const isNumeric = /^\d+$/.test(id);
        
        // Get team details by ID or slug
        const findTeamQuery = isNumeric 
            ? `SELECT * FROM teams WHERE id = $1`
            : `SELECT * FROM teams WHERE slug = $1`;
        const teamResult = await db.query(findTeamQuery, [id]);

        if (teamResult.rows.length === 0) {
            return res.status(400).json({ message: 'Team not found' });
        }

        const userTeam = teamResult.rows[0];
        const teamId = userTeam.id;

        // Get all players associated with the team
        const teamPlayersQuery = `
            SELECT players.id, players.name, players.salary, team_players.position, team_players.attendance, team_players.social,
                   team_players.productivity, team_players.intensity, team_players.specialty_rating, team_players.overall_rating,
                   team_players.purchase_date
            FROM players
            INNER JOIN team_players ON players.id = team_players.player_id
            WHERE team_players.team_id = $1
        `;
        const teamPlayersResult = await db.query(teamPlayersQuery, [teamId]);
        const userPlayers = teamPlayersResult.rows;

        // Respond with the team and its players
        res.status(200).json({
            userTeam: userTeam,
            userPlayers: userPlayers
        });
    } catch (error) {
        console.error('Error retrieving team:', error);
        res.status(500).json({ message: 'Error retrieving team information' });
    }
};


const purchasePlayer = async (req, res) => {
    const { teamId, playerId, position } = req.body; // Only need teamId, playerId, and position

    console.log(teamId, playerId, position);

    try {
        // Get team details and check the current cash balance
        const findTeamQuery = `SELECT * FROM teams WHERE id = $1`;
        const teamResult = await db.query(findTeamQuery, [teamId]);

        if (teamResult.rows.length === 0) {
            return res.status(400).json({ message: 'Team not found' });
        }

        const team = teamResult.rows[0];

        // Get player details and salary
        const findPlayerQuery = `SELECT * FROM players WHERE id = $1`;
        const playerResult = await db.query(findPlayerQuery, [playerId]);
        

        if (playerResult.rows.length === 0) {
            return res.status(400).json({ message: 'Player not found' });
        }

        const player = playerResult.rows[0];
        console.log(player);
        
        // Parse cash and salary to numbers (PostgreSQL returns numeric as strings)
        const teamCash = parseFloat(team.cash) || 0;
        const playerSalary = parseFloat(player.salary) || 0;

        // Check if the player is already on the team
        const checkExistingPlayerQuery = `
            SELECT * FROM team_players 
            WHERE team_id = $1 AND player_id = $2
        `;
        const existingPlayerResult = await db.query(checkExistingPlayerQuery, [teamId, playerId]);
        
        if (existingPlayerResult.rows.length > 0) {
            return res.status(400).json({ message: 'Player is already on this team' });
        }

        // Check if the team has enough cash to buy the player
        if (teamCash < playerSalary) {
            console.log('no cash robbo');
            console.log(`Team cash: ${teamCash}, Player salary: ${playerSalary}`);
            
            return res.status(400).json({ message: 'Not enough cash to purchase this player' });
        }

        // Deduct player's salary from team's cash
        const newCashBalance = teamCash - playerSalary;
        console.log(`Cash calculation: ${teamCash} - ${playerSalary} = ${newCashBalance}`);
        const updateTeamCashQuery = `UPDATE teams SET cash = $1::numeric WHERE id = $2`;
        await db.query(updateTeamCashQuery, [newCashBalance, teamId]);

        // Insert the player into the team_players table with all related metrics
        const insertPlayerQuery = `
            INSERT INTO team_players (team_id, player_id, position, attendance, social, productivity, intensity, specialty_rating, overall_rating, purchase_price, purchase_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        `;
        await db.query(insertPlayerQuery, [
            teamId,               // $1 -> team_id
            player.id,            // $2 -> player_id
            position,             // $3 -> position (from the request body)
            player.attendance,    // $4 -> attendance
            player.social,        // $5 -> social
            player.productivity,  // $6 -> productivity
            player.intensity,     // $7 -> intensity
            player.specialty_rating, // $8 -> specialty_rating
            player.overall_rating, // $9 -> overall_rating
            playerSalary          // $10 -> purchase_price (what team paid)
        ]);

        // Record purchase transaction
        const insertTransactionQuery = `
            INSERT INTO player_transactions (player_id, team_id, transaction_type, price)
            VALUES ($1, $2, 'purchase', $3)
        `;
        await db.query(insertTransactionQuery, [playerId, teamId, playerSalary]);

        // Increase player's base salary by $10,000 for future purchases
        const { increasePlayerBaseSalary } = require('./playerCalculations');
        await increasePlayerBaseSalary(playerId);
        console.log(`Player ${playerId} base salary increased by $10,000`);

        // Update player attributes in players table to average across all teams
        const { updatePlayerAttributesFromTeams } = require('./playerCalculations');
        await updatePlayerAttributesFromTeams(playerId);

        // Recalculate player's salary using dynamic formula (base + demand + performance)
        const newPlayerSalary = await calculatePlayerSalary(playerId);
        console.log(`Player salary recalculated: ${playerSalary} -> ${newPlayerSalary}`);
        
        // Update team score after purchase
        await calculateTeamScore(teamId);

        // Get the updated team details
        const updatedTeamQuery = `SELECT * FROM teams WHERE id = $1`;
        const updatedTeamResult = await db.query(updatedTeamQuery, [teamId]);
        const updatedTeam = updatedTeamResult.rows[0];

        // Get all players associated with the team
        const teamPlayersQuery = `
            SELECT players.id, players.name, players.salary, team_players.position, team_players.attendance, team_players.social,
                   team_players.productivity, team_players.intensity, team_players.specialty_rating, team_players.overall_rating,
                   team_players.purchase_date
            FROM players
            INNER JOIN team_players ON players.id = team_players.player_id
            WHERE team_players.team_id = $1
        `;
        const teamPlayersResult = await db.query(teamPlayersQuery, [teamId]);
        const teamPlayers = teamPlayersResult.rows;

        // Respond with the updated team and associated players
        res.status(201).json({
            userTeam: updatedTeam,
            teamPlayers: teamPlayers
        });

        // Respond with success message and updated team cash balance
        //res.status(201).json({ message: 'Player purchased successfully.', cash: newCashBalance });
    } catch (error) {
        console.error('Error purchasing player:', error);
        res.status(500).json({ message: 'Error processing the purchase' });
    }
};

const sellPlayer = async (req, res) => {
    const { teamId, playerId } = req.body;

    try {
        // Get team details
        const findTeamQuery = `SELECT * FROM teams WHERE id = $1`;
        const teamResult = await db.query(findTeamQuery, [teamId]);

        if (teamResult.rows.length === 0) {
            return res.status(400).json({ message: 'Team not found' });
        }

        const team = teamResult.rows[0];

        // Get player details and salary from the players table
        const findPlayerQuery = `SELECT * FROM players WHERE id = $1`;
        const playerResult = await db.query(findPlayerQuery, [playerId]);

        if (playerResult.rows.length === 0) {
            return res.status(400).json({ message: 'Player not found' });
        }

        const player = playerResult.rows[0];

        // Check if the player is actually on the team
        const checkTeamPlayerQuery = `
            SELECT *, purchase_date 
            FROM team_players 
            WHERE team_id = $1 AND player_id = $2
        `;
        const teamPlayerResult = await db.query(checkTeamPlayerQuery, [teamId, playerId]);

        if (teamPlayerResult.rows.length === 0) {
            return res.status(400).json({ message: 'Player is not on this team' });
        }

        const teamPlayer = teamPlayerResult.rows[0];
        const purchaseDate = new Date(teamPlayer.purchase_date);
        const now = new Date();
        
        // Calculate days since purchase
        const daysSincePurchase = Math.floor((now - purchaseDate) / (1000 * 60 * 60 * 24));
        const cooldownDays = 42; // 6 weeks = 42 days
        
        // Check if cooldown period has passed
        if (daysSincePurchase < cooldownDays) {
            const daysRemaining = cooldownDays - daysSincePurchase;
            return res.status(400).json({ 
                message: `Player cannot be sold yet. Contract cooldown: ${daysRemaining} days remaining (6 weeks from purchase date).`,
                daysRemaining: daysRemaining,
                purchaseDate: purchaseDate,
                cooldownDays: cooldownDays
            });
        }

        // Parse cash and salary to numbers
        const teamCash = parseFloat(team.cash) || 0;
        const playerSalary = parseFloat(player.salary) || 0;
        
        // Get purchase price (what team originally paid)
        const purchasePrice = parseFloat(teamPlayer.purchase_price) || 0;
        
        // After cooldown, teams can sell at current market value (they've earned it through development)
        const salePrice = playerSalary;
        
        // Calculate profit/loss
        const profitLoss = salePrice - purchasePrice;

        // Add player's current market value back to team's cash (after cooldown period)
        const newCashBalance = teamCash + salePrice;
        const updateTeamCashQuery = `UPDATE teams SET cash = $1 WHERE id = $2`;
        await db.query(updateTeamCashQuery, [newCashBalance, teamId]);

        // Record sale transaction
        const insertTransactionQuery = `
            INSERT INTO player_transactions (player_id, team_id, transaction_type, price)
            VALUES ($1, $2, 'sale', $3)
        `;
        await db.query(insertTransactionQuery, [playerId, teamId, salePrice]);

        // Remove the player from the team_players table
        const deleteTeamPlayerQuery = `
            DELETE FROM team_players 
            WHERE team_id = $1 AND player_id = $2
        `;
        await db.query(deleteTeamPlayerQuery, [teamId, playerId]);
        
        // Update player attributes in players table to average across remaining teams
        const { updatePlayerAttributesFromTeams } = require('./playerCalculations');
        await updatePlayerAttributesFromTeams(playerId);
        
        // Recalculate player's salary (demand will decrease, attributes may change)
        await calculatePlayerSalary(playerId);
        
        // Update team score after sale
        await calculateTeamScore(teamId);

        // Get the updated team details
        const updatedTeamQuery = `SELECT * FROM teams WHERE id = $1`;
        const updatedTeamResult = await db.query(updatedTeamQuery, [teamId]);
        const updatedTeam = updatedTeamResult.rows[0];

        // Get all players associated with the team
        const teamPlayersQuery = `
            SELECT players.id, players.name, players.salary, team_players.position, team_players.attendance, team_players.social,
                   team_players.productivity, team_players.intensity, team_players.specialty_rating, team_players.overall_rating,
                   team_players.purchase_date
            FROM players
            INNER JOIN team_players ON players.id = team_players.player_id
            WHERE team_players.team_id = $1
        `;
        const teamPlayersResult = await db.query(teamPlayersQuery, [teamId]);
        const teamPlayers = teamPlayersResult.rows;

        // Respond with the updated team, associated players, and sale info
        res.status(200).json({
            message: 'Player sold successfully',
            userTeam: updatedTeam,
            teamPlayers: teamPlayers,
            profitLoss: profitLoss,
            purchasePrice: purchasePrice,
            salePrice: salePrice,
            daysOwned: daysSincePurchase
        });
    } catch (error) {
        console.error('Error selling player:', error);
        res.status(500).json({ message: 'Error processing the sale' });
    }
};


const loginTeam = async (req, res) => {
    const { slug, password } = req.body;

    try {
        // Find the team by slug
        const findTeamQuery = `SELECT * FROM teams WHERE slug = $1`;
        const result = await db.query(findTeamQuery, [slug]);

        if (result.rows.length === 0) {
            return res.status(400).json({ message: 'Team not found' });
        }

        const team = result.rows[0];

        // Check if the password matches
        const isMatch = await bcrypt.compare(password, team.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Get all team ids
        const teamIdsQuery = `SELECT id FROM teams`;
        const teamIds = await db.query(teamIdsQuery);

        // Get players related to the team from the team_players table
        const teamPlayersQuery = `SELECT players.* FROM players
                                  INNER JOIN team_players ON players.id = team_players.player_id
                                  WHERE team_players.team_id = $1`;
        const teamPlayers = await db.query(teamPlayersQuery, [team.id]);

        console.log(teamPlayers);
        

        // Remove the password from the team object
        const { password: hashedPassword, ...teamWithoutPassword } = team;

        // Respond with the logged-in team (excluding the password), players, and all team ids
        res.status(201).json({
            team: teamWithoutPassword,
            players: teamPlayers.rows,
            teamIds: teamIds.rows
        });
    } catch (error) {
        console.error('Error logging in team:', error);
        res.status(500).json({ message: 'Error logging in team' });
    }
};



const createTeam = async (req, res) => {
    console.log(req.body);
    const { name, password, slug } = req.body;

    try {
        // Check if team already exists in the database
        const teamExistsQuery = `SELECT * FROM teams WHERE name = $1`;
        const teamExists = await db.query(teamExistsQuery, [name]);

        if (teamExists.rows.length > 0) {
            return res.status(400).json({ message: 'Team name already exists' });
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert new team into the database
        const insertTeamQuery = `
            INSERT INTO teams (name, slug, cash, total_points, weekly_points, task_points, leaderboard_score, password)
            VALUES ($1, $2, $3::numeric, $4::integer, $5::integer, $6::numeric, $7::numeric, $8)
            RETURNING id, name, slug, cash, total_points, weekly_points, task_points, leaderboard_score
        `;
        const result = await db.query(insertTeamQuery, [
            name,          // $1 -> name (string)
            slug,              // $2 -> slug (string)
            950000.00,         // $3 -> cash (numeric, casting it to numeric)
            0,                 // $4 -> total_points (integer)
            0,                 // $5 -> weekly_points (integer)
            0,                 // $6 -> task_points (numeric, default 0)
            0,                 // $7 -> leaderboard_score (numeric, default 0)
            hashedPassword     // $8 -> password (string)
        ]);

        // After insertion, count the total number of teams
        const getTeamsIds = `SELECT id FROM teams;`;
        const teamIds = await db.query(getTeamsIds);

        // Return the newly created team (excluding the password)
        res.status(201).json({ team: result.rows[0], teamIds: teamIds.rows });
    } catch (error) {
        console.error('Error creating team:', error);
        res.status(500).json({ message: 'Error adding team to the database.' });
    }
};

const updateTeamTaskPoints = async (req, res) => {
    const { id } = req.params; // Team ID from URL params
    const { points } = req.body; // Points to add from task completion

    try {
        // Validate points is a number
        if (typeof points !== 'number' || points < 0) {
            return res.status(400).json({ message: 'Invalid points value. Points must be a non-negative number.' });
        }

        // Get current team data
        const findTeamQuery = `SELECT * FROM teams WHERE id = $1`;
        const teamResult = await db.query(findTeamQuery, [id]);

        if (teamResult.rows.length === 0) {
            return res.status(400).json({ message: 'Team not found' });
        }

        const team = teamResult.rows[0];
        const currentTaskPoints = parseFloat(team.task_points || 0);
        const currentTotalPoints = parseFloat(team.total_points || 0);
        const currentWeeklyPoints = parseFloat(team.weekly_points || 0);
        const currentCash = parseFloat(team.cash || 0);

        // Calculate new point values
        const newTaskPoints = currentTaskPoints + points;
        const newTotalPoints = currentTotalPoints + points;
        const newWeeklyPoints = currentWeeklyPoints + points;
        
        // Award $1000 cash for completing the task
        const taskCompletionReward = 1000;
        const newCash = currentCash + taskCompletionReward;

        // Update team points and cash in the database
        const updateTeamQuery = `
            UPDATE teams 
            SET task_points = $1::numeric, 
                total_points = $2::numeric, 
                weekly_points = $3::numeric,
                cash = $4::numeric
            WHERE id = $5
            RETURNING id, name, slug, cash, total_points, weekly_points, task_points
        `;
        const updateResult = await db.query(updateTeamQuery, [
            newTaskPoints,
            newTotalPoints,
            newWeeklyPoints,
            newCash,
            id
        ]);

        const updatedTeam = updateResult.rows[0];

        // Recalculate team score
        await calculateTeamScore(id);

        // Respond with the updated team data
        res.status(200).json({
            message: 'Team points updated successfully',
            team: updatedTeam,
            pointsAdded: points
        });
    } catch (error) {
        console.error('Error updating team task points:', error);
        res.status(500).json({ message: 'Error updating team task points' });
    }
};

const completeTaskWithPlayers = async (req, res) => {
    const { id } = req.params; // Team ID
    const { 
        taskId, 
        points, 
        playerAssignments, // Array of { playerId, taskItemId, points }
        taskItems, // Array of { itemId, attribute, attributePoints, specialty, specialtyPoints } - for attribute/specialty point awards
        taskProductivityBonus, // Overall task productivity bonus (e.g., +2 for add-product)
        taskTags, // Array of strings
        taskType // String: 'customer service', 'collaborative', etc.
    } = req.body;

    try {
        // Validate inputs
        if (typeof points !== 'number' || points < 0) {
            return res.status(400).json({ message: 'Invalid points value.' });
        }

        if (!taskId) {
            return res.status(400).json({ message: 'Task ID is required.' });
        }

        // Get team data
        const findTeamQuery = `SELECT * FROM teams WHERE id = $1`;
        const teamResult = await db.query(findTeamQuery, [id]);

        if (teamResult.rows.length === 0) {
            return res.status(400).json({ message: 'Team not found' });
        }

        const completionDate = new Date();

        // Create task completion record
        const insertTaskCompletionQuery = `
            INSERT INTO task_completions (task_id, team_id, completed_at, task_tags, task_type, points_awarded)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `;
        const taskCompletionResult = await db.query(insertTaskCompletionQuery, [
            taskId,
            id,
            completionDate,
            taskTags || [],
            taskType || null,
            points
        ]);

        const taskCompletionId = taskCompletionResult.rows[0].id;

        // Create player assignments
        const assignmentPromises = (playerAssignments || []).map(async (assignment) => {
            const { playerId, taskItemId, points: itemPoints } = assignment;
            
            // Verify player is on the team
            const checkPlayerQuery = `
                SELECT * FROM team_players 
                WHERE player_id = $1 AND team_id = $2
            `;
            const playerCheck = await db.query(checkPlayerQuery, [playerId, id]);
            
            if (playerCheck.rows.length === 0) {
                console.warn(`Player ${playerId} not found on team ${id}`);
                return;
            }

            const insertAssignmentQuery = `
                INSERT INTO task_player_assignments 
                (task_completion_id, player_id, team_id, task_item_id, points_earned)
                VALUES ($1, $2, $3, $4, $5)
            `;
            return db.query(insertAssignmentQuery, [
                taskCompletionId,
                playerId,
                id,
                taskItemId,
                itemPoints || 0
            ]);
        });

        await Promise.all(assignmentPromises);

        // Award attribute points and specialty points to all players on the team
        if (taskItems && taskItems.length > 0) {
            const { awardAttributePoints, awardSpecialtyPoints } = require('./pointEarningSystem');
            await awardAttributePoints(id, taskItems, taskCompletionId);
            await awardSpecialtyPoints(id, taskItems, taskCompletionId);
        }

        // Award overall task productivity bonus if specified (only to players assigned to items)
        if (taskProductivityBonus && taskProductivityBonus > 0) {
            const { awardTaskProductivityBonus } = require('./pointEarningSystem');
            await awardTaskProductivityBonus(id, taskProductivityBonus, playerAssignments || []);
        }

        // Process point bonuses (attendance, social, productivity, intensity, specialist)
        const { processPointBonuses } = require('./pointEarningSystem');
        await processPointBonuses(
            taskCompletionId,
            id,
            completionDate,
            playerAssignments || []
        );

        // Update team points and award cash
        const team = teamResult.rows[0];
        const currentTaskPoints = parseFloat(team.task_points || 0);
        const currentTotalPoints = parseFloat(team.total_points || 0);
        const currentWeeklyPoints = parseFloat(team.weekly_points || 0);
        const currentCash = parseFloat(team.cash || 0);

        const newTaskPoints = currentTaskPoints + points;
        const newTotalPoints = currentTotalPoints + points;
        const newWeeklyPoints = currentWeeklyPoints + points;
        
        // Award $1000 cash for completing the task
        const taskCompletionReward = 1000;
        const newCash = currentCash + taskCompletionReward;

        const updateTeamQuery = `
            UPDATE teams 
            SET task_points = $1::numeric, 
                total_points = $2::numeric, 
                weekly_points = $3::numeric,
                cash = $4::numeric
            WHERE id = $5
            RETURNING id, name, slug, cash, total_points, weekly_points, task_points
        `;
        const updateResult = await db.query(updateTeamQuery, [
            newTaskPoints,
            newTotalPoints,
            newWeeklyPoints,
            newCash,
            id
        ]);

        // Recalculate team score
        await calculateTeamScore(id);

        res.status(200).json({
            message: 'Task completed successfully with player assignments',
            team: updateResult.rows[0],
            taskCompletionId,
            pointsAdded: points
        });
    } catch (error) {
        console.error('Error completing task with players:', error);
        res.status(500).json({ message: 'Error completing task' });
    }
};

const convertPlayerAttributePoints = async (req, res) => {
    const { id } = req.params; // Team ID

    try {
        const { convertAttributePointsToAttributes } = require('./pointEarningSystem');
        await convertAttributePointsToAttributes(id);

        res.status(200).json({
            message: 'Attribute points converted successfully'
        });
    } catch (error) {
        console.error('Error converting attribute points:', error);
        res.status(500).json({ message: 'Error converting attribute points' });
    }
};

// Player valuation and analytics endpoints
const getPlayerValuationById = async (req, res) => {
    const { id } = req.params;
    
    try {
        const valuation = await getPlayerValuation(id);
        if (!valuation) {
            return res.status(404).json({ message: 'Player not found' });
        }
        res.status(200).json(valuation);
    } catch (error) {
        console.error('Error getting player valuation:', error);
        res.status(500).json({ message: 'Error getting player valuation' });
    }
};

const getPlayerTransactions = async (req, res) => {
    const { id } = req.params; // playerId
    const { teamId } = req.query; // optional teamId filter
    
    try {
        const transactions = await getPlayerTransactionHistory(id, teamId ? parseInt(teamId) : null);
        res.status(200).json(transactions);
    } catch (error) {
        console.error('Error getting player transactions:', error);
        res.status(500).json({ message: 'Error getting player transactions' });
    }
};

const getMarketAnalyticsData = async (req, res) => {
    try {
        const analytics = await getMarketAnalytics();
        res.status(200).json(analytics);
    } catch (error) {
        console.error('Error getting market analytics:', error);
        res.status(500).json({ message: 'Error getting market analytics' });
    }
};

// Task name mapping (can be enhanced to read from taskConfig or database)
const getTaskName = (taskId) => {
    const taskNames = {
        'add-product': 'Add a product to the store',
        // Add more task mappings as tasks are created
    };
    // If not found in mapping, return a formatted version of the task ID
    return taskNames[taskId] || taskId.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
};

const getTaskLogs = async (req, res) => {
    try {
        // Get all task completions with team information
        const logsQuery = `
            SELECT 
                tc.id,
                tc.task_id,
                tc.team_id,
                tc.completed_at,
                tc.points_awarded,
                t.name as team_name,
                t.slug as team_slug
            FROM task_completions tc
            INNER JOIN teams t ON tc.team_id = t.id
            ORDER BY tc.completed_at DESC
        `;
        const logsResult = await db.query(logsQuery);
        
        // Get delegations for each task completion (if table exists)
        const completionIds = logsResult.rows.map(row => row.id);
        let delegationsMap = {};
        
        if (completionIds.length > 0) {
            try {
                const delegationsQuery = `
                    SELECT 
                        td.task_completion_id,
                        td.delegated_team_id,
                        td.delegating_team_id,
                        td.points_awarded as delegation_points,
                        t1.name as delegated_team_name,
                        t1.slug as delegated_team_slug,
                        t2.name as delegating_team_name,
                        t2.slug as delegating_team_slug
                    FROM task_delegations td
                    INNER JOIN teams t1 ON td.delegated_team_id = t1.id
                    INNER JOIN teams t2 ON td.delegating_team_id = t2.id
                    WHERE td.task_completion_id = ANY($1::int[])
                `;
                const delegationsResult = await db.query(delegationsQuery, [completionIds]);
                
                // Group delegations by task_completion_id
                delegationsResult.rows.forEach(delegation => {
                    if (!delegationsMap[delegation.task_completion_id]) {
                        delegationsMap[delegation.task_completion_id] = [];
                    }
                    delegationsMap[delegation.task_completion_id].push({
                        delegatedTeamId: delegation.delegated_team_id,
                        delegatedTeamName: delegation.delegated_team_name,
                        delegatedTeamSlug: delegation.delegated_team_slug,
                        delegatingTeamId: delegation.delegating_team_id,
                        delegatingTeamName: delegation.delegating_team_name,
                        delegatingTeamSlug: delegation.delegating_team_slug,
                        pointsAwarded: parseFloat(delegation.delegation_points) || 0
                    });
                });
            } catch (error) {
                // If task_delegations table doesn't exist yet, just continue without delegations
                console.log('Task delegations table not found or error querying delegations:', error.message);
            }
        }
        
        // Get dispute counts and disputing teams for each completion
        let disputesMap = {};
        let resolvedMap = {};
        let disputingTeamsMap = {};

        if (completionIds.length > 0) {
            try {
                // Get dispute counts and disputing team IDs
                const disputesQuery = `
                    SELECT 
                        task_completion_id,
                        disputing_team_id,
                        COUNT(*) OVER (PARTITION BY task_completion_id) as dispute_count
                    FROM task_disputes
                    WHERE task_completion_id = ANY($1::int[])
                `;
                const disputesResult = await db.query(disputesQuery, [completionIds]);
                disputesResult.rows.forEach(row => {
                    const completionId = row.task_completion_id;
                    if (!disputesMap[completionId]) {
                        disputesMap[completionId] = parseInt(row.dispute_count) || 0;
                        disputingTeamsMap[completionId] = [];
                    }
                    disputingTeamsMap[completionId].push(parseInt(row.disputing_team_id));
                });

                // Get resolved disputes
                const resolvedQuery = `
                    SELECT task_completion_id 
                    FROM task_dispute_resolutions 
                    WHERE task_completion_id = ANY($1::int[])
                `;
                const resolvedResult = await db.query(resolvedQuery, [completionIds]);
                resolvedResult.rows.forEach(row => {
                    resolvedMap[row.task_completion_id] = true;
                });
            } catch (error) {
                console.log('Error querying disputes:', error.message);
            }
        }
        
        // Format the response
        const logs = logsResult.rows.map(log => ({
            id: log.id,
            taskId: log.task_id,
            taskName: getTaskName(log.task_id),
            teamId: log.team_id,
            teamName: log.team_name,
            teamSlug: log.team_slug,
            completedAt: log.completed_at,
            pointsAwarded: parseFloat(log.points_awarded) || 0,
            delegations: delegationsMap[log.id] || [],
            disputeCount: disputesMap[log.id] || 0,
            isResolved: resolvedMap[log.id] || false,
            disputingTeamIds: disputingTeamsMap[log.id] || []
        }));
        
        res.status(200).json({
            logs: logs,
            total: logs.length
        });
    } catch (error) {
        console.error('Error getting task logs:', error);
        res.status(500).json({ message: 'Error retrieving task logs' });
    }
};

const disputeTaskCompletion = async (req, res) => {
    const { taskCompletionId } = req.body;
    const { id: teamId } = req.params; // Team ID from URL params (disputing team)

    try {
        // Validate inputs
        if (!taskCompletionId) {
            return res.status(400).json({ message: 'Task completion ID is required' });
        }

        // Get task completion details
        const taskCompletionQuery = `
            SELECT tc.id, tc.team_id as completed_by_team_id, tc.task_id, tc.points_awarded
            FROM task_completions tc
            WHERE tc.id = $1
        `;
        const taskCompletionResult = await db.query(taskCompletionQuery, [taskCompletionId]);

        if (taskCompletionResult.rows.length === 0) {
            return res.status(404).json({ message: 'Task completion not found' });
        }

        const taskCompletion = taskCompletionResult.rows[0];

        // Prevent teams from disputing their own task completions
        if (parseInt(taskCompletion.completed_by_team_id) === parseInt(teamId)) {
            return res.status(400).json({ message: 'You cannot dispute your own task completion' });
        }

        // Check if team has already disputed this completion
        const existingDisputeQuery = `
            SELECT id FROM task_disputes 
            WHERE task_completion_id = $1 AND disputing_team_id = $2
        `;
        const existingDisputeResult = await db.query(existingDisputeQuery, [taskCompletionId, teamId]);

        if (existingDisputeResult.rows.length > 0) {
            return res.status(400).json({ message: 'You have already disputed this task completion' });
        }

        // Check if this dispute has already been resolved (penalties applied)
        const resolvedQuery = `
            SELECT id FROM task_dispute_resolutions 
            WHERE task_completion_id = $1
        `;
        const resolvedResult = await db.query(resolvedQuery, [taskCompletionId]);

        if (resolvedResult.rows.length > 0) {
            return res.status(400).json({ message: 'This dispute has already been resolved and penalties applied' });
        }

        // Create the dispute
        const insertDisputeQuery = `
            INSERT INTO task_disputes (task_completion_id, disputing_team_id)
            VALUES ($1, $2)
            RETURNING id
        `;
        await db.query(insertDisputeQuery, [taskCompletionId, teamId]);

        // Count total disputes for this completion
        const countDisputesQuery = `
            SELECT COUNT(*) as dispute_count
            FROM task_disputes
            WHERE task_completion_id = $1
        `;
        const countResult = await db.query(countDisputesQuery, [taskCompletionId]);
        const disputeCount = parseInt(countResult.rows[0].dispute_count);

        let penaltiesApplied = false;

        // If 3 or more teams dispute, apply penalties
        if (disputeCount >= 3) {
            const disputedTeamId = taskCompletion.completed_by_team_id;
            const fineAmount = 15000;
            const pointsPenalty = 50;

            // Get current team data
            const teamQuery = `SELECT * FROM teams WHERE id = $1`;
            const teamResult = await db.query(teamQuery, [disputedTeamId]);

            if (teamResult.rows.length === 0) {
                return res.status(404).json({ message: 'Team that completed the task not found' });
            }

            const team = teamResult.rows[0];
            const currentCash = parseFloat(team.cash || 0);
            const currentTotalPoints = parseFloat(team.total_points || 0);
            const currentTaskPoints = parseFloat(team.task_points || 0);

            // Apply fine and point penalty
            const newCash = Math.max(0, currentCash - fineAmount); // Don't go below 0
            const newTotalPoints = Math.max(0, currentTotalPoints - pointsPenalty);
            const newTaskPoints = Math.max(0, currentTaskPoints - pointsPenalty);

            // Update team
            const updateTeamQuery = `
                UPDATE teams 
                SET cash = $1::numeric,
                    total_points = $2::numeric,
                    task_points = $3::numeric
                WHERE id = $4
            `;
            await db.query(updateTeamQuery, [newCash, newTotalPoints, newTaskPoints, disputedTeamId]);

            // Record the resolution
            const insertResolutionQuery = `
                INSERT INTO task_dispute_resolutions 
                (task_completion_id, disputed_team_id, dispute_count, fine_amount, points_penalty)
                VALUES ($1, $2, $3, $4, $5)
            `;
            await db.query(insertResolutionQuery, [
                taskCompletionId,
                disputedTeamId,
                disputeCount,
                fineAmount,
                pointsPenalty
            ]);

            // Recalculate team score
            await calculateTeamScore(disputedTeamId);

            penaltiesApplied = true;
        }

        res.status(200).json({
            message: 'Dispute recorded successfully',
            disputeCount: disputeCount,
            penaltiesApplied: penaltiesApplied,
            ...(penaltiesApplied && {
                fineAmount: 15000,
                pointsPenalty: 50,
                message: 'Dispute recorded. Penalties have been applied to the team that completed this task.'
            })
        });
    } catch (error) {
        console.error('Error disputing task completion:', error);
        res.status(500).json({ message: 'Error processing dispute' });
    }
};

const getTaskDisputes = async (req, res) => {
    const { taskCompletionId } = req.params;

    try {
        // Get all disputes for this task completion
        const disputesQuery = `
            SELECT 
                td.id,
                td.disputing_team_id,
                td.created_at,
                t.name as disputing_team_name,
                t.slug as disputing_team_slug
            FROM task_disputes td
            INNER JOIN teams t ON td.disputing_team_id = t.id
            WHERE td.task_completion_id = $1
            ORDER BY td.created_at ASC
        `;
        const disputesResult = await db.query(disputesQuery, [taskCompletionId]);

        // Check if resolved
        const resolvedQuery = `
            SELECT * FROM task_dispute_resolutions 
            WHERE task_completion_id = $1
        `;
        const resolvedResult = await db.query(resolvedQuery, [taskCompletionId]);

        res.status(200).json({
            disputes: disputesResult.rows.map(dispute => ({
                id: dispute.id,
                disputingTeamId: dispute.disputing_team_id,
                disputingTeamName: dispute.disputing_team_name,
                disputingTeamSlug: dispute.disputing_team_slug,
                createdAt: dispute.created_at
            })),
            disputeCount: disputesResult.rows.length,
            resolved: resolvedResult.rows.length > 0,
            resolution: resolvedResult.rows.length > 0 ? {
                fineAmount: parseFloat(resolvedResult.rows[0].fine_amount) || 0,
                pointsPenalty: parseInt(resolvedResult.rows[0].points_penalty) || 0,
                resolvedAt: resolvedResult.rows[0].resolved_at
            } : null
        });
    } catch (error) {
        console.error('Error getting task disputes:', error);
        res.status(500).json({ message: 'Error retrieving disputes' });
    }
};

// Utility endpoint to sync all player attributes from team_players to players table
const syncAllPlayerAttributes = async (req, res) => {
    try {
        const { updatePlayerAttributesFromTeams, calculatePlayerSalary, recalculateAllPlayerOverallRatings } = require('./playerCalculations');
        
        // Get all unique player IDs from team_players
        const playersQuery = `SELECT DISTINCT player_id FROM team_players`;
        const playersResult = await db.query(playersQuery);
        
        const syncPromises = playersResult.rows.map(async (row) => {
            const playerId = row.player_id;
            await updatePlayerAttributesFromTeams(playerId);
            await calculatePlayerSalary(playerId);
        });
        
        await Promise.all(syncPromises);
        
        // Also recalculate overall_rating for ALL players (including those not in any team)
        const recalculatedCount = await recalculateAllPlayerOverallRatings();
        
        res.status(200).json({ 
            message: `Successfully synced attributes for ${playersResult.rows.length} players and recalculated overall_rating for all players`,
            playersSynced: playersResult.rows.length,
            overallRatingsRecalculated: recalculatedCount
        });
    } catch (error) {
        console.error('Error syncing player attributes:', error);
        res.status(500).json({ message: 'Error syncing player attributes' });
    }
};

module.exports = {
  getAllPlayers,
  getPlayerById,
  updatePlayerAttributeByPosition,
  createPlayer,
  getAllTeams,
  getTeamById,
  createTeam,
  purchasePlayer,
  sellPlayer,
  loginTeam,
  updateTeamTaskPoints,
  completeTaskWithPlayers,
  convertPlayerAttributePoints,
  getPlayerValuationById,
  getPlayerTransactions,
  getMarketAnalyticsData,
  getTaskLogs,
  disputeTaskCompletion,
  getTaskDisputes,
  syncAllPlayerAttributes,
  recalculateAllPlayerOverallRatings: async (req, res) => {
    try {
      const { recalculateAllPlayerOverallRatings } = require('./playerCalculations');
      const count = await recalculateAllPlayerOverallRatings();
      res.status(200).json({ 
        message: `Successfully recalculated overall_rating for ${count} players`,
        playersUpdated: count
      });
    } catch (error) {
      console.error('Error recalculating overall ratings:', error);
      res.status(500).json({ message: 'Error recalculating overall ratings' });
    }
  }
};

