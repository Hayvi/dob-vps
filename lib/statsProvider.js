const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Game = require('../models/Game');


const KROSSTATS_API_BASE = process.env.KROSSTATS_API_BASE_URL || 'https://krosstats.betcoapps.com/api';
const KROSSTATS_LANG = process.env.KROSSTATS_LANG || 'en';

function readSecretFile(filename) {
    try {
        return fs.readFileSync(path.join('/etc/secrets', filename), 'utf8').trim();
    } catch {
        return null;
    }
}

async function fetchGameStats(gameId) {
    try {
        const krosstatsSiteId = process.env.KROSSTATS_SITE_ID || readSecretFile('KROSSTATS_SITE_ID');
        const krosstatsToken = process.env.KROSSTATS_TOKEN || readSecretFile('KROSSTATS_TOKEN');
        if (!krosstatsSiteId || !krosstatsToken) {
            throw new Error('Stats provider not configured');
        }

        // 1. Fetch game from DB to get team IDs
        const game = await Game.findOne({ gameId: parseInt(gameId) });
        if (!game) {
            throw new Error(`Game ${gameId} not found`);
        }

        // 2. Fetch stats from Krosstats
        const statsUrl = `${KROSSTATS_API_BASE}/${encodeURIComponent(String(KROSSTATS_LANG))}/${encodeURIComponent(String(krosstatsSiteId))}/${encodeURIComponent(String(krosstatsToken))}/Entity/GetGeneralStatsInfo?matchId=${encodeURIComponent(String(gameId))}`;
        console.log(`Fetching stats for game ${gameId}`);

        const response = await axios.get(statsUrl);
        const data = response.data;

        if (!data || !data.GeneralStatsInfoResult) {
            console.warn(`No stats found for game ${gameId}`);
            return {
                gameId,
                stats: { home: null, away: null }
            };
        }

        const results = data.GeneralStatsInfoResult;

        // 3. Map stats to Home/Away
        let homeStats = null;
        let awayStats = null;

        // Try to match by team ID first (most reliable if we have it)
        if (game.team1_id && game.team2_id) {
            homeStats = results.find(r => r.EntityId === game.team1_id);
            awayStats = results.find(r => r.EntityId === game.team2_id);
        }

        // Fallback: If IDs don't match or weren't scraped yet, we might need to rely on position or just return raw results
        // But for now, let's assume IDs match if they exist.

        // Transform the raw stats into a cleaner format
        const transformStats = (stat) => {
            if (!stat) return null;
            return {
                position: stat.Position,
                points: stat.Points,
                form: stat.GeneralInfoWDL // Array like ["W", "L", "D"]
            };
        };

        return {
            gameId,
            stats: {
                home: transformStats(homeStats),
                away: transformStats(awayStats),
                raw: results // Keep raw results just in case debugging is needed
            }
        };

    } catch (error) {
        console.error(`Error fetching stats for game ${gameId}:`, error.message);
        throw error;
    }
}

module.exports = { fetchGameStats };
