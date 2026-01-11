// Rendering
function renderSportsList() {


  if (!hierarchy || !hierarchy.sport) {
    sportsList.innerHTML = '<div class="loading">No sports data available</div>';
    return;
  }

  const sports = Object.entries(hierarchy.sport).map(([id, sport]) => ({
    id,
    name: sport.name,
    alias: sport.alias,
    order: sport.order || 999
  }))
    .filter(sport => {
      if (currentSport && String(currentSport.id) === String(sport.id)) return true; // Always show current selected sport

      if (currentMode === 'upcoming') {
        return sportsCountsUpcoming instanceof Map ? (sportsCountsUpcoming.get(String(sport.name).toLowerCase()) || 0) > 0 : true;
      }

      // Existing logic for other modes
      if (currentMode === 'live') {
        return sportsWithLiveGames instanceof Set ? sportsWithLiveGames.has(String(sport.name).toLowerCase()) : true;
      } else if (currentMode === 'results') {
        return sportsWithResults instanceof Set ? sportsWithResults.has(String(sport.name).toLowerCase()) : true;
      } else { // Prematch
        return sportsWithPrematchGames instanceof Set ? sportsWithPrematchGames.has(String(sport.name).toLowerCase()) : true;
      }
    })
    .sort((a, b) => a.order - b.order);

  let counts;
  let totalGamesForMode = 0;
  if (currentMode === 'live') {
    counts = sportsCountsLive;
    totalGamesForMode = totalGamesLive;
  } else if (currentMode === 'results') {
    counts = sportsCountsResults;
    totalGamesForMode = totalGamesResults;
  } else if (currentMode === 'upcoming') {
    counts = sportsCountsUpcoming;
    totalGamesForMode = totalGamesUpcoming;
  } else {
    counts = sportsCountsPrematch;
    totalGamesForMode = totalGamesPrematch;
  }

  document.getElementById('totalSports').textContent = totalGamesForMode;

  sportsList.innerHTML = sports.map(sport => {
    const isActive = Boolean(currentSport && String(currentSport.id) === String(sport.id));
    const count = counts instanceof Map ? counts.get(String(sport.name).toLowerCase()) : null;
    const countDisplay = count === null || count === undefined ? '' : count;
    return `
    <div class="sport-item ${isActive ? 'active' : ''}" data-id="${sport.id}" data-name="${sport.name}">
      <div class="sport-info">
        <span class="sport-icon">${sportIcons[sport.name] || sportIcons.default}</span>
        <span class="sport-name">${sport.name}</span>
      </div>
      <span class="sport-count">${countDisplay}</span>
    </div>
  `;
  }).join('');

  // Add click handlers
  sportsList.querySelectorAll('.sport-item').forEach(item => {
    item.addEventListener('click', () => {
      sportsList.querySelectorAll('.sport-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      if (currentMode === 'results') {
        loadResultGames(item.dataset.id, item.dataset.name);
      } else if (currentMode === 'prematch') {
        // Use subscription-based stream for prematch (instant!)
        currentSport = { id: item.dataset.id, name: item.dataset.name };
        // Show loading state
        welcomeScreen.classList.add('hidden');
        gamesContainer.classList.remove('hidden');
        document.getElementById('selectedSportName').textContent = item.dataset.name;
        
        // Check if time filter is active
        if (typeof activeTimeFilter !== 'undefined' && activeTimeFilter !== 0) {
          if (typeof loadFilteredPrematchGames === 'function') {
            loadFilteredPrematchGames();
          }
        } else if (typeof startPrematchStream === 'function') {
          startPrematchStream(item.dataset.id);
        }
      } else if (currentMode === 'live') {
        // Use subscription-based stream for live
        currentSport = { id: item.dataset.id, name: item.dataset.name };
        if (typeof startLiveStream === 'function') {
          startLiveStream(item.dataset.id);
        }
        welcomeScreen.classList.add('hidden');
        gamesContainer.classList.remove('hidden');
        document.getElementById('selectedSportName').textContent = item.dataset.name;
      }
      closeMobileSidebar();
    });
  });
}

function filterSports(query) {
  const items = sportsList.querySelectorAll('.sport-item');
  const lowerQuery = query.toLowerCase();
  items.forEach(item => {
    const name = item.dataset.name.toLowerCase();
    item.style.display = name.includes(lowerQuery) ? 'flex' : 'none';
  });
}
