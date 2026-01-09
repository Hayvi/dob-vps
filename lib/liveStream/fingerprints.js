function getGameFp(data) {
  const markets = data && typeof data === 'object' ? (data.market || {}) : {};
  const parts = [];
  for (const [mid, m] of Object.entries(markets || {}).sort(([a], [b]) => String(a).localeCompare(String(b)))) {
    const events = m?.event ? Object.values(m.event) : [];
    const evParts = events
      .slice()
      .sort((a, b) => {
        const ao = a?.order ?? Number.MAX_SAFE_INTEGER;
        const bo = b?.order ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
      })
      .map(e => `${String(e?.id ?? '')}:${String(e?.price ?? '')}:${String(e?.base ?? '')}`)
      .join(',');
    parts.push(`${String(mid)}|${String(m?.id ?? '')}|${String(m?.type ?? '')}|${String(m?.display_key ?? '')}|${evParts}`);
  }
  return parts.join('~');
}

function getCountsFp(sports) {
  return (Array.isArray(sports) ? sports : [])
    .filter(s => s && s.name)
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map(s => `${String(s.name)}:${Number(s.count) || 0}`)
    .join('|');
}

function getSportFp(games) {
  return (Array.isArray(games) ? games : [])
    .map(g => {
      const id = g?.id ?? g?.gameId ?? '';
      const info = g?.info && typeof g.info === 'object' ? g.info : {};
      // text_info is the most reliable score source (pre-formatted by API)
      const textInfo = g?.text_info ?? '';
      const score = info.score ?? info.ss ?? info.score_str ?? info.scoreString ?? info.current_score ?? '';
      const clock = info.current_game_time ?? info.time ?? info.timer ?? info.match_time ?? info.minute ?? info.min ?? '';
      const phase = info.current_game_state ?? info.period ?? info.period_name ?? info.stage ?? info.phase ?? '';
      const add = info.add_minutes ?? info.added_minutes ?? info.addMinutes ?? info.addedMinutes ?? '';
      const mc = g?.markets_count ?? '';
      // Include text_info in fingerprint for accurate change detection
      return `${String(id)}|${String(mc)}|${String(textInfo)}|${String(score)}|${String(phase)}|${String(clock)}|${String(add)}`;
    })
    .sort()
    .join('~');
}

function getOddsFp(market) {
  if (!market) return '';
  const events = market?.event && typeof market.event === 'object' ? Object.values(market.event) : [];
  const ordered = events
    .filter(Boolean)
    .slice()
    .sort((a, b) => {
      const ao = a?.order ?? Number.MAX_SAFE_INTEGER;
      const bo = b?.order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
    })
    .map(e => `${String(e?.id ?? '')}:${String(e?.price ?? '')}:${String(e?.base ?? '')}`)
    .join(',');
  return `${String(market?.id ?? '')}|${String(market?.type ?? '')}|${String(market?.display_key ?? '')}|${ordered}`;
}

module.exports = {
  getGameFp,
  getCountsFp,
  getSportFp,
  getOddsFp
};
