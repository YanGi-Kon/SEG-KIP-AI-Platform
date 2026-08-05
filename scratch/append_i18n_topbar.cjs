const fs = require('fs');
const path = require('path');

const i18nPath = path.join(__dirname, '../public/js/i18n.js');
let content = fs.readFileSync(i18nPath, 'utf8');

const newTranslations = {
  'SEG KIP AI Platform — Актлар журнали': {
    ru: 'SEG KIP AI Platform — Журнал актов',
    uz: 'SEG KIP AI Platform — Aktlar jurnali',
    en: 'SEG KIP AI Platform — Acts Journal',
    uz_cyrl: 'SEG KIP AI Platform — Актлар журнали'
  },
  'SEG KIP AI Platform — Носозликлар журнали': {
    ru: 'SEG KIP AI Platform — Журнал неисправностей',
    uz: 'SEG KIP AI Platform — Nosozliklar jurnali',
    en: 'SEG KIP AI Platform — Faults Journal',
    uz_cyrl: 'SEG KIP AI Platform — Носозликлар журнали'
  },
  'SEG KIP AI Platform — ТО журнал': {
    ru: 'SEG KIP AI Platform — Журнал ТО',
    uz: 'SEG KIP AI Platform — TO jurnali',
    en: 'SEG KIP AI Platform — Maintenance Journal',
    uz_cyrl: 'SEG KIP AI Platform — ТО журнал'
  },
  'SEG KIP AI Platform — Алмашиш журнали': {
    ru: 'SEG KIP AI Platform — Журнал замен',
    uz: 'SEG KIP AI Platform — Almashish jurnali',
    en: 'SEG KIP AI Platform — Replacement Journal',
    uz_cyrl: 'SEG KIP AI Platform — Алмашиш журнали'
  },
  'Конструктор ролей': {
    ru: 'Конструктор ролей',
    uz: 'Rollar konstruktori',
    en: 'Roles Constructor',
    uz_cyrl: 'Конструктор ролей'
  }
};

const langs = ['ru', 'uz', 'en', 'uz_cyrl'];
let newContent = content;

for (const lang of langs) {
  let appendString = `\n    // Dashboard topbar titles\n`;
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
console.log('Appended topbar titles to i18n.js');
