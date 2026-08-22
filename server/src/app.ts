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

  attachErrorHandling(app);
  return app;
}
