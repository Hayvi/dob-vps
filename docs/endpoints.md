# Forzza Scraper - API Endpoints Documentation

*Last Updated: 2026-01-05*

**Production Base URL:** `https://dob-lqpg.onrender.com`

---

## 📊 Cached Endpoints (MongoDB)

These endpoints return data from the database without hitting the Swarm API. Fast and reliable.

### Get Cached Sport Data

| Sport | Cached Data URL |
|-------|-----------------|
| Football | [/api/sport-games?sportName=Football](https://dob-lqpg.onrender.com/api/sport-games?sportName=Football) |
| Ice Hockey | [/api/sport-games?sportName=Ice_Hockey](https://dob-lqpg.onrender.com/api/sport-games?sportName=Ice_Hockey) |
| Basketball | [/api/sport-games?sportName=Basketball](https://dob-lqpg.onrender.com/api/sport-games?sportName=Basketball) |
| Tennis | [/api/sport-games?sportName=Tennis](https://dob-lqpg.onrender.com/api/sport-games?sportName=Tennis) |
| Volleyball | [/api/sport-games?sportName=Volleyball](https://dob-lqpg.onrender.com/api/sport-games?sportName=Volleyball) |
| American Football | [/api/sport-games?sportName=American_Football](https://dob-lqpg.onrender.com/api/sport-games?sportName=American_Football) |
| Aussie Rules | [/api/sport-games?sportName=Aussie_Rules](https://dob-lqpg.onrender.com/api/sport-games?sportName=Aussie_Rules) |
| Bandy | [/api/sport-games?sportName=Bandy](https://dob-lqpg.onrender.com/api/sport-games?sportName=Bandy) |
| Baseball | [/api/sport-games?sportName=Baseball](https://dob-lqpg.onrender.com/api/sport-games?sportName=Baseball) |
| Chess | [/api/sport-games?sportName=Chess](https://dob-lqpg.onrender.com/api/sport-games?sportName=Chess) |
| Cricket | [/api/sport-games?sportName=Cricket](https://dob-lqpg.onrender.com/api/sport-games?sportName=Cricket) |
| Curling | [/api/sport-games?sportName=Curling](https://dob-lqpg.onrender.com/api/sport-games?sportName=Curling) |
| Cycling | [/api/sport-games?sportName=Cycling](https://dob-lqpg.onrender.com/api/sport-games?sportName=Cycling) |
| Darts | [/api/sport-games?sportName=Darts](https://dob-lqpg.onrender.com/api/sport-games?sportName=Darts) |
| Floorball | [/api/sport-games?sportName=Floorball](https://dob-lqpg.onrender.com/api/sport-games?sportName=Floorball) |
| Formula 1 | [/api/sport-games?sportName=Formula_1](https://dob-lqpg.onrender.com/api/sport-games?sportName=Formula_1) |
| Futsal | [/api/sport-games?sportName=Futsal](https://dob-lqpg.onrender.com/api/sport-games?sportName=Futsal) |
| Golf | [/api/sport-games?sportName=Golf](https://dob-lqpg.onrender.com/api/sport-games?sportName=Golf) |
| Handball | [/api/sport-games?sportName=Handball](https://dob-lqpg.onrender.com/api/sport-games?sportName=Handball) |
| Lacrosse | [/api/sport-games?sportName=Lacrosse](https://dob-lqpg.onrender.com/api/sport-games?sportName=Lacrosse) |
| Rugby League | [/api/sport-games?sportName=Rugby_League](https://dob-lqpg.onrender.com/api/sport-games?sportName=Rugby_League) |
| Rugby Union | [/api/sport-games?sportName=Rugby_Union](https://dob-lqpg.onrender.com/api/sport-games?sportName=Rugby_Union) |
| Snooker | [/api/sport-games?sportName=Snooker](https://dob-lqpg.onrender.com/api/sport-games?sportName=Snooker) |
| Table Tennis | [/api/sport-games?sportName=Table_Tennis](https://dob-lqpg.onrender.com/api/sport-games?sportName=Table_Tennis) |
| Water Polo | [/api/sport-games?sportName=Water_Polo](https://dob-lqpg.onrender.com/api/sport-games?sportName=Water_Polo) |
| 3x3 Basketball | [/api/sport-games?sportName=3x3_Basketball](https://dob-lqpg.onrender.com/api/sport-games?sportName=3x3_Basketball) |
| Counter-Strike 2 | [/api/sport-games?sportName=Counter_Strike_2](https://dob-lqpg.onrender.com/api/sport-games?sportName=Counter_Strike_2) |
| Dota 2 | [/api/sport-games?sportName=Dota_2](https://dob-lqpg.onrender.com/api/sport-games?sportName=Dota_2) |
| League of Legends | [/api/sport-games?sportName=League_of_legends](https://dob-lqpg.onrender.com/api/sport-games?sportName=League_of_legends) |

### Football Shortcut
- [/api/football-games](https://dob-lqpg.onrender.com/api/football-games) - Same as `/api/sport-games?sportName=Football`

---

## 🚀 Live Endpoints (Swarm API)

These endpoints connect to the WebSocket API in real-time. May be slower due to network latency.

### Live Scrape (Fetches fresh data and saves to MongoDB)

| Sport | Live Scrape URL |
|-------|-----------------|
| Football | [/api/sport-full-scrape?sportId=1&sportName=Football](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=1&sportName=Football) |
| Ice Hockey | [/api/sport-full-scrape?sportId=2&sportName=Ice_Hockey](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=2&sportName=Ice_Hockey) |
| Basketball | [/api/sport-full-scrape?sportId=3&sportName=Basketball](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=3&sportName=Basketball) |
| Tennis | [/api/sport-full-scrape?sportId=4&sportName=Tennis](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=4&sportName=Tennis) |
| Volleyball | [/api/sport-full-scrape?sportId=5&sportName=Volleyball](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=5&sportName=Volleyball) |
| American Football | [/api/sport-full-scrape?sportId=6&sportName=American_Football](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=6&sportName=American_Football) |
| Aussie Rules | [/api/sport-full-scrape?sportId=8&sportName=Aussie_Rules](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=8&sportName=Aussie_Rules) |
| Bandy | [/api/sport-full-scrape?sportId=10&sportName=Bandy](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=10&sportName=Bandy) |
| Baseball | [/api/sport-full-scrape?sportId=11&sportName=Baseball](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=11&sportName=Baseball) |
| Chess | [/api/sport-full-scrape?sportId=18&sportName=Chess](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=18&sportName=Chess) |
| Cricket | [/api/sport-full-scrape?sportId=19&sportName=Cricket](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=19&sportName=Cricket) |
| Curling | [/api/sport-full-scrape?sportId=20&sportName=Curling](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=20&sportName=Curling) |
| Cycling | [/api/sport-full-scrape?sportId=21&sportName=Cycling](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=21&sportName=Cycling) |
| Darts | [/api/sport-full-scrape?sportId=22&sportName=Darts](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=22&sportName=Darts) |
| Floorball | [/api/sport-full-scrape?sportId=24&sportName=Floorball](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=24&sportName=Floorball) |
| Formula 1 | [/api/sport-full-scrape?sportId=25&sportName=Formula_1](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=25&sportName=Formula_1) |
| Futsal | [/api/sport-full-scrape?sportId=26&sportName=Futsal](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=26&sportName=Futsal) |
| Golf | [/api/sport-full-scrape?sportId=27&sportName=Golf](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=27&sportName=Golf) |
| Handball | [/api/sport-full-scrape?sportId=29&sportName=Handball](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=29&sportName=Handball) |
| Lacrosse | [/api/sport-full-scrape?sportId=110&sportName=Lacrosse](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=110&sportName=Lacrosse) |
| Rugby League | [/api/sport-full-scrape?sportId=36&sportName=Rugby_League](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=36&sportName=Rugby_League) |
| Rugby Union | [/api/sport-full-scrape?sportId=37&sportName=Rugby_Union](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=37&sportName=Rugby_Union) |
| Snooker | [/api/sport-full-scrape?sportId=39&sportName=Snooker](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=39&sportName=Snooker) |
| Table Tennis | [/api/sport-full-scrape?sportId=41&sportName=Table_Tennis](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=41&sportName=Table_Tennis) |
| Water Polo | [/api/sport-full-scrape?sportId=42&sportName=Water_Polo](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=42&sportName=Water_Polo) |
| 3x3 Basketball | [/api/sport-full-scrape?sportId=190&sportName=3x3_Basketball](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=190&sportName=3x3_Basketball) |
| Counter-Strike 2 | [/api/sport-full-scrape?sportId=75&sportName=Counter_Strike_2](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=75&sportName=Counter_Strike_2) |
| Dota 2 | [/api/sport-full-scrape?sportId=76&sportName=Dota_2](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=76&sportName=Dota_2) |
| League of Legends | [/api/sport-full-scrape?sportId=77&sportName=League_of_legends](https://dob-lqpg.onrender.com/api/sport-full-scrape?sportId=77&sportName=League_of_legends) |

### Football Shortcut
- [/api/football-full-scrape](https://dob-lqpg.onrender.com/api/football-full-scrape) - Same as `/api/sport-full-scrape?sportId=1&sportName=Football`

### Live Game Counts (Real-time count without full data)

| Endpoint | Description |
|----------|-------------|
| [/api/sport-games-count?sportName=Football](https://dob-lqpg.onrender.com/api/sport-games-count?sportName=Football) | Live count for any sport |
| [/api/football-games-count](https://dob-lqpg.onrender.com/api/football-games-count) | Football shortcut |

### Server-Sent Events (SSE) Streams

| Endpoint | Description |
|----------|-------------|
| [/api/counts-stream](https://dob-lqpg.onrender.com/api/counts-stream) | SSE for live + prematch counts. Uses Swarm `@count` subscriptions as change detectors (debounced refresh) with watchdog refresh; falls back to 1s polling if subscriptions are unavailable. |
| [/api/live-stream?sportId=1](https://dob-lqpg.onrender.com/api/live-stream?sportId=1) | SSE for live games list and main market odds diffs for selected sport |
| [/api/prematch-stream?sportId=1&sportName=Football](https://dob-lqpg.onrender.com/api/prematch-stream?sportId=1&sportName=Football) | SSE for prematch games list and main market odds diffs for selected sport. The client opens a new SSE when switching sportId; the server caches a per-sport Swarm subscription and cleans it up after ~60s idle (no clients). |
| [/api/live-game-stream?gameId=0](https://dob-lqpg.onrender.com/api/live-game-stream?gameId=0) | SSE for full market data of one selected game (live or prematch). Subscription-first with polling fallback. |

---

## 🎯 Markets / Odds / Game Details

| Endpoint | Type | Description |
|----------|------|-------------|
| `/api/game-stats?gameId=<id>` | REST | Optional team form/points/position via KrosStats. Returns `501` if not configured. |
| `/api/game-details?gameId=<id>` | REST | Legacy endpoint (backend available; frontend uses `/api/live-game-stream` to populate details). |
| `/api/game-main-market?gameId=<id>` | REST | Legacy endpoint (backend available; frontend no longer calls it). |

### KrosStats configuration

To enable `/api/game-stats`, set:

- `KROSSTATS_SITE_ID`
- `KROSSTATS_TOKEN`

Optional:

- `KROSSTATS_API_BASE_URL` (default `https://krosstats.betcoapps.com/api`)
- `KROSSTATS_LANG` (default `en`)

On Render, you can provide credentials via Secret Files instead of env vars:

- `/etc/secrets/KROSSTATS_SITE_ID`
- `/etc/secrets/KROSSTATS_TOKEN`

---

## 🏆 Results Endpoints (Finished Games)

Fetch finished game results and market settlements from the Swarm API.

### Get Competitions with Results

| Endpoint | Description |
|----------|-------------|
| [/api/results/competitions](https://dob-lqpg.onrender.com/api/results/competitions) | List sports/regions/competitions that have results available |

**Query Parameters:**
- `from` - Unix timestamp (optional, defaults to start of today)
- `to` - Unix timestamp (optional, defaults to end of today)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "Id": 1,
      "Name": "Football",
      "Alias": "Soccer",
      "Regions": [
        {
          "Id": 117,
          "Name": "Italy",
          "Competitions": [{ "Id": 543, "Name": "Serie A" }]
        }
      ]
    }
  ],
  "timestamp": "2026-01-03T16:00:00.000Z"
}
```

### Get Finished Games by Sport

| Sport | Results URL |
|-------|-------------|
| Football | [/api/results/games/1](https://dob-lqpg.onrender.com/api/results/games/1) |
| Ice Hockey | [/api/results/games/2](https://dob-lqpg.onrender.com/api/results/games/2) |
| Basketball | [/api/results/games/3](https://dob-lqpg.onrender.com/api/results/games/3) |
| Tennis | [/api/results/games/4](https://dob-lqpg.onrender.com/api/results/games/4) |

**Query Parameters:**
- `from` - Unix timestamp (optional, defaults to start of today)
- `to` - Unix timestamp (optional, defaults to end of today)

**Response:**
```json
{
  "success": true,
  "sportId": 1,
  "count": 147,
  "games": [
    {
      "game_id": "28686487",
      "game_name": "FC Como - Udinese",
      "scores": "1:0 (1:0)",
      "team1_name": "FC Como",
      "team2_name": "Udinese",
      "competition_name": "Serie A",
      "region_name": "Italy",
      "date": 1767439800
    }
  ],
  "timestamp": "2026-01-03T16:00:00.000Z"
}
```

### Get Game Market Settlements

| Endpoint | Description |
|----------|-------------|
| [/api/results/game/:gameId](https://dob-lqpg.onrender.com/api/results/game/28686487) | Get winning selections for all markets |

**Response:**
```json
{
  "success": true,
  "gameId": "28686487",
  "settlements": [
    { "market": "Match Result", "winners": ["W1"] },
    { "market": "Double Chance", "winners": ["12", "1X"] },
    { "market": "Total Goals", "winners": ["Over (0.5)"] },
    { "market": "Total Goals", "winners": ["Under (1.5)"] }
  ],
  "timestamp": "2026-01-03T16:00:00.000Z"
}
```

---

## 🛠️ Utility Endpoints

| Endpoint | Type | Description |
|----------|------|-------------|
| [/api/hierarchy](https://dob-lqpg.onrender.com/api/hierarchy) | Live | Full sports/regions/competitions tree |
| [/api/fetch-all-sports](https://dob-lqpg.onrender.com/api/fetch-all-sports) | Live | Bulk scrape ALL sports (slow) |
| [/api/health](https://dob-lqpg.onrender.com/api/health) | Utility | Server health, cache stats, response time metrics, plus `counts_stream` fetch-rate metrics and `swarm_ws` subscription metrics (including WS message counters) |

---

## 📝 Notes

### Game Types
The scraper fetches **all game types (0, 1, 2)** by default.

### Optional ADMIN_KEY Protection
If `ADMIN_KEY` is set in the environment, these endpoints require `?key=ADMIN_KEY`:
- `/api/sport-full-scrape`
- `/api/football-full-scrape`
- `/api/fetch-all-sports`

In production (`NODE_ENV=production`), `/api/debug-games` also requires the key.

### Response Format

**Cached endpoints return:**
```json
{
  "source": "mongodb",
  "sport": "Football",
  "last_updated": "2025-12-26T23:41:18.209Z",
  "count": 196,
  "data": [...]
}
```

**Live scrape endpoints return:**
```json
{
  "message": "Scrape completed for Football",
  "count": 196,
  "last_updated": "2025-12-26T23:41:18.209Z",
  "data": [...]
}
```
