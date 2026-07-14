const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const targetStr = `{/* Collapsible AI Assistant Pane */}`;
const replaceStr = `{/* Mobile Backdrop */}
          <AnimatePresence>
            {isAiAssistantOpen && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsAiAssistantOpen(false)}
                className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 md:hidden"
              />
            )}
          </AnimatePresence>

          {/* Collapsible AI Assistant Pane */}`;

if (!code.includes("Mobile Backdrop")) {
    code = code.replace(targetStr, replaceStr);
    fs.writeFileSync('src/App.tsx', code);
    console.log("Backdrop added.");
} else {
    console.log("Backdrop already exists.");
}
