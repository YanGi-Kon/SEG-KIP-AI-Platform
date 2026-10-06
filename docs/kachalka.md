# Kachalka

Foydalanuvchi 2026-10-06 kuni ushbu yuklanish animatsiyasi va matnini birgalikda **kachalka** deb nomladi. Keyingi loyiha vazifalarida “kachalka” shu komponentni anglatadi.

- Animatsiya: harakatlanayotgan neft kachalkasi, `public/assets/images/saneg-loading.gif`.
- Animatsiya ostidagi matn: **Sanegplatform yuklanmoqda...**
- Joylashuv: yuklanish oynasining markazida, animatsiya matnning tepasida.
- Oq va katakli fon `segLoaderBackgroundKey` SVG filtri orqali yashiriladi.
- Belgilash va uslublar: `public/index.html`, `segAppLoader`, `seg-loader-animation`, `seg-loader-status`.
- Yuklanish oynasini boshqarish: `public/js/app-loader.js`; yuklanish tugagach animatsiya va matn birga yashiriladi.
- Asl GIF: `C:/Users/777/Desktop/animatsiya/2.gif`.

2026-10-06: Foydalanuvchi barcha kutish holatlarida kachalka ko‘rsatilishini so‘radi. `public/js/kachalka.js` bosh sahifa va barcha modul HTML sahifalariga ulangan. Yuklanish, saqlash, tayyorlash, sinxronlash, kutish va ishlov berish yozuvlariga (lotin, kirill, rus va ingliz tillarida) hamda `aria-busy="true"` elementlariga kichik kachalka va uning standart matni qo‘shiladi. Asl holat matni saqlanadi; holat tugasa, xatoga almashsa yoki element olib tashlansa indikator olib tashlanadi.
