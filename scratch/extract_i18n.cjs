const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const modulesDir = path.join(__dirname, '../public/modules');
const files = fs.readdirSync(modulesDir).filter(f => f.endsWith('.html') && !['settings.html', 'roles.html', 'users.html'].includes(f));

const extractedKeys = new Set();

function isTextToTranslate(str) {
  if (!str) return false;
  str = str.trim();
  if (str.length === 0) return false;
  // Should contain at least one letter
  if (!/[a-zA-Zа-яА-ЯЎўҚқҒғҲҳЁё]/.test(str)) return false;
  return true;
}

for (const file of files) {
  const filePath = path.join(modulesDir, file);
  let html = fs.readFileSync(filePath, 'utf8');
  
  const $ = cheerio.load(html, { decodeEntities: false });
  
  // Add script if not exists
  if ($('script[src="../js/i18n.js"]').length === 0) {
    $('head').append('\n<script src="../js/i18n.js"></script>\n');
  }

  // Find all elements
  $('*').each(function() {
    const el = this;
    if (el.tagName === 'script' || el.tagName === 'style') return;

    // Check placeholder
    const ph = $(el).attr('placeholder');
    if (ph && isTextToTranslate(ph)) {
      $(el).attr('data-i18n-placeholder', ph.trim()); // Custom attribute for placeholders if we want to handle them later, or just data-i18n
      extractedKeys.add(ph.trim());
    }

    // Check title attribute
    const title = $(el).attr('title');
    if (title && isTextToTranslate(title)) {
      extractedKeys.add(title.trim());
    }

    // If element has only text nodes as children, add data-i18n to it
    const children = $(el).contents();
    let hasOnlyText = true;
    let textContent = '';
    
    children.each((i, child) => {
      if (child.type !== 'text' || (!child.data.trim() && child.data.includes('\n'))) {
        hasOnlyText = false;
      }
      if (child.type === 'text') {
        textContent += child.data;
      }
    });

    if (children.length === 1 && children[0].type === 'text') {
      const txt = textContent.trim();
      if (isTextToTranslate(txt)) {
        $(el).attr('data-i18n', txt);
        $(el).text(txt); // Clean up whitespace
        extractedKeys.add(txt);
      }
    } else if (children.length > 1) {
      // It has mixed content (e.g. text and spans)
      // Wrap text nodes in span data-i18n
      children.each((i, child) => {
        if (child.type === 'text') {
          const txt = child.data.trim();
          if (isTextToTranslate(txt)) {
            extractedKeys.add(txt);
            $(child).replaceWith(`<span data-i18n="${txt}">${txt}</span>`);
          }
        }
      });
    }
  });

  // cheerio creates <html><head><body> if missing, let's keep original format as much as possible
  // but it's okay for these files, they are full HTML or partials? They are full HTML with DOCTYPE in most cases.
  // Actually, let's just write the modified html.
  fs.writeFileSync(filePath, $.html());
  console.log(`Processed ${file}`);
}

fs.writeFileSync(path.join(__dirname, 'extracted_keys.json'), JSON.stringify(Array.from(extractedKeys), null, 2));
console.log('Done!');
