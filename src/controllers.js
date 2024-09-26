const db = require('./db');

// Dummy player data with ratings
const players = [
  {
    id: 1,
    name: 'Player 1',
    specialty: 'Collaborator',
    role: 'test',
    ratings: {
      punctuality: 80,
      social: 85,
      productivity: 90,
      intensity: 70,
      specialty: 88
    },
    get overall() {
      const total = this.ratings.punctuality + this.ratings.social + this.ratings.productivity + this.ratings.intensity + this.ratings.specialty;
      return parseInt((total / 500) * 100);  // Max total of 500 for ratings
    }
  },
  {
    id: 2,
    name: 'Player 2',
    specialty: 'Task Finisher',
    role: 'test',
    ratings: {
      punctuality: 78,
      social: 72,
      productivity: 95,
      intensity: 85,
      specialty: 90
    },
    get overall() {
      const total = this.ratings.punctuality + this.ratings.social + this.ratings.productivity + this.ratings.intensity + this.ratings.specialty;
      return parseInt((total / 500) * 100);  // Max total of 500 for ratings
    }
  },
  {
    id: 3,
    name: 'Player 3',
    specialty: 'Strategist',
    role: 'test',
    ratings: {
      punctuality: 88,
      social: 77,
      productivity: 85,
      intensity: 80,
      specialty: 92
    },
    get overall() {
      const total = this.ratings.punctuality + this.ratings.social + this.ratings.productivity + this.ratings.intensity + this.ratings.specialty;
      return parseInt((total / 500) * 100);  // Max total of 500 for ratings
    }
  },
  {
    id: 4,
    name: 'Player 4',
    specialty: 'Collaborator',
    role: 'test',
    ratings: {
      punctuality: 90,
      social: 80,
      productivity: 70,
      intensity: 75,
      specialty: 85
    },
    get overall() {
      const total = this.ratings.punctuality + this.ratings.social + this.ratings.productivity + this.ratings.intensity + this.ratings.specialty;
      return parseInt((total / 500) * 100);  // Max total of 500 for ratings
    }
  },
  {
    id: 5,
    name: 'Player 5',
    specialty: 'High Effort Performer',
    role: 'test',
    ratings: {
      punctuality: 85,
      social: 88,
      productivity: 80,
      intensity: 90,
      specialty: 95
    },
    get overall() {
      const total = this.ratings.punctuality + this.ratings.social + this.ratings.productivity + this.ratings.intensity + this.ratings.specialty;
      return parseInt((total / 500) * 100);  // Max total of 500 for ratings
    }
  }
];

// Dummy team data with an array of players
const teams = [
  {
    id: 1,
    name: 'Team A',
    slug: 'team-a',
    points: 450,
    cash: 5100,
    players: [players[0], players[1], players[2], players[3], players[4]]
  },
  {
    id: 2,
    name: 'Team B',
    slug: 'team-b',
    points: 410,
    cash: 4962,
    players: [players[2], players[3], players[4], players[1], players[0]]
  }
];


// Controllers
const getAllPlayers = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM players');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Could not get players from db.' });
    }
};

const getPlayerById = (req, res) => {
  const player = players.find(p => p.id === parseInt(req.params.id));
  if (player) res.json(player);
  else res.status(404).json({ message: 'Player not found' });
};

const createPlayer = (req, res) => {
  const newPlayer = {
    id: players.length + 1,
    ...req.body
  };
  players.push(newPlayer);
  res.status(201).json(newPlayer);
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

const createTeam = (req, res) => {
  const newTeam = {
    id: teams.length + 1,
    ...req.body
  };
  teams.push(newTeam);
  res.status(201).json(newTeam);
};

module.exports = {
  getAllPlayers,
  getPlayerById,
  createPlayer,
  getAllTeams,
  getTeamById,
  createTeam
};

