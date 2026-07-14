const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const targetStr = `                      <div className="flex-1 overflow-x-auto p-4 md:p-6 pb-20">
                        <div className="flex h-full min-w-max gap-3 items-start">
                          {itinerary.map((day, i) => (
                            <div key={i} className="w-72 bg-white rounded-2xl border border-slate-200 flex flex-col h-[70vh] shadow-sm shrink-0 overflow-hidden">
                              <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                                <div className="flex justify-between items-center mb-1">
                                  <h3 className="font-display font-bold text-slate-800">Day {i + 1}</h3>
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider bg-white px-2 py-1 rounded-md border border-slate-200">
                                    {day.date}
                                 </span>
                                </div>
                                <p className="text-xs text-slate-500 truncate">{day.title}</p>
                              </div>
                              <div className="p-3 flex-1 overflow-y-auto space-y-3 bg-slate-50/30 scrollbar-hide pb-10">
                                {day.events?.length === 0 ? (
                                  <div className="text-center py-10">
                                    <p className="text-slate-400 text-xs font-medium">No plans</p>
                                  </div>
                                ) : (
                                  day.events?.map((event, idx) => (
                                    <EventTile key={event.id || idx} event={event} dayIdx={i} eventIdx={idx} />
                                  ))
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>`;

const replaceStr = `                      <div className="flex-1 overflow-auto bg-slate-50 relative pb-20 scrollbar-hide">
                        <div className="flex min-w-max min-h-max relative">
                          {/* Time Axis */}
                          <div className="w-16 shrink-0 border-r border-slate-200 bg-white sticky left-0 z-30">
                            <div className="h-[88px] border-b border-slate-200 bg-white sticky top-0 z-40" />
                            <div className="relative" style={{ height: 24 * 80 }}>
                              {Array.from({ length: 24 }).map((_, h) => (
                                <div key={h} className="absolute w-full text-right pr-2 text-[10px] font-bold text-slate-400" style={{ top: h * 80 - 8 }}>
                                  {h === 0 ? '12 AM' : h < 12 ? \`\${h} AM\` : h === 12 ? '12 PM' : \`\${h - 12} PM\`}
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          {/* Background Grid Lines */}
                          <div className="absolute inset-0 pointer-events-none z-0 ml-16" style={{ height: 24 * 80 + 88 }}>
                            <div className="h-[88px]" />
                            {Array.from({ length: 24 }).map((_, h) => (
                              <div key={h} className="border-b border-slate-200 w-full" style={{ height: 80 }} />
                            ))}
                          </div>

                          {/* Day Columns */}
                          <div className="flex">
                            {itinerary.map((day, i) => (
                              <div key={i} className="w-72 shrink-0 border-r border-slate-200 relative flex flex-col z-10">
                                {/* Header */}
                                <div className="h-[88px] p-4 border-b border-slate-200 bg-slate-50/90 backdrop-blur-md sticky top-0 z-20 overflow-hidden shrink-0">
                                  <div className="flex justify-between items-center mb-1">
                                    <h3 className="font-display font-bold text-slate-800 text-lg">Day {i + 1}</h3>
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider bg-white px-2 py-1 rounded-md border border-slate-200">
                                      {day.date}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-500 truncate font-medium">{day.title}</p>
                                </div>
                                
                                {/* Events Area */}
                                <div className="relative w-full" style={{ height: 24 * 80 }}>
                                  {day.events?.map((event, idx) => {
                                    const startMins = toMinutes(event.startTime);
                                    let endMins = toMinutes(event.endTime || event.startTime);
                                    if (endMins <= startMins) endMins += 60; // Default 1 hour duration
                                    
                                    const top = (startMins / 60) * 80;
                                    const height = ((endMins - startMins) / 60) * 80;

                                    return (
                                      <div 
                                        key={event.id || idx} 
                                        className="absolute w-full px-2 py-1"
                                        style={{ top: \`\${top}px\`, height: \`\${height}px\` }}
                                      >
                                        <EventTile event={event} dayIdx={i} eventIdx={idx} isGridMode={true} />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>`;

if (code.includes('className="flex-1 overflow-x-auto p-4 md:p-6 pb-20"')) {
    code = code.replace(targetStr, replaceStr);
    fs.writeFileSync('src/App.tsx', code);
    console.log("Updated grid view.");
} else {
    console.log("Target string not found.");
}
