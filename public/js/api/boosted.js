// Boosted selections cache
let boostedEventIds = new Set();
let boostedLastFetch = 0;
const BOOSTED_CACHE_TTL = 60000; // 1 minute

async function fetchBoostedEventIds() {
  const now = Date.now();
  if (now - boostedLastFetch < BOOSTED_CACHE_TTL && boostedEventIds.size > 0) {
    return boostedEventIds;
  }
  
  try {
    const res = await fetch('/api/boosted-event-ids');
    if (res.ok) {
      const data = await res.json();
      boostedEventIds = new Set(data.eventIds || []);
      boostedLastFetch = now;
    }
  } catch (e) {
    console.warn('Failed to fetch boosted events:', e);
  }
  
  return boostedEventIds;
}

function isEventBoosted(eventId) {
  return boostedEventIds.has(eventId);
}

// Fetch on load
fetchBoostedEventIds();
