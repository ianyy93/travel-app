const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const oldAiStart = `      {/* AI Assistant Panel */}\n      <AnimatePresence>\n        {showAiAssistant && (`;
const idxStart = code.indexOf(oldAiStart);

if (idxStart !== -1) {
    const nextSectionStr = `      {/* Header */}`;
    const idxEnd = code.indexOf(nextSectionStr, idxStart);
    if (idxEnd !== -1) {
        code = code.substring(0, idxStart) + code.substring(idxEnd);
        fs.writeFileSync('src/App.tsx', code);
        console.log("Deleted old AI panel.");
    } else {
        console.log("Could not find end section.");
    }
} else {
    console.log("Could not find start section.");
}
