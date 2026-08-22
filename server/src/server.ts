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
