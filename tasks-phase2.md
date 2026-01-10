# Swarm API Improvements - Phase 2

## 🔴 Critical Optimizations (Bandwidth/Latency)

- [x] 1. Refactor live stream to use embedded market subscription (games + odds in ONE sub) ✅ DONE
- [x] 2. Remove 1s polling intervals - use native Swarm push updates ✅ DONE
- [x] 3. Forward incremental deltas to SSE clients instead of full payloads ✅ DONE

## 🚀 New Features

- [x] 4. Add `get_boosted_selections` API endpoint for enhanced odds ✅ DONE
- [x] 5. Display boosted odds badge (🔥) on boosted events ✅ DONE
- [x] 6. Add time-range filters (@gte/@lte) for "Today", "Next 24h" games ✅ DONE

## Missing Fields (Lower Priority)

### Game Fields
- [ ] 7. Add `scout_provider` - data provider ID
- [ ] 8. Add `visible_in_prematch` - prematch visibility flag

### Market Fields
- [ ] 9. Add `market_type` - type identifier
- [ ] 10. Add `display_sub_key` - sub-category (MATCH, 1ST HALF)
- [ ] 11. Add `sequence` + `point_sequence` - ordering

### Event Fields
- [ ] 12. Add `type_1` - primary type (W1, W2)
- [ ] 13. Add `original_order` - original ordering

### Competition Fields
- [ ] 14. Add `favorite` - favorite competition flag
- [ ] 15. Add `teams_reversed` - teams display order
