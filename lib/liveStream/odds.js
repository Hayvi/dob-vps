function getSportMainMarketTypePriority(sportName) {
  const n = String(sportName || '').toLowerCase();
  if (n.includes('football')) return ['P1XP2', 'W1XW2', '1X2', 'MATCH_RESULT', 'MATCHRESULT'];
  return ['P1P2', 'P1XP2', 'W1W2', 'W1XW2'];
}

function pickPreferredMarketFromEmbedded(marketMap, typePriority) {
  if (!marketMap || typeof marketMap !== 'object') return null;
  const markets = Object.values(marketMap).filter(Boolean);
  if (markets.length === 0) return null;

  const pri = Array.isArray(typePriority) ? typePriority.map(String) : [];
  for (const t of pri) {
    const tt = String(t || '').toUpperCase();
    const byType = markets.filter(m => String(m?.type || '').toUpperCase() === tt);
    if (byType.length) {
      byType.sort((a, b) => (a?.order ?? Number.MAX_SAFE_INTEGER) - (b?.order ?? Number.MAX_SAFE_INTEGER));
      return byType[0];
    }
  }

  // Fallback: pick first market by order (for sports with different market types)
  const sorted = markets.slice().sort((a, b) => (a?.order ?? Number.MAX_SAFE_INTEGER) - (b?.order ?? Number.MAX_SAFE_INTEGER));
  return sorted[0] || null;
}

function mapEventLabel(e) {
  const t = String(e?.type || '').toUpperCase();
  if (t === 'P1') return '1';
  if (t === 'P2') return '2';
  if (t === 'X') return 'X';

  const n = String(e?.name || '').toLowerCase();
  if (n === 'x' || n.includes('draw')) return 'X';
  return '';
}

function buildOddsArrFromMarket(market) {
  const marketBlocked = market?.is_blocked === true || market?.is_blocked === 1;
  const events = market?.event && typeof market.event === 'object' ? Object.values(market.event) : [];
  const ordered = events
    .filter(Boolean)
    .slice()
    .sort((a, b) => {
      const ao = a?.order ?? Number.MAX_SAFE_INTEGER;
      const bo = b?.order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
    });

  const odds = ordered.map((e, idx) => {
    const label = mapEventLabel(e) || (ordered.length === 2
      ? (idx === 0 ? '1' : '2')
      : (idx === 0 ? '1' : (idx === 1 ? 'X' : '2')));
    
    const eventBlocked = e?.is_blocked === true || e?.is_blocked === 1;

    return {
      label,
      price: e?.price,
      blocked: marketBlocked || eventBlocked
    };
  });

  if (odds.length === 2) return odds;
  if (odds.length === 3) return odds;
  return null;
}

module.exports = {
  getSportMainMarketTypePriority,
  pickPreferredMarketFromEmbedded,
  buildOddsArrFromMarket
};
