const db = require('./db');
const { calculatePlayerSalary } = require('./playerCalculations');

/**
 * Get comprehensive valuation metrics for a player
 */
const getPlayerValuation = async (playerId) => {
    try {
        // Get base player data
        const playerQuery = `
            SELECT id, name, salary, overall_rating, attendance, social, productivity, intensity, specialty_rating, base_salary
            FROM players
            WHERE id = $1
        `;
        const playerResult = await db.query(playerQuery, [playerId]);
        
        if (playerResult.rows.length === 0) {
            return null;
        }
        
        const player = playerResult.rows[0];
        
        // Get team count (demand)
        const demandQuery = `SELECT COUNT(*) as team_count FROM team_players WHERE player_id = $1`;
        const demandResult = await db.query(demandQuery, [playerId]);
        const teamCount = parseInt(demandResult.rows[0].team_count) || 0;
        
        // Get transaction history
        const transactionQuery = `
            SELECT transaction_type, price, transaction_date
            FROM player_transactions
            WHERE player_id = $1
            ORDER BY transaction_date DESC
            LIMIT 10
        `;
        const transactionResult = await db.query(transactionQuery, [playerId]);
        
        // Calculate total purchases and sales
        let totalPurchases = 0;
        let totalSales = 0;
        let purchaseCount = 0;
        let saleCount = 0;
        
        transactionResult.rows.forEach(tx => {
            if (tx.transaction_type === 'purchase') {
                totalPurchases += parseFloat(tx.price) || 0;
                purchaseCount++;
            } else {
                totalSales += parseFloat(tx.price) || 0;
                saleCount++;
            }
        });
        
        // Get average purchase price
        const avgPurchasePrice = purchaseCount > 0 ? totalPurchases / purchaseCount : 0;
        
        // Get current team purchase prices
        const teamPurchaseQuery = `
            SELECT purchase_price, overall_rating as team_overall_rating
            FROM team_players
            WHERE player_id = $1
        `;
        const teamPurchaseResult = await db.query(teamPurchaseQuery, [playerId]);
        
        // Calculate potential value (projected based on growth)
        // Simple projection: if player is improving, estimate future value
        const currentRating = parseFloat(player.overall_rating) || 0;
        const potentialRating = Math.min(99, currentRating + 5); // Conservative projection
        const potentialValue = 100000 * (potentialRating / 80) + (parseFloat(player.base_salary) || 0) + (teamCount * 10000);
        
        // Performance trend: compare current rating to average team rating
        let performanceTrend = 'stable';
        if (teamPurchaseResult.rows.length > 0) {
            const avgTeamRating = teamPurchaseResult.rows.reduce((sum, row) => sum + (parseFloat(row.team_overall_rating) || 0), 0) / teamPurchaseResult.rows.length;
            if (currentRating > avgTeamRating + 2) {
                performanceTrend = 'improving';
            } else if (currentRating < avgTeamRating - 2) {
                performanceTrend = 'declining';
            }
        }
        
        return {
            playerId: player.id,
            playerName: player.name,
            marketValue: parseFloat(player.salary) || 0,
            averagePurchasePrice: avgPurchasePrice,
            totalPurchases: purchaseCount,
            totalSales: saleCount,
            demandScore: teamCount,
            currentRating: currentRating,
            potentialValue: potentialValue,
            performanceTrend: performanceTrend,
            baseSalary: parseFloat(player.base_salary) || 0,
            attributes: {
                attendance: parseInt(player.attendance) || 0,
                social: parseInt(player.social) || 0,
                productivity: parseInt(player.productivity) || 0,
                intensity: parseInt(player.intensity) || 0,
                specialty_rating: parseInt(player.specialty_rating) || 0
            },
            recentTransactions: transactionResult.rows.map(tx => ({
                type: tx.transaction_type,
                price: parseFloat(tx.price) || 0,
                date: tx.transaction_date
            }))
        };
    } catch (error) {
        console.error('Error getting player valuation:', error);
        throw error;
    }
};

/**
 * Get player transaction history for a specific team
 */
const getPlayerTransactionHistory = async (playerId, teamId = null) => {
    try {
        let query, params;
        
        if (teamId) {
            query = `
                SELECT pt.*, t.name as team_name, p.name as player_name
                FROM player_transactions pt
                INNER JOIN teams t ON pt.team_id = t.id
                INNER JOIN players p ON pt.player_id = p.id
                WHERE pt.player_id = $1 AND pt.team_id = $2
                ORDER BY pt.transaction_date DESC
            `;
            params = [playerId, teamId];
        } else {
            query = `
                SELECT pt.*, t.name as team_name, p.name as player_name
                FROM player_transactions pt
                INNER JOIN teams t ON pt.team_id = t.id
                INNER JOIN players p ON pt.player_id = p.id
                WHERE pt.player_id = $1
                ORDER BY pt.transaction_date DESC
            `;
            params = [playerId];
        }
        
        const result = await db.query(query, params);
        
        return result.rows.map(row => ({
            id: row.id,
            playerId: row.player_id,
            playerName: row.player_name,
            teamId: row.team_id,
            teamName: row.team_name,
            transactionType: row.transaction_type,
            price: parseFloat(row.price) || 0,
            transactionDate: row.transaction_date
        }));
    } catch (error) {
        console.error('Error getting transaction history:', error);
        throw error;
    }
};

/**
 * Get market analytics
 */
const getMarketAnalytics = async () => {
    try {
        // Most purchased players
        const mostPurchasedQuery = `
            SELECT 
                p.id,
                p.name,
                COUNT(CASE WHEN pt.transaction_type = 'purchase' THEN 1 END) as purchase_count,
                AVG(CASE WHEN pt.transaction_type = 'purchase' THEN pt.price END) as avg_purchase_price
            FROM players p
            LEFT JOIN player_transactions pt ON p.id = pt.player_id
            GROUP BY p.id, p.name
            HAVING COUNT(CASE WHEN pt.transaction_type = 'purchase' THEN 1 END) > 0
            ORDER BY purchase_count DESC
            LIMIT 10
        `;
        const mostPurchasedResult = await db.query(mostPurchasedQuery);
        
        // Highest ROI players (based on current value vs average purchase price)
        const roiQuery = `
            SELECT 
                p.id,
                p.name,
                p.salary as current_value,
                AVG(CASE WHEN pt.transaction_type = 'purchase' THEN pt.price END) as avg_purchase_price,
                COUNT(CASE WHEN pt.transaction_type = 'purchase' THEN 1 END) as purchase_count,
                (p.salary - COALESCE(AVG(CASE WHEN pt.transaction_type = 'purchase' THEN pt.price END), p.salary)) as profit_per_purchase
            FROM players p
            LEFT JOIN player_transactions pt ON p.id = pt.player_id
            GROUP BY p.id, p.name, p.salary
            HAVING COUNT(CASE WHEN pt.transaction_type = 'purchase' THEN 1 END) > 0
            ORDER BY profit_per_purchase DESC
            LIMIT 10
        `;
        const roiResult = await db.query(roiQuery);
        
        // Fastest growing players (based on attribute increases)
        // Compare current rating to average purchase-time rating
        const growthQuery = `
            SELECT 
                p.id,
                p.name,
                p.overall_rating as current_rating,
                COALESCE(AVG(tp.overall_rating), p.overall_rating) as avg_team_rating,
                (p.overall_rating - COALESCE(AVG(tp.overall_rating), p.overall_rating)) as growth
            FROM players p
            LEFT JOIN team_players tp ON p.id = tp.player_id
            GROUP BY p.id, p.name, p.overall_rating
            HAVING COUNT(tp.id) > 0
            ORDER BY growth DESC
            LIMIT 10
        `;
        const growthResult = await db.query(growthQuery);
        
        // Most in-demand players (highest demand bonus)
        const demandQuery = `
            SELECT 
                p.id,
                p.name,
                p.salary,
                COUNT(tp.team_id) as team_count,
                (COUNT(tp.team_id) * 10000) as demand_bonus
            FROM players p
            LEFT JOIN team_players tp ON p.id = tp.player_id
            GROUP BY p.id, p.name, p.salary
            HAVING COUNT(tp.team_id) > 0
            ORDER BY team_count DESC, p.salary DESC
            LIMIT 10
        `;
        const demandResult = await db.query(demandQuery);
        
        return {
            mostPurchased: mostPurchasedResult.rows.map(row => ({
                playerId: row.id,
                playerName: row.name,
                purchaseCount: parseInt(row.purchase_count) || 0,
                avgPurchasePrice: parseFloat(row.avg_purchase_price) || 0
            })),
            highestROI: roiResult.rows.map(row => ({
                playerId: row.id,
                playerName: row.name,
                currentValue: parseFloat(row.current_value) || 0,
                avgPurchasePrice: parseFloat(row.avg_purchase_price) || 0,
                purchaseCount: parseInt(row.purchase_count) || 0,
                profitPerPurchase: parseFloat(row.profit_per_purchase) || 0,
                roi: row.avg_purchase_price > 0 
                    ? ((parseFloat(row.current_value) - parseFloat(row.avg_purchase_price)) / parseFloat(row.avg_purchase_price) * 100).toFixed(2) + '%'
                    : 'N/A'
            })),
            fastestGrowing: growthResult.rows.map(row => ({
                playerId: row.id,
                playerName: row.name,
                currentRating: parseFloat(row.current_rating) || 0,
                avgTeamRating: parseFloat(row.avg_team_rating) || 0,
                growth: parseFloat(row.growth) || 0
            })),
            mostInDemand: demandResult.rows.map(row => ({
                playerId: row.id,
                playerName: row.name,
                salary: parseFloat(row.salary) || 0,
                teamCount: parseInt(row.team_count) || 0,
                demandBonus: parseFloat(row.demand_bonus) || 0
            }))
        };
    } catch (error) {
        console.error('Error getting market analytics:', error);
        throw error;
    }
};

module.exports = {
    getPlayerValuation,
    getPlayerTransactionHistory,
    getMarketAnalytics
};

