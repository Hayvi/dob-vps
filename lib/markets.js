function pickMainMarket(markets) {
    if (!Array.isArray(markets) || markets.length === 0) return null;

    const sortByOrderAsc = (a, b) => {
        const ao = a?.original_order ?? a?.order ?? Number.MAX_SAFE_INTEGER;
        const bo = b?.original_order ?? b?.order ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
    };

    const marketText = (m) => `${m?.name || ''} ${m?.type || ''} ${m?.display_key || ''}`.toLowerCase();

    const isExcludedMainMarket = (m) => {
        const s = marketText(m);
        if (!s) return false;
        return /winning\s*margin|victory\s*margin|margin\s*of\s*victory|win\s*by/i.test(s);
    };

    const isSubMatchWinnerMarket = (m) => {
        const s = marketText(m);
        if (!s) return false;
        if (/(^|[^a-z0-9])(set|game|point|period|quarter|inning|frame|map|round)([^a-z0-9]|$)/i.test(s)) return true;
        if (/(^|[^a-z0-9])(1st|2nd|3rd|4th|first|second|third|fourth)\s*(set|game|half|period|quarter|inning|frame|map|round)([^a-z0-9]|$)/i.test(s)) return true;
        return false;
    };

    const isHalfTimeMarket = (m) => {
        const s = marketText(m);
        return s.includes('half') || s.includes('halftime') || /(^|[^a-z0-9])ht([^a-z0-9]|$)/i.test(s);
    };

    const preferFullTime = (candidates) => {
        if (!Array.isArray(candidates) || candidates.length === 0) return null;
        const ordered = candidates.slice().sort(sortByOrderAsc);
        return ordered.find(m => !isHalfTimeMarket(m)) || null;
    };

    const nonSubMarkets = markets.filter(m => !isSubMatchWinnerMarket(m));
    const eligibleMarkets = nonSubMarkets.filter(m => !isExcludedMainMarket(m));

    const byDisplayKeyCandidates = eligibleMarkets.filter(m => {
        const k = String(m?.display_key || '').toLowerCase();
        if (k === 'winner') {
            const n = String(m?.name || '').toLowerCase();
            return n === 'winner' || n === 'match winner' || n.includes('match');
        }
        return k.includes('1x2') || k.includes('w1xw2') || k.includes('match_result') || k.includes('matchresult') || k.includes('matchwinner') || k.includes('match_winner');
    });
    const byDisplayKey = preferFullTime(byDisplayKeyCandidates);
    if (byDisplayKey) return byDisplayKey;

    const byTypeCandidates = eligibleMarkets.filter(m => {
        const t = String(m?.type || '').toLowerCase();
        if (t === 'winner') {
            const n = String(m?.name || '').toLowerCase();
            return n === 'winner' || n === 'match winner' || n.includes('match');
        }
        return t.includes('matchresult') || t.includes('w1xw2') || t.includes('1x2') || t.includes('matchwinner');
    });
    const byType = preferFullTime(byTypeCandidates);
    if (byType) return byType;

    const byNameCandidates = eligibleMarkets.filter(m => {
        const n = String(m?.name || '').toLowerCase();
        const events = m?.event ? Object.values(m.event) : [];
        const hasValidCols = events.length === 2 || events.length === 3;
        if (!hasValidCols) return false;
        if (n.includes('match') && (n.includes('winner') || n.includes('result') || n.includes('1x2'))) return true;
        if (n === 'match winner') return true;
        if (n === 'winner') return true;
        return false;
    });
    const byName = preferFullTime(byNameCandidates);
    if (byName) return byName;

    const byDrawCandidates = eligibleMarkets.filter(m => {
        const events = m?.event ? Object.values(m.event) : [];
        if (events.length !== 3) return false;
        return events.some(e => String(e?.name || '').toLowerCase().includes('draw')) || events.some(e => String(e?.name || '').toLowerCase() === 'x');
    });
    const byDraw = preferFullTime(byDrawCandidates);
    if (byDraw) return byDraw;

    return null;
}

module.exports = { pickMainMarket };
