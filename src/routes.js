const express = require('express');
const router = express.Router();
const controllers = require('./controllers');

// Player routes
router.get('/players', controllers.getAllPlayers);
router.get('/players/:id', controllers.getPlayerById);
router.post('/players', controllers.createPlayer);

// Team routes
router.get('/teams', controllers.getAllTeams);
router.get('/teams/:slug', controllers.getTeamById);
router.post('/teams', controllers.createTeam);

module.exports = router;

