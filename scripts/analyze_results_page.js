/**
 * Analyze the results page to find how it fetches data
 */

const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function run() {
  console.log('Fetching and analyzing results page...\n');

  const html = await axios.get('https://mobile.forzza1x2.com/fr/sports/results', {
    timeout: 15000,
    httpsAgent,
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' }
  });

  // Find all script sources
  const scriptMatches = html.data.match(/<script[^>]*src="([^"]+)"[^>]*>/gi) || [];
  console.log('=== Script tags found ===');
  scriptMatches.forEach(s => {
    const src = s.match(/src="([^"]+)"/)?.[1];
    if (src) console.log(src);
  });

  // Find inline scripts that might contain config
  const inlineScripts = html.data.match(/<script[^>]*>([^<]+)<\/script>/gi) || [];
  console.log('\n=== Inline scripts (first 500 chars each) ===');
  inlineScripts.forEach((s, i) => {
    const content = s.replace(/<\/?script[^>]*>/gi, '').trim();
    if (content.length > 10) {
      console.log(`\n--- Script ${i + 1} ---`);
      console.log(content.slice(0, 500));
    }
  });

  // Look for WebSocket URLs
  const wsMatches = html.data.match(/wss?:\/\/[^"'\s]+/gi) || [];
  console.log('\n=== WebSocket URLs ===');
  console.log([...new Set(wsMatches)]);

  // Look for any "result" related strings
  const resultStrings = html.data.match(/["'][^"']*result[^"']*["']/gi) || [];
  console.log('\n=== Result-related strings ===');
  console.log([...new Set(resultStrings)].slice(0, 20));

  // Look for API base URLs
  const apiUrls = html.data.match(/["']https?:\/\/[^"']+api[^"']*["']/gi) || [];
  console.log('\n=== API URLs ===');
  console.log([...new Set(apiUrls)]);

  // Try to find the main JS bundle and analyze it
  const mainBundle = scriptMatches.find(s => s.includes('main') || s.includes('app') || s.includes('bundle'));
  if (mainBundle) {
    const bundleSrc = mainBundle.match(/src="([^"]+)"/)?.[1];
    if (bundleSrc) {
      const fullUrl = bundleSrc.startsWith('http') ? bundleSrc : `https://mobile.forzza1x2.com${bundleSrc}`;
      console.log('\n=== Fetching main bundle:', fullUrl, '===');
      
      try {
        const bundle = await axios.get(fullUrl, { httpsAgent, timeout: 30000 });
        const js = bundle.data;
        
        // Search for result-related code
        const resultPatterns = [
          /get_result/gi,
          /sport.*result/gi,
          /result.*api/gi,
          /source.*result/gi,
          /"result"/gi,
          /finished.*game/gi,
          /game.*finished/gi
        ];

        console.log('\n=== Searching bundle for result patterns ===');
        resultPatterns.forEach(pattern => {
          const matches = js.match(pattern);
          if (matches) {
            console.log(`${pattern}: ${matches.length} matches`);
            // Show context around first match
            const idx = js.search(pattern);
            if (idx > -1) {
              console.log(`  Context: ...${js.slice(Math.max(0, idx - 50), idx + 100)}...`);
            }
          }
        });

        // Look for Swarm commands
        const swarmCommands = js.match(/command["']?\s*[:=]\s*["']([^"']+)["']/gi) || [];
        console.log('\n=== Swarm commands found ===');
        console.log([...new Set(swarmCommands)].slice(0, 30));

      } catch (e) {
        console.log('Could not fetch bundle:', e.message);
      }
    }
  }
}

run().catch(console.error);
