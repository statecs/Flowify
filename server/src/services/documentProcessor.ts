import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pool, RowDataPacket } from '../db';
import { extract } from './extractionService';
import { logger } from '../logger';

class NapiCanvasFactory {
  create(width: number, height: number) {
    const { createCanvas } = require('@napi-rs/canvas');
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(canvasAndContext: { canvas: any; context: any }, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
    canvasAndContext.context = canvasAndContext.canvas.getContext('2d');
  }
  destroy(canvasAndContext: { canvas: any; context: any }) {
    // Do NOT set canvas.width = 0 — that triggers an exclusive-reference error in
    // @napi-rs/canvas. Just null the refs and let GC handle the native object.
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

async function convertPdfToImages(buffer: Buffer, outputDir: string): Promise<string[]> {
  const { createCanvas } = require('@napi-rs/canvas');
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    canvasFactory: new NapiCanvasFactory(),
  }).promise;
  const paths: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx as any, viewport }).promise;
    const imgPath = path.join(outputDir, `page.${i}.png`);
    fs.writeFileSync(imgPath, canvas.toBuffer('image/png'));
    paths.push(imgPath);
  }

  return paths;
}

async function extractPhotoFromPdf(pdfBuffer: Buffer, documentId: string): Promise<void> {
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const photosDir = path.join(uploadDir, 'photos');
  fs.mkdirSync(photosDir, { recursive: true });

  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  const sharp = require('sharp');

  const pdfDoc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    canvasFactory: new NapiCanvasFactory(),
  }).promise;

  const OPS = pdfjsLib.OPS;
  let bestImage: { data: Uint8ClampedArray | Uint8Array; width: number; height: number } | null = null;
  let bestScore = 0;

  const maxPages = Math.min(pdfDoc.numPages, 3);
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const opList = await page.getOperatorList();

    const imageNames = new Set<string>();
    for (let i = 0; i < opList.fnArray.length; i++) {
      if (opList.fnArray[i] === OPS.paintImageXObject) {
        imageNames.add(opList.argsArray[i][0]);
      }
    }

    for (const name of imageNames) {
      const imgData = await new Promise<any>((resolve) => {
        try {
          page.objs.get(name, (data: any) => resolve(data));
        } catch {
          resolve(null);
        }
      });

      if (!imgData || !imgData.data || !imgData.width || !imgData.height) continue;

      const { width, height } = imgData;
      if (width < 80 || height < 80) continue;
      if (width / height > 2.5) continue; // skip wide landscape images (logos, banners)

      const score = width * height;
      if (score > bestScore) {
        bestScore = score;
        bestImage = imgData;
      }
    }

    page.cleanup();
  }

  if (!bestImage) {
    logger.log(`[Processor] No suitable photo found in document ${documentId}`);
    return;
  }

  const photoPath = path.join(photosDir, `${documentId}.jpg`);
  const pixelCount = bestImage.width * bestImage.height;
  const channels = Math.max(3, Math.min(4, Math.round(bestImage.data.length / pixelCount)));

  await sharp(Buffer.from(bestImage.data), {
    raw: { width: bestImage.width, height: bestImage.height, channels },
  })
  .jpeg({ quality: 90 })
  .toFile(photoPath);

  await pool.execute('UPDATE documents SET photo_path = ? WHERE id = ?', [photoPath, documentId]);
  logger.log(`[Processor] Extracted photo for document ${documentId} → ${photoPath}`);
}

async function createWhitePlaceholder(outputDir: string): Promise<string> {
  const sharp = require('sharp');
  const placeholderPath = path.join(outputDir, 'page.1.png');
  await sharp({
    create: {
      width: 794,
      height: 1123,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  })
  .png()
  .toFile(placeholderPath);
  return placeholderPath;
}

export async function processDocument(documentId: string): Promise<void> {
  const uploadDir = process.env.UPLOAD_DIR || './uploads';

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM documents WHERE id = ?',
      [documentId]
    );

    if (rows.length === 0) {
      logger.error(`[Processor] Document ${documentId} not found`);
      return;
    }

    const doc = rows[0];

    await pool.execute(
      'UPDATE documents SET status = ?, error_message = NULL WHERE id = ?',
      ['processing', documentId]
    );

    logger.log(`[Processor] Processing document ${documentId} (${doc.original_filename})`);

    const pagesDir = path.join(uploadDir, 'pages', documentId);
    fs.mkdirSync(pagesDir, { recursive: true });

    let rawText = '';
    let imagePaths: string[] = [];

    if (doc.file_mime === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const pdfBuffer = fs.readFileSync(doc.file_path);
      const pdfData = await pdfParse(pdfBuffer);
      rawText = pdfData.text || '';

      try {
        imagePaths = await convertPdfToImages(pdfBuffer, pagesDir);
      } catch (e) {
        logger.error(`[Processor] PDF to image conversion failed:`, e);
      }

      // Best-effort photo extraction — failure must not abort processing
      try {
        await extractPhotoFromPdf(pdfBuffer, documentId);
      } catch (e) {
        logger.error(`[Processor] Photo extraction failed (non-fatal):`, e);
      }
    } else if (
      doc.file_mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: doc.file_path });
      rawText = result.value || '';
      imagePaths = [await createWhitePlaceholder(pagesDir)];
    } else if (
      doc.file_mime === 'application/msword' ||
      doc.file_mime === 'application/vnd.oasis.opendocument.text' ||
      doc.file_mime === 'application/rtf' ||
      doc.file_mime === 'text/rtf'
    ) {
      const officeparser = require('officeparser');
      try {
        rawText = await officeparser.parseOfficeAsync(doc.file_path);
      } catch (e) {
        logger.error(`[Processor] officeparser failed:`, e);
        rawText = '';
      }
      imagePaths = [await createWhitePlaceholder(pagesDir)];
    } else if (doc.file_mime === 'text/plain') {
      rawText = fs.readFileSync(doc.file_path, 'utf-8');
      imagePaths = [await createWhitePlaceholder(pagesDir)];
    } else if (doc.file_mime === 'image/png' || doc.file_mime === 'image/jpeg') {
      // No text extraction — pass image directly as the single page
      const sharp = require('sharp');
      const imgPath = path.join(pagesDir, 'page.1.png');
      await sharp(doc.file_path)
        .resize({ width: 1200, withoutEnlargement: true })
        .png()
        .toFile(imgPath);
      imagePaths = [imgPath];
      rawText = '';
    } else {
      throw new Error(`Unsupported file type: ${doc.file_mime}`);
    }

    // Save page records
    await pool.execute('DELETE FROM document_pages WHERE document_id = ?', [documentId]);

    for (let i = 0; i < imagePaths.length; i++) {
      const pageId = crypto.randomUUID();
      await pool.execute(
        'INSERT INTO document_pages (id, document_id, page_number, image_path) VALUES (?, ?, ?, ?)',
        [pageId, documentId, i + 1, imagePaths[i]]
      );
    }

    await pool.execute(
      'UPDATE documents SET page_count = ? WHERE id = ?',
      [imagePaths.length, documentId]
    );

    await extract(documentId, rawText, imagePaths);

    await pool.execute(
      'UPDATE documents SET status = ? WHERE id = ?',
      ['reviewing', documentId]
    );

    logger.log(`[Processor] Document ${documentId} processed successfully`);

  } catch (error: any) {
    logger.error(`[Processor] Failed to process document ${documentId}:`, error);
    await pool.execute(
      'UPDATE documents SET status = ?, error_message = ? WHERE id = ?',
      ['uploaded', error.message || 'Processing failed', documentId]
    );
  }
}
