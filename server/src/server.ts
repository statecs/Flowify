import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import multer from 'multer';
import { pool, initDatabase, RowDataPacket, ResultSetHeader } from './db';
import { logger } from './logger';
import { enqueue } from './processingQueue';
import { processDocument } from './services/documentProcessor';
import { renderTemplate, saveOutput } from './services/templateService';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '5073');
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '50');

// Ensure upload directories exist
fs.mkdirSync(path.join(UPLOAD_DIR, 'documents'), { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, 'pages'), { recursive: true });

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key']
}));
app.use(express.json({ limit: '10mb' }));

// ─── Auth Middleware ───────────────────────────────────────────────────────────

function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.ADMIN_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// ─── Multer ───────────────────────────────────────────────────────────────────

const documentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_DIR, 'documents')),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const documentUpload = multer({
  storage: documentStorage,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.oasis.opendocument.text',
      'application/rtf',
      'text/rtf',
      'text/plain',
      'image/png',
      'image/jpeg'
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  }
});

const templateStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_DIR, 'documents')),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `tmpl-${crypto.randomUUID()}${ext}`);
  }
});

const templateUpload = multer({ storage: templateStorage });

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'flowify-api' });
});

// ─── Document Types ────────────────────────────────────────────────────────────

app.get('/api/document-types', requireApiKey, async (_req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM document_types ORDER BY name');
    res.json(rows);
  } catch (error) {
    logger.error('[GET /api/document-types]', error);
    res.status(500).json({ error: 'Failed to fetch document types' });
  }
});

// ─── Templates ────────────────────────────────────────────────────────────────

app.get('/api/templates', requireApiKey, async (req, res) => {
  try {
    const { document_type_id } = req.query;
    let sql = 'SELECT id, document_type_id, name, description, is_default, created_at FROM templates';
    const params: any[] = [];
    if (document_type_id) {
      sql += ' WHERE document_type_id = ?';
      params.push(document_type_id);
    }
    sql += ' ORDER BY is_default DESC, created_at DESC';
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    res.json(rows);
  } catch (error) {
    logger.error('[GET /api/templates]', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

app.get('/api/templates/:id', requireApiKey, async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM templates WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Template not found' }); return; }
    res.json(rows[0]);
  } catch (error) {
    logger.error('[GET /api/templates/:id]', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

app.post('/api/templates', requireApiKey, templateUpload.single('file'), async (req, res) => {
  const { name, document_type_id, description, is_default } = req.body;
  if (!name || !document_type_id) {
    res.status(400).json({ error: 'name and document_type_id are required' });
    return;
  }

  let latexContent = '';
  if (req.file) {
    latexContent = fs.readFileSync(req.file.path, 'utf-8');
    fs.unlinkSync(req.file.path); // Don't store template files on disk
  } else if (req.body.latex_content) {
    latexContent = req.body.latex_content;
  } else {
    res.status(400).json({ error: 'file or latex_content is required' });
    return;
  }

  try {
    const id = crypto.randomUUID();
    if (is_default === '1' || is_default === true) {
      await pool.execute(
        'UPDATE templates SET is_default = 0 WHERE document_type_id = ?',
        [document_type_id]
      );
    }
    await pool.execute(
      'INSERT INTO templates (id, document_type_id, name, description, latex_content, is_default) VALUES (?, ?, ?, ?, ?, ?)',
      [id, document_type_id, name, description || null, latexContent, is_default ? 1 : 0]
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, document_type_id, name, description, is_default, created_at FROM templates WHERE id = ?',
      [id]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    logger.error('[POST /api/templates]', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

app.delete('/api/templates/:id', requireApiKey, async (req, res) => {
  try {
    const [result] = await pool.execute<ResultSetHeader>(
      'DELETE FROM templates WHERE id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0) { res.status(404).json({ error: 'Template not found' }); return; }
    res.json({ success: true });
  } catch (error) {
    logger.error('[DELETE /api/templates/:id]', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ─── Documents ────────────────────────────────────────────────────────────────

app.post('/api/documents/upload', requireApiKey, documentUpload.single('file'), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
  const { document_type_id } = req.body;
  if (!document_type_id) { res.status(400).json({ error: 'document_type_id is required' }); return; }

  try {
    const [dtRows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM document_types WHERE id = ?',
      [document_type_id]
    );
    if (dtRows.length === 0) { res.status(400).json({ error: 'Invalid document_type_id' }); return; }

    const docId = crypto.randomUUID();
    await pool.execute(
      'INSERT INTO documents (id, document_type_id, original_filename, file_path, file_mime, file_size, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [docId, document_type_id, req.file.originalname, req.file.path, req.file.mimetype, req.file.size, 'uploaded']
    );

    // Enqueue processing
    enqueue(docId, () => processDocument(docId));

    res.status(202).json({ id: docId, status: 'uploaded' });
  } catch (error) {
    logger.error('[POST /api/documents/upload]', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

app.get('/api/documents', requireApiKey, async (req, res) => {
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

app.get('/api/documents/:id', requireApiKey, async (req, res) => {
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

app.delete('/api/documents/:id', requireApiKey, async (req, res) => {
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

app.get('/api/documents/:id/pages/:n/image', requireApiKey, async (req, res) => {
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

app.put('/api/documents/:id/extraction', requireApiKey, async (req, res) => {
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

app.post('/api/documents/:id/accept', requireApiKey, async (req, res) => {
  const { template_id } = req.body;
  if (!template_id) { res.status(400).json({ error: 'template_id is required' }); return; }

  try {
    // Get extraction fields
    const [extRows] = await pool.query<RowDataPacket[]>(
      'SELECT fields FROM extractions WHERE document_id = ?',
      [req.params.id]
    );
    if (extRows.length === 0) { res.status(404).json({ error: 'Extraction not found' }); return; }

    const fields = typeof extRows[0].fields === 'string'
      ? JSON.parse(extRows[0].fields)
      : extRows[0].fields;

    // Render LaTeX
    const latexContent = await renderTemplate(template_id, fields);

    // Save output
    await saveOutput(req.params.id, template_id, latexContent);

    // Update statuses
    await pool.execute(
      'UPDATE extractions SET status = ? WHERE document_id = ?',
      ['accepted', req.params.id]
    );
    await pool.execute(
      'UPDATE documents SET status = ? WHERE id = ?',
      ['generated', req.params.id]
    );

    res.json({ latex_content: latexContent });
  } catch (error) {
    logger.error('[POST /api/documents/:id/accept]', error);
    res.status(500).json({ error: 'Failed to generate output' });
  }
});

app.get('/api/documents/:id/output', requireApiKey, async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT o.latex_content, d.original_filename
       FROM outputs o JOIN documents d ON o.document_id = d.id
       WHERE o.document_id = ?
       ORDER BY o.created_at DESC LIMIT 1`,
      [req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Output not found' }); return; }

    const baseName = path.basename(rows[0].original_filename, path.extname(rows[0].original_filename));
    res.setHeader('Content-Type', 'application/x-tex');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.tex"`);
    res.send(rows[0].latex_content);
  } catch (error) {
    logger.error('[GET /api/documents/:id/output]', error);
    res.status(500).json({ error: 'Failed to fetch output' });
  }
});

app.post('/api/documents/:id/reprocess', requireApiKey, async (req, res) => {
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

// ─── Start ────────────────────────────────────────────────────────────────────

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
