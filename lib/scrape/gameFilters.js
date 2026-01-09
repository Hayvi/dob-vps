function filterGamesByTypeParam(games, type) {
  if (!type) return games;

  if (type === 'live') {
    return (Array.isArray(games) ? games : []).filter(g => Number(g?.type) === 1);
  }

  if (type === 'prematch') {
    return (Array.isArray(games) ? games : []).filter(g => {
      const t = Number(g?.type);
      return t === 0 || t === 2;
    });
  }

  return games;
}

function filterPrematchAndOutright(games) {
  return (Array.isArray(games) ? games : []).filter(g => {
    const t = Number(g?.type);
    return t === 0 || t === 2;
  });
}

module.exports = {
  filterGamesByTypeParam,
  filterPrematchAndOutright
};
