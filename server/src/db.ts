import mysql, { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import dotenv from 'dotenv';
import { logger } from './logger';

dotenv.config();

export { RowDataPacket, ResultSetHeader };

export const pool: Pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
});

const CV_FIELD_SCHEMA = [
  { key: 'name', label: 'Full Name', type: 'text', required: true },
  { key: 'subtitle', label: 'Subtitle / Role', type: 'text', required: false },
  { key: 'summary', label: 'Professional Summary', type: 'textarea', required: false },
  {
    key: 'work_experience', label: 'Work Experience', type: 'json_array', required: false,
    item_schema: [
      { key: 'date_range', label: 'Date Range', type: 'text' },
      { key: 'title', label: 'Job Title', type: 'text' },
      { key: 'company', label: 'Company', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'bullet_points', label: 'Bullet Points', type: 'string_array' }
    ]
  },
  {
    key: 'education', label: 'Education', type: 'json_array', required: false,
    item_schema: [
      { key: 'date_range', label: 'Date Range', type: 'text' },
      { key: 'degree', label: 'Degree', type: 'text' },
      { key: 'institution', label: 'Institution', type: 'text' }
    ]
  },
  {
    key: 'skills', label: 'Skills', type: 'json_object', required: false,
    object_keys: [
      { key: 'Methods', label: 'Methods' },
      { key: 'Tools', label: 'Tools' },
      { key: 'Tech', label: 'Tech' },
      { key: 'Standards', label: 'Standards' },
      { key: 'Languages', label: 'Languages' }
    ]
  },
  { key: 'portfolio', label: 'Portfolio', type: 'string_array', required: false }
];

const INVOICE_FIELD_SCHEMA = [
  { key: 'invoice_number', label: 'Invoice Number', type: 'text', required: true },
  { key: 'date', label: 'Date', type: 'text', required: true },
  { key: 'due_date', label: 'Due Date', type: 'text', required: false },
  { key: 'vendor_name', label: 'Vendor Name', type: 'text', required: true },
  { key: 'vendor_address', label: 'Vendor Address', type: 'textarea', required: false },
  { key: 'client_name', label: 'Client Name', type: 'text', required: true },
  { key: 'client_address', label: 'Client Address', type: 'textarea', required: false },
  {
    key: 'line_items', label: 'Line Items', type: 'json_array', required: false,
    item_schema: [
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'quantity', label: 'Quantity', type: 'text' },
      { key: 'unit_price', label: 'Unit Price', type: 'text' },
      { key: 'total', label: 'Total', type: 'text' }
    ]
  },
  { key: 'subtotal', label: 'Subtotal', type: 'text', required: false },
  { key: 'tax', label: 'Tax', type: 'text', required: false },
  { key: 'total', label: 'Total', type: 'text', required: true },
  { key: 'notes', label: 'Notes', type: 'textarea', required: false }
];

const RECEIPT_FIELD_SCHEMA = [
  { key: 'merchant_name', label: 'Merchant Name', type: 'text', required: true },
  { key: 'date', label: 'Date', type: 'text', required: true },
  { key: 'total', label: 'Total Amount', type: 'text', required: true },
  { key: 'payment_method', label: 'Payment Method', type: 'text', required: false },
  {
    key: 'items', label: 'Items', type: 'json_array', required: false,
    item_schema: [
      { key: 'name', label: 'Item Name', type: 'text' },
      { key: 'price', label: 'Price', type: 'text' }
    ]
  },
  { key: 'tax', label: 'Tax', type: 'text', required: false },
  { key: 'notes', label: 'Notes', type: 'textarea', required: false }
];

const GENERIC_FIELD_SCHEMA = [
  { key: 'title', label: 'Title', type: 'text', required: false },
  { key: 'summary', label: 'Summary', type: 'textarea', required: false },
  { key: 'key_fields', label: 'Key Fields', type: 'json_object', required: false, object_keys: [] },
  { key: 'raw_content', label: 'Raw Content', type: 'textarea', required: false }
];

const SEED_DOCUMENT_TYPES = [
  { id: 'dt-cv', name: 'cv', label: 'CV / Resume', field_schema: JSON.stringify(CV_FIELD_SCHEMA) },
  { id: 'dt-invoice', name: 'invoice', label: 'Invoice', field_schema: JSON.stringify(INVOICE_FIELD_SCHEMA) },
  { id: 'dt-receipt', name: 'receipt', label: 'Receipt', field_schema: JSON.stringify(RECEIPT_FIELD_SCHEMA) },
  { id: 'dt-generic', name: 'generic', label: 'Generic Document', field_schema: JSON.stringify(GENERIC_FIELD_SCHEMA) },
];

// Default CV LaTeX template with placeholders
const DEFAULT_CV_TEMPLATE = `\\documentclass[a4paper,10pt]{article}
\\usepackage[a4paper, top=1.5cm, bottom=1.5cm, left=1.8cm, right=1.8cm]{geometry}
\\usepackage{longtable}
\\usepackage{array}
\\usepackage{parskip}
\\usepackage{hyperref}
\\usepackage{enumitem}
\\usepackage{fontenc}
\\usepackage{inputenc}

\\hypersetup{colorlinks=true, urlcolor=blue}

\\begin{document}
\\pagestyle{empty}

% Header
{\\Huge {{name}}}\\\\[4pt]
{\\footnotesize{\\textit{{{subtitle}}}}}

\\vspace{8pt}
\\hrule
\\vspace{8pt}

% Work Experience
\\section*{Work Experience}
\\begin{longtable}{@{} p{2.8cm} p{13.5cm} @{}}
{{#work_experience}}
{{date_range}} & \\textbf{{{title}}} --- {{company}} \\\\
& {{description}} \\\\
{{#bullet_points}}
& \\textbullet\\ {{.}} \\\\
{{/bullet_points}}
& \\\\
{{/work_experience}}
\\end{longtable}

% Education
\\section*{Education}
\\begin{longtable}{@{} p{2.8cm} p{13.5cm} @{}}
{{#education}}
{{date_range}} & \\textbf{{{degree}}} --- {{institution}} \\\\
& \\\\
{{/education}}
\\end{longtable}

% Skills
\\section*{Skills}
\\textbf{Methods:} {{skills_Methods}} \\\\
\\textbf{Tools:} {{skills_Tools}} \\\\
\\textbf{Tech:} {{skills_Tech}} \\\\
\\textbf{Standards:} {{skills_Standards}} \\\\
\\textbf{Languages:} {{skills_Languages}}

% Portfolio
\\section*{Portfolio}
{{#portfolio}}
\\href{{{.}}}{{{.}}} \\\\
{{/portfolio}}

\\end{document}`;

export async function initDatabase(): Promise<void> {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS document_types (
        id          CHAR(36) PRIMARY KEY,
        name        VARCHAR(100) NOT NULL UNIQUE,
        label       VARCHAR(100) NOT NULL,
        field_schema JSON NOT NULL,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS templates (
        id               CHAR(36) PRIMARY KEY,
        document_type_id CHAR(36) NOT NULL,
        name             VARCHAR(200) NOT NULL,
        description      TEXT,
        latex_content    LONGTEXT NOT NULL,
        is_default       TINYINT(1) DEFAULT 0,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_type_id) REFERENCES document_types(id)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS documents (
        id               CHAR(36) PRIMARY KEY,
        document_type_id CHAR(36) NOT NULL,
        original_filename VARCHAR(500) NOT NULL,
        file_path        VARCHAR(1000) NOT NULL,
        file_mime        VARCHAR(100) NOT NULL,
        file_size        INT NOT NULL,
        page_count       INT DEFAULT 0,
        status           ENUM('uploaded','processing','reviewing','accepted','generated') NOT NULL DEFAULT 'uploaded',
        error_message    TEXT,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (document_type_id) REFERENCES document_types(id)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS document_pages (
        id          CHAR(36) PRIMARY KEY,
        document_id CHAR(36) NOT NULL,
        page_number INT NOT NULL,
        image_path  VARCHAR(1000) NOT NULL,
        width       INT,
        height      INT,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        UNIQUE KEY unique_page (document_id, page_number)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS extractions (
        id            CHAR(36) PRIMARY KEY,
        document_id   CHAR(36) NOT NULL UNIQUE,
        raw_text      LONGTEXT,
        fields        JSON NOT NULL,
        status        ENUM('pending','reviewing','accepted') DEFAULT 'pending',
        input_tokens  INT DEFAULT 0,
        output_tokens INT DEFAULT 0,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS outputs (
        id            CHAR(36) PRIMARY KEY,
        document_id   CHAR(36) NOT NULL,
        template_id   CHAR(36) NOT NULL,
        latex_content LONGTEXT NOT NULL,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (template_id) REFERENCES templates(id)
      )
    `);

    // Idempotent migration: add preferred_template_id column if not exists
    try {
      await pool.execute(
        `ALTER TABLE documents ADD COLUMN preferred_template_id CHAR(36) NULL DEFAULT NULL`
      );
    } catch (err: any) {
      if (err.errno !== 1060) throw err; // 1060 = ER_DUP_FIELDNAME — already exists
    }

    // Idempotent migration: add photo_path column if not exists
    try {
      await pool.execute(
        `ALTER TABLE documents ADD COLUMN photo_path VARCHAR(1000) NULL DEFAULT NULL`
      );
    } catch (err: any) {
      if (err.errno !== 1060) throw err; // 1060 = ER_DUP_FIELDNAME
    }

    // Seed document types
    for (const dt of SEED_DOCUMENT_TYPES) {
      await pool.execute(
        `INSERT IGNORE INTO document_types (id, name, label, field_schema) VALUES (?, ?, ?, ?)`,
        [dt.id, dt.name, dt.label, dt.field_schema]
      );
    }

    // Seed default CV template
    await pool.execute(
      `INSERT IGNORE INTO templates (id, document_type_id, name, description, latex_content, is_default) VALUES (?, ?, ?, ?, ?, 1)`,
      ['tmpl-cv-default', 'dt-cv', 'Default CV Template', 'Standard CV template with work experience, education, and skills sections', DEFAULT_CV_TEMPLATE]
    );

    // Idempotent migration: inject summary field into CV schema if missing
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT field_schema FROM document_types WHERE id = 'dt-cv'`
      );
      if (rows.length > 0) {
        const stored: any[] = typeof rows[0].field_schema === 'string'
          ? JSON.parse(rows[0].field_schema)
          : rows[0].field_schema;
        const hasSummary = stored.some((f: any) => f.key === 'summary');
        if (!hasSummary) {
          await pool.execute(
            `UPDATE document_types SET field_schema = ? WHERE id = 'dt-cv'`,
            [JSON.stringify(CV_FIELD_SCHEMA)]
          );
          logger.log('[DB] Migrated CV field schema to include summary field');
        }
      }
    } catch (err) {
      logger.error('[DB] Failed to migrate CV field schema:', err);
    }

    logger.log('[DB] Database initialized successfully');
  } catch (error) {
    logger.error('[DB] Failed to initialize database:', error);
    throw error;
  }
}
