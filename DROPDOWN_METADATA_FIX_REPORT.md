# SEG KIP — Google Sheets Dropdown Metadata Fix

## Maqsad
Frontenddagi `Место установки`, `Тип, марка`, `Перечень в/р` maydonlari Google Sheets `База` varog'idagi Data Validation / dropdown qoidalariga mos ishlashi uchun tuzatildi.

## O'zgartirilgan fayllar

- `routes/kuduk.js`
- `public/modules/kuduk-journal.html`

## Backend o'zgarishlari

### Yangi endpoint

```http
GET /api/kuduk/metadata?sexId=sex_4
```

Javob:

```json
{
  "ok": true,
  "baseSheet": "База",
  "installationPlaces": [],
  "deviceTypes": [],
  "workTypes": []
}
```

### Metadata manbalari

Backend quyidagi ketma-ketlikda dropdown qiymatlarini yig'adi:

1. Google Sheets Data Validation `ONE_OF_LIST`
2. Google Sheets Data Validation `ONE_OF_RANGE`
3. `База` varog'idagi mavjud real qiymatlar
4. Static fallback ro'yxat

### Saqlash validatsiyasi

`POST /api/kuduk/rows` va `PUT /api/kuduk/rows` endi quyidagi maydonlarni tekshiradi:

- `location` → `Место установки`
- `brand` → `Тип, марка`
- `work` → `Перечень в/р`

Agar qiymat dropdown ro'yxatida yo'q bo'lsa, backend xato qaytaradi.

## Frontend o'zgarishlari

Edit/Create modal ochilganda metadata endpoint chaqiriladi.

Quyidagi maydonlar endi oddiy input emas, dropdown bo'ldi:

- `Место установки`
- `Тип, марка`
- `Перечень в/р`

Dizayn, ranglar, modal struktura va umumiy UI o'zgartirilmadi.

## Natija

Frontend Google Sheets'dagi Data Validation mantiqiga yaqinlashtirildi. Foydalanuvchi routing uchun muhim `Место установки` qiymatini endi ro'yxatdan tanlaydi.
