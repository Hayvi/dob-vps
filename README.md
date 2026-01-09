# Forzza Sports Betting Scraper - VPS Ready

*VPS-optimized version with clustering for 10k+ concurrent users*

Node/Express backend with clustering support that pulls prematch, live, and cached betting data from the Forzza (Swarm) API, stores it in MongoDB Atlas, and serves real-time updates via Server-Sent Events (SSE).

## 🚀 Quick Start

```bash
git clone <your-repo>
cd dob-vps
npm install
cp .env.example .env
# Edit .env with your MONGODB_URI
node cluster.js
```

## 🏗️ Architecture

```
Primary Process (cluster.js)
├── Scraper Worker (1x) - Single shared Swarm WebSocket
└── HTTP Workers (Nx) - Express + SSE via IPC proxy
```

## 📊 Scaling

| Users | RAM | CPUs | Workers | MongoDB |
|-------|-----|------|---------|---------|
| 1-2k | 2GB | 2 | 2 | Atlas M10 |
| 5k | 4GB | 4 | 4 | Atlas M20 |
| 10k | 8GB | 4-8 | 4-8 | Atlas M30+ |

## ⚙️ Environment

```env
MONGODB_URI=mongodb+srv://...
PORT=3000
NODE_ENV=production
WEB_CONCURRENCY=4        # Number of HTTP workers
ADMIN_KEY=your_secret    # Optional
```

## 🔧 OS Tuning (Ubuntu/Debian)

```bash
# Increase file descriptors for 10k+ SSE connections
echo "* soft nofile 65535" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65535" | sudo tee -a /etc/security/limits.conf
ulimit -n 65535
```

## 🚦 Run Modes

```bash
# Single process (development)
node index.js

# Clustered (production)
node cluster.js
```

## 📡 Key Features

- **Shared WebSocket:** Single Swarm connection across all workers
- **List Virtualization:** Handles thousands of games smoothly
- **Real-time SSE:** Live odds updates with minimal latency
- **Gzip Compression:** 85-95% payload reduction
- **Auto-reconnect:** Resilient WebSocket with heartbeat
- **Results & Settlements:** Finished games with market outcomes

See original README.md for full feature documentation.

## 🚀 Live Demo

- **Frontend:** https://dob-lqpg.onrender.com  
- **API Health:** https://dob-lqpg.onrender.com/api/health

## ✨ Features

### Results & Settlements
- **Results Tab:** Fourth mode in the UI alongside Prematch/Live/Cached - displays finished games with final scores
- **Finished Game Results:** Fetch completed games with final scores via `/api/results/games/:sportId`
- **Market Settlements:** Get winning selections for all markets (1X2, Over/Under, etc.) via `/api/results/game/:gameId`
- **Date Range Filtering:** Query results by date range using `from` and `to` Unix timestamps
- **Settlement Details Panel:** Click any finished game to see all market settlements with winning selections highlighted

### Real-time Architecture (Server-Sent Events)
- **Pure WebSocket Architecture:** The application has been migrated to a pure WebSocket-backed SSE architecture, eliminating all legacy REST polling for live data. This results in a more efficient, lower-latency, and reliable real-time experience.
- **Enhanced WebSocket Client:** The underlying WebSocket client now includes a heartbeat mechanism to ensure a stable, long-lived connection and features a more robust subscription protocol for handling real-time data feeds from the Swarm API.
- **Dual SSE Streams:** The application uses two distinct SSE streams for optimized real-time updates:
  - `GET /api/live-stream`: Streams live game counts, the list of games for a selected sport, and a high-performance **odds diff stream**. This `odds` event sends only changed main market odds for all games in the current view, minimizing payload size and enabling a "Forzza-like" live update experience.
  - `GET /api/prematch-stream`: Streams prematch games for a selected sport and a main market `odds` diff stream. The server caches the last known odds per game and sends an **odds snapshot on connect**, preventing the UI from falling back to per-row REST hydration on refresh. Prematch Swarm subscriptions are cached per sport and cleaned up after ~60s idle (no SSE clients), so switching sports can temporarily create multiple short-lived subscriptions.
  - `GET /api/live-game-stream`: Streams full market data for a single selected game, driving the details panel and ensuring the list row stays in sync.
  - `GET /api/counts-stream`: **Always-on stream** for live and prematch counts. Uses Swarm `@count` subscriptions as change detectors (debounced refresh on updates) with a 15s watchdog refresh, and falls back to 1s polling if subscriptions are unavailable.
- **Forzza-Exact & Accurate Counts:** Prematch counts use the same filter as Forzza's frontend (`visible_in_prematch OR type in [0,2]`, excluding sport types 1 and 4). All live and prematch counts are now calculated recursively through the full sport/region/competition hierarchy, ensuring the totals are always accurate.
- **1-Second Polling (live):** Live streams poll the Swarm API every 1 second for near-instant updates.
- **Resilient Connections:** The live streams automatically attempt to reconnect on error, and the underlying WebSocket client's heartbeat ensures the connection remains stable.

### Live Match Metadata & Statistics
- **Universal Score Detection:** Uses the API's `text_info` field as the primary score source, ensuring accurate score display across all sports (football, cricket, tennis, basketball, etc.) without sport-specific parsing.
- **Live Match Statistics:** Visual bar charts comparing team stats in real-time (dangerous attacks, corners, shots on target, possession, wickets, overs, etc.). Stats adapt automatically per sport based on available API data.
- **Period/Half Scores:** Displays score breakdown by period (1H/2H for football, sets for tennis, quarters for basketball, innings for cricket) when available.
- **Live Events Timeline:** Shows recent match events with icons (⚽ goals, 🟨 yellow cards, 🟥 red cards, 🚩 corners, 🔄 substitutions, etc.) sorted by time.
- **Sport-Agnostic Design:** All live metadata features work universally - the UI renders whatever data the API provides without hardcoded sport logic.

### Blocked/Suspended Markets
- **Lock Icon Display (🔒):** When markets or events are suspended, odds are replaced with a lock icon matching Forzza's behavior.
- **Game-Level Suspension:** When an entire game is blocked, ALL markets in the details panel show lock icons.
- **Visual Indicators:** Suspended games show dimmed rows (50% opacity), gray LIVE badge without pulse animation, and "🔒 SUSPENDED" badge in details.
- **Real-time Updates:** Blocked state updates live via SSE - locks appear/disappear as the API reports changes.

### Team Visual Identity
- **Team Shirt Colors:** Colored badges displayed next to team names using `info.shirt1_color` and `info.shirt2_color` from the API.
- **Consistent Display:** Colors shown in both game list rows (10x10px) and match details header (14x14px).

### Frontend Performance & UI/UX
- **Mobile-First UX Overhaul:** Redesigned mobile experience with improved touch targets, responsive layouts, and optimized details panel for smaller screens.
- **Premium Live Metadata Display:** Horizontal layout for live game info showing score, period, and match time in a clean, compact format.
- **List Virtualization (Windowing):** The main games list is virtualized, rendering only the visible rows (plus a small buffer). This allows the UI to remain fast and responsive even with thousands of games loaded, keeping scrolling smooth and memory usage low.
- **Stateful Details Panel:** The match details panel now persists its state across live data refreshes. The active tab, expanded/collapsed market sections, and scroll position are remembered, preventing jarring UI resets.
- **Flicker-Free Rendering:** Client-side caching of odds and market counts prevents the UI from flickering during transient updates. Short-lived flash animations (for odds going up or down) are also persisted across re-renders for a consistent user experience.
- **Incremental DOM Patching:** Live odds updates are applied via targeted DOM patches, avoiding expensive full re-renders of the game list.

### Data & Backend
- **Improved Main Market Selection:** The logic for selecting a game's main market (e.g., `1X2`, `Winner`) has been enhanced with better heuristics to correctly identify and prioritize full-time winner markets over half-time or other variations.
- **Optimized Scraping & Caching:** Includes concurrent scraping for bulk operations, gzip compression for smaller payloads, and an in-memory cache for hierarchy data to reduce API calls.

## 🛠️ Stack

- **Backend:** Node.js, Express 5, WebSocket client, MongoDB/Mongoose
- **Frontend:** Vanilla JS (plain `<script>` tags / global scope), modular CSS (dark theme)
- **Perf:** gzip/deflate compression, in-memory caching, query optimization
- **Tests:** Jest + fast-check
- **Deploy:** Render (keep-alive in health/UI)


## 📡 API Overview

**Live (real-time)**
| Endpoint | Description |
| --- | --- |
| `GET /api/counts-stream` | SSE for live + prematch counts (subscription-triggered refresh; polling fallback) |
| `GET /api/live-stream?sportId=<id>` | SSE (1s) for live games and main market odds diffs |
| `GET /api/live-game-stream?gameId=<id>` | SSE for selected game markets (subscription-first with polling fallback); drives list + details sync |
| `GET /api/prematch-stream?sportId=<id>&sportName=<name>` | SSE for prematch games and main market odds diffs |
| `GET /api/live-sports` | Sports with live games + counts |
| `GET /api/prematch-sports` | Sports with prematch games + counts (Forzza-exact filter) |
| `GET /api/health` | Cache stats + response metrics + `counts_stream` fetch-rate metrics + `swarm_ws` subscription metrics + WS message counters |

**Markets / odds**
| Endpoint | Description |
| --- | --- |
| `GET /api/game-main-market?gameId=<id>` | Legacy endpoint (backend available, frontend no longer calls it) |
| `GET /api/game-details?gameId=<id>` | Legacy endpoint (backend available, frontend uses `/api/live-game-stream` for details) |
| `GET /api/game-stats?gameId=<id>` | Team form/points/position (optional Krosstats) |
| `GET /api/debug-game-fields?gameId=<id>` | Raw game API fields for debugging |
| `GET /api/debug-market-fields?gameId=<id>` | Raw market/event fields for debugging |

**Cached (MongoDB)**
| Endpoint | Description | Pagination |
| --- | --- | --- |
| `GET /api/cached-sports` | Sports with cached games + counts | No |
| `GET /api/sport-games?sportName=X&limit=&skip=` | Latest cached games for a sport | Yes |
| `GET /api/football-games?limit=&skip=` | Cached football games | Yes |

**Scraping/admin**
| Endpoint | Description |
| --- | --- |
| `GET /api/sport-full-scrape?sportId=&sportName=` | Scrape sport and save to DB |
| `GET /api/football-full-scrape` | Scrape football and save to DB |
| `GET /api/fetch-all-sports` | Bulk scrape all sports (rate-limited) |
| `GET /api/hierarchy` | Full sports tree (cached 5m) |

**Results (finished games)**
| Endpoint | Description |
| --- | --- |
| `GET /api/results/competitions?from=&to=` | Sports/competitions with results available |
| `GET /api/results/games/:sportId?from=&to=` | Finished games with scores for a sport |
| `GET /api/results/game/:gameId` | Market settlements (winning selections) |

If `ADMIN_KEY` is set, scrape/debug endpoints require `?key=ADMIN_KEY`.

## ⚙️ Setup

1) Install dependencies
```bash
npm install
```

2) Configure `.env`
```env
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster/forzza_scraper
PORT=3000
NODE_ENV=production
# Optional
ADMIN_KEY=your_admin_key
KROSSTATS_SITE_ID=...
KROSSTATS_TOKEN=...
KROSSTATS_LANG=en
```

KrosStats credentials can also be provided via Render Secret Files:
- `/etc/secrets/KROSSTATS_SITE_ID`
- `/etc/secrets/KROSSTATS_TOKEN`

3) Run the server
```bash
node index.js
```

## 🧪 Testing

```bash
npm test               # all tests
npm run test:watch     # watch mode
npm run test:coverage  # coverage
```

## 🚦 Modes & Data Flow

- **Prematch:** Real-time counts via `/api/counts-stream` (1s) and real-time games + main market odds via `/api/prematch-stream`.
- **Live:** SSE `/api/live-stream` (1s). The connection is kept alive via a heartbeat ping and automatically reconnects on error.
- **Selected game markets (live or prematch):** SSE `/api/live-game-stream` (subscription-first with polling fallback). List + details share the same payload.
- **Cached:** reads from MongoDB with pagination; UI auto-fetches pages.
- **Results:** fetches finished games from `/api/results/games/:sportId`; displays final scores and market settlements.

## 💻 Frontend Notes

- The frontend is intentionally **not bundled** (no ES modules build step). Scripts are loaded via `<script>` tags in `public/index.html`, so **load order matters** and all modules share a global scope.
- Frontend code is organized into focused files under:
  - `public/js/api/` (SSE + polling + fetch helpers)
  - `public/js/details/` (details panel helpers)
  - `public/js/renderGames/` (rendering + virtualization + tree state)
  - `public/js/utils/` (shared utilities)
- Odds flashing is synchronized between list and details for the selected live game.
- List hydration skips the selected game when details are open or SSE is active.
- Live Tracker iframe: `https://widget-iframe.wadua.io/?partnerID=1777&matchID=<gameId>&language=eng&viewMode=single&header=false&timer=true&isAnalyticsOn=false&isLoggerOn=false`

## 🩺 Health & Keep-Alive

- `GET /api/health` exposes cache stats and response-time metrics, plus `counts_stream` and `swarm_ws` monitoring (including WS message counters).
- Keep-alive pings are built-in (frontend + GitHub Actions suggested). External cron (e.g., cron-job.org) is recommended for free-tier hosting.

## 📁 Project Structure

```
├── index.js              # Express app entry
├── routes/               # API routes (live, cached, markets, scrape, tracker, stats)
├── lib/                  # backend helpers (auth/http/parsing/liveStream/liveCounts/scrape)
├── scraper.js            # Swarm WebSocket client
├── models/Game.js        # MongoDB schema
├── middleware/           # compression, response timer
├── utils/                # cache, pagination, query optimizer, rate limiter
├── public/               # frontend (HTML/CSS/JS)
│   ├── index.html         # script load order + app shell
│   └── js/
│       ├── api/           # SSE + polling + fetch helpers
│       ├── details/       # details panel helpers
│       ├── renderGames/   # rendering + virtualization + tree state
│       └── utils/         # shared utilities
├── tests/                # jest + fast-check
└── .github/workflows/    # keep-alive workflow
```

## 🔧 Deployment (Render)

- **Build:** `npm install`
- **Start:** `node index.js`
- **Env:** Node 18+
- **Auto-deploy:** from `main`

## 🧭 Game Types

| Type | Meaning | Included |
| --- | --- | --- |
| `0` | Prematch | ✅ |
| `1` | Live | ✅ |
| `2` | Outright | ✅ |

- ❌ No caching (repeated API calls)
- ❌ No pagination (large response sizes)
- ❌ Multiple DB queries per request
- ❌ No compression (full JSON payloads)
- ❌ Sequential scraping (slow bulk operations)

### After Optimization
- ✅ **5-minute caching** (instant repeated requests)
- ✅ **Smart pagination** (500 records max per request)
- ✅ **Single aggregation queries** (3x faster DB operations)
- ✅ **Gzip compression** (90% smaller responses)
- ✅ **Concurrent scraping** (3x faster bulk operations)
- ✅ **Response monitoring** (performance visibility)

### Typical Performance
- **Cache hit:** < 50ms response time
- **Cache miss:** 1-3 seconds (external API dependent)
- **Bulk scraping:** 30-60 seconds for all sports
- **Compression ratio:** 85-95% for large JSON responses

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

ISC

---

**Built with ❤️ for sports betting data analysis**