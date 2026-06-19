# SEG-KIP-AI: Ulchov, Aktlar va Excel tugmalari bo‘yicha tuzatish hisoboti

## Bajarilgan ishlar

1. `public/js/app.js`
   - Har bir asosiy modul ochilganda faol menyu to‘g‘ri belgilanadigan qilindi.
   - Excel tugmasi uchun yagona `openCurrentExcel()` logikasi qo‘shildi.
   - Google Sheets havolasi quyidagi manbalardan izlanadi:
     - `localStorage: seg_kip_sheet_url`
     - `localStorage: spreadsheetUrl`
     - `localStorage: sheetUrl`
     - `localStorage: googleSheetUrl`
     - server fallback: `/api/kuduk/state?sexId=sex_4` va `/api/kuduk/state?sexId=sex_default`
   - Iframe moduldan keladigan `SEG_SHEET_URL` xabari qabul qilinadi va umumiy xotiraga saqlanadi.

2. `public/index.html`
   - `ЖУРНАЛ УЧЕТА`, `АКТЛАР ЖУРНАЛИ`, `НОСОЗЛИКЛАР ЖУРНАЛИ`, `ТО ЖУРНАЛ`, `АЛМАШИШ ЖУРНАЛИ` dashboard kartochkalari bosiladigan qilindi.
   - `genericModulePage` va `ulchovIntegratedPage` ichiga umumiy `Excel` tugmasi qo‘shildi.
   - Menyu ko‘rinishi va frontend dizayn strukturasi saqlandi.

3. `public/css/style.css`
   - Excel tugmasi uchun layout-neutral overlay CSS qo‘shildi.
   - Mavjud ranglar, menyu joylashuvi, asosiy dizayn va classlar o‘zgartirilmadi.

4. `public/modules/kuduk-journal.html`
   - Google Sheets havolasi muvaffaqiyatli ulanayotganda umumiy `localStorage` ga yoziladi.
   - Parent oynaga `SEG_SHEET_URL` xabari yuboriladi.
   - Sahifa yuklanganda avvalgi Sheets havolasi inputga avtomatik qaytariladi.

5. `public/modules/acts.html`
   - `АКТЛАР ЖУРНАЛИ` ikkita ichki menyuga ajratildi:
     - `1. Хужат яратиш`
     - `2. Хисоботлар`
   - `Хужат яратиш` qismida akt qoralamasini yaratish formasi qo‘shildi.
   - `Хисоботлар` qismi “ЖУРНАЛ УЧЕТА” tartibiga o‘xshash jadval, qidiruv va holat filtri bilan tizimlashtirildi.
   - Draftlar vaqtincha `localStorage: seg_kip_acts_reports` da saqlanadi.
   - Ichki Excel tugmasi ham qo‘shildi.

## Ulchov vositalari moduli ishlash sxemasi

- Asosiy menyudagi `2. УЛЧОВ ВОСИТАЛАРИ` tugmasi `openUlchovVositalari()` funksiyasini chaqiradi.
- Funksiya `ulchovIntegratedPage` sahifasini faollashtiradi.
- Modul `public/modules/ulchov.html` iframe orqali yuklanadi.
- Excel tugmasi umumiy Google Sheets havolasini ochadi.

## Excel tugmasi algoritmi

1. Foydalanuvchi istalgan asosiy menyuga kiradi.
2. `Excel` tugmasi ko‘rinadi.
3. Tugma bosilganda tizim avval `localStorage` dan Sheets havolasini qidiradi.
4. Topilmasa, backend state orqali havolani izlaydi.
5. Havola topilsa, yangi oynada Google Sheets ochiladi.
6. Havola topilmasa: `Google Sheets ҳаволаси киритилмаган` xabari chiqadi.

## Test natijasi

- `node --check public/js/app.js` — OK
- `node --check server.js` — OK
- `npm install` bajarildi va server ishga tushishi tekshirildi.
- `npm start` natijasi: server `http://localhost:3000` da ishga tushdi.

## Qolgan tavsiyalar

- `АКТЛАР ЖУРНАЛИ` uchun keyingi bosqichda backend API va Google Sheets write integratsiyasi qo‘shilishi kerak.
- PDF eksport va E-IMZO jarayoni alohida modul sifatida ishlab chiqilishi kerak.
- Production muhitida CORS, auth va rate-limit kuchaytirilishi kerak.
