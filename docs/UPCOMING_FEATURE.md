# Upcoming Matches Feature

## Discovery

Forzza has an "Upcoming" tab showing games starting soon. They use the Swarm `@now` operator for server-side relative time filtering.

## Swarm Query

```javascript
{
  source: 'betting',
  what: {
    sport: ['id', 'name', 'alias'],
    region: ['id', 'name'],
    competition: ['id', 'name'],
    game: ['id', 'team1_name', 'team2_name', 'start_ts', 'type', 'is_blocked', 'markets_count', 'info', ...]
  },
  where: {
    sport: { type: { '@nin': [1, 4] } },
    game: {
      type: { '@in': [0, 2] },  // prematch + outright
      start_ts: { '@now': { '@gte': 0, '@lte': 7200 } }  // within 2 hours from now
    }
  },
  subscribe: true
}
```

The `@now` operator is server-side relative time - subscriptions auto-update as games enter/exit the time window.

## Test Results (2026-01-10 21:23 UTC)

- **167 games** starting in next 2 hours
- By sport: Football (34), Basketball (59), Ice Hockey (15), Table Tennis (28), Tennis (6), etc.

## Implementation Plan

1. **Backend**: Add `/api/upcoming-stream` SSE endpoint
2. **Backend**: Add `subscribeToUpcoming(hours)` method in scraper
3. **Frontend**: Add "Upcoming" tab in mode selector
4. **Frontend**: Wire up SSE stream similar to prematch

## Files to Modify

- `scraper.js` - add subscription method
- `routes/` - new upcoming stream route
- `public/index.html` - add tab
- `public/js/api/` - add upcoming stream handler
- `public/js/renderGames/` - handle upcoming mode
