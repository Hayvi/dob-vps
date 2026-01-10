#!/usr/bin/env node

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

class DeepSwarmAnalysis {
    constructor() {
        this.wsUrl = 'wss://eu-swarm-newm.vmemkhhgjigrjefb.com';
        this.ws = null;
        this.sessionId = null;
        this.pendingRequests = new Map();
        this.subscriptions = new Map();
        this.partnerId = 1777;
        this.messageStats = {
            total: 0,
            byType: {},
            subscriptionUpdates: 0,
            requestResponses: 0
        };
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
                        console.log(`🎫 Session: ${this.sessionId}`);
                        resolve();
                    } else {
                        reject(new Error('No session ID'));
                    }
                } catch (error) {
                    reject(error);
                }
            });

            this.ws.on('message', (data) => {
                this.messageStats.total++;
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(message);
                } catch (e) {
                    console.error('❌ Parse error:', e.message);
                }
            });

            this.ws.on('error', reject);
            this.ws.on('close', () => console.log('🔌 Connection closed'));
        });
    }

    handleMessage(message) {
        // Subscription updates (rid=0 or no rid with subid)
        if ((message.rid === 0 || message.rid === '0' || !message.rid) && message.subid) {
            this.messageStats.subscriptionUpdates++;
            const sub = this.subscriptions.get(String(message.subid));
            if (sub?.onUpdate) {
                sub.onUpdate(message.data || message);
            }
            return;
        }

        // New format: rid=0 with data containing subids as keys
        if ((message.rid === 0 || message.rid === '0') && message.data && typeof message.data === 'object') {
            const dataKeys = Object.keys(message.data);
            const matchedSubIds = dataKeys.filter(k => this.subscriptions.has(k));
            
            if (matchedSubIds.length > 0) {
                this.messageStats.subscriptionUpdates++;
                for (const subid of matchedSubIds) {
                    const sub = this.subscriptions.get(subid);
                    if (sub?.onUpdate) {
                        sub.onUpdate(message.data[subid]);
                    }
                }
                return;
            }
        }

        // Request responses
        if (message.rid && this.pendingRequests.has(message.rid)) {
            this.messageStats.requestResponses++;
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
                reject(new Error(`${command} timeout`));
            }, timeout);

            this.pendingRequests.set(rid, { 
                resolve: (response) => {
                    clearTimeout(timer);
                    resolve(response);
                }
            });

            this.ws.send(JSON.stringify(request));
        });
    }

    async deepAnalysis() {
        console.log('\n🔬 Deep Swarm Analysis Starting...\n');

        // 1. Compare different subscription approaches
        console.log('1️⃣ Testing subscription approaches...');
        
        const subscriptionTests = [
            {
                name: 'Live Games (Current Implementation)',
                request: {
                    source: 'betting',
                    what: {
                        sport: ['id', 'name'],
                        game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type', 'is_live', 'markets_count', 'is_blocked']
                    },
                    where: { game: { type: 1 } },
                    subscribe: true
                }
            },
            {
                name: 'Prematch Games (Forzza Filter)',
                request: {
                    source: 'betting',
                    what: {
                        sport: ['id', 'name'],
                        game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type', 'visible_in_prematch', 'markets_count']
                    },
                    where: {
                        sport: { id: 1 }, // Football only
                        game: {
                            '@or': [
                                { 'visible_in_prematch': 1 },
                                { 'type': { '@in': [0, 2] } }
                            ]
                        }
                    },
                    subscribe: true
                }
            },
            {
                name: 'Live Count Monitor',
                request: {
                    source: 'betting',
                    what: { game: '@count' },
                    where: {
                        sport: { type: { '@nin': [1, 4] } },
                        game: { type: 1 }
                    },
                    subscribe: true
                }
            }
        ];

        const activeSubscriptions = [];

        for (const test of subscriptionTests) {
            try {
                console.log(`   🧪 Testing: ${test.name}`);
                const response = await this.sendRequest('get', test.request);
                
                if (response.data?.subid) {
                    const subid = String(response.data.subid);
                    console.log(`      ✅ Subscription ID: ${subid}`);
                    
                    let updateCount = 0;
                    this.subscriptions.set(subid, {
                        name: test.name,
                        onUpdate: (data) => {
                            updateCount++;
                            console.log(`      📡 ${test.name} update #${updateCount}: ${JSON.stringify(data).length} bytes`);
                            
                            // Log first few updates in detail
                            if (updateCount <= 2) {
                                console.log(`         Data preview: ${JSON.stringify(data, null, 2).substring(0, 200)}...`);
                            }
                        }
                    });
                    
                    activeSubscriptions.push({ subid, name: test.name });
                    
                    // Show initial data
                    const initialData = response.data?.data;
                    if (initialData) {
                        if (typeof initialData === 'object' && !Array.isArray(initialData)) {
                            const keys = Object.keys(initialData);
                            console.log(`      📊 Initial data keys: ${keys.join(', ')}`);
                            
                            // Count items in each key
                            keys.forEach(key => {
                                const value = initialData[key];
                                if (typeof value === 'object' && value !== null) {
                                    const count = Array.isArray(value) ? value.length : Object.keys(value).length;
                                    console.log(`         ${key}: ${count} items`);
                                }
                            });
                        } else {
                            console.log(`      📊 Initial data: ${initialData}`);
                        }
                    }
                } else {
                    console.log(`      ❌ No subscription ID returned`);
                    console.log(`         Response: ${JSON.stringify(response, null, 2)}`);
                }
            } catch (e) {
                console.log(`      ❌ Failed: ${e.message}`);
            }
        }

        // 2. Monitor for real-time updates
        console.log(`\n2️⃣ Monitoring ${activeSubscriptions.length} subscriptions for 30 seconds...`);
        
        const startTime = Date.now();
        const monitorInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            console.log(`   ⏱️  ${elapsed}s - Messages: ${this.messageStats.total} (${this.messageStats.subscriptionUpdates} updates, ${this.messageStats.requestResponses} responses)`);
        }, 5000);

        await new Promise(resolve => setTimeout(resolve, 30000));
        clearInterval(monitorInterval);

        // 3. Test different data fetching patterns
        console.log('\n3️⃣ Testing data fetching patterns...');
        
        const fetchTests = [
            {
                name: 'All Sports Hierarchy',
                request: {
                    source: 'betting',
                    what: {
                        sport: ['id', 'name', 'alias', 'order', 'type'],
                        region: ['id', 'name', 'alias', 'order'],
                        competition: ['id', 'name', 'order', 'favorite']
                    }
                }
            },
            {
                name: 'Live Games All Sports',
                request: {
                    source: 'betting',
                    what: {
                        game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type', 'is_live', 'sport_id', 'markets_count']
                    },
                    where: { game: { type: 1 } }
                }
            },
            {
                name: 'Football Prematch (Alternative Filter)',
                request: {
                    source: 'betting',
                    what: {
                        game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type', 'visible_in_prematch', 'markets_count']
                    },
                    where: {
                        sport: { id: 1 },
                        game: { type: { '@in': [0, 2] } }
                    }
                }
            }
        ];

        for (const test of fetchTests) {
            try {
                console.log(`   🔍 ${test.name}...`);
                const response = await this.sendRequest('get', test.request, 15000);
                
                if (response.data?.data) {
                    const data = response.data.data;
                    const keys = Object.keys(data);
                    console.log(`      ✅ Data keys: ${keys.join(', ')}`);
                    
                    keys.forEach(key => {
                        const value = data[key];
                        if (typeof value === 'object' && value !== null) {
                            const count = Array.isArray(value) ? value.length : Object.keys(value).length;
                            console.log(`         ${key}: ${count} items`);
                        }
                    });
                } else {
                    console.log(`      ❌ No data returned`);
                }
            } catch (e) {
                console.log(`      ❌ ${e.message}`);
            }
        }

        // 4. Clean up subscriptions
        console.log('\n4️⃣ Cleaning up subscriptions...');
        for (const { subid, name } of activeSubscriptions) {
            try {
                await this.sendRequest('unsubscribe', { subid }, 5000);
                this.subscriptions.delete(subid);
                console.log(`   ✅ Unsubscribed: ${name}`);
            } catch (e) {
                console.log(`   ⚠️  Failed to unsubscribe ${name}: ${e.message}`);
            }
        }

        // 5. Final statistics
        console.log('\n5️⃣ Final Statistics:');
        console.log(`   📊 Total messages: ${this.messageStats.total}`);
        console.log(`   📡 Subscription updates: ${this.messageStats.subscriptionUpdates}`);
        console.log(`   🔄 Request responses: ${this.messageStats.requestResponses}`);
        
        console.log('\n✅ Deep analysis complete!');
    }

    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

async function main() {
    const analyzer = new DeepSwarmAnalysis();
    
    try {
        await analyzer.connect();
        await analyzer.deepAnalysis();
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

module.exports = DeepSwarmAnalysis;
