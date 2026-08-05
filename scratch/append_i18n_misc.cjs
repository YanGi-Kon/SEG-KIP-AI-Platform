const fs = require('fs');
const path = require('path');

const i18nPath = path.join(__dirname, '../public/js/i18n.js');
let content = fs.readFileSync(i18nPath, 'utf8');

const newTranslations = {
  'Модул алоҳида HTML файлдан юкланади': {
    ru: 'Модуль загружается из отдельного HTML файла',
    uz: 'Modul alohida HTML fayldan yuklanadi',
    en: 'Module is loaded from a separate HTML file',
    uz_cyrl: 'Модул алоҳида HTML файлдан юкланади'
  },
  'Алоҳида modules/ulchov.html файлидан юкланади': {
    ru: 'Загружается из отдельного файла modules/ulchov.html',
    uz: 'Alohida modules/ulchov.html faylidan yuklanadi',
    en: 'Loaded from a separate modules/ulchov.html file',
    uz_cyrl: 'Алоҳида modules/ulchov.html файлидан юкланади'
  },
  '6+ символов': {
    ru: '6+ символов',
    uz: '6+ belgilar',
    en: '6+ characters',
    uz_cyrl: '6+ белгилар'
  },
  '(6+ символов)': {
    ru: '(6+ символов)',
    uz: '(6+ belgilar)',
    en: '(6+ characters)',
    uz_cyrl: '(6+ белгилар)'
  },
  '(оставьте пустым, чтобы не менять; если меняете: 6+ символов)': {
    ru: '(оставьте пустым, чтобы не менять; если меняете: 6+ символов)',
    uz: "(o'zgartirmaslik uchun bo'sh qoldiring; agar o'zgartirsangiz: 6+ belgilar)",
    en: '(leave blank to keep unchanged; if changing: 6+ characters)',
    uz_cyrl: '(ўзгартирмаслик учун бўш қолдиринг; агар ўзгартирсангиз: 6+ белгилар)'
  },
  'Пароль должен содержать 6-200 символов': {
    ru: 'Пароль должен содержать 6-200 символов',
    uz: "Parol 6-200 belgidan iborat bo'lishi kerak",
    en: 'Password must contain 6-200 characters',
    uz_cyrl: 'Пароль 6-200 белгидан иборат бўлиши керак'
  }
};

const langs = ['ru', 'uz', 'en', 'uz_cyrl'];
let newContent = content;

for (const lang of langs) {
  let appendString = `\n    // Topbar & Password requirements\n`;
  for (const [key, trans] of Object.entries(newTranslations)) {
    const val = trans[lang];
    const safeKey = key.replace(/'/g, "\\'").replace(/\n/g, "\\n");
    const safeVal = val.replace(/'/g, "\\'").replace(/\n/g, "\\n");
    appendString += `    '${safeKey}': '${safeVal}',\n`;
  }
  
  const regex = new RegExp(`(${lang}: \\{[\\s\\S]*?)(  \\},|  \\}\\n\\};)`);
  newContent = newContent.replace(regex, `$1${appendString}$2`);
}

fs.writeFileSync(i18nPath, newContent);
console.log('Appended misc keys to i18n.js');
