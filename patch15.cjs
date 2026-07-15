const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/console\.warn\(\`\[DEBUG Reservation Raw Text\]:\`, text\);/g, "console.warn(`[DEBUG Reservation Raw Text]: unavailable`);");
code = code.replace(/rawText: text/g, "rawText: 'unavailable'");
code = code.replace(/console\.warn\(\`\[DEBUG Raw Text\]:\`, text\);/g, "console.warn(`[DEBUG Raw Text]: unavailable`);");

fs.writeFileSync('server.ts', code);
