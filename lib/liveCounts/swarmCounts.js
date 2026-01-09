const { unwrapSwarmData } = require('../swarm/unwrap');

function normalizeSwarmResponse(rawData) {
  return unwrapSwarmData(rawData);
}

function extractSportsCountsFromSwarm(rawData) {
  const data = normalizeSwarmResponse(rawData);
  const sports = [];

  if (data && data.sport) {
    for (const s of Object.values(data.sport)) {
      const name = s?.name;
      const count = s?.game ? Object.keys(s.game).length : 0;
      if (name && count > 0) {
        sports.push({ name, count });
      }
    }
  }

  const totalGames = sports.reduce((sum, s) => sum + (Number(s?.count) || 0), 0);
  return { sports, totalGames };
}

module.exports = {
  normalizeSwarmResponse,
  extractSportsCountsFromSwarm
};
