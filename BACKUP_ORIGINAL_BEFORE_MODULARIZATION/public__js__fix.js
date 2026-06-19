function isDateRow(v){
  v=String(v||'').trim();
  return v.includes('-//-') || v.includes('//') || /^\d{2}\.\d{2}\.\d{4}$/.test(v);
}
