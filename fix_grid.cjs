const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
    `className="flex-1 overflow-x-auto p-4 md:p-6 pb-32"`,
    `className="flex-1 overflow-x-auto p-4 md:p-6 pb-20"`
);

code = code.replace(
    `className="flex h-full min-w-max gap-4 items-start"`,
    `className="flex h-full min-w-max gap-3 items-start"`
);

code = code.replace(
    `className="w-80 bg-white rounded-2xl border border-slate-200 flex flex-col h-[70vh] shadow-sm shrink-0 overflow-hidden"`,
    `className="w-72 bg-white rounded-2xl border border-slate-200 flex flex-col h-[70vh] shadow-sm shrink-0 overflow-hidden"`
);

fs.writeFileSync('src/App.tsx', code);
console.log("Updated grid layout.");
