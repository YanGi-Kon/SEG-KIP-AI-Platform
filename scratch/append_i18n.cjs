const fs = require('fs');
const path = require('path');

const keys = require('./extracted_keys.json');
const i18nPath = path.join(__dirname, '../public/js/i18n.js');
let content = fs.readFileSync(i18nPath, 'utf8');

// Simple transliterator Uz_Cyrl -> Uz_Latn
const cyrlToLatnMap = {
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo', 'Ж': 'J', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'X', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sh', 'Ъ': '\'', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': '\'', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'Қ': 'Q', 'қ': 'q', 'Ғ': 'G\'', 'ғ': 'g\'', 'Ҳ': 'H', 'ҳ': 'h', 'Ў': 'O\'', 'ў': 'o\''
};

function transliterate(text) {
  return text.split('').map(char => cyrlToLatnMap[char] || char).join('');
}

// We will construct the new blocks to append.
// We need to insert keys into each language block.
// To do this safely without parsing the entire AST, we can find the end of each object:
// `ru: {`, `uz: {`, `en: {`, `uz_cyrl: {`

const langs = ['ru', 'uz', 'en', 'uz_cyrl'];
let newContent = content;

// Temporary eval to get current keys so we don't duplicate
// Since the file just declares `const I18N_LANG_KEY = ...` and `const TRANSLATIONS = ...` we can extract it.
const TRANSLATIONS_MATCH = content.match(/const TRANSLATIONS = (\{[\s\S]*?\n\});/);
let existingTranslations = {};
if (TRANSLATIONS_MATCH) {
  // eval to get keys
  const jsCode = '(' + TRANSLATIONS_MATCH[1] + ')';
  try {
    existingTranslations = eval(jsCode);
  } catch (e) {
    console.error("Eval failed", e);
  }
}

for (const lang of langs) {
  const currentDict = existingTranslations[lang] || {};
  let appendString = `\n    // Auto-extracted\n`;
  let added = 0;
  
  for (const key of keys) {
    if (currentDict.hasOwnProperty(key)) continue; // already exists
    
    // Determine translation
    let val = key;
    if (lang === 'uz') {
      val = transliterate(key);
    }
    
    // Escape quotes
    const safeKey = key.replace(/'/g, "\\'").replace(/\n/g, "\\n");
    const safeVal = val.replace(/'/g, "\\'").replace(/\n/g, "\\n");
    
    appendString += `    '${safeKey}': '${safeVal}',\n`;
    added++;
  }
  
  if (added > 0) {
    // Find the end of the language block
    // We look for a line with `  },` or `  }` that corresponds to the end of this lang.
    // Actually, it's easier to use string replacement: find the specific lang block end.
    // e.g. for `ru:` we find `    'Редактировать пользователя': 'Редактировать пользователя',` (from earlier update)
    // Or we can just find the start of the next language.
    const regex = new RegExp(`(${lang}: \\{[\\s\\S]*?)(  \\},|  \\}\\n\\};)`);
    newContent = newContent.replace(regex, `$1${appendString}$2`);
  }
}

fs.writeFileSync(i18nPath, newContent);
console.log('Appended missing keys to i18n.js');
