// Upcoming stream - games starting soon (within N hours)
let upcomingStreamSource = null;
let upcomingStreamHours = 2;
let upcomingStreamRetryTimeoutId = null;
let upcomingGames = [];

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

    upcomingGames = payload.games || [];
    console.log('[Upcoming] Parsed', upcomingGames.length, 'games');
    renderUpcomingGames();
  });

  es.addEventListener('odds', (evt) => {
    if (currentMode !== 'upcoming') return;
    const payload = safeJsonParse(evt?.data);
    if (!payload) return;
    
    // Apply odds to games
    for (const [gameId, odds] of Object.entries(payload)) {
      const game = upcomingGames.find(g => String(g.id) === String(gameId));
      if (game) game.__mainOdds = odds;
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
        ? odds.map(o => `<span class="odd-btn${o.blocked ? ' blocked' : ''}">${o.blocked ? '🔒' : o.price?.toFixed(2) || '-'}</span>`).join('')
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
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
