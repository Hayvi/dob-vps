#!/usr/bin/env node

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

class SwarmAnalyzer {
    constructor() {
        this.wsUrl = 'wss://eu-swarm-newm.vmemkhhgjigrjefb.com';
        this.ws = null;
        this.sessionId = null;
        this.pendingRequests = new Map();
        this.messageLog = [];
        this.subscriptions = new Map();
        this.partnerId = 1777; // Forzza's partner ID
    }

    async connect() {
        return new Promise((resolve, reject) => {
            console.log('🔌 Connecting to Swarm WebSocket...');
            this.ws = new WebSocket(this.wsUrl, { perMessageDeflate: true });

            this.ws.on('open', async () => {
                console.log('✅ WebSocket connected');
                try {
                    const response = await this.sendRequest('request_session', {
                        site_id: this.partnerId,
                        language: 'eng'
                    });
                    
                    if (response?.data?.sid) {
                        this.sessionId = response.data.sid;
                        console.log(`🎫 Session established: ${this.sessionId}`);
                        resolve();
                    } else {
                        reject(new Error('Failed to get session ID'));
                    }
                } catch (error) {
                    reject(error);
                }
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.logMessage('RECEIVED', message);
                    this.handleMessage(message);
                } catch (e) {
                    console.error('❌ Parse error:', e.message);
                }
            });

            this.ws.on('error', (error) => {
                console.error('❌ WebSocket error:', error.message);
                reject(error);
            });

            this.ws.on('close', () => {
                console.log('🔌 WebSocket closed');
            });
        });
    }

    logMessage(direction, message) {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, direction, message };
        this.messageLog.push(logEntry);
        
        // Keep only last 100 messages
        if (this.messageLog.length > 100) {
            this.messageLog.shift();
        }

        // Log important messages
        if (direction === 'RECEIVED' && message.subid) {
            console.log(`📡 [${timestamp}] Subscription update: ${message.subid}`);
        }
    }

    handleMessage(message) {
        // Handle subscription updates
        if (message.subid && !message.rid) {
            const sub = this.subscriptions.get(message.subid);
            if (sub && sub.onUpdate) {
                sub.onUpdate(message.data);
            }
            return;
        }

        // Handle request responses
        if (message.rid && this.pendingRequests.has(message.rid)) {
            const { resolve } = this.pendingRequests.get(message.rid);
            this.pendingRequests.delete(message.rid);
            resolve(message);
        }
    }

    async sendRequest(command, params = {}, timeout = 30000) {
        const rid = uuidv4();
        const request = { command, params, rid };

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(rid);
                reject(new Error(`Request ${command} timed out`));
            }, timeout);

            this.pendingRequests.set(rid, { 
                resolve: (response) => {
                    clearTimeout(timer);
                    resolve(response);
                },
                reject
            });

            this.logMessage('SENT', request);
            this.ws.send(JSON.stringify(request));
        });
    }

    async analyzeDataFlow() {
        console.log('\n🔍 Starting Swarm API Analysis...\n');

        // 1. Test basic hierarchy request
        console.log('1️⃣ Testing hierarchy request...');
        try {
            const hierarchyResponse = await this.sendRequest('get', {
                source: 'betting',
                what: {
                    sport: ['id', 'name', 'alias', 'order'],
                    region: ['id', 'name', 'alias', 'order'],
                    competition: ['id', 'name', 'order']
                }
            });
            
            const sports = hierarchyResponse.data?.data?.sport || {};
            console.log(`   ✅ Found ${Object.keys(sports).length} sports`);
            
            // Show first few sports
            Object.entries(sports).slice(0, 3).forEach(([id, sport]) => {
                console.log(`   📊 Sport ${id}: ${sport.name} (${sport.alias})`);
            });
        } catch (e) {
            console.log(`   ❌ Hierarchy failed: ${e.message}`);
        }

        // 2. Test live games subscription (Forzza's exact format)
        console.log('\n2️⃣ Testing live games subscription...');
        try {
            const liveSubResponse = await this.sendRequest('get', {
                source: 'betting',
                what: {
                    sport: ['id', 'name', 'alias'],
                    game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type', 'is_live', 'markets_count']
                },
                where: {
                    game: { type: 1 } // Live games only
                },
                subscribe: true
            });

            if (liveSubResponse.data?.subid) {
                const subid = liveSubResponse.data.subid;
                console.log(`   ✅ Live subscription created: ${subid}`);
                
                this.subscriptions.set(subid, {
                    type: 'live_games',
                    onUpdate: (data) => {
                        console.log(`   📡 Live update received: ${JSON.stringify(data).length} bytes`);
                    }
                });

                // Wait for a few updates
                await new Promise(resolve => setTimeout(resolve, 10000));
                
                // Unsubscribe
                await this.sendRequest('unsubscribe', { subid });
                this.subscriptions.delete(subid);
                console.log(`   🔄 Unsubscribed from ${subid}`);
            } else {
                console.log('   ❌ No subscription ID returned');
            }
        } catch (e) {
            console.log(`   ❌ Live subscription failed: ${e.message}`);
        }

        // 3. Test prematch games for football
        console.log('\n3️⃣ Testing prematch football games...');
        try {
            const footballResponse = await this.sendRequest('get', {
                source: 'betting',
                what: {
                    sport: ['id', 'name'],
                    region: ['id', 'name'],
                    competition: ['id', 'name'],
                    game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type', 'visible_in_prematch', 'markets_count']
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

            const games = footballResponse.data?.data?.game || {};
            console.log(`   ✅ Found ${Object.keys(games).length} prematch football games`);
            
            // Show sample games
            Object.entries(games).slice(0, 3).forEach(([id, game]) => {
                console.log(`   ⚽ Game ${id}: ${game.team1_name} vs ${game.team2_name} (${game.markets_count} markets)`);
            });
        } catch (e) {
            console.log(`   ❌ Prematch football failed: ${e.message}`);
        }

        // 4. Test count subscriptions
        console.log('\n4️⃣ Testing count subscriptions...');
        try {
            const liveCountResponse = await this.sendRequest('get', {
                source: 'betting',
                what: { game: '@count' },
                where: {
                    sport: { type: { '@nin': [1, 4] } },
                    game: { type: 1 }
                },
                subscribe: true
            });

            if (liveCountResponse.data?.subid) {
                const subid = liveCountResponse.data.subid;
                console.log(`   ✅ Live count subscription: ${subid}`);
                console.log(`   📊 Current live count: ${liveCountResponse.data?.data?.game || 0}`);
                
                this.subscriptions.set(subid, {
                    type: 'live_count',
                    onUpdate: (data) => {
                        console.log(`   📊 Live count update: ${data?.game || 0}`);
                    }
                });

                // Wait for updates
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                await this.sendRequest('unsubscribe', { subid });
                this.subscriptions.delete(subid);
            }
        } catch (e) {
            console.log(`   ❌ Count subscription failed: ${e.message}`);
        }

        // 5. Analyze message patterns
        console.log('\n5️⃣ Message Pattern Analysis:');
        const messageTypes = {};
        this.messageLog.forEach(entry => {
            if (entry.direction === 'RECEIVED') {
                const type = entry.message.subid ? 'subscription_update' : 
                           entry.message.rid ? 'request_response' : 'other';
                messageTypes[type] = (messageTypes[type] || 0) + 1;
            }
        });
        
        console.log('   📈 Message distribution:');
        Object.entries(messageTypes).forEach(([type, count]) => {
            console.log(`      ${type}: ${count}`);
        });

        console.log('\n✅ Analysis complete!');
    }

    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Run analysis
async function main() {
    const analyzer = new SwarmAnalyzer();
    
    try {
        await analyzer.connect();
        await analyzer.analyzeDataFlow();
    } catch (error) {
        console.error('❌ Analysis failed:', error.message);
    } finally {
        analyzer.close();
        process.exit(0);
    }
}

if (require.main === module) {
    main();
}

module.exports = SwarmAnalyzer;
