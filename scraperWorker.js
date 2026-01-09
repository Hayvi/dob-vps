/**
 * Dedicated scraper worker - runs single Swarm WebSocket connection
 * Broadcasts data to HTTP workers via IPC
 */
const ForzzaScraper = require('./scraper');

const scraper = new ForzzaScraper();
const subscriptions = new Map(); // requestKey -> { subid, refCount }

function getRequestKey(request) {
  return JSON.stringify(request);
}

async function init() {
  await scraper.init();
  console.log('[ScraperWorker] Connected to Swarm API');
}

process.on('message', async (msg) => {
  if (!msg || !msg.type) return;

  try {
    switch (msg.type) {
      case 'call': {
        const { id, method, args, workerId } = msg;
        if (typeof scraper[method] !== 'function') {
          process.send({ type: 'response', id, workerId, error: `Unknown method: ${method}` });
          return;
        }
        const result = await scraper[method](...(args || []));
        process.send({ type: 'response', id, workerId, result });
        break;
      }

      case 'subscribe': {
        const { id, request, workerId } = msg;
        const key = getRequestKey(request);
        
        if (subscriptions.has(key)) {
          const sub = subscriptions.get(key);
          sub.refCount++;
          sub.workers.add(workerId);
          const data = scraper.subscriptions.get(sub.subid)?.data || {};
          process.send({ type: 'subscribeResult', id, subid: sub.subid, data, workerId });
        } else {
          const sub = await scraper.subscribe(request, (fullData, delta) => {
            process.send({ type: 'subscriptionUpdate', key, subid: sub.subid, data: fullData, delta });
          });
          subscriptions.set(key, { subid: sub.subid, refCount: 1, workers: new Set([workerId]) });
          process.send({ type: 'subscribeResult', id, subid: sub.subid, data: sub.data, workerId });
        }
        break;
      }

      case 'unsubscribe': {
        const { key, workerId } = msg;
        const sub = subscriptions.get(key);
        if (sub) {
          sub.workers.delete(workerId);
          sub.refCount--;
          if (sub.refCount <= 0) {
            await scraper.unsubscribe(sub.subid);
            subscriptions.delete(key);
          }
        }
        break;
      }

      case 'getHealth': {
        const { id, workerId } = msg;
        const metrics = scraper.getWebSocketHealthMetrics();
        process.send({ type: 'response', id, workerId, result: metrics });
        break;
      }
    }
  } catch (err) {
    if (msg.id) {
      process.send({ type: 'response', id: msg.id, error: err.message });
    }
  }
});

init().catch(err => {
  console.error('[ScraperWorker] Init failed:', err.message);
  process.exit(1);
});
