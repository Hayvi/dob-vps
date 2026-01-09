/**
 * Probe REST API endpoints that might provide results data
 * The results page likely uses a different API than the WebSocket
 */

const axios = require('axios');
const https = require('https');

// Disable SSL verification for probing
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const BASE_URLS = [
  'https://sportsbook.forzza1x2.com',
  'https://mobile.forzza1x2.com',
  'https://api.forzza1x2.com',
  'https://eu-swarm-newm.vmemkhhgjigrjefb.com'
];

const RESULT_ENDPOINTS = [
  '/api/results',
  '/api/sport-results',
  '/api/game-results', 
  '/results',
  '/sport/results',
  '/api/v1/results',
  '/api/finished',
  '/api/settled',
  '/rest/results',
  '/rest/sport/results'
];

async function probeEndpoint(url) {
  try {
    const response = await axios.get(url, { 
      timeout: 10000,
      httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      validateStatus: () => true // Don't throw on any status
    });
    return { 
      url, 
      status: response.status, 
      hasData: response.data && Object.keys(response.data).length > 0,
      sample: JSON.stringify(response.data).slice(0, 300)
    };
  } catch (e) {
    return { url, error: e.message };
  }
}

async function run() {
  console.log('Probing potential REST API endpoints for results...\n');

  // First, let's check what the results page HTML contains
  console.log('=== Checking results page HTML for API hints ===\n');
  try {
    const html = await axios.get('https://mobile.forzza1x2.com/fr/sports/results', {
      timeout: 15000,
      httpsAgent,
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' }
    });
    
    // Look for API URLs in the HTML/JS
    const apiMatches = html.data.match(/https?:\/\/[^"'\s]+api[^"'\s]*/gi) || [];
    const resultMatches = html.data.match(/["']\/[^"']*result[^"']*["']/gi) || [];
    const swarmMatches = html.data.match(/swarm[^"'\s]*/gi) || [];
    
    console.log('API URLs found:', [...new Set(apiMatches)].slice(0, 10));
    console.log('Result paths found:', [...new Set(resultMatches)].slice(0, 10));
    console.log('Swarm references:', [...new Set(swarmMatches)].slice(0, 10));
    
    // Look for config objects
    const configMatch = html.data.match(/config\s*[=:]\s*\{[^}]+\}/gi);
    if (configMatch) {
      console.log('\nConfig objects found:', configMatch.slice(0, 3));
    }
  } catch (e) {
    console.log('Could not fetch results page:', e.message);
  }

  console.log('\n=== Probing common REST endpoints ===\n');
  
  for (const base of BASE_URLS) {
    for (const endpoint of RESULT_ENDPOINTS) {
      const url = base + endpoint;
      const result = await probeEndpoint(url);
      
      if (result.error) {
        console.log(`✗ ${url} - ${result.error}`);
      } else if (result.status === 200 && result.hasData) {
        console.log(`✓ ${url} - Status ${result.status}`);
        console.log(`  Sample: ${result.sample}`);
      } else {
        console.log(`? ${url} - Status ${result.status}`);
      }
    }
  }

  // Try with query params (sport=1 for football, date params)
  console.log('\n=== Trying with query parameters ===\n');
  
  const now = new Date();
  const yesterday = new Date(now - 86400000);
  const dateStr = yesterday.toISOString().split('T')[0];
  
  const paramEndpoints = [
    `https://mobile.forzza1x2.com/api/results?sport=1&date=${dateStr}`,
    `https://mobile.forzza1x2.com/api/results?sportId=1`,
    `https://sportsbook.forzza1x2.com/api/results?sport_id=1`,
  ];

  for (const url of paramEndpoints) {
    const result = await probeEndpoint(url);
    console.log(`${result.error ? '✗' : result.status === 200 ? '✓' : '?'} ${url}`);
    if (result.sample) console.log(`  ${result.sample}`);
  }

  console.log('\nDone.');
}

run().catch(console.error);
