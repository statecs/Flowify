import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './db';
import { logger } from './logger';
import { PORT } from './config';
import healthRouter from './routes/health';
import documentTypesRouter from './routes/documentTypes';
import templatesRouter from './routes/templates';
import documentsRouter from './routes/documents';
import outputsRouter from './routes/outputs';
import outputsListRouter from './routes/outputsList';

dotenv.config();

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key']
}));
app.use(express.json({ limit: '10mb' }));

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body ?? {};
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }
  res.json({ apiKey: process.env.ADMIN_API_KEY });
});

app.use('/', healthRouter);
app.use('/api/document-types', documentTypesRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/documents', outputsRouter);
app.use('/api/outputs', outputsListRouter);

async function main() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      logger.log(`[Server] flowify-api running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

main();
