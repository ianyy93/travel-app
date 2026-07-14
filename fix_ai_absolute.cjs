const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
    `className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 md:hidden"`,
    `className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-40 md:hidden"`
);

code = code.replace(
    `"fixed inset-y-0 right-0 md:static z-50 bg-white border-l border-slate-200 flex flex-col transition-all duration-300 shadow-2xl md:shadow-none overflow-hidden"`,
    `"absolute inset-y-0 right-0 md:static z-50 bg-white border-l border-slate-200 flex flex-col transition-all duration-300 shadow-2xl md:shadow-none overflow-hidden"`
);

fs.writeFileSync('src/App.tsx', code);
console.log("Updated AI pane positioning.");
