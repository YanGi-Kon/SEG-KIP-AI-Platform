# SEG KIP — ЖУРНАЛ / База Single Source Fix

## Qilingan asosiy tuzatishlar

1. `ЖУРНАЛ` kartochkasi oddiy hudud varog‘i emas, umumiy jurnal sifatida belgilandi.
2. `ЖУРНАЛ` bosilganda `База` varog‘i Single Source of Truth sifatida ochiladi.
3. Hudud varoqlari view sifatida qoldi; Create/Edit/Delete operatsiyalari backendda `База` varog‘iga yo‘naltirildi.
4. `Место установки` ustuni saqlanadi va tahrirlash mumkin; u hudud viewlariga ta’sir qiluvchi routing ustuni sifatida qoldirildi.
5. Frontendda Menu View va Journal View ajratildi: kartochka bosilganda jadval menyu pastida chiqmaydi, alohida ichki jurnal sahifasi ochiladi.
6. Jadval ustunlari to‘liq ko‘rsatiladi: `Дата`, `Поз номер`, `Наименование СИ`, `Тип, марка`, `Заводской номер`, `Предел измерения`, `Место установки`, `СКВ`, `Перечень в/р`, `Исполнитель работ`, `Подпись`.
7. Formula matnlari frontendga chiqarilmaydi; grid o‘qishda `formattedValue/effectiveValue` ustuvor.

## O‘zgartirilgan fayllar

- `routes/kuduk.js`
- `public/modules/kuduk-journal.html`

## Ishga tushirish

```bash
npm install
npm start
```

Brauzerda:

```text
http://localhost:3000
```
