# O‘lchov pasportlarini ishga tushirish

## Server

Server startda `034_instrument_passports.sql` migratsiyasini qo‘llaydi. `DB_AUTO_MIGRATE=false` bo‘lsa, `npm run db:migrate`ni avval bajaring. Bu qo‘shimcha jadvallar yaratadi; ACT va TO ma’lumotlarini o‘zgartirmaydi.

`PASSPORT_WORKER_ENABLED` odatda yoqilgan. Uni `false` qilish yuklangan hujjatlarni navbatda saqlaydi, ammo Drive’ga nashrni vaqtincha to‘xtatadi. Worker alohida `passport_merge` job turini qayta ishlaydi; `OUTBOX_WORKER_ENABLED` ACT/TO workerining mavjud sozlamasi bo‘lib qoladi.

## Drive papkasi

O‘lchov vositalari → **6. ЯКУНИЙ ҲУЖЖАТЛАР** → papka URL/ID → **Saqlash** → **Tekshirish**.

Bu papka `moduleSettings.ulchov_final_documents_folder_id`da saqlanadi. U kiritilmagan bo‘lsa, Workspace yakuniy hujjatlar papkasi ishlatiladi. O‘lchov papkasini o‘zgartirish ACT/TO papkasini o‘zgartirmaydi. Personal Drive ulanishi esa barcha modullar uchun Workspace darajasida umumiy.

Shared Drive uchun Workspace service account (kiritilmagan bo‘lsa server credentiali) ishlatiladi. Papkaga yozish huquqi bering. PDFlar `PASPORTLAR/<zavod-raqami>-<passport-uuid>/CURRENT/pasport.pdf`ga tushadi. `ORIGINALS`da yuklangan fayllar, `ARCHIVE`da oldingi yig‘ma versiyalar saqlanadi.

## Personal Drive: mavjud skriptni kengaytirish

Repositorydagi `apps-script/Passport.gs`ni mavjud Apps Script loyihasiga yangi fayl sifatida qo‘shing. Boshqa skriptlarni o‘chirmang.

Mavjud `doPost` HMAC tekshiruvini bajarganidan keyin quyidagi marshrutni qo‘shing. Repositorydagi `Code.gs` allaqachon shu o‘zgarishni o‘z ichiga oladi:

```javascript
if (typeof handlePassportRequest_ === 'function') {
  var passportResult = handlePassportRequest_(body);
  if (passportResult) return response_(passportResult);
}
```

Services → **Drive API**, version **v3**ni yoqing. Agar loyiha standart Google Cloud projectdan foydalansa, Drive API ham o‘sha projectda yoqilgan bo‘lishi kerak. Deploy → Manage deployments → Edit → New version → Deploy orqali mavjud `/exec` deploymentni yangilang. Shu URLni saqlasangiz server ulanishini qayta kiritish talab qilinmaydi. Script Propertiesdagi `SEG_KIP_WEBHOOK_SECRET`ni saqlang.

`validate_folder`, `ensure_subfolder`, `upload_pdf_base64` amallari saqlanadi; yangi amallar `passport_capabilities` va `save_passport_pdf`dir. PDF birlashtirish Apps Scriptda bajarilmaydi.

## Foydalanuvchi oqimi

**📎 Ҳужжат қўшиш** kompyuterdagi fayl tanlash oynasini ochadi. Ctrl yoki Shift bilan 20 tagacha JPG/JPEG/PDF belgilang, so‘ng **Saqlash**ni bosing. Har bir fayl 15 MBgacha, jami 60 MBgacha bo‘lsin. JPGlar alohida PDF sahifalariga aylantiriladi; PDFlarning barcha sahifalari tanlangan fayllar ro‘yxati tartibida qo‘shiladi. Bir tanlash to‘plami bitta PDF sifatida navbatga yoziladi, xatoda qisman yuklash amalga oshmaydi. Bitta PDF tanlansa, baytlari o‘zgartirilmasdan saqlanadi. Avvalgi pasport mavjud bo‘lsa, yangi to‘plam uning oxiriga qo‘shiladi. ORIGINALS papkasida har bir yuklash to‘plamining PDF nusxasi saqlanadi.

1. Asbob kartochkasida **PDF юклаш**ni bosing.
2. Birinchi marta mavjud asosiy pasport PDFni tanlang; keyinchalik yangi qo‘shimcha PDFni tanlang.
3. **PDF yuklash** → kachalka → **Pasport yangilandi**.
4. **Паспортни кўриш** aniq yig‘ma PDFni ochadi. Upload oynasida fayllar tarixi ko‘rinadi.

Asl PDF Drive qidiruv havolasidan avtomatik tanlanmaydi. Bir xil SHA-256li fayl ayni asbobga ikkinchi marta qo‘shilmaydi. Operator yuklaydi, viewer ko‘radi, owner/administrator sozlaydi. Bitta fayl 15 MBgacha; bir asbob hujjatlari jami 60 MB va 500 sahifagacha.

## Nosozliklar

- `PASSPORT_APPS_SCRIPT_UPDATE_REQUIRED`: yuqoridagi yangi fayl va deployment kerak.
- `PASSPORT_ADVANCED_DRIVE_REQUIRED`: Apps Scriptda Drive API v3 xizmatini yoqing.
- Drive ruxsat/papka xatosi: sozlamani tuzating, so‘ng asbob yuklash oynasida **Qayta urinish**ni bosing. Qayta urinish hozir sozlangan O‘lchov papkasidan foydalanadi.
- Vaqtinchalik tarmoq, 429 yoki 5xx xatolari navbat orqali cheklangan marta qayta bajariladi. Server restartida asl PDFlar PostgreSQLda saqlanib qoladi.
- Bir xil varaqda zavod raqami, nomi va brendi bir xil bo‘lgan ikki asbob bo‘lsa, upload rad etiladi: avval reestrdagi identifikatsiyani aniqlashtiring.

Rasmiy qo‘llanmalar: [Advanced Drive service](https://developers.google.com/apps-script/advanced/drive), [Drive faylini yangilash](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update).
