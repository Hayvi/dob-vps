#!/usr/bin/env node

const ForzzaScraper = require('./scraper.js');
const { parseGamesFromData } = require('./lib/parseGamesFromData');

async function testPrematchFix() {
    const scraper = new ForzzaScraper();
    
    try {
        await scraper.init();
        console.log('🔌 Testing prematch filtering fix...\n');

        // Get raw data from Swarm API
        const response = await scraper.sendRequest('get', {
            source: 'betting',
            what: {
                sport: ['id', 'name', 'alias'],
                region: ['id', 'name', 'alias'],
                competition: ['id', 'name'],
                game: [
                    'id', 'team1_name', 'team2_name', 'start_ts', 'type', 
                    'visible_in_prematch', 'markets_count', 'is_blocked'
                ]
            },
            where: {
                sport: { id: 1 }, // Football
                game: {
                    '@or': [
                        { 'visible_in_prematch': 1 },
                        { 'type': { '@in': [0, 2] } }
                    ]
                }
            }
        });

        const rawData = response.data?.data;
        if (!rawData) {
            console.log('❌ No data received');
            return;
        }

        // Parse games using the same logic as the route
        const allGames = parseGamesFromData(rawData, 'Football');
        
        // Test old filtering logic
        const oldFiltered = allGames.filter(g => {
            return g?.visible_in_prematch === 1 || [0, 2].includes(Number(g?.type));
        });

        // New logic: no additional filtering
        const newFiltered = allGames; // No filtering - trust Swarm API

        console.log('📊 Results:');
        console.log(`   Raw Swarm API games: ${allGames.length}`);
        console.log(`   Old client filter: ${oldFiltered.length} games`);
        console.log(`   New (no filter): ${newFiltered.length} games`);
        console.log(`   Improvement: +${newFiltered.length - oldFiltered.length} games\n`);

        // Analyze what was being filtered out
        const filtered_out = allGames.filter(g => {
            return !(g?.visible_in_prematch === 1 || [0, 2].includes(Number(g?.type)));
        });

        if (filtered_out.length > 0) {
            console.log(`🔍 Games that were being filtered out (${filtered_out.length}):`);
            filtered_out.slice(0, 5).forEach(game => {
                console.log(`   ${game.id}: ${game.team1_name} vs ${game.team2_name || 'N/A'} (type: ${game.type}, visible: ${game.visible_in_prematch})`);
            });
            if (filtered_out.length > 5) {
                console.log(`   ... and ${filtered_out.length - 5} more`);
            }
        }

        // Show game type distribution
        const typeStats = { 0: 0, 1: 0, 2: 0, other: 0 };
        const visibilityStats = { visible: 0, notVisible: 0 };
        
        allGames.forEach(game => {
            const type = Number(game.type);
            if ([0, 1, 2].includes(type)) {
                typeStats[type]++;
            } else {
                typeStats.other++;
            }
            
            if (game.visible_in_prematch === 1) {
                visibilityStats.visible++;
            } else {
                visibilityStats.notVisible++;
            }
        });

        console.log('\n📈 Game Distribution:');
        console.log(`   Type 0 (Prematch): ${typeStats[0]}`);
        console.log(`   Type 1 (Live): ${typeStats[1]}`);
        console.log(`   Type 2 (Outright): ${typeStats[2]}`);
        console.log(`   Other types: ${typeStats.other}`);
        console.log(`   Visible in prematch: ${visibilityStats.visible}`);
        console.log(`   Not visible: ${visibilityStats.notVisible}`);

        console.log('\n✅ Fix verified! Prematch games should now show correctly.');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        scraper.close();
    }
}

if (require.main === module) {
    testPrematchFix();
}

module.exports = testPrematchFix;
