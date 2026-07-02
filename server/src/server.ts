import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { PORT } from './config/paths';
import { getDb } from './db';
import health from './routes/health';
import lookups from './routes/lookups';
import draft from './routes/draft';
import exportRoutes from './routes/export';
import media from './routes/media';
import portrait from './routes/portrait';
import players from './routes/players';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api', health);
app.use('/api', lookups);
app.use('/api', draft);
app.use('/api', exportRoutes);
app.use('/api', media);
app.use('/api', portrait);
app.use('/api', players);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server] error:', err);
  res.status(500).json({ error: err.message });
});

getDb(); // initialize the cache database + schema

app.listen(PORT, () => {
  console.log(`[server] Draft Class Generator API on http://localhost:${PORT}`);
});

export default app;
