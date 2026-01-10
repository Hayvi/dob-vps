function renderGames(sportName, games, lastUpdated, pagination, options = {}) {
  // Don't overwrite if time filter is active in prematch mode
  if (currentMode === 'prematch' && typeof activeTimeFilter !== 'undefined' && activeTimeFilter !== 0) {
    return;
  }
  
  welcomeScreen.classList.add('hidden');
  gamesContainer.classList.remove('hidden');

  document.getElementById('selectedSportName').innerHTML = `
    ${sportIcons[sportName] || sportIcons.default} ${sportName}
  `;

  const total = pagination?.total || games.length;
  document.getElementById('gamesCount').textContent = `${total} games`;
  document.getElementById('lastUpdated').textContent = lastUpdated ?
    `Updated: ${new Date(lastUpdated).toLocaleString()}` : '';

  // Group by region and competition
  const grouped = groupGames(games);
  renderRegionsTree(grouped, options);
  // Clear game details
  if (!options || !options.preserveDetails) {
    clearGameDetails();
  }
}
