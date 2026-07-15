const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

content = content.replace(
  /onClick=\{\(\) => setHourHeight\(prev => Math.max\(40, prev - 20\)\)\}/,
  "onClick={() => { setHourHeight(prev => Math.max(40, prev - 20)); setDayWidth(prev => Math.max(150, prev - 72)); }}"
);

content = content.replace(
  /onClick=\{\(\) => setHourHeight\(prev => Math.min\(200, prev \+ 20\)\)\}/,
  "onClick={() => { setHourHeight(prev => Math.min(300, prev + 20)); setDayWidth(prev => Math.min(600, prev + 72)); }}"
);

fs.writeFileSync('src/App.tsx', content);
