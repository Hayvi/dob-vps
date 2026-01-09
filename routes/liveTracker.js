const WebSocket = require('ws');

function registerLiveTrackerRoutes(app) {
  app.get('/api/live-tracker', async (req, res) => {
    const { gameId } = req.query;
    if (!gameId) return res.status(400).json({ error: 'gameId is required' });

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const partnerId = 1777;
    const siteRef = 'https://sportsbook.forzza1x2.com/';
    const url = `wss://animation.ml.bcua.io/animation_json_v2?partner_id=${partnerId}&site_ref=${siteRef}`;

    let closed = false;
    let heartbeatId = null;

    const safeWrite = (payload) => {
      if (closed) return;
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {
        return;
      }
    };

    const safeEvent = (eventName, payload) => {
      if (closed) return;
      try {
        res.write(`event: ${eventName}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {
        return;
      }
    };

    const ws = new WebSocket(url, {
      handshakeTimeout: 15000,
      perMessageDeflate: true,
      headers: {
        Origin: 'https://widget-iframe.wadua.io',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const nowSec = () => Math.floor(Date.now() / 1000);

    const subscribe = () => {
      const ts = nowSec();
      const msg = {
        request: {
          arg: {
            submatch: {
              feed_type: 'live',
              gameevents: 'true',
              id: String(gameId),
              link_id: '',
              provider: 'animation',
              snapshot: true
            }
          },
          meta: {
            request_id: ts,
            ts
          }
        }
      };
      ws.send(JSON.stringify(msg));
    };

    ws.on('open', () => {
      safeEvent('ready', { gameId: String(gameId) });
      try {
        subscribe();
      } catch (e) {
        safeEvent('error', { error: e.message || String(e) });
      }
    });

    ws.on('unexpected-response', (request, response) => {
      const statusCode = response?.statusCode;
      const headers = response?.headers || {};
      let body = '';

      try {
        response.on('data', (chunk) => {
          body += chunk.toString();
          if (body.length > 2000) body = body.slice(0, 2000);
        });
        response.on('end', () => {
          safeEvent('error', {
            error: 'Unexpected server response',
            statusCode,
            headers,
            body
          });
        });
      } catch (e) {
        safeEvent('error', {
          error: 'Unexpected server response',
          statusCode,
          headers
        });
      }
    });

    ws.on('message', (buf) => {
      let parsed = null;
      try {
        parsed = JSON.parse(buf.toString());
      } catch (e) {
        parsed = { raw: buf.toString() };
      }
      safeWrite(parsed);
    });

    ws.on('error', (err) => {
      safeEvent('error', { error: err?.message || 'WebSocket error' });
    });

    ws.on('close', () => {
      safeEvent('end', { gameId: String(gameId) });
      try {
        res.end();
      } catch {
        return;
      }
    });

    heartbeatId = setInterval(() => {
      if (closed) return;
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch {
        return;
      }
    }, 15000);

    req.on('close', () => {
      closed = true;
      if (heartbeatId) clearInterval(heartbeatId);
      try {
        ws.close();
      } catch {
        return;
      }
    });
  });
}

module.exports = { registerLiveTrackerRoutes };
