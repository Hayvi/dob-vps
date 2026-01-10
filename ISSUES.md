# Known Issues & Investigation Notes

## Fixed Issues

### 1. Event Type Mapping (Fixed 2026-01-10)
- **Problem**: Yellow cards showed as red cards, red cards showed incorrectly
- **Cause**: Swarm API uses `type_id: "3"` for Yellow Cards, not Red Cards as assumed
- **Fix**: Updated event type mapping in `stats.js` and `liveMeta.js`

### 2. Region Ordering (Fixed 2026-01-10)
- **Problem**: Regions displayed alphabetically instead of Forzza's custom order
- **Cause**: `region_order` field wasn't being extracted from API data
- **Fix**: Added `region_order` to `parseGamesFromData.js` and sorting in `treeRender.js`

### 3. Blocked State Sync (Fixed 2026-01-10)
- **Problem**: Game row showed blocked/unblocked state before details panel updated
- **Cause**: Details panel only re-rendered on market updates, not `is_blocked` changes
- **Fix**: Added `is_blocked` change detection in `livePayloads.js` and `prematchStream.js`

### 4. No Markets Infinite Loading (Fixed 2026-01-10)
- **Problem**: "Loading markets..." shown indefinitely when game has no markets
- **Cause**: Code didn't check `markets_count === 0` before showing loading state
- **Fix**: Added check in `details.js` to show "No events are available" when `markets_count` is 0

---

## Potential Issues (To Investigate)

### 1. Second Yellow Card → Red Card Display
- **Status**: Needs verification
- **Question**: When a player gets a second yellow card (sent off), does the API send:
  - A second type 3 (yellow) event?
  - A different type (red card)?
  - Both events?
- **Forzza behavior**: May display second yellow differently than first
- **Action**: Monitor live games with red cards to capture actual API data

### 2. VAR Review Events (Type 328)
- **Status**: Needs verification
- **Question**: Are VAR events displaying correctly with 📺 icon?
- **Action**: Find a game with VAR review to test

### 3. Penalty Events (Type 5)
- **Status**: Needs verification
- **Question**: Does type 5 cover both scored and missed penalties?
- **Forzza shows**: "Penalty 24' Shrewsbury Town" - unclear if scored/missed
- **Action**: Check if there's a separate type for missed penalties

### 4. Event Deduplication
- **Status**: Needs investigation
- **Observation**: Some events appear duplicated in `live_events` array (same time, same type)
- **Example**: Multiple corner events at exact same timestamp
- **Action**: May need to deduplicate by time + type_id + side

### 5. Red Card Type ID
- **Status**: Unknown
- **Question**: What is the actual type_id for red cards?
- **Current mapping**: Type 15 assumed for red cards (unverified)
- **Action**: Find a game with actual red card to verify

---

## Event Type Mapping Reference

```javascript
// Current mapping (Swarm API)
'1': Goal
'3': Yellow Card  // Confirmed
'4': Corner
'5': Penalty
'6': Substitution
'7': Injury
'8': Half Time
'9': Full Time
'10': Shot on Target
'11': Shot off Target
'12': Save
'13': Offside
'14': Foul
'15': Red Card (assumed, unverified)
'20': Dangerous Attack
'328': VAR Review
```

---

## Testing Checklist

- [ ] Yellow card displays correctly
- [ ] Red card displays correctly (need live data)
- [ ] Second yellow → red card scenario
- [ ] VAR review displays correctly
- [ ] Penalty scored vs missed
- [ ] Event deduplication working
- [ ] Region order matches Forzza
- [ ] Competition order matches Forzza
- [ ] Blocked/suspended state syncs properly
- [ ] "No events available" shows when markets_count = 0
