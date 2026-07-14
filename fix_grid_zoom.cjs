const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Replace standard height values with state variable
const targetBlock = `                      <div className="flex-1 overflow-auto bg-slate-50 relative pb-20 scrollbar-hide">
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
                                <div className="relative w-full overflow-hidden" style={{ height: 24 * 80 }}>
                                  {day.events?.map((event, idx) => {
                                    const startMins = toMinutes(event.startTime);
                                    let endMins = toMinutes(event.endTime || event.startTime);
                                    if (endMins < startMins && event.endTime) {
                                      endMins += 24 * 60;
                                    } else if (endMins === startMins) {
                                      endMins += 60; // Default 1 hour duration
                                    }
                                    
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

const replaceBlock = `                      <div className="flex-1 overflow-auto bg-slate-50 relative pb-20 scrollbar-hide">
                        <div className="flex min-w-max min-h-max relative">
                          {/* Time Axis */}
                          <div className="w-16 shrink-0 border-r border-slate-200 bg-white sticky left-0 z-30">
                            <div className="h-[88px] border-b border-slate-200 bg-white sticky top-0 z-40" />
                            <div className="relative" style={{ height: 24 * hourHeight }}>
                              {Array.from({ length: 24 }).map((_, h) => (
                                <div key={h} className="absolute w-full text-right pr-2 text-[10px] font-bold text-slate-400" style={{ top: h * hourHeight - 8 }}>
                                  {h === 0 ? '12 AM' : h < 12 ? \`\${h} AM\` : h === 12 ? '12 PM' : \`\${h - 12} PM\`}
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          {/* Background Grid Lines */}
                          <div className="absolute inset-0 pointer-events-none z-0 ml-16" style={{ height: 24 * hourHeight + 88 }}>
                            <div className="h-[88px]" />
                            {Array.from({ length: 24 }).map((_, h) => (
                              <div key={h} className="border-b border-slate-200 w-full" style={{ height: hourHeight }} />
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
                                <div className="relative w-full overflow-hidden" style={{ height: 24 * hourHeight }}>
                                  {day.events?.map((event, idx) => {
                                    const startMins = toMinutes(event.startTime);
                                    let endMins = toMinutes(event.endTime || event.startTime);
                                    if (endMins < startMins && event.endTime) {
                                      endMins += 24 * 60;
                                    } else if (endMins === startMins) {
                                      endMins += 60; // Default 1 hour duration
                                    }
                                    
                                    const top = (startMins / 60) * hourHeight;
                                    const height = ((endMins - startMins) / 60) * hourHeight;

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

if (code.indexOf('className="flex-1 overflow-auto bg-slate-50 relative pb-20 scrollbar-hide"') !== -1) {
    code = code.replace(targetBlock, replaceBlock);
    fs.writeFileSync('src/App.tsx', code);
    console.log("Replaced grid hours successfully!");
} else {
    console.log("Could not find the target grid block.");
}
