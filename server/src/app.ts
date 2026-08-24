import path from 'path';
import fs from 'fs';
import 'express-async-errors'; // rejected async handlers reach the error middleware (Express 4)
import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import health from './routes/health';
import lookups from './routes/lookups';
import draft from './routes/draft';
import exportRoutes from './routes/export';
import media from './routes/media';
import portrait from './routes/portrait';
import players from './routes/players';
import franchise from './routes/franchise';
import gear from './routes/gear';

/** Origins allowed to call the API. The franchise routes write into the Madden
 *  Saves folder, so this is deliberately just the local Vite dev server (plus
 *  anything listed in CORS_ORIGINS, comma-separated). */
export function allowedOrigins(): string[] {
  const extra = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return ['http://127.0.0.1:5173', 'http://localhost:5173', ...extra];
}

/** JSON error middleware: every thrown/rejected error becomes a 500 with a message
 *  instead of an unhandled rejection (which exits the process on Node 24). */
export function attachErrorHandling(app: Express): void {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[server] error:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: err.message || 'internal error' });
  });
}

/** The built web UI (web/dist), when it exists: the packaged desktop app and
 *  `npm run start` serve the whole tool from this one server. API routes keep
 *  priority; anything else falls back to index.html (the SPA router). */
function webDist(): string | null {
  const candidates = [
    process.env.WEB_DIST,
    path.resolve(__dirname, '..', '..', 'web', 'dist'), // server/dist -> repo web/dist
    path.resolve(__dirname, '..', '..', '..', 'web', 'dist'),
  ].filter((c): c is string => !!c);
  for (const c of candidates) if (fs.existsSync(path.join(c, 'index.html'))) return c;
  return null;
}

export function createApp(): Express {
  const app = express();
  app.use(cors({ origin: allowedOrigins() }));
  app.use(express.json({ limit: '50mb' }));

  app.use('/api', health);
  app.use('/api', lookups);
  app.use('/api', draft);
  app.use('/api', exportRoutes);
  app.use('/api', media);
  app.use('/api', portrait);
  app.use('/api', players);
  app.use('/api', franchise);
  app.use('/api', gear);

  const dist = webDist();
  if (dist) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  attachErrorHandling(app);

  return app;
}
