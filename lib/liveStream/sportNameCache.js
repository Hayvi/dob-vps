function createGetSportName(scraper) {
  let sportNameCache = null;
  let sportNameCacheExpiresAt = 0;

  const ensureSportNameCache = async () => {
    const now = Date.now();
    if (sportNameCache && sportNameCacheExpiresAt > now) return;
    try {
      const raw = await scraper.getHierarchy();
      const h = raw?.data || raw;
      const sports = h?.sport || h?.data?.sport || {};
      const map = new Map();
      for (const [id, s] of Object.entries(sports || {})) {
        if (s?.name) map.set(String(id), String(s.name));
      }
      sportNameCache = map;
      sportNameCacheExpiresAt = now + 5 * 60 * 1000;
    } catch (e) {
      sportNameCache = null;
      sportNameCacheExpiresAt = now + 30 * 1000;
    }
  };

  const getSportName = async (sportId) => {
    await ensureSportNameCache();
    if (sportNameCache instanceof Map) {
      return sportNameCache.get(String(sportId)) || String(sportId);
    }
    return String(sportId);
  };

  return getSportName;
}

module.exports = {
  createGetSportName
};
