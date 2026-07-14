const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const bottomNavStart = `{/* Bottom Navigation */}
      {view === 'itinerary' && (
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto md:hidden bg-white/80 backdrop-blur-xl border-t border-slate-100 px-6 py-4 pb-10 flex justify-around items-center z-50">
          <button onClick={() => setActiveTab('calendar')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'calendar' ? "text-blue-600" : "text-slate-400")} title="View Calendar">
            <Calendar className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Calendar</span>
          </button>
          <button onClick={() => setActiveTab('places')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'places' ? "text-blue-600" : "text-slate-400")} title="View Shortlisted Places">
            <MapPin className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Places</span>
          </button>
          <button onClick={() => setActiveTab('info')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'info' ? "text-blue-600" : "text-slate-400")} title="Reservations & Bookings">
            <Info className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Reservations</span>
          </button>
        </nav>
      )}`;

const bottomNavReplace = `{/* Bottom Navigation */}
      {view === 'itinerary' && (
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto md:hidden bg-white/80 backdrop-blur-xl border-t border-slate-100 px-4 py-2 pb-6 flex justify-around items-center z-50">
          <button onClick={() => setActiveTab('calendar')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'calendar' ? "text-blue-600" : "text-slate-400")} title="View Calendar">
            <Calendar className="w-5 h-5" /><span className="text-[9px] font-bold uppercase tracking-wider">Calendar</span>
          </button>
          <button onClick={() => setActiveTab('places')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'places' ? "text-blue-600" : "text-slate-400")} title="View Shortlisted Places">
            <MapPin className="w-5 h-5" /><span className="text-[9px] font-bold uppercase tracking-wider">Places</span>
          </button>
          <button onClick={() => setActiveTab('info')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'info' ? "text-blue-600" : "text-slate-400")} title="Reservations & Bookings">
            <Info className="w-5 h-5" /><span className="text-[9px] font-bold uppercase tracking-wider">Reservations</span>
          </button>
        </nav>
      )}`;

code = code.replace(bottomNavStart, bottomNavReplace);

// EventTile padding
code = code.replace(
    `"rounded-2xl transition-all relative w-full border p-4 pl-12 overflow-hidden",`,
    `"rounded-2xl transition-all relative w-full border p-3 pl-10 md:p-4 md:pl-12 overflow-hidden",`
);

code = code.replace(
    `"absolute left-2 top-4 w-8 h-8 rounded-xl flex items-center justify-center border transition-all",`,
    `"absolute left-1.5 top-3 w-7 h-7 md:left-2 md:top-4 md:w-8 md:h-8 rounded-xl flex items-center justify-center border transition-all",`
);

// pb-32 to pb-24 for content areas
code = code.replace(
    `className="p-4 md:p-6 space-y-4 pb-32">`,
    `className="p-3 md:p-6 space-y-4 pb-20">`
).replace(
    `className="p-4 md:p-6 space-y-4 pb-32">`,
    `className="p-3 md:p-6 space-y-4 pb-20">`
).replace(
    `className="p-4 md:p-6 space-y-4 pb-32">`,
    `className="p-3 md:p-6 space-y-4 pb-20">`
);

code = code.replace(
    `className="flex-1 overflow-y-auto p-4 md:p-6 pb-32 space-y-6">`,
    `className="flex-1 overflow-y-auto p-3 md:p-6 pb-20 space-y-4 md:space-y-6">`
);

fs.writeFileSync('src/App.tsx', code);
console.log("Updated");
