import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { UPLOAD_DIR, MAX_FILE_SIZE_MB } from '../config';

// Ensure upload directories exist at module-load time
fs.mkdirSync(path.join(UPLOAD_DIR, 'documents'), { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, 'pages'), { recursive: true });

const documentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(UPLOAD_DIR, 'documents')),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

export const documentUpload = multer({
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

export const templateUpload = multer({ storage: templateStorage });
