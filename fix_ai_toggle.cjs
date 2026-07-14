const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const mobileHeaderStart = `{/* Mobile Header Toggle for AI */}`;
const idxStart = code.indexOf(mobileHeaderStart);

if (idxStart !== -1) {
    const nextSectionStr = `{/* Tab Content */}`;
    const idxEnd = code.indexOf(nextSectionStr, idxStart);
    if (idxEnd !== -1) {
        code = code.substring(0, idxStart) + code.substring(idxEnd);
        fs.writeFileSync('src/App.tsx', code);
        console.log("Updated AI toggle and removed redundant mobile header.");
    } else {
        console.log("Could not find end of mobile header");
    }
} else {
    console.log("Could not find mobile header");
}
