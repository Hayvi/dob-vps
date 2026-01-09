/**
 * Fetch and analyze the main JS bundle for results API patterns
 */

const axios = require('axios');
const https = require('https');
const fs = require('fs');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function run() {
  console.log('Fetching main bundle...\n');

  const bundle = await axios.get('https://mobile.forzza1x2.com/assets/index-Cbdhgt9x.js', {
    httpsAgent,
    timeout: 60000
  });

  const js = bundle.data;
  console.log(`Bundle size: ${(js.length / 1024 / 1024).toFixed(2)} MB\n`);

  // Save for manual inspection
  fs.writeFileSync('scripts/bundle_sample.txt', js.slice(0, 500000));
  console.log('Saved first 500KB to scripts/bundle_sample.txt\n');

  // Search patterns
  const patterns = [
    { name: 'get_result command', regex: /get_result/gi },
    { name: 'result source', regex: /source["':]\s*["']?result/gi },
    { name: 'sport_result', regex: /sport_result/gi },
    { name: 'match_result', regex: /match_result/gi },
    { name: 'finished games', regex: /finished.*game|game.*finished/gi },
    { name: 'settled', regex: /settled/gi },
    { name: 'ResultsController', regex: /result.*controller|controller.*result/gi },
    { name: 'results API', regex: /api.*result|result.*api/gi },
    { name: 'getResults function', regex: /getResults|get_results|fetchResults/gi },
    { name: 'swarm result', regex: /swarm.*result/gi },
    { name: 'game type 3', regex: /type["':]\s*3/gi },
    { name: 'is_finished', regex: /is_finished/gi },
    { name: 'game_state', regex: /game_state/gi },
    { name: 'ended', regex: /["']ended["']/gi },
    { name: 'completed', regex: /["']completed["']/gi }
  ];

  console.log('=== Pattern search results ===\n');
  
  for (const { name, regex } of patterns) {
    const matches = js.match(regex);
    if (matches && matches.length > 0) {
      console.log(`✓ ${name}: ${matches.length} matches`);
      
      // Show context around first few matches
      let searchStart = 0;
      for (let i = 0; i < Math.min(3, matches.length); i++) {
        const idx = js.indexOf(matches[i], searchStart);
        if (idx > -1) {
          const context = js.slice(Math.max(0, idx - 80), idx + 120);
          console.log(`  [${i + 1}] ...${context.replace(/\n/g, ' ')}...`);
          searchStart = idx + 1;
        }
      }
      console.log();
    }
  }

  // Look for WebSocket URLs
  console.log('\n=== WebSocket URLs ===');
  const wsUrls = js.match(/wss?:\/\/[^"'\s,\)]+/gi) || [];
  [...new Set(wsUrls)].forEach(url => console.log(url));

  // Look for Swarm-related code
  console.log('\n=== Swarm source values ===');
  const sourceMatches = js.match(/source["':]\s*["']([^"']+)["']/gi) || [];
  const sources = [...new Set(sourceMatches)];
  sources.forEach(s => console.log(s));

  // Look for command values
  console.log('\n=== Command values ===');
  const cmdMatches = js.match(/command["':]\s*["']([^"']+)["']/gi) || [];
  const cmds = [...new Set(cmdMatches)];
  cmds.slice(0, 30).forEach(c => console.log(c));
}

run().catch(console.error);
