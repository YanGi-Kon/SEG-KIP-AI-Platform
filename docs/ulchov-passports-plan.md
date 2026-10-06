# O‘lchov vositalari: platformadan yuklanadigan yig‘ma pasportlar

## Foydalanuvchi talabi

Hujjatlar loyiha ichidagi asbob kartochkasidan yuklanadi. Drive papkasi kuzatilmaydi. O‘lchov vositalari menyusida **6. ЯКУНИЙ ҲУЖЖАТЛАР** oynasi bo‘ladi: papka URL/ID, saqlash, yozuvni tekshirish va mavjud Personal Drive ulanishi. O‘lchov papkasi alohida saqlanadi; kiritilmagan bo‘lsa Workspace yakuniy hujjatlar papkasi ishlatiladi. ACT/TO papka sozlamalari o‘zgartirilmaydi.

## Ketma-ketlik

1. Server Workspace ruxsatlarini tekshiradi va asbobni sozlangan Sheets varag‘idan qayta aniqlaydi.
2. PDF ochilishi, hajmi, sahifalar soni va shifrlanmaganligi tekshiriladi.
3. Birinchi PDF asosiy pasport; keyingilar yuklash tartibida qo‘shimcha sahifalardir. Eski kartochka Drive qidiruviga ochilgani sabab avvalgi PDFni avtomatik tanlash mumkin emas: birinchi marta uning asl fayli kartochkadan yuklanadi.
4. Asl PDF PostgreSQLda saqlanadi, SHA-256 orqali takrorlar aniqlanadi. Ma’lumot va passport_merge navbat vazifasi bitta tranzaksiyada yaratiladi.
5. Worker har bir asbobni PostgreSQL advisory lock bilan ketma-ket qayta ishlaydi. Boshqa asboblar va ACT/TO vazifalari alohida boshqariladi.
6. Boshlang‘ich PDF va qo‘shimchalar ro‘yxatidan yagona PDF qayta yig‘iladi; qayta urinish sahifalarni takrorlamaydi.
7. Drive’dagi PASPORTLAR/<asbob>/ORIGINALS va ARCHIVE papkalarida asl va oldingi nusxalar saqlanadi; CURRENT ichidagi bitta pasport.pdf yangilanadi. Shu papkada Drive fileId o‘zgarmaydi.
8. Drive yozuvidan so‘ng nashr versiyasi va natija bazada qayd etiladi. Jarayon uzilsa deterministik Drive kalitlari bilan qayta bajariladi. Yangi versiya ustiga eski job yozmaydi.
9. Kartochka holati va hujjatlar tarixi yangilanadi. Kutish paytida kachalka chiqadi. Xatolar va qo‘lda qayta urinish ko‘rsatiladi.

## Muhit va cheklovlar

- Railway Node.js: API, pdf-lib va worker. Worker alohida passport_merge job turini qayta ishlaydi.
- PostgreSQL: doimiy asbob bog‘lanishi, asl PDFlar, versiyalar, navbat. PDFlar restartda yo‘qolmaydi; bu boshlang‘ich hajmlar uchun tanlangan durable storage. Katta hajmlarda asl fayllar uchun alohida object storagega o‘tish mumkin.
- Drive: yakuniy PDF, asl nusxalar va arxiv. Shared Drive service account va Personal Drive Apps Script qo‘llanadi.
- Apps Script: faqat tasdiqlangan Drive yozuvi; PDF birlashtirish Node.js’da bajariladi. Yangi Passport.gs adapteri mavjud Code.gs amallarini saqlagan holda qo‘shiladi.
- Operator hujjat yuklaydi; viewer ko‘radi; owner/administrator papka va ulanishni sozlaydi.
- Shifrlangan yoki ochilmaydigan PDF qabul qilinmaydi. Asl imzolangan fayllar saqlanadi; yig‘ma PDF uchun eski elektron imzolarning haqiqiyligi va interaktiv shakllarning saqlanishi va’da qilinmaydi.

## Tekshirish va ishga tushirish

PDF sahifa tartibi, takrorlar, parallel vazifalar, Drive timeoutidan keyingi tiklash, Workspace chegaralari, xato va retry holatlari, kartochka UI va moslashuvchan ekran tekshiriladi. Mavjud testlar ham bajariladi. Server startda 034 migratsiyani qo‘llaydi. Personal Drive ishlatilsa Passport.gs qo‘shilib Drive v3 advanced service yoqiladi va /exec deployment yangilanadi; buni mavjud boshqa skriptlarni almashtirmasdan amalga oshirish kerak.
