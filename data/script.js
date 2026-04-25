async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    document.getElementById('ip').textContent     = data.ip;
    document.getElementById('rssi').textContent   = data.rssi + ' dBm';
    document.getElementById('uptime').textContent = formatUptime(data.uptime);

    const statusEl = document.getElementById('status');
    statusEl.textContent  = data.status === 'ok' ? 'Online' : 'Error';
    statusEl.className    = 'value ' + (data.status === 'ok' ? 'status-ok' : 'status-err');
  } catch (err) {
    console.error('Failed to fetch status:', err);
    document.getElementById('status').textContent  = 'Error';
    document.getElementById('status').className    = 'value status-err';
  }
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

// Auto-refresh every 10 seconds
fetchStatus();
setInterval(fetchStatus, 10000);
