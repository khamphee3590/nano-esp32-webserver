const http = require('http');
const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const PORT     = 8080;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.json': 'application/json',
    '.png':  'image/png',
    '.ico':  'image/x-icon',
    '.svg':  'image/svg+xml',
};

// Mock GPIO state
const PINS = [
    {name:'D2',  gpio:5,  analog:false},
    {name:'D3',  gpio:6,  analog:false},
    {name:'D4',  gpio:7,  analog:false},
    {name:'D5',  gpio:8,  analog:false},
    {name:'D6',  gpio:9,  analog:false},
    {name:'D7',  gpio:10, analog:false},
    {name:'D8',  gpio:17, analog:false},
    {name:'D9',  gpio:18, analog:false},
    {name:'D10', gpio:21, analog:false},
    {name:'D11', gpio:38, analog:false},
    {name:'D12', gpio:47, analog:false},
    {name:'D13', gpio:48, analog:false},
    {name:'A0',  gpio:1,  analog:true},
    {name:'A1',  gpio:2,  analog:true},
    {name:'A2',  gpio:3,  analog:true},
    {name:'A3',  gpio:4,  analog:true},
    {name:'A4',  gpio:11, analog:true},
    {name:'A5',  gpio:12, analog:true},
    {name:'A6',  gpio:13, analog:true},
    {name:'A7',  gpio:14, analog:true},
];

const gpioState = {};
PINS.forEach(p => { gpioState[p.name] = { ...p, mode: 0, value: 0 }; });

// Simulate analog noise for INPUT analog pins
setInterval(() => {
    PINS.filter(p => p.analog).forEach(p => {
        if (gpioState[p.name].mode !== 1)
            gpioState[p.name].value = Math.floor(Math.random() * 4096);
    });
}, 1000);

function readBody(req) {
    return new Promise(resolve => {
        let buf = '';
        req.on('data', c => buf += c);
        req.on('end', () => resolve(buf));
    });
}

http.createServer(async (req, res) => {
    const url = req.url.split('?')[0];

    if (url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status:'ok', ip:'192.168.1.100', rssi:-55, uptime: Math.floor(Date.now()/1000 % 86400) }));
    }

    if (url === '/api/gpio' && req.method === 'GET') {
        const pins = PINS.map(p => ({ ...gpioState[p.name] }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ pins }));
    }

    if (url === '/api/gpio/set' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req));
        if (gpioState[body.pin]) {
            gpioState[body.pin].mode  = body.mode;
            gpioState[body.pin].value = body.mode === 1 ? body.value : gpioState[body.pin].value;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true }));
    }

    const filePath = path.join(DATA_DIR, url === '/' ? 'index.html' : url);
    fs.readFile(filePath, (err, data) => {
        if (err) {
            fs.readFile(path.join(DATA_DIR, '404.html'), (e, d) => {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(e ? '404 Not Found' : d);
            });
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain' });
        res.end(data);
    });
}).listen(PORT, () => console.log(`Preview: http://localhost:${PORT}`));
