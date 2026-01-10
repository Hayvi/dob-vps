# Missing Features from Swarm API

## 🔴 Not Implemented

### 1. Live Streaming / TV Integration
- `tv_type`, `video_id`, `video_id2`, `video_id3` - embed live video
- 91 prematch games have streaming available
- `sportcast_id` for alternative provider

### 2. Market Display Organization
- `display_key` - Main category (WINNER, TOTALS, HANDICAP, CORRECT SCORE, etc.)
- `display_sub_key` - Sub-category (MATCH, PERIOD, SET, HALF, etc.)
- `display_color` - 92 unique colors for visual grouping

### 3. Optimal Markets Flag
- `optimal: true` - 641/6811 markets marked as recommended
- Should highlight in UI

### 4. New Markets Badge
- `is_new: true` - 193 markets marked as new
- "Ending - Teams Score Last Digits" markets are new

### 5. Competition Favorites
- `favorite: true` and `favorite_order` on competitions
- Premier League, La Liga, Champions League, World Cup
- Show prominently / sort first

### 6. Asian Handicap Base Values
- `base` field on events: -59.5 to +59.5
- Quarter handicaps (-0.25, -0.75, etc.)

### 7. Express/Combo Bet IDs
- `express_id` and `prematch_express_id` on markets
- Determines which markets can combine in parlays

### 8. Cashout Functionality
- `cashout: 1` on markets - badge shown, no actual feature

### 9. Bet Builder Markets
- `available_for_betbuilder: true` - same-game parlay markets

### 10. Additional Market Groups
- Corners, Cards, Players, Minutes, Quarters, Sets, Frames, Fouls, Wickets, Overs

## 🟡 Partially Implemented

| Feature | Status |
|---------|--------|
| `live_events` timeline | ✅ Have data, show in UI |
| `stats` | ✅ Have data, show in UI |
| `cashout` badge | ✅ Badge only |
| `betbuilder` badge | ✅ Badge only |
| `promoted` games | ⚠️ Not using |
| `favorite_order` | ⚠️ Not sorting by it |

## 🎯 Priority Order

1. Live Streaming Widget
2. Market Display Keys reorganization
3. Optimal Markets highlight
4. Competition Favorites sorting
5. Market Colors
6. New Markets Badge
7. Promoted Games featuring
