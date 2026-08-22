import { PORT } from './config/paths';
import { getDb } from './db';
import { createApp } from './app';

const HOST = process.env.HOST || '127.0.0.1';

// Last-resort guards: log instead of dying on a stray rejection (Node 24 exits by
// default), and say something useful when the port is taken.
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[server] uncaught exception:', err);
});

const app = createApp();
getDb(); // initialize the cache database + schema

// Warm the depth-chart position caches (3 s from disk; minutes on a fresh clone
// while the nflverse CSVs download). Until they are ready, generated classes are
// flagged degraded so the browser does not cache them as final.
import('./services/DbPositionService').then(({ DbPositionService }) =>
  DbPositionService.ensureBuilt().then(() => console.log('[server] depth-chart position caches ready')).catch((e) => console.warn('[server] depth-chart caches unavailable:', (e as Error).message))
);

const server = app.listen(PORT, HOST, () => {
  console.log(`[server] Draft Class Generator API on http://${HOST}:${PORT}`);
});
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[server] port ${PORT} is already in use — an earlier dev server is probably still running.\n` +
        `         Find it with: netstat -ano | findstr :${PORT}   then: taskkill /PID <pid> /F`
    );
    process.exit(1);
  }
  throw err;
});

export default app;
