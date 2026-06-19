# SEG KIP — Quduqlar ro'yxati menyu va mapping tuzatish hisoboti

## Topilgan asosiy xatolar

1. Backend `spreadsheets.get` orqali workbookdagi barcha sheet tablarini aylanib chiqib, data header topilgan har bir varoqni route/kartochka sifatida frontendga yuborayotgan edi.
2. Shu sababli `База`, `Общие`, `Манометр`, `Формуляр`, `Телемеханика`, `УЛЧОВ ВОСИТАЛАРИ` kabi xizmat varoqlari foydalanuvchi menyusida chiqib ketgan.
3. Menyu real Google Sheets dizaynidagi `кудук руйхати!A8:Q50` tugma blokiga bog'lanmagan edi.
4. `HYPERLINK` formulasi faqat inglizcha nom bilan tekshirilgan, rus lokalidagi `ГИПЕРССЫЛКА` formulasi to'liq qo'llab-quvvatlanmagan.
5. Frontend API route kelishmovchiligi bo'lishi mumkin bo'lgan holatlar uchun alias endpointlar yetarli emas edi.

## Qilingan tuzatishlar

- Frontend dizayni, HTML/CSS, tugmalar joylashuvi o'zgartirilmadi.
- Faqat backend `routes/kuduk.js` mantiqi yangilandi.
- Menyu kartochkalari endi faqat `'кудук руйхати'!A8:Q50` diapazonidan olinadi.
- Workbook bo'ylab avtomatik sheet skanerlash sync jarayonidan olib tashlandi.
- Xizmat varoqlari blacklist qilindi.
- `HYPERLINK` va `ГИПЕРССЫЛКА` formulalari qo'llab-quvvatlandi.
- Har bir menu item JSON ichida `title`, `targetSheet`, `cell`, `range` qaytariladi.
- `Column B -> pos` mapping saqlandi; `Поз номер` bo'sh ketmasligi uchun header mapping kuchaytirildi.
- API compatibility endpointlar qo'shildi: `/connect`, `/menu`, `/sheet`, `/update`, `/clear`.

## To'g'ri arxitektura

SEG KIP AI Platform
→ ЖУРНАЛ УЧЕТА
→ Google Sheets: `'кудук руйхати'!A8:Q50`
→ faqat hudud tugmalari
→ hudud sheet
→ jurnal qatorlari A:K mapping orqali frontendga chiqadi.

## O'zgartirilgan fayl

- `routes/kuduk.js`

## Ishga tushirish

```bash
npm install
npm start
```

Brauzerda faqat:

```text
http://localhost:3000
```

orqali oching.
