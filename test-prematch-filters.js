#!/usr/bin/env node

const ForzzaScraper = require('./scraper.js');

async function testPrematchFilters() {
    const scraper = new ForzzaScraper();
    
    try {
        await scraper.init();
        console.log('🔌 Connected to Swarm API\n');

        const filters = [
            {
                name: 'Current Forzza Filter',
                filter: {
                    sport: { id: 1 },
                    game: {
                        '@or': [
                            { 'visible_in_prematch': 1 },
                            { 'type': { '@in': [0, 2] } }
                        ]
                    }
                }
            },
            {
                name: 'Simple Type Filter',
                filter: {
                    sport: { id: 1 },
                    game: { type: { '@in': [0, 2] } }
                }
            },
            {
                name: 'Visible Only Filter',
                filter: {
                    sport: { id: 1 },
                    game: { visible_in_prematch: 1 }
                }
            },
            {
                name: 'Type 0 Only (Prematch)',
                filter: {
                    sport: { id: 1 },
                    game: { type: 0 }
                }
            },
            {
                name: 'Type 2 Only (Outright)',
                filter: {
                    sport: { id: 1 },
                    game: { type: 2 }
                }
            }
        ];

        for (const test of filters) {
            console.log(`🧪 Testing: ${test.name}`);
            
            try {
                const response = await scraper.sendRequest('get', {
                    source: 'betting',
                    what: {
                        game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type', 'visible_in_prematch', 'markets_count']
                    },
                    where: test.filter
                }, 15000);

                const games = response.data?.data?.game || {};
                const gameCount = Object.keys(games).length;
                
                console.log(`   ✅ Found ${gameCount} games`);
                
                if (gameCount > 0) {
                    // Analyze game types and visibility
                    const stats = {
                        type0: 0, type1: 0, type2: 0,
                        visible: 0, notVisible: 0,
                        withMarkets: 0
                    };
                    
                    Object.values(games).forEach(game => {
                        if (game.type === 0) stats.type0++;
                        if (game.type === 1) stats.type1++;
                        if (game.type === 2) stats.type2++;
                        if (game.visible_in_prematch === 1) stats.visible++;
                        else stats.notVisible++;
                        if (game.markets_count > 0) stats.withMarkets++;
                    });
                    
                    console.log(`      Type 0 (Prematch): ${stats.type0}`);
                    console.log(`      Type 1 (Live): ${stats.type1}`);
                    console.log(`      Type 2 (Outright): ${stats.type2}`);
                    console.log(`      Visible in prematch: ${stats.visible}`);
                    console.log(`      Not visible: ${stats.notVisible}`);
                    console.log(`      With markets: ${stats.withMarkets}`);
                    
                    // Show sample games
                    const sampleGames = Object.entries(games).slice(0, 3);
                    console.log(`      Sample games:`);
                    sampleGames.forEach(([id, game]) => {
                        console.log(`        ${id}: ${game.team1_name} vs ${game.team2_name} (type: ${game.type}, visible: ${game.visible_in_prematch}, markets: ${game.markets_count})`);
                    });
                }
                
            } catch (e) {
                console.log(`   ❌ Failed: ${e.message}`);
            }
            
            console.log('');
        }

        // Test current vs recommended filter side by side
        console.log('🔍 Direct Comparison:');
        
        const currentResponse = await scraper.sendRequest('get', {
            source: 'betting',
            what: { game: ['id', 'type', 'visible_in_prematch'] },
            where: {
                sport: { id: 1 },
                game: {
                    '@or': [
                        { 'visible_in_prematch': 1 },
                        { 'type': { '@in': [0, 2] } }
                    ]
                }
            }
        });

        const simpleResponse = await scraper.sendRequest('get', {
            source: 'betting',
            what: { game: ['id', 'type', 'visible_in_prematch'] },
            where: {
                sport: { id: 1 },
                game: { type: { '@in': [0, 2] } }
            }
        });

        const currentGames = Object.keys(currentResponse.data?.data?.game || {}).length;
        const simpleGames = Object.keys(simpleResponse.data?.data?.game || {}).length;
        
        console.log(`Current filter: ${currentGames} games`);
        console.log(`Simple filter: ${simpleGames} games`);
        console.log(`Difference: ${simpleGames - currentGames} more games with simple filter`);
        
        if (simpleGames > currentGames) {
            console.log('\n💡 Recommendation: Use simple type filter for better game coverage');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        scraper.close();
    }
}

if (require.main === module) {
    testPrematchFilters();
}

module.exports = testPrematchFilters;
