const db = require('./db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


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

const createPlayer = (req, res) => {

};

const getAllTeams = async (req, res) => {
     try {
        const result = await db.query('SELECT * FROM teams');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Could not get players from db.' });
    }
};

const getTeamById = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM team_players WHERE team_id = ${req.body.team_id');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Could not get players from db.' });
    }
};

const purchasePlayer = async (req, res) => {
    const { teamId, playerId } = req.body;

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

        // Check if the team has enough cash to buy the player
        if (team.cash < player.salary) {
            return res.status(400).json({ message: 'Not enough cash to purchase this player' });
        }

        // Deduct player's salary from team's cash
        const newCashBalance = team.cash - player.salary;
        const updateTeamCashQuery = `UPDATE teams SET cash = $1 WHERE id = $2`;
        await db.query(updateTeamCashQuery, [newCashBalance, teamId]);

        // Insert the player into the team_players table
        const insertPlayerQuery = `
            INSERT INTO team_players (team_id, player_id)
            VALUES ($1, $2)
        `;
        await db.query(insertPlayerQuery, [teamId, playerId]);

        // Respond with success message and updated team cash balance
        res.status(201).json({ message: 'Player purchased successfully', cash: newCashBalance });
    } catch (error) {
        console.error('Error purchasing player:', error);
        res.status(500).json({ message: 'Error processing the purchase' });
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
            INSERT INTO teams (name, slug, cash, total_points, weekly_points, password)
            VALUES ($1, $2, $3::numeric, $4::integer, $5::integer, $6)
            RETURNING id, name, slug, cash, total_points, weekly_points
        `;
        const result = await db.query(insertTeamQuery, [
            name,          // $1 -> name (string)
            slug,              // $2 -> slug (string)
            950000.00,         // $3 -> cash (numeric, casting it to numeric)
            0,                 // $4 -> total_points (integer)
            0,                 // $5 -> weekly_points (integer)
            hashedPassword     // $6 -> password (string)
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


module.exports = {
  getAllPlayers,
  getPlayerById,
  createPlayer,
  getAllTeams,
  getTeamById,
  createTeam,
  purchasePlayer,
  loginTeam
};

