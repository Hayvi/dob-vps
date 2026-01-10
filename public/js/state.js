// State
let hierarchy = null;
let currentSport = null;
let currentCompetition = null;
let currentGames = [];
let selectedGame = null;
let currentMode = 'prematch'; // 'prematch', 'live', 'results'

let sportsWithPrematchGames = null;
let sportsWithLiveGames = null;
let sportsWithResults = null;

let sportsCountsPrematch = null;
let sportsCountsLive = null;
let sportsCountsResults = null;

let totalGamesPrematch = null;
let totalGamesLive = null;
let totalGamesResults = null;

// Sport icons mapping
const sportIcons = {
  'Football': '⚽', 'Basketball': '🏀', 'Tennis': '🎾', 'Ice Hockey': '🏒',
  'Volleyball': '🏐', 'Handball': '🤾', 'Baseball': '⚾', 'American Football': '🏈',
  'Table Tennis': '🏓', 'Cricket': '🏏', 'Rugby': '🏉', 'Golf': '⛳',
  'Boxing': '🥊', 'MMA': '🥋', 'Darts': '🎯', 'Snooker': '🎱',
  'Chess': '♟️', 'Cycling': '🚴', 'Formula 1': '🏎️', 'default': '🏆'
};

// Region flags
const regionFlags = {
  'Europe': '🇪🇺', 'World': '🌍', 'England': '🏴', 'Spain': '🇪🇸',
  'Germany': '🇩🇪', 'Italy': '🇮🇹', 'France': '🇫🇷', 'Africa': '🌍',
  'Asia': '🌏', 'America': '🌎', 'default': '🏳️'
};

// UI Elements & Mode Logic
const btnModePrematch = document.getElementById('modePrematch');
const btnModeLive = document.getElementById('modeLive');
const btnModeResults = document.getElementById('modeResults');
const btnModeUpcoming = document.getElementById('modeUpcoming');

function setMode(mode) {
  currentMode = mode;

  // Stop streams that don't apply to new mode
  if (mode !== 'live' && typeof stopLiveStream === 'function') {
    stopLiveStream();
  }
  if (mode !== 'prematch' && typeof stopPrematchStream === 'function') {
    stopPrematchStream();
  }
  if (mode !== 'upcoming' && typeof stopUpcomingStream === 'function') {
    stopUpcomingStream();
  }

  // Update UI
  [btnModePrematch, btnModeLive, btnModeResults, btnModeUpcoming].forEach(btn => btn?.classList.remove('active'));

  const activeBtn = document.getElementById(`mode${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Hide time filters for non-prematch modes
  const timeFiltersEl = document.getElementById('timeFilters');
  if (timeFiltersEl) {
    timeFiltersEl.classList.toggle('hidden', mode !== 'prematch');
  }

  // Trigger data refresh
  renderSportsList();

  // Clear current games view to indicate switch
  currentGames = [];
  const gamesListEl = document.getElementById('gamesList');
  if (gamesListEl) gamesListEl.innerHTML = '';
  document.getElementById('gamesCount').textContent = '0 games';

  if (mode === 'upcoming') {
    // Upcoming mode doesn't need sport selection
    if (typeof startUpcomingStream === 'function') {
      startUpcomingStream(2);
    }
  } else if (currentSport) {
    // Reload based on new mode
    if (mode === 'live') {
      if (typeof startLiveStream === 'function') {
        startLiveStream(currentSport?.id || null);
      }
    } else if (mode === 'results') {
      loadResultGames(currentSport.id, currentSport.name);
    } else if (mode === 'prematch') {
      if (typeof activeTimeFilter !== 'undefined' && activeTimeFilter !== 0) {
        if (typeof loadFilteredPrematchGames === 'function') {
          loadFilteredPrematchGames();
        }
      } else if (typeof startPrematchStream === 'function') {
        startPrematchStream(currentSport?.id);
      }
    }
  } else if (mode === 'live') {
    if (typeof startLiveStream === 'function') {
      startLiveStream(null);
    }
  }
}

if (btnModePrematch) btnModePrematch.addEventListener('click', () => setMode('prematch'));
if (btnModeLive) btnModeLive.addEventListener('click', () => setMode('live'));
if (btnModeResults) btnModeResults.addEventListener('click', () => setMode('results'));
if (btnModeUpcoming) btnModeUpcoming.addEventListener('click', () => setMode('upcoming'));
