/**
 * Scraper proxy for HTTP workers - communicates with scraper worker via IPC
 */
const { v4: uuidv4 } = require('uuid');

class ScraperProxy {
  constructor() {
    this.pending = new Map();
    this.subscriptionListeners = new Map(); // key -> Set<callback>
    this.workerId = process.pid;
    
    process.on('message', (msg) => this._handleMessage(msg));
  }

  _handleMessage(msg) {
    if (!msg) return;

    if (msg.type === 'response' && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg.result);
    }

    if (msg.type === 'subscribeResult' && msg.workerId === this.workerId && this.pending.has(msg.id)) {
      const { resolve } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      resolve({ subid: msg.subid, data: msg.data });
    }

    if (msg.type === 'subscriptionUpdate') {
      const listeners = this.subscriptionListeners.get(msg.key);
      if (listeners) {
        for (const cb of listeners) {
          try { cb(msg.data, msg.delta); } catch (e) {}
        }
      }
    }
  }

  _call(method, args = []) {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timeout`));
      }, 90000);
      this.pending.set(id, { resolve: (r) => { clearTimeout(timeout); resolve(r); }, reject: (e) => { clearTimeout(timeout); reject(e); } });
      process.send({ type: 'call', id, method, args });
    });
  }

  async init() { return this._call('init'); }
  async getHierarchy() { return this._call('getHierarchy'); }
  async getGames(competitionId) { return this._call('getGames', [competitionId]); }
  async getGamesBySport(sportId) { return this._call('getGamesBySport', [sportId]); }
  async getGameDetails(gameId) { return this._call('getGameDetails', [gameId]); }
  async getActiveCompetitions(from, to) { return this._call('getActiveCompetitions', [from, to]); }
  async getResultGames(sportId, from, to) { return this._call('getResultGames', [sportId, from, to]); }
  async getGameResults(gameId) { return this._call('getGameResults', [gameId]); }
  async sendRequest(command, params, timeout) { return this._call('sendRequest', [command, params, timeout]); }

  async subscribe(request, onUpdate) {
    const key = JSON.stringify(request);
    
    if (!this.subscriptionListeners.has(key)) {
      this.subscriptionListeners.set(key, new Set());
    }
    if (onUpdate) this.subscriptionListeners.get(key).add(onUpdate);

    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('subscribe timeout'));
      }, 30000);
      this.pending.set(id, { resolve: (r) => { clearTimeout(timeout); resolve({
        ...r,
        getData: () => r.data,
        addListener: (fn) => this.subscriptionListeners.get(key)?.add(fn),
        unsubscribe: () => {
          this.subscriptionListeners.get(key)?.delete(onUpdate);
          if (this.subscriptionListeners.get(key)?.size === 0) {
            process.send({ type: 'unsubscribe', key, workerId: this.workerId });
            this.subscriptionListeners.delete(key);
          }
        }
      }); }, reject: (e) => { clearTimeout(timeout); reject(e); } });
      process.send({ type: 'subscribe', id, request, workerId: this.workerId });
    });
  }

  // Proxy subscription methods
  async subscribeToPrematchGames(sportId, onUpdate) {
    const request = {
      source: 'betting',
      what: { sport: ['id','name','alias','order'], region: ['id','name','alias','order'], competition: ['id','order','name','favorite','teams_reversed'], game: ['id','team1_name','team2_name','team1_id','team2_id','start_ts','type','is_blocked','markets_count','info','stats','score1','score2','text_info','live_events','is_live','is_started','game_number','match_length','sport_alias','show_type','is_stat_available','strong_team','round','region_alias','last_event','live_available','promoted','is_neutral_venue','season_id','scout_provider','visible_in_prematch','not_in_sportsbook','is_reversed','team1_reg','team2_reg','team1_reg_name','team2_reg_name','add_info_name','favorite_order'] },
      where: { sport: { id: parseInt(sportId) }, game: { '@or': [{ visible_in_prematch: 1 }, { type: { '@in': [0,2] } }] } },
      subscribe: true
    };
    return this.subscribe(request, onUpdate);
  }

  async subscribeToLiveCount(onUpdate) {
    const request = { source: 'betting', what: { game: '@count' }, where: { sport: { type: { '@nin': [1,4] } }, game: { type: 1 } }, subscribe: true };
    return this.subscribe(request, onUpdate);
  }

  async subscribeToPrematchCount(onUpdate) {
    const request = { source: 'betting', what: { game: '@count' }, where: { sport: { type: { '@nin': [1,4] } }, game: { '@or': [{ visible_in_prematch: 1 }, { type: { '@in': [0,2] } }] } }, subscribe: true };
    return this.subscribe(request, onUpdate);
  }

  async subscribeToGameMarkets(gameId, onUpdate) {
    const request = { source: 'betting', what: { market: ['id','name','type','order','col_count','mobile_col_count','display_key','is_blocked','cashout','available_for_betbuilder','group_id','group_name','group_order','display_color','market_type','display_sub_key','sequence','point_sequence','optimal','name_template','express_id','is_new'], event: ['id','name','price','order','original_order','type','type_1','base','is_blocked','home_value','away_value','type_id','alt_order'] }, where: { game: { id: parseInt(gameId) } }, subscribe: true };
    return this.subscribe(request, onUpdate);
  }

  getWebSocketHealthMetrics() {
    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const timeout = setTimeout(() => { this.pending.delete(id); resolve({}); }, 5000);
      this.pending.set(id, { resolve: (r) => { clearTimeout(timeout); resolve(r); }, reject: (e) => { clearTimeout(timeout); resolve({}); } });
      process.send({ type: 'getHealth', id });
    });
  }

  isConnected() { return true; } // Scraper worker handles connection
  async ensureConnection() {} // No-op, scraper worker handles it
}

module.exports = ScraperProxy;
