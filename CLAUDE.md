# Flowify — Claude Guide

## Project Overview

Flowify is a document intake pipeline that converts uploaded PDFs and Word documents into structured, AI-extracted data and then renders that data into formatted LaTeX documents (e.g. CVs). Users upload a document, review and correct the AI-extracted fields in a browser UI, and then generate a polished PDF from a LaTeX template.

---

## Architecture

Monorepo with two packages:

| Package | Root | Purpose |
|---|---|---|
| Frontend | `/` (repo root) | React + Vite SPA, runs on port **8080** |
| Backend | `server/` | Express API, runs on port **5073** |

```
/
├── src/                    # React frontend
│   ├── App.tsx             # Router, ProtectedRoute, AppLayout
│   ├── main.tsx            # React root
│   ├── lib/api.ts          # Typed API client (all fetch calls go here)
│   ├── lib/utils.ts
│   ├── contexts/AuthContext.tsx   # API key auth state
│   ├── components/         # UI components (shadcn/ui based)
│   └── pages/              # LoginPage, DashboardPage, UploadPage, ReviewPage, TemplatesPage
├── server/
│   └── src/
│       ├── server.ts       # Express app — mounts all routes
│       ├── config.ts       # PORT, UPLOAD_DIR, MAX_FILE_SIZE_MB
│       ├── db.ts           # MySQL connection pool
│       ├── ai.ts           # OpenAI / Anthropic client calls
│       ├── prompts.ts      # AI prompt templates
│       ├── processingQueue.ts   # Async document processing queue
│       ├── middleware/
│       │   ├── auth.ts     # requireApiKey — checks x-api-key header
│       │   └── upload.ts   # multer configs for documents and templates
│       ├── routes/         # health, documentTypes, templates, documents, outputs
│       └── services/
│           ├── documentProcessor.ts   # PDF→images, text extraction
│           ├── extractionService.ts   # AI field extraction
│           └── templateService.ts     # LaTeX rendering (renderTemplate, saveOutput)
├── vite.config.ts
├── tailwind.config.ts
├── components.json         # shadcn/ui config
└── release.js              # SFTP deploy script
```

---

## Dev Commands

**Frontend** (run from repo root):
```bash
npm install
npm run dev          # Vite dev server → http://localhost:8080
npm run build        # Production build → dist/
npm run lint
npm run release      # Build + SFTP deploy
```

**Backend** (run from `server/`):
```bash
npm install
npm run dev          # tsc -w + nodemon → http://localhost:5073
npm run build        # tsc → dist/
npm start            # node dist/server.js
npm run release      # Build + SFTP deploy
```

---

## Key Files

| File | Purpose |
|---|---|
| `src/lib/api.ts` | All API calls. Add new endpoints here. Auth header injected automatically. |
| `src/contexts/AuthContext.tsx` | Reads/writes `flowify_api_key` in localStorage |
| `server/src/server.ts` | Express app — imports and mounts route modules |
| `server/src/config.ts` | All server constants from env vars |
| `server/src/db.ts` | MySQL pool; also defines field schema used for extraction |
| `server/src/middleware/auth.ts` | `requireApiKey` — applied to all `/api/*` routes |
| `server/src/services/templateService.ts` | `renderTemplate(templateId, fields)` — core LaTeX rendering |
| `server/src/ai.ts` | OpenAI/Anthropic API wrappers |

---

## Conventions

### Authentication
- API key only — no JWT, no sessions, no cookies.
- Header: `x-api-key: <ADMIN_API_KEY>`
- `requireApiKey` middleware is applied in `server.ts` before all `/api` routes.
- Frontend stores the key in `localStorage` under `flowify_api_key`.

### LaTeX Template Syntax
Templates use a custom `{{...}}` substitution syntax (not Handlebars):
- `{{field_name}}` — scalar placeholder; renders the field value, LaTeX-escaped.
- `{{#block_name}} ... {{/block_name}}` — block loop; iterates over an array field.
- Nested: `{{field}}` inside a block refers to the current item's field.
- Unresolved placeholders render as empty string.
- Implementation: `server/src/services/templateService.ts` → `renderBlock()`.

### Database
- MySQL via `mysql2` with a connection pool (`server/src/db.ts`).
- Always use prepared statements / parameterised queries (`pool.execute(sql, [params])`).
- No ORM.

### Frontend UI
- Component library: [shadcn/ui](https://ui.shadcn.com) — components live in `src/components/ui/`.
- Styling: Tailwind CSS utility classes only.
- State: React hooks + Context. No Redux, Zustand, or other state manager.
- Toast notifications: `sonner`.

### API Client Pattern
Every API call goes through `src/lib/api.ts`:
- `request<T>(path, options?)` — JSON requests, injects `x-api-key` header.
- `requestFile(path, options?)` — returns a `Blob` (used for PDF/LaTeX downloads).
- Base URL from `VITE_API_URL` env var.

---

## System Dependencies

The backend requires these to be installed on the host:

| Tool | Purpose |
|---|---|
| **Node.js** ≥ 20 | Runtime for both frontend and backend |
| **MySQL** ≥ 8 | Primary database |
| **pdflatex** (TeX Live) | Compiling LaTeX templates to PDF for preview. Install path: `/usr/share/texlive` — ensure `pdflatex` is on `PATH`. |

---

## Environment Variables

### Frontend (`/.env`)
| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL, e.g. `http://localhost:5073` |
| `SFTP_HOST` | Deploy target hostname |
| `SFTP_PORT` | Deploy target SSH port (default `22`) |
| `SFTP_USERNAME` | Deploy SSH user |
| `SFTP_PASSWORD` | Deploy SSH password |
| `REMOTE_DIR` | Remote path for frontend deploy |

### Backend (`/server/.env`)
| Variable | Description |
|---|---|
| `PORT` | HTTP port (default `5073`) |
| `DB_HOST` | MySQL host |
| `DB_PORT` | MySQL port (default `3306`) |
| `DB_USER` | MySQL user |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | MySQL database name |
| `OPENAI_API_KEY` | OpenAI API key (GPT-4o Vision for extraction) |
| `ANTHROPIC_API_KEY` | Anthropic API key (optional, alternative AI) |
| `ADMIN_API_KEY` | Shared secret for `x-api-key` auth |
| `FRONTEND_URL` | Allowed CORS origin |
| `UPLOAD_DIR` | Local path for uploaded files (default `./uploads`) |
| `MAX_FILE_SIZE_MB` | Upload size cap (default `50`) |
| `SFTP_*` / `REMOTE_DIR` | Same pattern as frontend, for server deploy |

---

## Do Not

- **No JWT or sessions** — authentication is API key only.
- **No ORM** — use raw `mysql2` prepared statements.
- **No global state manager** — React hooks and Context only.
- **No real secrets in code** — all credentials via env vars, never hardcoded.
- **No `tabularx` in LaTeX templates** — it causes spurious alignment errors during pdflatex trial passes. Use `minipage` side-by-side or plain `tabular` with explicit `p{}` column widths.
