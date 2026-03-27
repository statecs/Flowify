import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { pool, RowDataPacket, ResultSetHeader } from '../db';
import { logger } from '../logger';
import { requireApiKey } from '../middleware/auth';
import { documentUpload } from '../middleware/upload';
import { UPLOAD_DIR } from '../config';
import { enqueue } from '../processingQueue';
import { processDocument } from '../services/documentProcessor';

const router = Router();

router.post('/upload', requireApiKey, documentUpload.single('file'), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const { document_type_id, preferred_template_id } = req.body;
  if (!document_type_id) { res.status(400).json({ error: 'document_type_id is required' }); return; }

  try {
    const [dtRows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM document_types WHERE id = ?',
      [document_type_id]
    );
    if (dtRows.length === 0) { res.status(400).json({ error: 'Invalid document_type_id' }); return; }

    const docId = crypto.randomUUID();
    await pool.execute(
      'INSERT INTO documents (id, document_type_id, preferred_template_id, original_filename, file_path, file_mime, file_size, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [docId, document_type_id, preferred_template_id || null, req.file.originalname, req.file.path, req.file.mimetype, req.file.size, 'uploaded']
    );

    // Enqueue processing
    enqueue(docId, () => processDocument(docId));

    res.status(202).json({ id: docId, status: 'uploaded' });
  } catch (error) {
    logger.error('[POST /api/documents/upload]', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

router.get('/', requireApiKey, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string || '1');
    const limit = parseInt(req.query.limit as string || '20');
    const offset = (page - 1) * limit;
    const status = req.query.status as string;

    let where = '';
    const params: any[] = [];
    if (status) {
      where = 'WHERE d.status = ?';
      params.push(status);
    }

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM documents d ${where}`,
      params
    );
    const total = countRows[0].total;

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT d.*, dt.name as document_type_name, dt.label as document_type_label
       FROM documents d
       JOIN document_types dt ON d.document_type_id = dt.id
       ${where}
       ORDER BY d.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ data: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error('[GET /api/documents]', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

router.get('/:id', requireApiKey, async (req, res) => {
  try {
    const [docRows] = await pool.query<RowDataPacket[]>(
      `SELECT d.*, dt.name as document_type_name, dt.label as document_type_label, dt.field_schema
       FROM documents d
       JOIN document_types dt ON d.document_type_id = dt.id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (docRows.length === 0) { res.status(404).json({ error: 'Document not found' }); return; }
    const doc = docRows[0];

    const [pages] = await pool.query<RowDataPacket[]>(
      'SELECT id, page_number, width, height FROM document_pages WHERE document_id = ? ORDER BY page_number',
      [req.params.id]
    );

    const [extractions] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM extractions WHERE document_id = ?',
      [req.params.id]
    );

    res.json({
      ...doc,
      pages,
      extraction: extractions.length > 0 ? extractions[0] : null
    });
  } catch (error) {
    logger.error('[GET /api/documents/:id]', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

router.delete('/:id', requireApiKey, async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT file_path FROM documents WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Document not found' }); return; }

    // Delete file
    try { fs.unlinkSync(rows[0].file_path); } catch {}

    // Delete page images
    const pagesDir = path.join(UPLOAD_DIR, 'pages', req.params.id);
    try { fs.rmSync(pagesDir, { recursive: true }); } catch {}

    await pool.execute('DELETE FROM documents WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('[DELETE /api/documents/:id]', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

router.get('/:id/pages/:n/image', requireApiKey, async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT image_path FROM document_pages WHERE document_id = ? AND page_number = ?',
      [req.params.id, parseInt(req.params.n)]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Page not found' }); return; }

    const imagePath = rows[0].image_path;
    if (!fs.existsSync(imagePath)) { res.status(404).json({ error: 'Image file not found' }); return; }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fs.createReadStream(imagePath).pipe(res);
  } catch (error) {
    logger.error('[GET /api/documents/:id/pages/:n/image]', error);
    res.status(500).json({ error: 'Failed to stream image' });
  }
});

router.put('/:id/extraction', requireApiKey, async (req, res) => {
  const { fields } = req.body;
  if (!fields) { res.status(400).json({ error: 'fields is required' }); return; }

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      'UPDATE extractions SET fields = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE document_id = ?',
      [JSON.stringify(fields), 'reviewing', req.params.id]
    );
    if (result.affectedRows === 0) { res.status(404).json({ error: 'Extraction not found' }); return; }

    await pool.execute(
      'UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['reviewing', req.params.id]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('[PUT /api/documents/:id/extraction]', error);
    res.status(500).json({ error: 'Failed to update extraction' });
  }
});

router.post('/:id/reprocess', requireApiKey, async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, status FROM documents WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Document not found' }); return; }

    await pool.execute(
      'UPDATE documents SET status = ?, error_message = NULL WHERE id = ?',
      ['uploaded', req.params.id]
    );

    enqueue(req.params.id, () => processDocument(req.params.id));
    res.json({ id: req.params.id, status: 'uploaded' });
  } catch (error) {
    logger.error('[POST /api/documents/:id/reprocess]', error);
    res.status(500).json({ error: 'Failed to reprocess document' });
  }
});

export default router;
