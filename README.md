# Flowify

Turn uploaded PDFs and Word documents into polished, AI-populated LaTeX documents — with a browser-based review step in between.

---

## Features

- **Upload PDF or DOCX** — drag-and-drop or file picker; up to 50 MB
- **AI field extraction** — GPT-4o Vision reads each page and extracts structured fields (name, experience, education, skills, etc.)
- **Review UI** — edit extracted fields before generating output; page-by-page image preview alongside the form
- **LaTeX generation** — render a chosen LaTeX template with the reviewed fields
- **PDF preview** — compile the rendered template with `pdflatex` and display the result in-browser
- **Multi-template support** — upload multiple templates per document type, set a default, switch at generation time

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Node.js, Express, TypeScript |
| Database | MySQL 8 |
| AI | OpenAI GPT-4o Vision (extraction), optional Anthropic Claude |
| Document processing | pdfjs-dist, sharp, @napi-rs/canvas |
| LaTeX compilation | pdflatex (TeX Live) |

---

## Prerequisites

Install these before setup:

- **Node.js** ≥ 20
- **MySQL** ≥ 8
- **TeX Live** (for PDF preview) — `brew install --cask mactex` / `apt install texlive-full`

  <details>
  <summary>Ubuntu server setup</summary>

  ```bash
  # Install TeX Live (full distribution — includes pdflatex)
  sudo apt update
  sudo apt install -y texlive-full

  # Verify pdflatex is available
  pdflatex --version
  ```

  If `pdflatex` is not found after install, add the TeX Live bin directory to your PATH:

  ```bash
  # Find the exact bin path
  find /usr/share/texlive -name pdflatex -type f 2>/dev/null

  # Add to PATH permanently (replace x86_64-linux with your arch if different)
  echo 'export PATH="/usr/share/texlive/bin/x86_64-linux:$PATH"' >> ~/.bashrc
  source ~/.bashrc

  # Verify
  pdflatex --version
  ```

  > **Note:** `texlive-full` is large (~5 GB). For a minimal install use `texlive-latex-extra` instead — it includes `pdflatex` and common packages but is much smaller.
  </details>
- An **OpenAI API key** with access to `gpt-4o`

---

## Setup

```bash
# 1. Clone
git clone https://github.com/statecs/flowify.git
cd flowify

# 2. Install frontend dependencies
npm install

# 3. Install backend dependencies
cd server && npm install && cd ..

# 4. Configure frontend environment
cp .env.example .env
# Edit .env — set VITE_API_URL=http://localhost:5073

# 5. Configure backend environment
cp server/.env.example server/.env
# Edit server/.env — set DB_*, OPENAI_API_KEY, ADMIN_API_KEY

# 6. Create the database and run migrations
mysql -u root -p -e "CREATE DATABASE flowify;"
# (apply schema — see server/src/db.ts for table definitions)

# 7. Start the backend
cd server && npm run dev

# 8. Start the frontend (new terminal, repo root)
npm run dev
```

Frontend: http://localhost:8080
Backend: http://localhost:5073

Log in with the value you set for `ADMIN_API_KEY` in `server/.env`.

---

## Environment Variables

### Frontend (`/.env`)

| Variable | Example | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5073` | Backend base URL |
| `SFTP_HOST` | `deploy.example.com` | Deploy host (optional) |
| `SFTP_PORT` | `22` | Deploy SSH port |
| `SFTP_USERNAME` | `deploy` | Deploy SSH user |
| `SFTP_PASSWORD` | `••••••` | Deploy SSH password |
| `REMOTE_DIR` | `/var/www/flowify` | Remote frontend path |

### Backend (`/server/.env`)

| Variable | Example | Description |
|---|---|---|
| `PORT` | `5073` | HTTP listen port |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USER` | `flowify` | MySQL user |
| `DB_PASSWORD` | `••••••` | MySQL password |
| `DB_NAME` | `flowify` | MySQL database |
| `OPENAI_API_KEY` | `sk-proj-...` | OpenAI key for extraction |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Anthropic key (optional) |
| `ADMIN_API_KEY` | `change-me` | Shared secret for all API calls |
| `FRONTEND_URL` | `http://localhost:8080` | Allowed CORS origin |
| `UPLOAD_DIR` | `./uploads` | Local upload storage path |
| `MAX_FILE_SIZE_MB` | `50` | Upload size limit |

---

## Usage

1. **Log in** — enter your `ADMIN_API_KEY` on the login screen.
2. **Upload** — go to Upload, pick a PDF or DOCX, choose the document type (e.g. CV), and submit.
3. **Wait for processing** — the document is queued; the dashboard shows live status (`processing` → `ready`).
4. **Review** — open the document, inspect each extracted field against the page preview, and edit as needed.
5. **Generate** — click "Accept & Generate", choose a LaTeX template, and download the `.tex` file or preview the compiled PDF.

---

## API Reference

All endpoints require the header `x-api-key: <ADMIN_API_KEY>`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/document-types` | List supported document types |
| `GET` | `/api/templates` | List templates (optional `?document_type_id=`) |
| `POST` | `/api/templates` | Upload a new LaTeX template (multipart) |
| `DELETE` | `/api/templates/:id` | Delete a template |
| `PATCH` | `/api/templates/:id/set-default` | Set template as default |
| `GET` | `/api/templates/:id/preview-pdf` | Render template with sample data → PDF |
| `POST` | `/api/documents/upload` | Upload a document for processing (multipart) |
| `GET` | `/api/documents` | List documents (pagination, status filter) |
| `GET` | `/api/documents/:id` | Get document detail with extracted fields |
| `PUT` | `/api/documents/:id/extraction` | Update extracted fields |
| `POST` | `/api/documents/:id/accept` | Accept fields and render template |
| `GET` | `/api/documents/:id/output` | Download rendered `.tex` file |
| `POST` | `/api/documents/:id/reprocess` | Re-run AI extraction |
| `DELETE` | `/api/documents/:id` | Delete a document |
| `GET` | `/api/documents/:id/pages/:n/image` | Get page preview image |

---

## Deployment

Both the frontend and backend have release scripts that build, then SFTP the output to a remote server.

```bash
# Deploy frontend (from repo root)
npm run release

# Deploy backend (from server/)
npm run release
```

Configure `SFTP_*` and `REMOTE_DIR` in each package's `.env` before running. The backend release script runs `tsc` first; start/restart the process on the server with PM2 or your process manager of choice.

---

## Project Structure

```
flowify/
├── src/                        # React frontend
│   ├── App.tsx                 # Routes and layout
│   ├── lib/api.ts              # Typed API client
│   ├── contexts/               # AuthContext
│   ├── components/             # UI components (shadcn/ui)
│   └── pages/                  # Page components
├── server/
│   └── src/
│       ├── server.ts           # Express entry point
│       ├── config.ts           # Env-based config
│       ├── db.ts               # MySQL pool
│       ├── ai.ts               # AI client wrappers
│       ├── middleware/         # Auth, upload (multer)
│       ├── routes/             # Route handlers
│       └── services/           # documentProcessor, extractionService, templateService
├── vite.config.ts
├── tailwind.config.ts
├── CLAUDE.md                   # Guide for Claude AI
└── package.json
```
