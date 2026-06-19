# SEG KIP AI — Modular structure

This package was reorganized into safer frontend modules without changing backend routes.

## Key files

- `public/index.html` — main shell/dashboard.
- `public/css/style.css` — shared dashboard styles.
- `public/js/app.js` — module navigation and AI panel controller.
- `public/js/fix.js` — existing helper kept unchanged.
- `public/modules/ulchov.html` — original ULCHOV VOSITALARI page extracted from legacy iframe `srcdoc`.
- `public/modules/*.html` — separate placeholders for the remaining menu sections.
- `routes/chat.js` — OpenAI backend route remains separate.

## Run

```bash
npm install
npm start
```

Open: http://localhost:3000

## Safety

The original edited files are copied into `BACKUP_ORIGINAL_BEFORE_MODULARIZATION/`.
Secrets are not added. Use `.env` locally or Railway Variables for `OPENAI_API_KEY`.
