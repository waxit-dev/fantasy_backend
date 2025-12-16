const db = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { updatePlayerOverallRating, calculatePlayerSalary, calculateTeamScore } = require('./playerCalculations');


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
                   team_players.productivity, team_players.intensity, team_players.specialty_rating, team_players.overall_rating
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
            INSERT INTO team_players (team_id, player_id, position, attendance, social, productivity, intensity, specialty_rating, overall_rating)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
            player.overall_rating // $9 -> overall_rating
        ]);

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
            SELECT players.id, players.name, team_players.position, team_players.attendance, team_players.social,
                   team_players.productivity, team_players.intensity, team_players.specialty_rating, team_players.overall_rating
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
            SELECT * FROM team_players 
            WHERE team_id = $1 AND player_id = $2
        `;
        const teamPlayerResult = await db.query(checkTeamPlayerQuery, [teamId, playerId]);

        if (teamPlayerResult.rows.length === 0) {
            return res.status(400).json({ message: 'Player is not on this team' });
        }

        // Parse cash and salary to numbers
        const teamCash = parseFloat(team.cash) || 0;
        const playerSalary = parseFloat(player.salary) || 0;

        // Add player's salary back to team's cash
        const newCashBalance = teamCash + playerSalary;
        const updateTeamCashQuery = `UPDATE teams SET cash = $1 WHERE id = $2`;
        await db.query(updateTeamCashQuery, [newCashBalance, teamId]);

        // Remove the player from the team_players table
        const deleteTeamPlayerQuery = `
            DELETE FROM team_players 
            WHERE team_id = $1 AND player_id = $2
        `;
        await db.query(deleteTeamPlayerQuery, [teamId, playerId]);
        
        // Recalculate player's salary (demand will decrease)
        await calculatePlayerSalary(playerId);
        
        // Update team score after sale
        await calculateTeamScore(teamId);

        // Get the updated team details
        const updatedTeamQuery = `SELECT * FROM teams WHERE id = $1`;
        const updatedTeamResult = await db.query(updatedTeamQuery, [teamId]);
        const updatedTeam = updatedTeamResult.rows[0];

        // Get all players associated with the team
        const teamPlayersQuery = `
            SELECT players.id, players.name, team_players.position, team_players.attendance, team_players.social,
                   team_players.productivity, team_players.intensity, team_players.specialty_rating, team_players.overall_rating
            FROM players
            INNER JOIN team_players ON players.id = team_players.player_id
            WHERE team_players.team_id = $1
        `;
        const teamPlayersResult = await db.query(teamPlayersQuery, [teamId]);
        const teamPlayers = teamPlayersResult.rows;

        // Respond with the updated team and associated players
        res.status(200).json({
            message: 'Player sold successfully',
            userTeam: updatedTeam,
            teamPlayers: teamPlayers
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

        // Calculate new point values
        const newTaskPoints = currentTaskPoints + points;
        const newTotalPoints = currentTotalPoints + points;
        const newWeeklyPoints = currentWeeklyPoints + points;

        // Update team points in the database
        const updateTeamQuery = `
            UPDATE teams 
            SET task_points = $1::numeric, 
                total_points = $2::numeric, 
                weekly_points = $3::numeric
            WHERE id = $4
            RETURNING id, name, slug, cash, total_points, weekly_points, task_points
        `;
        const updateResult = await db.query(updateTeamQuery, [
            newTaskPoints,
            newTotalPoints,
            newWeeklyPoints,
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

        // Process point bonuses (attendance, social, productivity, intensity, specialist)
        const { processPointBonuses } = require('./pointEarningSystem');
        await processPointBonuses(
            taskCompletionId,
            id,
            completionDate,
            playerAssignments || []
        );

        // Update team points
        const team = teamResult.rows[0];
        const currentTaskPoints = parseFloat(team.task_points || 0);
        const currentTotalPoints = parseFloat(team.total_points || 0);
        const currentWeeklyPoints = parseFloat(team.weekly_points || 0);

        const newTaskPoints = currentTaskPoints + points;
        const newTotalPoints = currentTotalPoints + points;
        const newWeeklyPoints = currentWeeklyPoints + points;

        const updateTeamQuery = `
            UPDATE teams 
            SET task_points = $1::numeric, 
                total_points = $2::numeric, 
                weekly_points = $3::numeric
            WHERE id = $4
            RETURNING id, name, slug, cash, total_points, weekly_points, task_points
        `;
        const updateResult = await db.query(updateTeamQuery, [
            newTaskPoints,
            newTotalPoints,
            newWeeklyPoints,
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
  completeTaskWithPlayers
};

