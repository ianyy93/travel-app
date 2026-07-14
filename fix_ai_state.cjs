const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/const \[showAiAssistant, setShowAiAssistant\] = useState\(false\);\n?/g, '');
code = code.replace(/setShowAiAssistant/g, 'setIsAiAssistantOpen');
code = code.replace(/showAiAssistant/g, 'isAiAssistantOpen');

fs.writeFileSync('src/App.tsx', code);
console.log("Updated AI state.");
