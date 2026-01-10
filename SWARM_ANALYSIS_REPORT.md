# Swarm API Data Consumption Analysis Report

## Executive Summary

After deep analysis of the Forzza Swarm WebSocket API (`wss://eu-swarm-newm.vmemkhhgjigrjefb.com/`), I've identified several key insights about data consumption patterns and potential mismatches between the current implementation and optimal usage.

## Key Findings

### ✅ What's Working Correctly

1. **WebSocket Connection**: Stable connection with proper session management
2. **Subscription System**: Real-time updates are being received correctly
3. **Message Handling**: Both `rid=0` and legacy subscription formats work
4. **Data Filtering**: Forzza's exact filters are implemented correctly

### 🔍 Discovered Patterns

#### Subscription Update Frequency
- **Live Games**: ~18 updates in 30 seconds (very active)
- **Prematch Games**: ~11 updates in 30 seconds (moderate activity)  
- **Count Monitoring**: ~4 updates in 30 seconds (periodic changes)

#### Data Volume Insights
- **Live Games**: 294 active games across 22 sports
- **Football Prematch**: 1,111 games with broad filter vs ~few with Forzza's exact filter
- **Sports Hierarchy**: 83 sports available

#### Update Content Analysis
```json
// Typical live game update (incremental)
{
  "sport": {
    "1": {
      "game": {
        "28683703": {
          "markets_count": 117,
          "is_blocked": 1
        }
      }
    }
  }
}
```

## Potential Mismatches & Optimizations

### 1. **Prematch Game Filtering Discrepancy**

**Issue**: The current implementation uses Forzza's exact filter:
```javascript
game: {
  '@or': [
    { 'visible_in_prematch': 1 },
    { 'type': { '@in': [0, 2] } }
  ]
}
```

**Finding**: This returns very few games compared to a simpler `type: [0, 2]` filter (1,111 games).

**Recommendation**: Test if Forzza's website uses a different filter or if `visible_in_prematch` is not being set correctly by the API.

### 2. **Subscription Message Format Handling**

**Current Implementation**: Handles both formats:
- Legacy: `{ subid: "123", data: {...} }`
- New: `{ rid: 0, data: { "123": {...} } }`

**Finding**: Both formats are working, but the new format might be more efficient for multiple subscriptions.

### 3. **Update Processing Efficiency**

**Current Approach**: Applies incremental updates correctly using `_applyUpdate()`

**Potential Optimization**: The current implementation processes all updates, but Forzza might be batching or throttling certain update types.

### 4. **Count Subscription Strategy**

**Current**: Separate subscriptions for live/prematch counts
**Finding**: Count updates are frequent (every ~7-10 seconds)
**Optimization**: Consider debouncing count updates to reduce UI flicker

## Recommended Improvements

### 1. **Enhanced Filtering Analysis**
```javascript
// Test different prematch filters to match Forzza exactly
const filters = [
  { game: { type: { '@in': [0, 2] } } },
  { game: { visible_in_prematch: 1 } },
  { game: { '@or': [{ visible_in_prematch: 1 }, { type: { '@in': [0, 2] } }] } }
];
```

### 2. **Update Batching**
```javascript
// Batch rapid updates to prevent UI thrashing
const updateBatcher = {
  pending: new Map(),
  timer: null,
  batch: () => {
    // Process all pending updates at once
  }
};
```

### 3. **Connection Health Monitoring**
```javascript
// Enhanced heartbeat with reconnection logic
setInterval(async () => {
  const isHealthy = await scraper.ping();
  if (!isHealthy) {
    await scraper.init(); // Force reconnect
  }
}, 30000);
```

### 4. **Subscription Lifecycle Management**
```javascript
// Clean up stale subscriptions
const cleanupStaleSubscriptions = () => {
  const now = Date.now();
  for (const [subid, sub] of subscriptions) {
    if (now - sub.lastUpdateAtMs > 300000) { // 5 minutes
      unsubscribe(subid);
    }
  }
};
```

## Performance Metrics

| Metric | Current | Optimal |
|--------|---------|---------|
| Connection Stability | ✅ Stable | ✅ Stable |
| Update Latency | ~1-2s | ~1-2s |
| Message Processing | ✅ Working | ✅ Working |
| Memory Usage | Unknown | Monitor |
| Subscription Cleanup | Manual | Automatic |

## Action Items

1. **Investigate Prematch Filter**: Compare game counts with Forzza's actual website
2. **Implement Update Batching**: Reduce UI update frequency for better UX
3. **Add Connection Monitoring**: Proactive reconnection on health issues
4. **Optimize Subscription Management**: Automatic cleanup of stale subscriptions
5. **Monitor Memory Usage**: Track subscription data growth over time

## Conclusion

The current implementation is fundamentally sound and correctly implements Forzza's WebSocket protocol. The main opportunities for improvement are:

1. **Filter Optimization**: Ensure prematch filters match Forzza's exact behavior
2. **Update Efficiency**: Batch rapid updates to improve UI performance  
3. **Connection Resilience**: Enhanced monitoring and automatic recovery
4. **Resource Management**: Better subscription lifecycle management

The Swarm API is working as expected, with real-time updates flowing correctly. Any perceived "mismatches" are likely in the filtering logic or update processing rather than the core WebSocket implementation.
