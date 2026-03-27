Flowify — Implementation Plan

 Context

 Flowify is a document extraction and reformatting system. The primary use case is CV conversion: companies receive CVs in all formats and manually
 extract/reformat them. Flowify automates this by (1) extracting page screenshots + raw text from uploaded documents, (2) using OpenAI GPT-4o Vision to
  extract structured fields, (3) letting an admin review and edit the extraction side-by-side with screenshots, and (4) generating a LaTeX-formatted
 output using a stored template.

 The architecture mirrors the tumble project exactly: React+Vite+TypeScript+Tailwind+shadcn/ui frontend, Express+TypeScript+MySQL backend, SFTP+PM2
 deployment, API-key auth via x-api-key header.

 The extraction pipeline is designed to be extensible — new document types (invoices, receipts) are added by defining a field_schema JSON, not by
 changing service code.

---

 File Structure

 /Users/statecs/Git/Flowify/
 ├── index.html
 ├── package.json                   # Frontend (Vite/React)
 ├── vite.config.ts
 ├── tailwind.config.ts
 ├── postcss.config.js
 ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
 ├── components.json                # shadcn/ui config
 ├── .env / .env.example
 ├── release.js                     # SFTP deploy (frontend)
 │
 ├── src/
 │   ├── main.tsx
 │   ├── App.tsx                    # Routes + AuthProvider + ProtectedRoute
 │   ├── index.css
 │   ├── contexts/AuthContext.tsx   # API key → localStorage('flowify\_api\_key')
 │   ├── lib/
 │   │   ├── api.ts                 # Typed request() + requestFile() helpers
 │   │   └── utils.ts               # cn() helper
 │   ├── components/
 │   │   ├── Navbar.tsx
 │   │   ├── StatusBadge.tsx
 │   │   └── ui/                    # shadcn/ui primitives
 │   └── pages/
 │       ├── LoginPage.tsx
 │       ├── DashboardPage.tsx      # Document list, status badges, polling
 │       ├── UploadPage.tsx         # File drag-drop + document type select
 │       ├── ReviewPage.tsx         # Split: page screenshots | editable fields
 │       └── TemplatesPage.tsx      # Manage LaTeX templates
 │
 └── server/
     ├── package.json
     ├── tsconfig.json
     ├── ecosystem.config.js        # PM2: name=flowify-api, port=5073
     ├── .env / .env.example
     ├── release.js
     ├── uploads/                   # gitignored runtime dir
     │   ├── documents/             # original uploaded files
     │   └── pages/                 # per-page PNG screenshots
     └── src/
         ├── server.ts              # Express app, routes, auth middleware
         ├── db.ts                  # MySQL pool + initDatabase()
         ├── ai.ts                  # callOpenAIVision() + callOpenAI()
         ├── prompts.ts             # Extraction system/user prompt builders
         ├── processingQueue.ts     # In-memory async job queue (setImmediate)
         ├── logger.ts              # Copy from tumble
         └── services/
             ├── documentProcessor.ts  # Orchestrates PDF→images+text → AI
             ├── extractionService.ts  # Calls AI, parses JSON, writes to DB
             └── templateService.ts    # Fills {{placeholders}} in LaTeX template

---

 Database Schema (MySQL)

 Same initDatabase() + CREATE TABLE IF NOT EXISTS + INSERT IGNORE pattern as tumble.

 CREATE TABLE IF NOT EXISTS document_types (
   id          CHAR(36) PRIMARY KEY,
   name        VARCHAR(100) NOT NULL UNIQUE,  -- 'cv', 'invoice', 'receipt', 'generic'
   label       VARCHAR(100) NOT NULL,
   field_schema JSON NOT NULL,                -- array of field definitions
   created\_at  TIMESTAMP DEFAULT CURRENT\_TIMESTAMP
 );

 CREATE TABLE IF NOT EXISTS templates (
   id               CHAR(36) PRIMARY KEY,
   document\_type\_id CHAR(36) NOT NULL,
   name             VARCHAR(200) NOT NULL,
   description      TEXT,
   latex_content    LONGTEXT NOT NULL,         -- with {{placeholders}}
   is_default       TINYINT(1) DEFAULT 0,
   created\_at       TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,
   FOREIGN KEY (document\_type\_id) REFERENCES document_types(id)
 );

 CREATE TABLE IF NOT EXISTS documents (
   id               CHAR(36) PRIMARY KEY,
   document\_type\_id CHAR(36) NOT NULL,
   original_filename VARCHAR(500) NOT NULL,
   file_path        VARCHAR(1000) NOT NULL,
   file_mime        VARCHAR(100) NOT NULL,
   file_size        INT NOT NULL,
   page_count       INT DEFAULT 0,
   status           ENUM('uploaded','processing','reviewing','accepted','generated')
                    NOT NULL DEFAULT 'uploaded',
   error_message    TEXT,
   created\_at       TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,
   updated\_at       TIMESTAMP DEFAULT CURRENT\_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   FOREIGN KEY (document\_type\_id) REFERENCES document_types(id)
 );

 CREATE TABLE IF NOT EXISTS document_pages (
   id          CHAR(36) PRIMARY KEY,
   document_id CHAR(36) NOT NULL,
   page_number INT NOT NULL,
   image_path  VARCHAR(1000) NOT NULL,
   width INT, height INT,
   created\_at  TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,
   FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
   UNIQUE KEY unique\_page (document\_id, page_number)
 );

 CREATE TABLE IF NOT EXISTS extractions (
   id            CHAR(36) PRIMARY KEY,
   document_id   CHAR(36) NOT NULL UNIQUE,
   raw_text      LONGTEXT,
   fields        JSON NOT NULL,               -- AI-extracted fields
   status        ENUM('pending','reviewing','accepted') DEFAULT 'pending',
   input_tokens  INT DEFAULT 0,
   output_tokens INT DEFAULT 0,
   created\_at    TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,
   updated\_at    TIMESTAMP DEFAULT CURRENT\_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
 );

 CREATE TABLE IF NOT EXISTS outputs (
   id            CHAR(36) PRIMARY KEY,
   document_id   CHAR(36) NOT NULL,
   template_id   CHAR(36) NOT NULL,
   latex_content LONGTEXT NOT NULL,
   created\_at    TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,
   FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
   FOREIGN KEY (template_id) REFERENCES templates(id)
 );

 Seeded on startup:

- 4 document types: cv, invoice, receipt, generic — each with field_schema JSON
- 1 default CV template: the Christopher State LaTeX template converted to use {{placeholders}}

---

 API Routes (all require x-api-key except /health)

 ┌────────┬───────────────────────────────────┬────────────────────────────────────────────────────┐
 │ Method │               Route               │                    Description                     │
 ├────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
 │ GET    │ /health                           │ Health check                                       │
 ├────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
 │ GET    │ /api/document-types               │ List document types + field schemas                │
 ├────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
 │ GET    │ /api/templates                    │ List templates (?document\_type\_id=)                │
 ├────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
 │ GET    │ /api/templates/:id                │ Get template with full latex_content               │
 ├────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
 │ POST   │ /api/templates                    │ Upload .tex file as new template (multipart)       │
 ├────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
 │ DELETE │ /api/templates/:id                │ Delete template                                    │
 ├────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
 │ POST   │ /api/documents/upload             │ Upload document → returns 202, enqueues processing │
 ├────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
 │ GET    │ /api/documents                    │ List documents with pagination + status filter     │
 ├────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
 │ GET    │ /api/documents/:id                │ Get document + pages + extraction                  │
 ├────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
 │ DELETE │ /api/documents/:id                │ Delete document + files                            │
 ├────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
 │ GET    │ /api/documents/:id/pages/:n/image │ Stream page PNG (auth-gated)                       │
 ├────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
 │ PUT    │ /api/documents/:id/extraction     │ Update extraction fields (admin corrections)       │
 ├────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
 │ POST   │ /api/documents/:id/accept         │ Accept → generate LaTeX output                     │
 ├────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
 │ GET    │ /api/documents/:id/output         │ Download generated .tex file                       │
 ├────────┼───────────────────────────────────┼────────────────────────────────────────────────────┤
 │ POST   │ /api/documents/:id/reprocess      │ Re-run AI extraction                               │
 └────────┴───────────────────────────────────┴────────────────────────────────────────────────────┘

---

 Processing Pipeline (documentProcessor.ts)

 processDocument(documentId):

1. SET status = 'processing'
2. Read file from disk
3. Branch on MIME:
   PDF  → pdf-parse (text) + pdf2pic (PNG per page, requires Ghostscript)
   DOCX → mammoth.extractRawText (text) + single placeholder image (v1)
4. sharp().resize(max 1200px).png() each page image → save to uploads/pages/{docId}/
5. INSERT document_pages rows
6. UPDATE documents.page_count
7. Call extractionService.extract(docId, rawText, imagePathArray)
8. On success → SET status = 'reviewing'
9. On failure → SET status = 'uploaded', SET error_message

 Queue (processingQueue.ts): Simple Map<string, job> + setImmediate(). No Redis needed for single-instance PM2 deployment. Reprocess endpoint handles
 restarts.

---

 AI Extraction (extractionService.ts + prompts.ts)

 extract(documentId, rawText, imagePaths):

1. Fetch document\_type.field\_schema
2. Build system prompt: describe expected JSON fields from schema
3. Build user content array (OpenAI vision format):
   - text part: raw_text (capped at 8000 chars)
   - image parts: up to 5 pages as base64 data:image/png;base64,... with detail:'high'
4. Call callOpenAIVision('gpt-4o', system, contentParts, maxTokens=4000)
   with response\_format: { type: 'json\_object' }
5. Parse JSON response, validate keys against field_schema
6. INSERT INTO extractions (fields, raw_text, status='pending', tokens)

 System prompt pattern (from prompts.ts):
 You are a document data extraction specialist. Extract the following fields
 and return ONLY valid JSON with no other text:

- name (Full Name): text
- work\_experience (Work Experience): array of {date\_range, title, company, description, bullet_points[]}
- education: array of {date_range, degree, institution}
- skills: object with category keys (Methods, Tools, Tech, Standards, Languages)
- portfolio: string array

 Rules: null for missing scalars, [] for missing arrays, preserve exact text, no paraphrasing.

---

 Template Service (templateService.ts)

 LaTeX escaping is critical — all substituted values must escape: & % $ # _ { } ~ ^ \

 render(templateId, fields):

1. Fetch latex_content
2. Replace {{scalar_key}} with escaped string value
3. Replace {{#array\_key}}...{{/array\_key}} blocks:
   - Render each array item using the block body as a sub-template
   - Join rendered items
4. INSERT INTO outputs, return latex_content

 CV template placeholder mapping (from the Christopher State .tex file):

 ┌──────────────────────────────────────┬────────────────────────────┐
 │            LaTeX location            │        Placeholder         │
 ├──────────────────────────────────────┼────────────────────────────┤
 │ \Huge Christopher State              │ {{name}}                   │
 ├──────────────────────────────────────┼────────────────────────────┤
 │ \footnotesize{\textit{...}} subtitle │ {{subtitle}}               │
 ├──────────────────────────────────────┼────────────────────────────┤
 │ Each longtable work row              │ {{#work_experience}} block │
 ├──────────────────────────────────────┼────────────────────────────┤
 │ Each longtable education row         │ {{#education}} block       │
 ├──────────────────────────────────────┼────────────────────────────┤
 │ \textbf{Methods:} line               │ {{skills_methods}}         │
 ├──────────────────────────────────────┼────────────────────────────┤
 │ \textbf{Tools:} line                 │ {{skills_tools}}           │
 ├──────────────────────────────────────┼────────────────────────────┤
 │ \textbf{Tech:} line                  │ {{skills_tech}}            │
 ├──────────────────────────────────────┼────────────────────────────┤
 │ \textbf{Standards:} line             │ {{skills_standards}}       │
 ├──────────────────────────────────────┼────────────────────────────┤
 │ \textbf{Languages:} line             │ {{skills_languages}}       │
 ├──────────────────────────────────────┼────────────────────────────┤
 │ \href{...} portfolio                 │ {{portfolio}}              │
 └──────────────────────────────────────┴────────────────────────────┘

---

 Frontend Pages

 DashboardPage

- Table of documents: filename, type badge, status badge, date, Review/Delete actions
- Status badges: uploaded(gray), processing(yellow+pulse), reviewing(blue), accepted(green), generated(purple)
- Auto-polls every 3s for documents in processing state

 UploadPage

- Document type selector (from GET /api/document-types)
- File drag-drop zone (PDF, DOCX, max 50MB)
- POST /api/documents/upload → navigate to dashboard

 ReviewPage (the main page — split layout)

 Left panel: Page image viewer with thumbnail strip, prev/next navigation. Images fetched as binary via requestFile() with API key header, rendered via
  URL.createObjectURL().

 Right panel: Dynamic field form driven by document\_type.field\_schema:

- text → <Input>
- textarea → <Textarea>
- json\_array → repeatable sub-form cards (add/remove/reorder), each item has its item\_schema fields
- string_array → tag-style chips with add/remove
- json_object → key-value editor

 Actions:

- Save Changes → PUT /api/documents/:id/extraction
- Accept & Generate → dialog: select template → POST /api/documents/:id/accept → show LaTeX in <pre> + Download button

 TemplatesPage

- Templates grouped by document type
- Upload dialog: .tex file input, name, type, default checkbox
- Preview modal: monospace latex_content display

---

 Environment Variables

 Frontend .env.example

 VITE\_API\_URL=[https://flowify-api.example.com](https://flowify-api.example.com "‌")
 SFTP_HOST=
 SFTP_PORT=22
 SFTP_USERNAME=
 SFTP_PASSWORD=
 REMOTE_DIR=/var/www/flowify.example.com

 Backend server/.env.example

 PORT=5073
 DB_HOST=localhost
 DB_PORT=3306
 DB_USER=flowify
 DB_PASSWORD=
 DB_NAME=flowify
 OPENAI\_API\_KEY=sk-proj-...
 ANTHROPIC\_API\_KEY=sk-ant-...
 ADMIN\_API\_KEY=change-me
 FRONTEND_URL=[https://flowify.example.com](https://flowify.example.com "‌")
 UPLOAD_DIR=./uploads
 MAX\_FILE\_SIZE_MB=50
 SFTP_HOST=
 SFTP_PORT=22
 SFTP_USERNAME=
 SFTP_PASSWORD=
 REMOTE_DIR=/var/www/flowify-api.example.com

---

 Key Dependencies

 Backend (server/package.json)

 express, mysql2, cors, dotenv, express-rate-limit, multer,
 pdf-parse, pdf2pic, mammoth, sharp, node-ssh
 ▎ System deps on server: Ghostscript + GraphicsMagick required by pdf2pic for PDF→PNG conversion.

 Frontend (package.json)

 react, react-dom, react-router-dom, tailwindcss,
 \@radix-ui/* (dialog, select, label, toast, tooltip, progress, separator, slot),
 lucide-react, sonner, class-variance-authority, clsx, tailwind-merge

---

 Implementation Order

1. Backend foundation: logger.ts (copy tumble) → db.ts (schema + seeds) → server.ts (auth + health + document-types) → ai.ts (vision call)
2. Upload pipeline: multer config → processingQueue.ts → documentProcessor.ts → prompts.ts → extractionService.ts
3. Review + output routes: GET documents, page image streaming, PUT extraction, templateService.ts, POST accept, GET output
4. Frontend scaffold: Vite setup, copy tumble configs → AuthContext → api.ts → shadcn/ui components → Login + Navbar
5. Pages in order: Dashboard (with polling) → Upload → Review → Templates
6. Release scripts: Copy from tumble, update app names/ports/remote dirs

---

 Verification

1. npm run dev (frontend port 8080) + npm run dev (backend port 5073) both start cleanly
2. Upload the provided CV (.net).docx.pdf → status transitions to processing → reviewing
3. Open ReviewPage: left panel shows PDF page screenshots, right panel shows extracted fields (name, work experience entries, education, skills)
4. Edit a field, save, confirm PUT /api/documents/:id/extraction persists
5. Accept with the default CV template → downloaded .tex compiles with pdflatex without errors
6. Upload the provided CV English.docx → same flow works for DOCX (text extraction, placeholder image on left)
7. Upload a custom template via TemplatesPage → verify it appears as selectable on Accept dialog