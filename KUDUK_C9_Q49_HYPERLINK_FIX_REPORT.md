# KUDUK C9:Q49 Hyperlink Menu Fix Report

## Tuzatilgan muammolar

1. Menyu diapazoni `A8:Q50`dan `C9:Q49`ga o'zgartirildi.
2. 0-based koordinatalar `A8` emas, `C9` asosida hisoblanadigan qilindi:
   - `MENU_START_ROW_INDEX = 8`
   - `MENU_START_COL_INDEX = 2`
3. Menyu kartochkalari faqat `кудук руйхати!C9:Q49` diapazonidagi bo'sh bo'lmagan kataklardan olinadi.
4. HYPERLINK / ГИПЕРССЫЛКА formulalaridan `gid`, `title`, `sourceCell`, `targetSheet` ajratish mantiqi saqlandi va `gid/sourceCell` route obyektiga qo'shildi.
5. Google Sheets formula matnlari (`=ARRAYFORMULA`, `=ARRAY_CONSTRAIN`, `=IFERROR`, `=INDEX`) oddiy jurnal qiymati sifatida frontendga yuborilmasligi uchun `cellText()` ichidagi `formulaValue` fallback olib tashlandi.
6. `formulaValue` endi faqat hyperlink parser uchun ishlatiladi.
7. Frontend HTML/CSS/UI ko'rinishi o'zgartirilmadi.

## O'zgartirilgan fayl

- `routes/kuduk.js`

## Muhim konstanta qiymatlari

```js
const MENU_RANGE_A1 = "C9:Q49";
const MENU_START_ROW_INDEX = 8;
const MENU_START_COL_INDEX = 2;
```

## Ishga tushirish

```bash
npm install
npm start
```

Brauzerda faqat server orqali oching:

```text
http://localhost:3000
```

`file:///.../index.html` orqali ochmang.
