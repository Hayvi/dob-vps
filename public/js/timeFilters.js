// Time filter state
let activeTimeFilter = 0; // 0 = all, or hours
let filteredGames = []; // Store filtered games for click handlers

function initTimeFilters() {
  const container = document.getElementById('timeFilters');
  if (!container) return;

  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('.time-filter-btn');
    if (!btn) return;

    // Update active state
    container.querySelectorAll('.time-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const hours = btn.dataset.hours;
    activeTimeFilter = hours === '0' ? 0 : hours;
    
    console.log('Time filter clicked:', activeTimeFilter, 'currentSport:', currentSport, 'currentMode:', currentMode);

    // Reload games with filter
    if (currentMode === 'prematch' && currentSport) {
      if (activeTimeFilter === 0) {
        // Back to normal stream - show regionsTree, hide gamesList
        const regionsTree = document.getElementById('regionsTree');
        const gamesList = document.getElementById('gamesList');
        if (regionsTree) regionsTree.classList.remove('hidden');
        if (gamesList) gamesList.classList.add('hidden');
        
        if (typeof startPrematchStream === 'function') {
          startPrematchStream(currentSport.id, currentSport.name);
        }
      } else {
        await loadFilteredPrematchGames();
      }
    }
  });
}

async function loadFilteredPrematchGames() {
  console.log('loadFilteredPrematchGames called, currentSport:', currentSport);
  if (!currentSport) return;

  // Capture sport at call time to avoid race conditions
  const sportId = currentSport.id;
  const sportName = currentSport.name;

  // Stop the normal prematch stream
  if (typeof stopPrematchStream === 'function') {
    stopPrematchStream();
  }

  // Hide regionsTree, show gamesList
  const regionsTree = document.getElementById('regionsTree');
  const gamesList = document.getElementById('gamesList');
  if (regionsTree) regionsTree.classList.add('hidden');
  if (!gamesList) return;
  gamesList.classList.remove('hidden');
  
  // Update header
  const sportNameEl = document.getElementById('selectedSportName');
  if (sportNameEl) {
    const icon = (typeof sportIcons !== 'undefined' && sportIcons[sportName]) || '⚽';
    sportNameEl.innerHTML = `${icon} ${sportName}`;
  }
  
  gamesList.innerHTML = '<div class="loading">Loading filtered games...</div>';

  try {
    // Use the full games endpoint
    const url = `/api/games-by-time?sportId=${sportId}&hours=${activeTimeFilter === 'today' ? 24 : activeTimeFilter}`;
    console.log('Fetching:', url);

    const res = await fetch(url);
    const data = await res.json();
    console.log('Response:', data.count, 'games');

    // Check if sport changed during fetch
    if (currentSport?.id !== sportId) {
      console.log('Sport changed during fetch, ignoring response');
      return;
    }

    if (data.games && data.games.length > 0) {
      renderFilteredGames(data.games, gamesList);
      updateSidebarCountForFilter(data.games.length);
    } else {
      const label = activeTimeFilter === 'today' ? 'today' : `next ${activeTimeFilter}h`;
      gamesList.innerHTML = `<div class="empty-state">No games ${label}</div>`;
      updateSidebarCountForFilter(0);
    }
  } catch (e) {
    console.error('Filter error:', e);
    gamesList.innerHTML = `<div class="error">Error: ${e.message}</div>`;
  }
}

function renderFilteredGames(games, container) {
  console.log('renderFilteredGames called with', games.length, 'games');
  filteredGames = games; // Store for click handlers
  
  // Group by competition
  const byComp = {};
  for (const g of games) {
    const key = g.competition || 'Other';
    if (!byComp[key]) byComp[key] = [];
    byComp[key].push(g);
  }

  let html = '';
  for (const [comp, compGames] of Object.entries(byComp)) {
    html += `<div class="competition-group">
      <div class="competition-header">${comp} <span class="game-count">(${compGames.length})</span></div>`;
    
    for (const g of compGames) {
      const time = g.start_ts ? new Date(g.start_ts * 1000) : null;
      const dateStr = time ? time.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : '-';
      const timeStr = time ? time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-';
      const fav1 = g.strong_team === 1 ? '<span class="favorite-star">⭐</span>' : '';
      const fav2 = g.strong_team === 2 ? '<span class="favorite-star">⭐</span>' : '';
      const roundBadge = g.round ? `<span class="game-round">R${g.round}</span>` : '';

      html += `
        <div class="game-row" data-game-id="${g.id}" data-server-game-id="${g.id}">
          <div class="game-time">
            <div class="game-date">${dateStr}${roundBadge}</div>
            <div class="game-hour">${timeStr}</div>
          </div>
          <div class="game-teams">
            <div class="team-name">${fav1}${g.team1_name || 'Team 1'}</div>
            <div class="team-name">${fav2}${g.team2_name || 'Team 2'}</div>
          </div>
          <div class="game-odds">
            <div class="more-markets-pill">+${g.markets_count || 0}</div>
          </div>
        </div>`;
    }
    
    html += '</div>';
  }

  console.log('Setting innerHTML, length:', html.length);
  container.innerHTML = html;
  
  // Update count
  const countEl = document.getElementById('gamesCount');
  if (countEl) countEl.textContent = `${games.length} games`;
  
  // Add click handlers for game rows
  container.querySelectorAll('.game-row').forEach(row => {
    row.addEventListener('click', () => {
      const gameId = row.dataset.gameId;
      const game = filteredGames.find(g => String(g.id) === String(gameId));
      if (game) {
        // Remove previous selection
        container.querySelectorAll('.game-row.selected').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        
        selectedGame = game;
        
        // Start live game stream for markets
        if (typeof startLiveGameStream === 'function') {
          startLiveGameStream(gameId);
        }
        
        // Show details
        if (typeof showGameDetails === 'function') {
          showGameDetails(game);
        }
        
        // Show panel
        const panel = document.getElementById('gameDetails');
        if (panel) {
          if (typeof isMobileLayout === 'function' && isMobileLayout()) {
            if (typeof openMobileDetails === 'function') openMobileDetails();
          } else {
            panel.classList.remove('hidden');
          }
        }
      }
    });
  });
}

// Update sidebar count for current sport when filter is active
function updateSidebarCountForFilter(count) {
  if (!currentSport) return;
  const sportItem = document.querySelector(`.sport-item[data-id="${currentSport.id}"]`);
  if (sportItem) {
    const countEl = sportItem.querySelector('.sport-count');
    if (countEl) countEl.textContent = count;
  }
}

// Show/hide time filters based on mode
function updateTimeFiltersVisibility() {
  const container = document.getElementById('timeFilters');
  if (!container) return;
  
  const regionsTree = document.getElementById('regionsTree');
  const gamesList = document.getElementById('gamesList');
  
  if (currentMode === 'prematch') {
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
    // Reset to "All" when leaving prematch
    activeTimeFilter = 0;
    container.querySelectorAll('.time-filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.hours === '0');
    });
    // Restore normal view
    if (regionsTree) regionsTree.classList.remove('hidden');
    if (gamesList) gamesList.classList.add('hidden');
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initTimeFilters);
