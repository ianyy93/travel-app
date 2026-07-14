const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const oldLogic = `                                  {day.events?.map((event, idx) => {
                                    const startMins = toMinutes(event.startTime);
                                    let endMins = toMinutes(event.endTime || event.startTime);
                                    if (endMins <= startMins) endMins += 60; // Default 1 hour duration
                                    
                                    const top = (startMins / 60) * 80;
                                    const height = ((endMins - startMins) / 60) * 80;`;

const newLogic = `                                  {day.events?.map((event, idx) => {
                                    const startMins = toMinutes(event.startTime);
                                    let endMins = toMinutes(event.endTime || event.startTime);
                                    if (endMins < startMins && event.endTime) {
                                      endMins += 24 * 60;
                                    } else if (endMins === startMins) {
                                      endMins += 60; // Default 1 hour duration
                                    }
                                    
                                    const top = (startMins / 60) * 80;
                                    const height = ((endMins - startMins) / 60) * 80;`;

code = code.replace(oldLogic, newLogic);

code = code.replace(
  `{/* Events Area */}
                                <div className="relative w-full" style={{ height: 24 * 80 }}>`,
  `{/* Events Area */}
                                <div className="relative w-full overflow-hidden" style={{ height: 24 * 80 }}>`
);

fs.writeFileSync('src/App.tsx', code);
console.log("Updated cross day event duration.");
