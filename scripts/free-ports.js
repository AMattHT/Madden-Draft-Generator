// Frees the dev ports before `npm run dev`. On Windows, Ctrl-C (or a crash) often
// leaves the Vite child alive on 5173; the next start then fails with
// "Port 5173 is already in use" and `concurrently -k` kills the healthy API too.
// Only node processes are killed, and only when they hold one of our ports.
const { execSync } = require('child_process');

const PORTS = [5173, 5174];

function listeners(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf8' });
      return [...new Set(out.split(/\r?\n/).filter((l) => /LISTENING/.test(l) && l.includes(`:${port} `)).map((l) => l.trim().split(/\s+/).pop()))];
    }
    const out = execSync(`lsof -t -iTCP:${port} -sTCP:LISTEN`, { encoding: 'utf8' });
    return out.split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

function isNode(pid) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' });
      return /node\.exe/i.test(out);
    }
    return /node/.test(execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' }));
  } catch {
    return false;
  }
}

for (const port of PORTS) {
  for (const pid of listeners(port)) {
    if (!pid || pid === String(process.pid)) continue;
    if (!isNode(pid)) {
      console.log(`[dev] port ${port} is held by PID ${pid} (not node) — leaving it alone`);
      continue;
    }
    try {
      execSync(process.platform === 'win32' ? `taskkill /PID ${pid} /T /F` : `kill -9 ${pid}`, { stdio: 'ignore' });
      console.log(`[dev] freed port ${port} (killed stale node PID ${pid})`);
    } catch {
      console.log(`[dev] could not kill PID ${pid} on port ${port}`);
    }
  }
}
