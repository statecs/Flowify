import { Router } from 'express';
import { pool, RowDataPacket } from '../db';
import { logger } from '../logger';
import { requireApiKey } from '../middleware/auth';

const router = Router();

router.get('/', requireApiKey, async (_req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM document_types ORDER BY name');
    res.json(rows);
  } catch (error) {
    logger.error('[GET /api/document-types]', error);
    res.status(500).json({ error: 'Failed to fetch document types' });
  }
});

export default router;
