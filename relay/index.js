const express    = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const http       = require('http');

const app        = express();
const httpServer = http.createServer(app);
const wss        = new WebSocketServer({ server: httpServer, path: '/tunnel' });

const TIMEOUT_MS = 10000;

let esp32 = null;
const pending = new Map();

app.use(express.json());

wss.on('connection', (ws, req) => {
    console.log(`[Tunnel] ESP32 connected from ${req.socket.remoteAddress}`);
    esp32 = ws;

    ws.on('message', (raw) => {
        const text = raw.toString();
        const nl   = text.indexOf('\n');
        const jsonPart = nl >= 0 ? text.slice(0, nl) : text;
        const body     = nl >= 0 ? text.slice(nl + 1) : '';

        let msg;
        try { msg = JSON.parse(jsonPart); } catch { return; }

        if (msg.type === 'response' && pending.has(msg.id)) {
            const { res, timer } = pending.get(msg.id);
            clearTimeout(timer);
            pending.delete(msg.id);
            res.status(msg.status).type(msg.contentType || 'text/plain').send(body);
        }
    });

    ws.on('close', () => { console.log('[Tunnel] ESP32 disconnected'); esp32 = null; });
    ws.on('error', (err) => console.error('[Tunnel] WS error:', err.message));
});

app.use((req, res) => {
    if (req.path === '/healthz')
        return res.json({ relay: 'ok', esp32: esp32 ? 'online' : 'offline' });

    if (!esp32 || esp32.readyState !== WebSocket.OPEN) {
        return res.status(503).send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ESP32 Offline</title>
<style>body{background:#0f172a;color:#e2e8f0;font-family:sans-serif;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center}.dot{font-size:4rem}h2{color:#f59e0b}p{color:#94a3b8}</style>
</head><body><div class="box">
<div class="dot">📡</div>
<h2>ESP32 Offline</h2>
<p>อุปกรณ์ยังไม่ได้เชื่อมต่อ กรุณารอสักครู่...</p>
</div></body></html>`);
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
        if (pending.has(id)) {
            pending.delete(id);
            res.status(504).send('Gateway Timeout: ESP32 did not respond in time');
        }
    }, TIMEOUT_MS);

    pending.set(id, { res, timer });

    esp32.send(JSON.stringify({
        type:   'request',
        id,
        method: req.method,
        path:   req.path || '/',
        query:  req.query,
        body:   req.body ? JSON.stringify(req.body) : '',
    }));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Relay server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/healthz`);
});
