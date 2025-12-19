const express = require('express');
const router = express.Router();
const controllers = require('./controllers');
const notionControllers = require('./notionControllers');

// Player routes
router.get('/players', controllers.getAllPlayers);
router.get('/players/:id', controllers.getPlayerById);
router.get('/players/:id/valuation', controllers.getPlayerValuationById);
router.get('/players/:id/transactions', controllers.getPlayerTransactions);
router.post('/players', controllers.createPlayer);
router.post('/players/purchase', controllers.purchasePlayer);
router.post('/players/sell', controllers.sellPlayer);
router.post('/players/update', controllers.updatePlayerAttributeByPosition);

// Market analytics
router.get('/market/analytics', controllers.getMarketAnalyticsData);

// Task logs
router.get('/logs', controllers.getTaskLogs);
router.post('/teams/:id/dispute', controllers.disputeTaskCompletion);
router.get('/task-completions/:taskCompletionId/disputes', controllers.getTaskDisputes);

// Seasons
router.get('/seasons/current', controllers.getCurrentSeasonInfo);
router.get('/seasons', controllers.getAllSeasonsHistory);
router.get('/seasons/:seasonId/snapshot', controllers.getSeasonSnapshotData);
router.post('/seasons/complete-expired', controllers.completeExpiredSeasons);

// Notifications
router.get('/teams/:teamId/notifications', controllers.getTeamNotificationsData);
router.get('/notifications/global', controllers.getGlobalNotificationsData);
router.post('/notifications/:notificationId/read', controllers.markNotificationAsRead);

// Utility endpoints
router.post('/players/sync-attributes', controllers.syncAllPlayerAttributes);
router.post('/players/recalculate-overall-ratings', controllers.recalculateAllPlayerOverallRatings);

// Team routes
router.get('/teams', controllers.getAllTeams);
router.get('/teams/:id', controllers.getTeamById);
router.post('/teams', controllers.createTeam);
router.post('/teams/:id/tasks/complete', controllers.updateTeamTaskPoints);
router.post('/teams/:id/tasks/complete-with-players', controllers.completeTaskWithPlayers);
router.post('/teams/:id/convert-points', controllers.convertPlayerAttributePoints);

router.post('/register', controllers.createTeam);
router.post('/login', controllers.loginTeam);

router.get('/notion', notionControllers.filteredRows);

module.exports = router;

