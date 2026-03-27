import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { pool, RowDataPacket } from '../db';
import { logger } from '../logger';
import { requireApiKey } from '../middleware/auth';
import { renderTemplate, saveOutput } from '../services/templateService';

const execAsync = promisify(exec);

const router = Router();

router.post('/:id/accept', requireApiKey, async (req, res) => {
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

router.get('/:id/output-pdf', requireApiKey, async (req, res) => {
  const tmpDir = path.join(os.tmpdir(), crypto.randomUUID());
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT o.latex_content, d.original_filename
       FROM outputs o JOIN documents d ON o.document_id = d.id
       WHERE o.document_id = ?
       ORDER BY o.created_at DESC LIMIT 1`,
      [req.params.id]
    );
    if (rows.length === 0) { res.status(404).json({ error: 'Output not found' }); return; }

    const latexContent: string = rows[0].latex_content;

    fs.mkdirSync(tmpDir, { recursive: true });
    const texPath = path.join(tmpDir, 'output.tex');
    fs.writeFileSync(texPath, latexContent, 'utf-8');

    await execAsync(
      `pdflatex -interaction=nonstopmode -output-directory=${tmpDir} ${texPath}`
    );

    const pdfPath = path.join(tmpDir, 'output.pdf');
    if (!fs.existsSync(pdfPath)) {
      res.status(503).json({ error: 'LaTeX compilation failed', detail: 'pdflatex produced no PDF' });
      return;
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error: any) {
    const latexLog: string = error.stdout ?? '';
    const detail = latexLog.split('\n').slice(0, 60).join('\n') || error.message || String(error);
    logger.error('[GET /api/documents/:id/output-pdf]', error);
    res.status(503).json({ error: 'LaTeX compilation failed', detail });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

router.patch('/:id/output', requireApiKey, async (req, res) => {
  const { latex_content } = req.body;
  if (!latex_content) { res.status(400).json({ error: 'latex_content is required' }); return; }
  try {
    await pool.execute(
      'UPDATE outputs SET latex_content = ? WHERE document_id = ? ORDER BY created_at DESC LIMIT 1',
      [latex_content, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    logger.error('[PATCH /api/documents/:id/output]', error);
    res.status(500).json({ error: 'Failed to update output' });
  }
});

router.get('/:id/output', requireApiKey, async (req, res) => {
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

export default router;
