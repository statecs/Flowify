import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { pool, RowDataPacket, ResultSetHeader } from '../db';
import { logger } from '../logger';
import { requireApiKey } from '../middleware/auth';
import { templateUpload } from '../middleware/upload';
import { renderTemplate } from '../services/templateService';

const execAsync = promisify(exec);

const router = Router();

router.get('/', requireApiKey, async (req, res) => {
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

router.get('/:id', requireApiKey, async (req, res) => {
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

router.post('/', requireApiKey, templateUpload.single('file'), async (req, res) => {
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

router.delete('/:id', requireApiKey, async (req, res) => {
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

router.patch('/:id/set-default', requireApiKey, async (req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, document_type_id, name, description, is_default, created_at FROM templates WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const { document_type_id } = rows[0];
    await pool.execute('UPDATE templates SET is_default = 0 WHERE document_type_id = ?', [document_type_id]);
    await pool.execute('UPDATE templates SET is_default = 1 WHERE id = ?', [req.params.id]);
    const [updated] = await pool.query<RowDataPacket[]>(
      'SELECT id, document_type_id, name, description, is_default, created_at FROM templates WHERE id = ?',
      [req.params.id]
    );
    res.json(updated[0]);
  } catch (error) {
    logger.error('[PATCH /api/templates/:id/set-default]', error);
    res.status(500).json({ error: 'Failed to update default template' });
  }
});

router.patch('/:id/content', requireApiKey, async (req, res) => {
  const { latex_content } = req.body;
  if (!latex_content || typeof latex_content !== 'string') {
    return res.status(400).json({ error: 'latex_content is required' });
  }
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM templates WHERE id = ?', [req.params.id]
    );
    if ((rows as RowDataPacket[]).length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    await pool.execute('UPDATE templates SET latex_content = ? WHERE id = ?',
      [latex_content, req.params.id]);
    const [updated] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM templates WHERE id = ?', [req.params.id]
    );
    res.json((updated as RowDataPacket[])[0]);
  } catch (error) {
    logger.error('[PATCH /api/templates/:id/content]', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.get('/:id/preview-pdf', requireApiKey, async (req, res) => {
  const tmpDir = path.join(os.tmpdir(), crypto.randomUUID());
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT document_type_id FROM templates WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) { res.status(404).json({ error: 'Template not found' }); return; }

    const [dtRows] = await pool.query<RowDataPacket[]>(
      'SELECT name FROM document_types WHERE id = ?',
      [rows[0].document_type_id]
    );
    const docTypeName = dtRows[0]?.name ?? 'cv';

    const sampleDataByType: Record<string, unknown> = {
      cv: {
        name: 'Jane Smith',
        subtitle: 'Senior Software Engineer',
        work_experience: [{
          title: 'Lead Engineer',
          company: 'Acme Corp',
          date_range: 'Jan 2020 – Present',
          description: 'Led a team building scalable cloud infrastructure.',
          bullet_points: ['Designed microservices architecture', 'Reduced deploy time by 60%'],
        }],
        education: [{
          degree: 'BSc Computer Science',
          institution: 'University of Technology',
          date_range: '2014 – 2018',
        }],
        skills: {
          Methods: 'Agile, Scrum',
          Tools: 'Git, Docker',
          Tech: 'TypeScript, Python',
          Standards: 'REST, GraphQL',
          Languages: 'English (Native)',
        },
        portfolio: [{ label: 'GitHub', url: 'github.com/janesmith' }],
      },
    };

    const sampleData = sampleDataByType[docTypeName] ?? sampleDataByType['cv'];
    const latexContent = await renderTemplate(req.params.id, sampleData as Record<string, unknown>);

    fs.mkdirSync(tmpDir, { recursive: true });
    const texPath = path.join(tmpDir, 'preview.tex');
    fs.writeFileSync(texPath, latexContent, 'utf-8');

    await execAsync(
      `pdflatex -interaction=nonstopmode -output-directory=${tmpDir} ${texPath}`
    );

    const pdfPath = path.join(tmpDir, 'preview.pdf');
    if (!fs.existsSync(pdfPath)) {
      res.status(503).json({ error: 'LaTeX compilation failed', detail: 'pdflatex exited cleanly but produced no PDF' });
      return;
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error: any) {
    const latexLog: string = error.stdout ?? '';
    // Keep first 60 lines of pdflatex log — includes ! errors, l. context, and the
    // "recently read" lines in between that show what LaTeX was processing.
    const detail = latexLog.split('\n').slice(0, 60).join('\n') || error.message || String(error);
    logger.error('[GET /api/templates/:id/preview-pdf]', error);
    res.status(503).json({ error: 'LaTeX compilation failed', detail });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

export default router;
