import { Router } from 'express';
import { pool, RowDataPacket } from '../db';
import { logger } from '../logger';
import { requireApiKey } from '../middleware/auth';

const router = Router();

router.get('/', requireApiKey, async (_req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT o.id, o.document_id, o.template_id, o.created_at,
              d.original_filename, d.document_type_id,
              dt.label as document_type_label, t.name as template_name
       FROM outputs o
       JOIN documents d ON o.document_id = d.id
       JOIN document_types dt ON d.document_type_id = dt.id
       JOIN templates t ON o.template_id = t.id
       ORDER BY o.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    logger.error('[GET /api/outputs]', error);
    res.status(500).json({ error: 'Failed to fetch outputs' });
  }
});

export default router;
