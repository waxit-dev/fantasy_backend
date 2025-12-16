const express = require('express');
const router = express.Router();
const controllers = require('./controllers');
const notionControllers = require('./notionControllers');

// Player routes
router.get('/players', controllers.getAllPlayers);
router.get('/players/:id', controllers.getPlayerById);
router.post('/players', controllers.createPlayer);
router.post('/players/purchase', controllers.purchasePlayer);
router.post('/players/sell', controllers.sellPlayer);
router.post('/players/update', controllers.updatePlayerAttributeByPosition);

// Team routes
router.get('/teams', controllers.getAllTeams);
router.get('/teams/:id', controllers.getTeamById);
router.post('/teams', controllers.createTeam);
router.post('/teams/:id/tasks/complete', controllers.updateTeamTaskPoints);

router.post('/register', controllers.createTeam);
router.post('/login', controllers.loginTeam);

router.get('/notion', notionControllers.filteredRows);

module.exports = router;

