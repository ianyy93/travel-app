const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const navStart = `{/* Bottom Navigation */}
      {view === 'itinerary' && (
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto md:hidden bg-white/80 backdrop-blur-xl border-t border-slate-100 px-4 py-2 pb-6 flex justify-around items-center z-50">`;

const oldNav = `        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto md:hidden bg-white/80 backdrop-blur-xl border-t border-slate-100 px-4 py-2 pb-6 flex justify-around items-center z-50">
          <button onClick={() => setActiveTab('calendar')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'calendar' ? "text-blue-600" : "text-slate-400")} title="View Calendar">
            <Calendar className="w-5 h-5" /><span className="text-[9px] font-bold uppercase tracking-wider">Calendar</span>
          </button>
          <button onClick={() => setActiveTab('places')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'places' ? "text-blue-600" : "text-slate-400")} title="View Shortlisted Places">
            <MapPin className="w-5 h-5" /><span className="text-[9px] font-bold uppercase tracking-wider">Places</span>
          </button>
          <button onClick={() => setActiveTab('info')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'info' ? "text-blue-600" : "text-slate-400")} title="Reservations & Bookings">
            <Info className="w-5 h-5" /><span className="text-[9px] font-bold uppercase tracking-wider">Reservations</span>
          </button>
        </nav>`;

const newNav = `        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto md:hidden bg-white/80 backdrop-blur-xl border-t border-slate-100 px-2 py-2 pb-6 flex justify-around items-center z-50">
          <button onClick={() => setActiveTab('calendar')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'calendar' && !isAiAssistantOpen ? "text-blue-600" : "text-slate-400")} title="View Calendar">
            <Calendar className="w-5 h-5" /><span className="text-[9px] font-bold uppercase tracking-wider">Calendar</span>
          </button>
          <button onClick={() => setActiveTab('places')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'places' && !isAiAssistantOpen ? "text-blue-600" : "text-slate-400")} title="View Shortlisted Places">
            <MapPin className="w-5 h-5" /><span className="text-[9px] font-bold uppercase tracking-wider">Places</span>
          </button>
          <button onClick={() => setIsAiAssistantOpen(!isAiAssistantOpen)} className={cn("flex flex-col items-center gap-1 transition-colors relative", isAiAssistantOpen ? "text-indigo-600" : "text-slate-400")} title="AI Assistant">
            <Sparkles className={cn("w-5 h-5", isAiAssistantOpen && "animate-pulse")} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Magic AI</span>
          </button>
          <button onClick={() => setActiveTab('info')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'info' && !isAiAssistantOpen ? "text-blue-600" : "text-slate-400")} title="Reservations & Bookings">
            <Info className="w-5 h-5" /><span className="text-[9px] font-bold uppercase tracking-wider">Bookings</span>
          </button>
        </nav>`;

if (code.includes(navStart)) {
    code = code.replace(oldNav, newNav);
    fs.writeFileSync('src/App.tsx', code);
    console.log("Updated bottom nav to include AI assistant.");
} else {
    console.log("Could not find bottom nav.");
}
