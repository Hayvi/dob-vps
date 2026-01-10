# Missing Features from Swarm API

## ✅ Completed

### Competition Favorites ✓
- Competitions sorted by favorite status, then favorite_order, then order
- ⭐ star icon shown for favorite competitions
- Premier League, La Liga, Champions League, World Cup appear first

### Market Display Organization ✓
- Tabs use `display_key` from API (Winner, Totals, Handicap, Halves, Corners, Cards)
- `display_color` shown as left border on market sections
- `display_sub_key` used for period/half detection

### Optimal Markets Flag ✓
- `optimal: true` markets show ⚡ badge

### New Markets Badge ✓
- `is_new: true` markets show "NEW" badge

## 🔴 Not Implemented

### 1. Live Streaming / TV Integration
- `tv_type`, `video_id`, `video_id2`, `video_id3` - embed live video
- 91 prematch games have streaming available
- `sportcast_id` for alternative provider

### 2. Asian Handicap Base Values
- `base` field on events: -59.5 to +59.5
- Quarter handicaps (-0.25, -0.75, etc.)

### 3. Express/Combo Bet IDs
- `express_id` and `prematch_express_id` on markets
- Determines which markets can combine in parlays

### 4. Cashout Functionality
- `cashout: 1` on markets - badge shown, no actual feature

### 5. Bet Builder Markets
- `available_for_betbuilder: true` - same-game parlay markets

### 6. Promoted Games
- `promoted: true` on games - feature at top of list

## 🟡 Partially Implemented

| Feature | Status |
|---------|--------|
| `live_events` timeline | ✅ Have data, show in UI |
| `stats` | ✅ Have data, show in UI |
| `cashout` badge | ✅ Badge only |
| `betbuilder` badge | ✅ Badge only |
| `promoted` games | ⚠️ Not using |
| `favorite_order` | ✅ Now sorting by it |

## 🎯 Priority Order

1. ~~Competition Favorites sorting~~ ✅
2. ~~Market Display Keys reorganization~~ ✅
3. Live Streaming Widget
4. Promoted Games featuring
5. Asian Handicap display improvements
