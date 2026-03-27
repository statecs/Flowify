import dotenv from 'dotenv';

dotenv.config();

export const PORT = parseInt(process.env.PORT || '5073');
export const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
export const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '50');
