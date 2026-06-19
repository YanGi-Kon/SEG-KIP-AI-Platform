# SEG-KIP-AI — Stage 1: Security & Structure

## Bajarildi

- `.env` ZIP ichidan chiqarildi.
- `service-account.json` ZIP ichidan chiqarildi.
- `.git` papkasi chiqarildi.
- `node_modules` chiqarildi.
- Backup HTML/JS fayllar chiqarildi.
- `.gitignore` professional ko‘rinishga keltirildi.
- `.env.example` tayyorlandi.
- `server.js` kichraytirildi.
- API endpointlar `routes/` papkasiga ajratildi.
- Google Sheets ulanishi `config/google.js` ichiga chiqarildi.
- Hardcoded spreadsheet ID olib tashlandi; endi `.env` / Railway Variables orqali olinadi.

## Railway Variables

Railway ichida quyidagilar bo‘lishi kerak:

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
SPREADSHEET_ID=191RWU_J2IxqfwdwCbvopVtcb4WhRkPM1UQppVbgiLhs
GOOGLE_APPLICATION_CREDENTIALS=service-account.json
```

Google service account faylini productionda xavfsiz usulda saqlash kerak. Uni GitHub’ga joylamang.

## Lokal ishga tushirish

```bash
npm install
cp .env.example .env
npm start
```

## Muhim xavfsizlik tavsiyasi

Agar eski `.env` yoki `service-account.json` GitHub’ga push qilingan bo‘lsa, OpenAI API key va Google service account keyni almashtiring/rotate qiling.
