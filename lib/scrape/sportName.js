async function resolveSportNameFromHierarchy(scraper, sportId, fallbackName) {
  const hierarchy = await scraper.getHierarchy().catch(() => null);
  const sports = hierarchy?.data?.sport || hierarchy?.sport || {};
  if (sports && sports[sportId] && sports[sportId].name) {
    return sports[sportId].name;
  }
  return fallbackName;
}

function normalizeSportNameFromQuery(sportName) {
  return String(sportName || '').replace(/_/g, ' ');
}

module.exports = {
  resolveSportNameFromHierarchy,
  normalizeSportNameFromQuery
};
