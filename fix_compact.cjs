const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Day Header
code = code.replace(
    `<div className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur-md py-3 border-b border-slate-200/60">
                               <h3 className="font-display font-bold text-slate-900 text-lg">Day {dIdx + 1} • {day.date}</h3>
                               <p className="text-sm text-slate-500">{day.title}</p>
                             </div>`,
    `<div className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur-md py-2 md:py-3 border-b border-slate-200/60 flex items-baseline justify-between px-1">
                               <div>
                                 <h3 className="font-display font-bold text-slate-900 text-base md:text-lg">Day {dIdx + 1} <span className="text-slate-400 font-normal">| {day.date}</span></h3>
                                 {day.title && <p className="text-xs md:text-sm text-slate-500 font-medium">{day.title}</p>}
                               </div>
                             </div>`
);

// Event list spacing
code = code.replace(
    `<div className="space-y-4 relative pl-4 border-l-2 border-slate-100">`,
    `<div className="space-y-3 relative pl-4 border-l-2 border-slate-100">`
);

code = code.replace(
    `<div key={event.id || idx} className="relative mt-4">`,
    `<div key={event.id || idx} className="relative mt-3">`
);

// Schedule/Grid toggle margin
code = code.replace(
    `<div className="flex bg-slate-200/60 p-1 rounded-xl w-fit mx-auto mt-4 mb-2 shrink-0">`,
    `<div className="flex bg-slate-200/60 p-1 rounded-xl w-fit mx-auto mt-2 mb-2 shrink-0">`
);

fs.writeFileSync('src/App.tsx', code);
console.log("Updated calendar layout.");
