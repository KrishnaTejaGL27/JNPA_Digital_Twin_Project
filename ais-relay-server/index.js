try { require('dotenv').config(); } catch { /* dotenv optional */ }

const http      = require('http');
const WebSocket = require('ws');

const PORT       = process.env.PORT || 3001;
const AIS_KEY    = process.env.AIS_STREAM_KEY;
const AIS_WS_URL = 'wss://stream.aisstream.io/v0/stream';

// Using the World Bounding Box because aisstream.io has no data for JNPA directly
const WORLD_BBOX = [[-90, -180], [90, 180]];

const vesselStore = new Map();

let totalMessagesReceived    = 0;
let positionMessagesReceived = 0;
let lastMessageAt            = null;
let subscriptionConfirmed    = false;

function mapNavStatus(code) {
  const map = { 0:'APPROACHING', 1:'ANCHORED', 3:'LOADING', 5:'BERTHING', 8:'DEPARTING' };
  return map[code] ?? 'APPROACHING';
}

function mapShipType(code) {
  if (code >= 70 && code <= 79) return 'CONTAINER';
  if (code >= 80 && code <= 89) return 'TANKER';
  if (code >= 40 && code <= 49) return 'BULK';
  if (code === 60 || code === 69) return 'PASSENGER';
  return 'GENERAL';
}

let ws;

function connectAIS() {
  if (!AIS_KEY) {
    console.error('[AIS Relay] ERROR: AIS_STREAM_KEY not set.');
    return;
  }
  console.log('[AIS Relay] Connecting to aisstream.io...');
  ws = new WebSocket(AIS_WS_URL);

  ws.on('open', () => {
    console.log('[AIS Relay] WebSocket connected');
    const sub = {
      APIKey:             AIS_KEY, // Make sure 'APIKey' has a capital 'K'
      BoundingBoxes:      [WORLD_BBOX],
      FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
    };
    console.log('[AIS Relay] Subscription sent for WORLD BBOX');
    ws.send(JSON.stringify(sub));
  });

  ws.on('message', (raw) => {
    totalMessagesReceived++;
    lastMessageAt = new Date().toISOString();
    const text = raw.toString();

    try {
      const msg = JSON.parse(text);

      if (msg.MessageType === 'SubscriptionStatus' || msg.status === 'subscribed') {
        subscriptionConfirmed = true;
        console.log('[AIS Relay] Subscription confirmed');
        return;
      }

      if (msg.error || msg.Error) {
        console.error('[AIS Relay] API Error:', msg.error || msg.Error);
        return;
      }

      const pos  = msg.Message?.PositionReport;
      const meta = msg.MetaData;
      if (!pos || !meta) return;

      const lat = meta.latitude;
      const lng = meta.longitude;

      positionMessagesReceived++;
      const mmsi     = String(pos.UserID);
      const existing = vesselStore.get(mmsi) ?? {};

      vesselStore.set(mmsi, {
        mmsi,
        name:      (meta.ShipName ?? existing.name ?? 'UNKNOWN').trim(),
        lat,
        lng,
        speed:     pos.SpeedOverGround  ?? existing.speed ?? 0,
        heading:   pos.TrueHeading === 511
                     ? (pos.CourseOverGround ?? existing.heading ?? 0)
                     : pos.TrueHeading,
        navStatus: pos.NavigationalStatus ?? 0,
        status:    mapNavStatus(pos.NavigationalStatus ?? 0),
        shipType:  existing.shipType ?? 0,
        type:      mapShipType(existing.shipType ?? 0),
        flag:      meta.MMSI_CountryCode ?? existing.flag ?? 'XX',
        updatedAt: new Date().toISOString(),
      });

    } catch { /* skip malformed */ }
  });

  ws.on('close', (code) => {
    console.log(`[AIS Relay] Disconnected (${code}) — reconnecting in 5s`);
    subscriptionConfirmed = false;
    setTimeout(connectAIS, 5000);
  });

  ws.on('error', (err) => console.error('[AIS Relay] Error:', err.message));
}

// Evict vessels older than 15 minutes to prevent memory leaks
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [mmsi, v] of vesselStore.entries()) {
    if (new Date(v.updatedAt).getTime() < cutoff) vesselStore.delete(mmsi);
  }
}, 60 * 1000);

// Status log every 30s
setInterval(() => {
  console.log(
    `[AIS Relay] Active vessels in memory: ${vesselStore.size} | ` +
    `ws: ${ws?.readyState === WebSocket.OPEN ? 'OPEN' : 'CLOSED'}`
  );
}, 30 * 1000);

// HTTP server
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET' && req.url === '/api/vessels') {
    // CAP THE RESPONSE TO 80 VESSELS TO PREVENT NEXT.JS CRASH
    const vessels = Array.from(vesselStore.values()).slice(0, 80);
    
    res.writeHead(200);
    res.end(JSON.stringify({
      vessels,
      count:     vesselStore.size, // Still sends the REAL total to your UI dashboard!
      renderedCount: vessels.length,
      source:    'aisstream.io LIVE',
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status:                 'ok',
      vesselCount:            vesselStore.size,
      wsConnected:            ws?.readyState === WebSocket.OPEN,
      subscriptionConfirmed,
      uptime:                 process.uptime(),
    }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Available endpoints: /health, /api/vessels' }));
});

server.listen(PORT, () => {
  console.log(`\n[AIS Relay] Server ready on port ${PORT}`);
  connectAIS();
});