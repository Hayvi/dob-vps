#!/usr/bin/env node

const ForzzaScraper = require('./scraper.js');
const { unwrapSwarmData } = require('./lib/swarm/unwrap');

async function testTeamNames() {
    const scraper = new ForzzaScraper();
    
    try {
        await scraper.init();
        console.log('🔌 Testing team names in time filter data...\n');

        const now = Math.floor(Date.now() / 1000);
        const toTs = now + (24 * 3600); // Next 24 hours

        const raw = await scraper.sendRequest('get', {
            source: 'betting',
            what: {
                sport: ['id', 'name'],
                region: ['id', 'name'],
                competition: ['id', 'name', 'order', 'favorite', 'favorite_order', 'teams_reversed'],
                game: [
                    'id', 'team1_name', 'team2_name', 'start_ts', 'type',
                    'markets_count', 'strong_team', 'round', 'is_blocked'
                ]
            },
            where: {
                sport: { id: 1 }, // Football
                game: {
                    type: 0, // Prematch only
                    start_ts: { '@gte': now, '@lte': toTs }
                }
            }
        });

        const data = unwrapSwarmData(raw);
        const games = [];
        
        // Extract games from nested structure
        if (data?.sport) {
            for (const sport of Object.values(data.sport)) {
                if (sport?.region) {
                    for (const region of Object.values(sport.region)) {
                        if (region?.competition) {
                            for (const comp of Object.values(region.competition)) {
                                if (comp?.game) {
                                    for (const game of Object.values(comp.game)) {
                                        games.push({
                                            ...game,
                                            sport: sport.name,
                                            region: region.name,
                                            competition: comp.name,
                                            competition_favorite: comp.favorite,
                                            teams_reversed: comp.teams_reversed
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        console.log(`📊 Found ${games.length} games`);
        
        if (games.length > 0) {
            console.log('\n🔍 Sample games:');
            games.slice(0, 5).forEach((game, idx) => {
                console.log(`${idx + 1}. ID: ${game.id}`);
                console.log(`   Team 1: "${game.team1_name}" (${typeof game.team1_name})`);
                console.log(`   Team 2: "${game.team2_name}" (${typeof game.team2_name})`);
                console.log(`   Competition: ${game.competition}`);
                console.log(`   Start: ${new Date(game.start_ts * 1000).toLocaleString()}`);
                console.log('');
            });

            // Check for games with missing team names
            const missingTeam1 = games.filter(g => !g.team1_name);
            const missingTeam2 = games.filter(g => !g.team2_name);
            
            console.log(`❌ Games missing team1_name: ${missingTeam1.length}`);
            console.log(`❌ Games missing team2_name: ${missingTeam2.length}`);
            
            if (missingTeam1.length > 0) {
                console.log('\nSample games missing team1_name:');
                missingTeam1.slice(0, 3).forEach(game => {
                    console.log(`   ${game.id}: ${game.competition} - team1_name: ${game.team1_name}`);
                });
            }
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        scraper.close();
    }
}

if (require.main === module) {
    testTeamNames();
}

module.exports = testTeamNames;
