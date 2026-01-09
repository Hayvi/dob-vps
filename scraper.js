const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { unwrapSwarmData } = require('./lib/swarm/unwrap');

class ForzzaScraper {
    constructor(partnerId = 1777) {
        this.partnerId = partnerId;
        this.wsUrl = 'wss://eu-swarm-newm.vmemkhhgjigrjefb.com';
        this.ws = null;
        this.sessionId = null;
        this.pendingRequests = new Map();
        this.isConnecting = false;
        
        // Subscription system
        this.subscriptions = new Map(); // subid -> { data, listeners, request, meta, createdAtMs, lastUpdateAtMs, updatesTotal, updateTimestampsMs, sessionIdAtCreation }

        this.wsMessagesTotal = 0;
        this.wsMessageTimestampsMs = [];
        this.wsMessageParseErrorsTotal = 0;
        this.wsMessageKinds = {
            subscription_update: { total: 0, timestampsMs: [] },
            request_response: { total: 0, timestampsMs: [] },
            other: { total: 0, timestampsMs: [] }
        };
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN && this.sessionId;
    }

    async ensureConnection() {
        if (this.isConnected()) return;

        // Prevent multiple simultaneous connection attempts
        if (this.isConnecting) {
            // Wait for ongoing connection
            await new Promise(resolve => {
                const check = setInterval(() => {
                    if (!this.isConnecting) {
                        clearInterval(check);
                        resolve();
                    }
                }, 100);
            });
            if (this.isConnected()) return;
        }

        await this.init();
    }

    async init() {
        // Close existing connection if any
        if (this.ws) {
            try {
                this.ws.close();
            } catch (e) {
                if (typeof this.ws.terminate === 'function') {
                    this.ws.terminate();
                }
            }
            this.ws = null;
            this.sessionId = null;
        }

        this.isConnecting = true;

        return new Promise((resolve, reject) => {
            const connectionTimeout = setTimeout(() => {
                this.isConnecting = false;
                reject(new Error('WebSocket connection timeout'));
            }, 15000);

            this.ws = new WebSocket(this.wsUrl);

            this.ws.on('open', async () => {
                try {
                    const response = await this.sendRequest('request_session', {
                        site_id: this.partnerId,
                        language: 'eng'
                    });
                    if (response && response.data && response.data.sid) {
                        this.sessionId = response.data.sid;
                        clearTimeout(connectionTimeout);
                        this.isConnecting = false;
                        console.log('WebSocket connected, session:', this.sessionId);
                        resolve(this.sessionId);
                    } else {
                        clearTimeout(connectionTimeout);
                        this.isConnecting = false;
                        reject(new Error('Failed to get session ID'));
                    }
                } catch (error) {
                    clearTimeout(connectionTimeout);
                    this.isConnecting = false;
                    reject(error);
                }
            });

            this.ws.on('message', (data) => {
                this._recordWsMessage();
                try {
                    const message = JSON.parse(data.toString());
                    
                    // Handle subscription updates - Swarm sends them with rid=0 and subid as key in data
                    if ((message.rid === 0 || message.rid === '0') && message.data && typeof message.data === 'object') {
                        // Check if data contains subscription IDs as keys
                        const dataKeys = Object.keys(message.data);
                        const matchedSubIds = dataKeys.filter(k => this.subscriptions.has(k));
                        if (matchedSubIds.length > 0) {
                            this._recordWsMessageKind('subscription_update');
                            for (const subid of matchedSubIds) {
                                this._handleSubscriptionUpdateByKey(subid, message.data[subid]);
                            }
                            return;
                        }
                    }
                    
                    // Handle legacy subscription updates (messages with subid but no rid)
                    if (message.subid !== undefined && message.rid === undefined) {
                        this._recordWsMessageKind('subscription_update');
                        this._handleSubscriptionUpdate(message);
                        return;
                    }
                    
                    // Handle request responses (has rid)
                    if (message.rid && this.pendingRequests.has(message.rid)) {
                        this._recordWsMessageKind('request_response');
                        const { resolve, timeout } = this.pendingRequests.get(message.rid);
                        clearTimeout(timeout);
                        this.pendingRequests.delete(message.rid);
                        resolve(message);
                        return;
                    }

                    this._recordWsMessageKind('other');
                } catch (e) {
                    this.wsMessageParseErrorsTotal = (Number(this.wsMessageParseErrorsTotal) || 0) + 1;
                    console.error('Error parsing WebSocket message:', e.message);
                }
            });

            this.ws.on('error', (error) => {
                console.error('WebSocket error:', error.message);
                clearTimeout(connectionTimeout);
                this.isConnecting = false;
                this.sessionId = null;
                reject(error);
            });

            this.ws.on('close', () => {
                console.log('WebSocket connection closed');
                this.sessionId = null;
                this.isConnecting = false;
            });
        });
    }

    _recordWsMessage() {
        const now = Date.now();
        this.wsMessagesTotal = (Number(this.wsMessagesTotal) || 0) + 1;
        if (!Array.isArray(this.wsMessageTimestampsMs)) this.wsMessageTimestampsMs = [];
        this.wsMessageTimestampsMs.push(now);
        if (this.wsMessageTimestampsMs.length > 2000) {
            this.wsMessageTimestampsMs.splice(0, this.wsMessageTimestampsMs.length - 2000);
        }
    }

    _recordWsMessageKind(kind) {
        const now = Date.now();
        if (!this.wsMessageKinds || typeof this.wsMessageKinds !== 'object') {
            this.wsMessageKinds = {
                subscription_update: { total: 0, timestampsMs: [] },
                request_response: { total: 0, timestampsMs: [] },
                other: { total: 0, timestampsMs: [] }
            };
        }
        const key = this.wsMessageKinds[kind] ? kind : 'other';
        const bucket = this.wsMessageKinds[key];
        bucket.total = (Number(bucket.total) || 0) + 1;
        if (!Array.isArray(bucket.timestampsMs)) bucket.timestampsMs = [];
        bucket.timestampsMs.push(now);
        if (bucket.timestampsMs.length > 2000) {
            bucket.timestampsMs.splice(0, bucket.timestampsMs.length - 2000);
        }
    }

    async sendRequest(command, params = {}, timeoutMs = 60000) {
        // Ensure connection before sending (except for session request)
        if (command !== 'request_session') {
            await this.ensureConnection();
        }

        // Double-check connection state
        if (command !== 'request_session' && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
            throw new Error('WebSocket not connected');
        }

        const rid = uuidv4();
        const request = {
            command,
            params,
            rid
        };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(rid)) {
                    this.pendingRequests.delete(rid);
                    reject(new Error(`Request ${command} timed out`));
                }
            }, timeoutMs);

            this.pendingRequests.set(rid, { resolve, reject, timeout });

            try {
                this.ws.send(JSON.stringify(request));
            } catch (error) {
                clearTimeout(timeout);
                this.pendingRequests.delete(rid);
                this.sessionId = null;
                reject(new Error(`Failed to send request: ${error.message}`));
            }
        });
    }

    async getHierarchy() {
        // Ensure connection (will reconnect if needed)
        await this.ensureConnection();
        console.log('getHierarchy: Using session:', this.sessionId);

        // Get full hierarchy without game type filter
        const response = await this.sendRequest('get', {
            source: 'betting',
            what: {
                sport: ['id', 'name', 'alias', 'order'],
                region: ['id', 'name', 'alias', 'order'],
                competition: ['id', 'name', 'order']
            }
        });

        // Handle nested data structure from Swarm API
        const data = unwrapSwarmData(response);
        console.log('Hierarchy sport count:', data?.sport ? Object.keys(data.sport).length : 0);

        // If we got empty data, force reconnect and retry once
        if (!data?.sport || Object.keys(data.sport).length === 0) {
            console.log('Hierarchy returned empty, forcing reconnect...');
            await this.init();
            const retryResponse = await this.sendRequest('get', {
                source: 'betting',
                what: {
                    sport: ['id', 'name', 'alias', 'order'],
                    region: ['id', 'name', 'alias', 'order'],
                    competition: ['id', 'name', 'order']
                }
            });
            const retryData = unwrapSwarmData(retryResponse);
            console.log('Retry hierarchy sport count:', retryData?.sport ? Object.keys(retryData.sport).length : 0);
            return retryData;
        }

        return data;
    }

    async getGames(competitionId) {
        const response = await this.sendRequest('get', {
            source: 'betting',
            what: {
                game: [
                    'id', 'team1_name', 'team2_name', 'team1_id', 'team2_id', 
                    'start_ts', 'markets_count', 'info',
                    // Additional live metadata fields
                    'stats', 'score1', 'score2', 'text_info', 'live_events',
                    'is_live', 'is_started', 'type', 'game_number', 'match_length'
                ]
            },
            where: {
                competition: { id: parseInt(competitionId) },
                game: { type: { '@in': [0, 1, 2] } }
            }
        });
        return response.data;
    }

    async getGamesBySport(sportId) {
        // Ensure connection (reuses existing if valid)
        await this.ensureConnection();

        const buildRequest = (includeTypeFilter) => ({
            source: 'betting',
            what: {
                sport: ['id', 'name'],
                region: ['id', 'name', 'competition'],
                competition: ['id', 'name', 'game'],
                game: [
                    'id', 'team1_name', 'team2_name', 'team1_id', 'team2_id', 
                    'start_ts', 'type', 'is_blocked', 'markets_count', 'info',
                    // Additional live metadata fields
                    'stats', 'score1', 'score2', 'text_info', 'live_events',
                    'is_live', 'is_started', 'game_number', 'match_length'
                ]
            },
            where: {
                sport: { id: parseInt(sportId) },
                ...(includeTypeFilter ? { game: { type: { '@in': [0, 1, 2] } } } : {})
            }
        });

        const hasAnyData = (message) => {
            const d = unwrapSwarmData(message);
            if (!d || typeof d !== 'object') return false;

            const hasRegionContainer = Boolean(d.region && Object.keys(d.region).length > 0);
            const hasCompetitionContainer = Boolean(d.competition && Object.keys(d.competition).length > 0);
            const hasGameContainer = Boolean(d.game && Object.keys(d.game).length > 0);
            const hasSportContainer = Boolean(d.sport && Object.keys(d.sport).length > 0);

            if (hasGameContainer) return true;
            if (hasCompetitionContainer) return true;

            // Region container alone is not enough if it contains no competition references
            if (hasRegionContainer) {
                const anyRegionHasCompetition = Object.values(d.region).some(r => r && r.competition && Object.keys(r.competition).length > 0);
                if (anyRegionHasCompetition) return true;
            }

            return hasSportContainer;
        };

        // First attempt: all types
        let response = await this.sendRequest('get', buildRequest(true), 90000);

        // Swarm may respond with error metadata but no data (especially for large sports)
        if (response?.code !== undefined && response?.code !== 0) {
            const msg = response?.msg ? `: ${response.msg}` : '';
            throw new Error(`Swarm getGamesBySport failed (code ${response.code})${msg}`);
        }

        if (!hasAnyData(response)) {
            // Retry once with a forced reconnect
            try {
                await this.init();
            } catch (e) {
                // ignore reconnect failure and try anyway
            }
            response = await this.sendRequest('get', buildRequest(true), 90000);

            if (response?.code !== undefined && response?.code !== 0) {
                const msg = response?.msg ? `: ${response.msg}` : '';
                throw new Error(`Swarm getGamesBySport failed (code ${response.code})${msg}`);
            }
        }

        // Fallback: if still empty, try without type filter
        if (!hasAnyData(response)) {
            response = await this.sendRequest('get', buildRequest(false), 90000);

            if (response?.code !== undefined && response?.code !== 0) {
                const msg = response?.msg ? `: ${response.msg}` : '';
                throw new Error(`Swarm getGamesBySport failed (code ${response.code})${msg}`);
            }
        }

        return response;
    }

    /**
     * Subscribe to prematch games for a sport using Forzza's exact protocol
     * @param {number} sportId - Sport ID
     * @param {Function} onUpdate - Callback for real-time updates
     * @returns {Promise<Object>} - Subscription object with data and controls
     */
    async subscribeToPrematchGames(sportId, onUpdate = null) {
        await this.ensureConnection();

        // Use Forzza's exact prematch subscription format
        const subscriptionRequest = {
            source: 'betting',
            what: {
                sport: ['id', 'name', 'alias', 'order'],
                region: ['id', 'name', 'alias', 'order'],
                competition: ['id', 'order', 'name'],
                game: [
                    'id', 'team1_name', 'team2_name', 'team1_id', 'team2_id',
                    'start_ts', 'type', 'is_blocked', 'markets_count', 'info',
                    'stats', 'score1', 'score2', 'text_info', 'live_events',
                    'is_live', 'is_started', 'game_number', 'match_length',
                    'sport_alias', 'show_type', 'is_stat_available'
                ]
            },
            where: {
                sport: { id: parseInt(sportId) },
                game: {
                    '@or': [
                        { 'visible_in_prematch': 1 },
                        { 'type': { '@in': [0, 2] } }
                    ]
                }
            },
            subscribe: true
        };

        console.log(`Creating prematch subscription for sport ${sportId}...`);
        return await this.subscribe(subscriptionRequest, onUpdate, this._buildSubscriptionMeta({
            endpoint: '/api/prematch-stream',
            tag: 'prematch_games',
            extra: { sportId: parseInt(sportId) }
        }));
    }

    /**
     * Subscribe to live games count using Forzza's format
     * @param {Function} onUpdate - Callback for real-time updates
     * @returns {Promise<Object>} - Subscription object
     */
    async subscribeToLiveCount(onUpdate = null) {
        const subscriptionRequest = {
            source: 'betting',
            what: { game: '@count' },
            where: {
                sport: { type: { '@nin': [1, 4] } },
                game: { type: 1 }
            },
            subscribe: true
        };

        console.log('Creating live count subscription...');
        return await this.subscribe(subscriptionRequest, onUpdate, this._buildSubscriptionMeta({
            endpoint: '/api/counts-stream',
            tag: 'live_count'
        }));
    }

    /**
     * Subscribe to prematch games count using Forzza's format
     * @param {Function} onUpdate - Callback for real-time updates
     * @returns {Promise<Object>} - Subscription object
     */
    async subscribeToPrematchCount(onUpdate = null) {
        const subscriptionRequest = {
            source: 'betting',
            what: { game: '@count' },
            where: {
                sport: { type: { '@nin': [1, 4] } },
                game: {
                    '@or': [
                        { 'visible_in_prematch': 1 },
                        { 'type': { '@in': [0, 2] } }
                    ]
                }
            },
            subscribe: true
        };

        console.log('Creating prematch count subscription...');
        return await this.subscribe(subscriptionRequest, onUpdate, this._buildSubscriptionMeta({
            endpoint: '/api/counts-stream',
            tag: 'prematch_count'
        }));
    }

    async subscribeToGameMarkets(gameId, onUpdate = null) {
        await this.ensureConnection();

        const subscriptionRequest = {
            source: 'betting',
            what: {
                market: ['id', 'name', 'type', 'order', 'col_count', 'display_key', 'is_blocked'],
                event: ['id', 'name', 'price', 'order', 'type', 'base', 'is_blocked']
            },
            where: {
                game: { id: parseInt(gameId) }
            },
            subscribe: true
        };

        return await this.subscribe(subscriptionRequest, onUpdate, this._buildSubscriptionMeta({
            endpoint: '/api/live-game-stream',
            tag: 'game_markets',
            extra: { gameId: parseInt(gameId) }
        }));
    }

    async getGameDetails(gameId) {
        const response = await this.sendRequest('get', {
            source: 'betting',
            what: {
                market: ['id', 'name', 'type', 'order', 'col_count', 'display_key', 'is_blocked'],
                event: ['id', 'name', 'price', 'order', 'type', 'base', 'is_blocked']
            },
            where: {
                game: { id: parseInt(gameId) }
            }
        });
        return response.data;
    }

    // ==================== RESULTS API ====================

    /**
     * Get competitions that have results available within a date range
     * @param {number} fromDate - Unix timestamp (start of range)
     * @param {number} toDate - Unix timestamp (end of range)
     * @returns {Promise<Object>} - Sports/regions/competitions with results
     */
    async getActiveCompetitions(fromDate, toDate) {
        await this.ensureConnection();
        
        // Default to today if no dates provided
        const now = Math.floor(Date.now() / 1000);
        const from = fromDate || (now - (now % 86400));
        const to = toDate || (from + 86400);

        const response = await this.sendRequest('get_active_competitions', {
            from_date: from,
            to_date: to
        });

        if (response?.code !== 0) {
            throw new Error(`get_active_competitions failed: ${response?.msg || 'Unknown error'}`);
        }

        return response.data;
    }

    /**
     * Get finished games with results for a sport within a date range
     * @param {number} sportId - Sport ID (1=Football, etc.)
     * @param {number} fromDate - Unix timestamp (start of range)
     * @param {number} toDate - Unix timestamp (end of range)
     * @returns {Promise<Array>} - Array of finished games with scores
     */
    async getResultGames(sportId, fromDate, toDate) {
        await this.ensureConnection();

        // Default to today if no dates provided
        const now = Math.floor(Date.now() / 1000);
        const from = fromDate || (now - (now % 86400));
        const to = toDate || (from + 86400);

        const response = await this.sendRequest('get_result_games', {
            is_date_ts: 1,
            from_date: from,
            to_date: to,
            live: 0,
            sport_id: parseInt(sportId)
        });

        if (response?.code !== 0) {
            throw new Error(`get_result_games failed: ${response?.msg || 'Unknown error'}`);
        }

        // Response structure: data.games.game[]
        const games = response.data?.games?.game;
        return Array.isArray(games) ? games : [];
    }

    /**
     * Get detailed results (market settlements) for a specific game
     * @param {string|number} gameId - Game ID
     * @returns {Promise<Object>} - Market settlements with winning selections
     */
    async getGameResults(gameId) {
        await this.ensureConnection();

        const response = await this.sendRequest('get_results', {
            game_id: String(gameId)
        });

        if (response?.code !== 0) {
            throw new Error(`get_results failed: ${response?.msg || 'Unknown error'}`);
        }

        return response.data;
    }

    // ==================== SUBSCRIPTION SYSTEM ====================

    /**
     * Handle incoming subscription updates from Swarm
     * Swarm sends incremental updates with the same subid
     */
    _handleSubscriptionUpdate(message) {
        const subid = String(message.subid);
        const sub = this.subscriptions.get(subid);
        if (!sub) {
            console.log(`Received update for unknown subscription ${subid}`);
            return;
        }

        const updateData = message.data;
        if (!updateData) return;

        this._processSubscriptionUpdate(subid, sub, updateData);
    }

    /**
     * Handle subscription updates where subid is a key in the data object (rid=0 format)
     */
    _handleSubscriptionUpdateByKey(subid, updateData) {
        const sub = this.subscriptions.get(subid);
        if (!sub) {
            console.log(`Received update for unknown subscription ${subid}`);
            return;
        }

        if (!updateData) return;

        this._processSubscriptionUpdate(subid, sub, updateData);
    }

    /**
     * Common logic for processing subscription updates
     */
    _processSubscriptionUpdate(subid, sub, updateData) {
        const isCountOnlySub = Boolean(
            sub && sub.request && sub.request.what &&
            sub.request.what.game === '@count'
        );

        if (!isCountOnlySub) {
            console.log(`📡 Subscription update for ${subid}:`, JSON.stringify(updateData, null, 2));
        }

        const now = Date.now();
        sub.lastUpdateAtMs = now;
        sub.updatesTotal = (Number(sub.updatesTotal) || 0) + 1;
        if (!Array.isArray(sub.updateTimestampsMs)) sub.updateTimestampsMs = [];
        sub.updateTimestampsMs.push(now);
        if (sub.updateTimestampsMs.length > 300) {
            sub.updateTimestampsMs.splice(0, sub.updateTimestampsMs.length - 300);
        }

        // Apply incremental update to cached data
        this._applyUpdate(sub.data, updateData);

        // Notify all listeners
        for (const listener of sub.listeners) {
            try {
                listener(sub.data, updateData);
            } catch (e) {
                console.error('Subscription listener error:', e.message);
            }
        }
    }

    _buildSubscriptionMeta({ endpoint, tag, extra } = {}) {
        const meta = {
            endpoint: endpoint ? String(endpoint) : null,
            tag: tag ? String(tag) : null
        };
        if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
            meta.extra = extra;
        }
        return meta;
    }

    /**
     * Apply Swarm incremental update to existing data
     * Swarm sends updates like: { sport: { "1": { game: { "123": { score1: 2 } } } } }
     * null values indicate deletion
     */
    _applyUpdate(target, update) {
        if (!update || typeof update !== 'object') return;

        for (const key of Object.keys(update)) {
            const val = update[key];

            // Swarm uses null to indicate deletion
            if (val === null) {
                delete target[key];
                continue;
            }

            // If value is an object (not array), recurse
            if (val && typeof val === 'object' && !Array.isArray(val)) {
                if (!target[key] || typeof target[key] !== 'object') {
                    target[key] = {};
                }
                this._applyUpdate(target[key], val);
            } else {
                // Primitive value or array - just set it
                target[key] = val;
            }
        }
    }

    /**
     * Subscribe to data and receive real-time updates using Forzza's exact protocol
     * @param {Object} request - The Swarm request (what, where, etc.)
     * @param {Function} onUpdate - Callback for updates (fullData, delta)
     * @returns {Promise<{ subid: string, data: Object, unsubscribe: Function }>}
     */
    async subscribe(request, onUpdate = null, meta = null) {
        await this.ensureConnection();

        if (onUpdate && typeof onUpdate === 'object' && meta == null) {
            meta = onUpdate;
            onUpdate = null;
        }

        // Use Forzza's exact subscription format - send subscription request directly
        console.log('Creating subscription using Forzza protocol...');
        console.log('Subscription request:', JSON.stringify(request, null, 2));
        
        try {
            const subscribeResponse = await this.sendRequest('get', request, 30000);
            
            // Check for subid in nested data structure
            const subid = subscribeResponse?.data?.subid;
            const initialData = subscribeResponse?.data?.data;
            
            if (subid) {
                console.log(`✅ Subscription created with subid: ${subid}`);
                console.log(`Initial subscription data:`, JSON.stringify(initialData, null, 2));
                
                const listeners = onUpdate ? [onUpdate] : [];
                const now = Date.now();
                this.subscriptions.set(String(subid), {
                    data: initialData || {},
                    listeners,
                    request: request,
                    meta: meta && typeof meta === 'object' ? meta : null,
                    createdAtMs: now,
                    lastUpdateAtMs: now,
                    updatesTotal: 0,
                    updateTimestampsMs: [],
                    sessionIdAtCreation: this.sessionId
                });

                return {
                    subid: String(subid),
                    data: initialData || {},
                    addListener: (fn) => {
                        const sub = this.subscriptions.get(String(subid));
                        if (sub && typeof fn === 'function') {
                            sub.listeners.push(fn);
                        }
                    },
                    getData: () => {
                        const sub = this.subscriptions.get(String(subid));
                        return sub ? sub.data : initialData || {};
                    },
                    unsubscribe: () => this.unsubscribe(String(subid))
                };
            } else {
                console.log('❌ Subscription response did not include subid');
                console.log('Response structure:', JSON.stringify(subscribeResponse, null, 2));
                
                // Fallback: try to get initial data without subscription
                const fallbackData = unwrapSwarmData(subscribeResponse) || {};
                return {
                    subid: null,
                    data: fallbackData,
                    addListener: () => {},
                    getData: () => fallbackData,
                    unsubscribe: () => {}
                };
            }
        } catch (e) {
            console.log('❌ Subscription creation failed:', e.message);
            throw e;
        }
    }

    /**
     * Unsubscribe from a subscription
     * @param {string} subid - Subscription ID
     */
    async unsubscribe(subid) {
        if (!this.subscriptions.has(subid)) return;

        try {
            if (this.isConnected()) {
                await this.sendRequest('unsubscribe', { subid }, 5000).catch(() => {});
            }
        } catch (e) {
            // Ignore unsubscribe errors
        }

        this.subscriptions.delete(subid);
        console.log(`Subscription ${subid} removed`);
    }

    getWebSocketHealthMetrics() {
        const now = Date.now();
        const subscriptions = [];

        const wsMessageTimestamps = Array.isArray(this.wsMessageTimestampsMs) ? this.wsMessageTimestampsMs : [];
        const wsMessagesLast60s = wsMessageTimestamps.filter(t => Number.isFinite(t) && (now - t) <= 60000).length;

        const wsMessagesByKind = {};
        const kinds = this.wsMessageKinds && typeof this.wsMessageKinds === 'object' ? this.wsMessageKinds : {};
        for (const kind of Object.keys(kinds)) {
            const bucket = kinds[kind];
            const ts = Array.isArray(bucket?.timestampsMs) ? bucket.timestampsMs : [];
            wsMessagesByKind[kind] = {
                total: Number(bucket?.total) || 0,
                last_60s: ts.filter(t => Number.isFinite(t) && (now - t) <= 60000).length
            };
        }

        const byEndpoint = {};
        const byTag = {};
        let updatesLast60sTotal = 0;

        for (const [subid, sub] of this.subscriptions.entries()) {
            const ts = Array.isArray(sub?.updateTimestampsMs) ? sub.updateTimestampsMs : [];
            const updatesLast60s = ts.filter(t => Number.isFinite(t) && (now - t) <= 60000).length;
            updatesLast60sTotal += updatesLast60s;

            const endpoint = sub?.meta?.endpoint || null;
            const tag = sub?.meta?.tag || null;
            if (endpoint) {
                if (!byEndpoint[endpoint]) byEndpoint[endpoint] = { active_subscriptions: 0, updates_last_60s: 0 };
                byEndpoint[endpoint].active_subscriptions += 1;
                byEndpoint[endpoint].updates_last_60s += updatesLast60s;
            }
            if (tag) {
                if (!byTag[tag]) byTag[tag] = { active_subscriptions: 0, updates_last_60s: 0 };
                byTag[tag].active_subscriptions += 1;
                byTag[tag].updates_last_60s += updatesLast60s;
            }

            subscriptions.push({
                subid: String(subid),
                tag: sub?.meta?.tag || null,
                endpoint: sub?.meta?.endpoint || null,
                extra: sub?.meta?.extra && typeof sub.meta.extra === 'object' ? sub.meta.extra : null,
                created_at: sub?.createdAtMs ? new Date(sub.createdAtMs).toISOString() : null,
                last_update_at: sub?.lastUpdateAtMs ? new Date(sub.lastUpdateAtMs).toISOString() : null,
                updates_total: Number(sub?.updatesTotal) || 0,
                updates_last_60s: updatesLast60s,
                session_id_at_creation: sub?.sessionIdAtCreation || null,
                what_keys: sub?.request?.what && typeof sub.request.what === 'object' ? Object.keys(sub.request.what) : null
            });
        }

        return {
            connected: this.isConnected(),
            session_id: this.sessionId,
            ws_url: this.wsUrl,
            ws_messages_total: Number(this.wsMessagesTotal) || 0,
            ws_messages_last_60s: wsMessagesLast60s,
            ws_parse_errors_total: Number(this.wsMessageParseErrorsTotal) || 0,
            ws_messages_by_kind: wsMessagesByKind,
            active_subscriptions: subscriptions.length,
            updates_last_60s_total: updatesLast60sTotal,
            by_endpoint: byEndpoint,
            by_tag: byTag,
            subscriptions
        };
    }

    /**
     * Get all active subscriptions
     */
    getActiveSubscriptions() {
        return Array.from(this.subscriptions.keys());
    }

    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.sessionId = null;
        }
    }
}

module.exports = ForzzaScraper;
