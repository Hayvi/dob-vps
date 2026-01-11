// Upcoming stream - games starting soon (within N hours)
let upcomingStreamSource = null;
let upcomingStreamHours = 2;
let upcomingStreamRetryTimeoutId = null;
let upcomingGames = [];
let pendingUpcomingOdds = {};

function isUpcomingStreamActive() {
  return Boolean(upcomingStreamSource && upcomingStreamSource.readyState !== 2);
}

function stopUpcomingStream() {
  if (upcomingStreamRetryTimeoutId) {
    clearTimeout(upcomingStreamRetryTimeoutId);
    upcomingStreamRetryTimeoutId = null;
  }
  if (upcomingStreamSource) {
    upcomingStreamSource.close();
  }
  upcomingStreamSource = null;
  upcomingGames = [];
}

function startUpcomingStream(hours = 2) {
  if (currentMode !== 'upcoming') return;

  // Reuse existing stream if same hours - just re-render cached games
  if (upcomingStreamSource && upcomingStreamHours === hours && upcomingStreamSource.readyState !== 2) {
    renderUpcomingGames();
    return;
  }

  stopUpcomingStream();
  upcomingStreamHours = hours;

  // Hide welcome screen, show games container
  if (typeof welcomeScreen !== 'undefined') welcomeScreen.classList.add('hidden');
  if (typeof gamesContainer !== 'undefined') gamesContainer.classList.remove('hidden');

  console.log('Starting upcoming stream for', hours, 'hours');
  const url = `/api/upcoming-stream?hours=${hours}&_=${Date.now()}`;
  console.log('SSE URL:', url);
  
  const es = new EventSource(url);
  upcomingStreamSource = es;

  es.onopen = () => {
    console.log('[Upcoming] SSE connected, readyState:', es.readyState);
  };

  es.onerror = (err) => {
    console.error('[Upcoming] SSE error:', err, 'readyState:', es.readyState);
  };

  es.onmessage = (evt) => {
    console.log('[Upcoming] Generic message event:', evt.type, evt.data?.substring(0, 100));
  };

      es.addEventListener('games', (evt) => {
          console.log('[Upcoming] games event received, data length:', evt.data?.length);
          if (currentMode !== 'upcoming') {
              console.log('[Upcoming] Ignoring - mode is', currentMode);
              return;
          }
          const payload = safeJsonParse(evt?.data);
          if (!payload) {
              console.error('[Upcoming] Failed to parse games payload');
              return;
          }

          const prevById = new Map();
          for (const g of Array.isArray(upcomingGames) ? upcomingGames : []) {
            const id = g?.id;
            if (id === undefined || id === null) continue;
            prevById.set(String(id), g);
          }

          const next = Array.isArray(payload.games) ? payload.games : [];
          for (const g of next) {
            const prev = prevById.get(String(g?.id));
            if (!prev) continue;
            if (prev.__mainOdds && !g.__mainOdds) g.__mainOdds = prev.__mainOdds;
            if (prev.__clientId && !g.__clientId) g.__clientId = prev.__clientId;
          }

          if (pendingUpcomingOdds && typeof pendingUpcomingOdds === 'object') {
            for (const g of next) {
              const gid = g?.id;
              if (gid === undefined || gid === null) continue;
              const cached = pendingUpcomingOdds[String(gid)];
              if (!cached) continue;
              g.__mainOdds = cached;
              delete pendingUpcomingOdds[String(gid)];
            }
          }

          upcomingGames = next;
          console.log('[Upcoming] Parsed', upcomingGames.length, 'games');
          renderUpcomingGames();
      });
  
      es.addEventListener('counts', (evt) => {
          if (currentMode !== 'upcoming') return;
          const payload = safeJsonParse(evt?.data);
          if (!payload) return;
  
          sportsCountsUpcoming = new Map();
          payload.sports.forEach(s => sportsCountsUpcoming.set(String(s.name).toLowerCase(), s.count));
          totalGamesUpcoming = payload.total_games;
          if (typeof updateModeButtons === 'function') {
              updateModeButtons();
          }
          if (typeof renderSportsList === 'function') {
              renderSportsList();
          }
      });
  es.addEventListener('odds', (evt) => {
    if (currentMode !== 'upcoming') return;
    const payload = safeJsonParse(evt?.data);
    if (!payload) return;
    
    // Apply odds to games
    for (const [gameId, odds] of Object.entries(payload)) {
      const game = upcomingGames.find(g => String(g.id) === String(gameId));
      if (game) {
        game.__mainOdds = odds;
      } else {
        if (!pendingUpcomingOdds || typeof pendingUpcomingOdds !== 'object') pendingUpcomingOdds = {};
        pendingUpcomingOdds[String(gameId)] = odds;
      }
    }
    renderUpcomingGames();
  });

  es.addEventListener('error', () => {
    if (currentMode !== 'upcoming') return;
    upcomingStreamRetryTimeoutId = setTimeout(() => {
      if (currentMode === 'upcoming') startUpcomingStream(hours);
    }, 3000);
  });
}

function renderUpcomingGames() {
  const container = document.getElementById('gamesList');
  console.log('[Upcoming] renderUpcomingGames called, container:', !!container, 'mode:', currentMode, 'games:', upcomingGames.length);
  if (!container || currentMode !== 'upcoming') return;

  // Ensure container is visible
  if (typeof welcomeScreen !== 'undefined') welcomeScreen.classList.add('hidden');
  if (typeof gamesContainer !== 'undefined') gamesContainer.classList.remove('hidden');

  // Update count
  const countEl = document.getElementById('gamesCount');
  if (countEl) countEl.textContent = `${upcomingGames.length} upcoming`;

  if (upcomingGames.length === 0) {
    container.innerHTML = '<div class="no-games">No upcoming games in the next ' + upcomingStreamHours + ' hours</div>';
    return;
  }

  // Group by sport
  const bySport = {};
  for (const game of upcomingGames) {
    const sportName = game.sport_name || 'Other';
    if (!bySport[sportName]) bySport[sportName] = [];
    bySport[sportName].push(game);
  }

  let html = '';
  for (const [sportName, games] of Object.entries(bySport)) {
    html += `<div class="upcoming-sport-group">
      <div class="upcoming-sport-header">${escapeHtml(sportName)} (${games.length})</div>`;
    
    for (const game of games) {
      const startTime = new Date(game.start_ts * 1000);
      const timeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const minutesUntil = Math.round((game.start_ts * 1000 - Date.now()) / 60000);
      const timeLabel = minutesUntil <= 60 ? `${minutesUntil}m` : timeStr;
      
      const odds = game.__mainOdds || [];
      const oddsHtml = odds.length > 0 
        ? odds.map(o => {
            if (o?.blocked) return `<span class="odd-btn blocked">🔒</span>`;
            const p = Number(o?.price);
            const txt = Number.isFinite(p) ? p.toFixed(2) : '-';
            return `<span class="odd-btn">${txt}</span>`;
          }).join('')
        : '<span class="odd-btn">-</span><span class="odd-btn">-</span><span class="odd-btn">-</span>';

      html += `<div class="game-row upcoming-game" data-game-id="${game.id}">
        <div class="game-time upcoming-time ${minutesUntil <= 30 ? 'starting-soon' : ''}">${timeLabel}</div>
        <div class="game-teams">
          <span class="team">${escapeHtml(game.team1_name || 'Team 1')}</span>
          <span class="vs">vs</span>
          <span class="team">${escapeHtml(game.team2_name || 'Team 2')}</span>
        </div>
        <div class="game-odds">${oddsHtml}</div>
      </div>`;
    }
    html += '</div>';
  }

  console.log('[Upcoming] Setting innerHTML, html length:', html.length);
  container.innerHTML = html;

  // Click to open details
  container.onclick = (e) => {
    const row = e?.target?.closest ? e.target.closest('.game-row.upcoming-game') : null;
    if (!row) return;
    const gid = row.getAttribute('data-game-id');
    if (!gid) return;
    const game = upcomingGames.find(g => String(g?.id) === String(gid));
    if (!game) return;
    if (!game.__clientId) game.__clientId = String(game.id);
    if (typeof selectGame === 'function') {
      selectGame(game, row);
      return;
    }
    selectedGame = game;
    if (typeof showGameDetails === 'function') showGameDetails(game);
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
