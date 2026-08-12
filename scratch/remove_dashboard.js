const fs = require('fs');
const file = '/Users/abdulazizbektuhtasinov/Documents/1_developer/my_progects/SEG_KIP_AI_Platform/SEG-KIP-AI-Platform/public/index.html';
let html = fs.readFileSync(file, 'utf8');

// The section starts at <section id="journalDashboard" class="layout">
// and ends at the corresponding </section> before <section id="genericModulePage"

const startIdx = html.indexOf('<section id="journalDashboard"');
if (startIdx !== -1) {
  const nextSectionIdx = html.indexOf('<section id="genericModulePage"');
  if (nextSectionIdx !== -1) {
    html = html.substring(0, startIdx) + html.substring(nextSectionIdx);
    fs.writeFileSync(file, html);
    console.log('Successfully removed journalDashboard section');
  } else {
    console.log('Could not find genericModulePage');
  }
} else {
  console.log('Could not find journalDashboard');
}
