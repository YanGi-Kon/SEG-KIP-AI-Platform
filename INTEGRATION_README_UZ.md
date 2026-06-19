# SEG KIP AI Platform — Quduqlar ro‘yxati jurnali integratsiyasi

## Arxitektura qarori
- Asosiy platforma: `SEG-KIP-AI-modular-professional`.
- Ichki modul: `seg_kip_shape_safe_project` mantiqi asosida qayta yozilgan `public/modules/kuduk-journal.html`.
- `ЖУРНАЛ УЧЕТА` menyusi endi platforma ichida `modules/kuduk-journal.html` iframe modulini ochadi.

## Muhim fayllar
1. `server.js`
   - Express + HTTP + Socket.IO bir serverga birlashtirildi.
   - Eski `/api/chat`, `/api/base`, `/api/workbook`, `/api/menu` route’lari saqlandi.
   - Yangi `/api/kuduk/*` route’lari qo‘shildi.

2. `routes/kuduk.js`
   - Multi-tenant sex konfiguratsiyasi.
   - Har bir sex uchun alohida fayl: `data/tenants/<sexId>.json`.
   - Google Sheets ikki tomonlama sync:
     - o‘qish: route map va varoq ma’lumotlari;
     - yozish: qo‘shish, tahrirlash, o‘chirish.
   - `Service Account` scopes: `https://www.googleapis.com/auth/spreadsheets`.
   - Socket.IO room: `sex:<sexId>`.
   - `XOTIRANI TOZALASH` faqat joriy sex faylini o‘chiradi.

3. `public/js/app.js`
   - `journal` moduli `modules/kuduk-journal.html`ga yo‘naltirildi.
   - Chap menyudagi `ЖУРНАЛ УЧЕТА` bosilganda ichki modul ochiladi.

4. `public/modules/kuduk-journal.html`
   - Sex ID, Google Sheets link, asosiy varoq, Service Account JSON, sync sekund maydonlari.
   - `SAQLASH & ULASH`, `XOTIRANI TOZALASH`, `LIVE SYNC` tugmalari.
   - READY/OFFLINE/ERROR statuslari.
   - Jadval qatorlarini qo‘shish, tahrirlash va o‘chirish.

5. `package.json`
   - `socket.io` va `cors` qo‘shildi.

## API
- `GET /api/kuduk/health?sexId=sex_4`
- `GET /api/kuduk/state?sexId=sex_4`
- `POST /api/kuduk/config`
- `DELETE /api/kuduk/config/:sexId`
- `POST /api/kuduk/sync`
- `POST /api/kuduk/rows`
- `PUT /api/kuduk/rows`
- `DELETE /api/kuduk/rows?sexId=sex_4&sheet=...&rowNumber=...`

## Ishga tushirish
```bash
npm install
npm start
```

Brauzerda:
```text
http://localhost:3000
```

## Google Sheets talablari
- Service Account email manzilini Google Sheets fayliga Editor sifatida qo‘shing.
- Asosiy varoq nomi, masalan: `кудук руйхати`.
- Asosiy varoq ichidagi tugmalar Drawing/Shape bo‘lsa, Google API ularni ko‘rmaydi. Tugma ostidagi yoki yaqin katakka quyidagilardan biri yozilishi kerak:
  - `=HYPERLINK("#gid=123456"; "Xonqazi")`
  - yoki tegishli varoq nomi oddiy matn sifatida.

## Failed to fetch yechimi
- Frontend barcha chaqiruvlarni nisbiy URL orqali yuboradi: `/api/kuduk/...`.
- Backend bitta Express server ichida API va frontendni birga beradi.
- Socket.IO ham shu serverga ulangan.
- Backend ulanganida status `READY` bo‘ladi.
