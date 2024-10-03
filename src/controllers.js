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
  createTeam
};

