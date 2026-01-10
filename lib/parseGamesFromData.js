function parseGamesFromData(rawData, sportName = "Unknown") {
    const debug = process.env.DEBUG_PARSE_GAMES === 'true';

    // Debug: log the input structure
    if (debug) console.log('parseGamesFromData input type:', typeof rawData);
    if (debug) console.log('parseGamesFromData input keys:', Object.keys(rawData || {}));

    // Handle multiple possible response structures
    // Structure 1: { code, rid, data: { data: { region: {...} } } } (from getGamesBySport)
    // Structure 2: { data: { region: {...} } }
    // Structure 3: { region: {...} }
    let data = rawData;

    if (rawData && rawData.data) {
        if (debug) console.log('parseGamesFromData rawData.data keys:', Object.keys(rawData.data || {}));
        data = rawData.data;
        if (data && data.data) {
            if (debug) console.log('parseGamesFromData data.data keys:', Object.keys(data.data || {}));
            data = data.data;
        }
    }

    if (debug) console.log('parseGamesFromData - final data keys:', Object.keys(data || {}));

    const allGames = [];

    const pushGame = (game, regionName, competitionName) => {
        const markets = {};
        if (game.market) {
            for (const mId in game.market) {
                const market = game.market[mId];
                const events = {};
                if (market.event) {
                    for (const eId in market.event) {
                        events[eId] = market.event[eId];
                    }
                }
                markets[mId] = { ...market, event: events };
            }
        }

        allGames.push({
            ...game,
            sport: sportName,
            region: regionName,
            competition: competitionName,
            market: markets
        });
    };

    const resolveFromMap = (value, key, map) => {
        if (!map) return null;
        if (value !== null && value !== undefined && (typeof value === 'string' || typeof value === 'number')) {
            return map[String(value)] || null;
        }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const looksLikeEntity = Boolean(value.name || value.game || value.competition || value.market || value.event);
            if (looksLikeEntity) return value;
            if (value.id !== null && value.id !== undefined && map[String(value.id)]) return map[String(value.id)];
        }
        if (key !== null && key !== undefined && map[String(key)]) return map[String(key)];
        return null;
    };

    const resolveCollection = (refs, map) => {
        if (!refs) return [];
        if (Array.isArray(refs)) {
            return refs.map(id => (map ? map[String(id)] : null)).filter(Boolean);
        }
        if (typeof refs === 'object') {
            return Object.entries(refs)
                .map(([k, v]) => resolveFromMap(v, k, map) || (v && typeof v === 'object' ? v : null))
                .filter(Boolean);
        }
        return [];
    };

    // Shape A: { region: { ... } }
    if (data && data.region) {
        for (const regionId in data.region) {
            const region = data.region[regionId];
            const competitions = resolveCollection(region?.competition, data.competition);
            for (const competition of competitions) {
                const games = resolveCollection(competition?.game, data.game);
                for (const game of games) {
                    pushGame(game, region?.name || regionId, competition?.name);
                }
            }
        }
    }

    // Shape B: { sport: { <sportId>: { region: { ... } } } }
    // Some feeds return nested region/competition/game under sport.
    if (allGames.length === 0 && data && data.sport) {
        for (const sId in data.sport) {
            const sport = data.sport[sId];

            if (sport?.region) {
                const regions = resolveCollection(sport.region, data.region);
                for (const region of regions) {
                    const competitions = resolveCollection(region?.competition, sport.competition || data.competition);
                    for (const competition of competitions) {
                        const games = resolveCollection(competition?.game, sport.game || data.game);
                        for (const game of games) {
                            pushGame(game, region?.name, competition?.name);
                        }
                    }
                }
            } else if (sport?.competition) {
                // Fallback: sport -> competition -> game (no region)
                const competitions = resolveCollection(sport.competition, data.competition);
                for (const competition of competitions) {
                    const games = resolveCollection(competition?.game, sport.game || data.game);
                    for (const game of games) {
                        pushGame(game, sport.name, competition?.name);
                    }
                }
            }
        }
    }

    if (allGames.length === 0 && data) {
        const hasExpectedKeys = Boolean(data.region || data.sport);
        if (!hasExpectedKeys) {
            // Shape C: Flat { game: { <gameId>: {...} } } from subscriptions
            if (data.game && typeof data.game === 'object') {
                for (const gameId in data.game) {
                    const game = data.game[gameId];
                    if (game && typeof game === 'object') {
                        pushGame(game, game.region_alias || sportName, game.competition || '');
                    }
                }
            }
        }
    }

    if (debug) console.log(`parseGamesFromData - parsed ${allGames.length} games for ${sportName}`);
    return allGames;
}

module.exports = { parseGamesFromData };
