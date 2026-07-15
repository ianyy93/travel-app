const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// 1. Add dayWidth state
content = content.replace(
  'const [hourHeight, setHourHeight] = useState<number>(80);',
  'const [hourHeight, setHourHeight] = useState<number>(80);\n  const [dayWidth, setDayWidth] = useState<number>(288);'
);

// 2. Add pinch zoom event listener
const hookStart = '  // Scroll to earliest event time in Grid (All Days) view';
const customHook = `
  // Semantic Pinch-to-Zoom for Grid View
  useEffect(() => {
    const el = gridScrollContainerRef.current;
    if (!el || calendarViewMode !== 'grid') return;

    let initialDist = 0;
    let initialH = 80;
    let initialW = 288;

    const handleTouchStart = (e) => {
      if (e.touches.length === 2) {
        initialDist = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
        setHourHeight(prev => { initialH = prev; return prev; });
        setDayWidth(prev => { initialW = prev; return prev; });
      }
    };

    const handleTouchMove = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault(); // Prevents page zoom
        const currentDist = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
        const scale = currentDist / initialDist;
        
        setHourHeight(Math.min(300, Math.max(40, initialH * scale)));
        setDayWidth(Math.min(600, Math.max(150, initialW * scale)));
      }
    };

    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault(); // Prevents trackpad page zoom
        const scaleChange = e.deltaY * -0.01;
        setHourHeight(prev => Math.min(300, Math.max(40, prev * (1 + scaleChange))));
        setDayWidth(prev => Math.min(600, Math.max(150, prev * (1 + scaleChange))));
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('wheel', handleWheel);
    };
  }, [calendarViewMode]);

`;
content = content.replace(hookStart, customHook + hookStart);

// 3. Update day columns to use dayWidth
// Search for w-72 shrink-0 border-r border-slate-200 relative flex flex-col z-10
content = content.replace(
  /className="w-72 shrink-0 border-r border-slate-200 relative flex flex-col z-10"/g,
  'className="shrink-0 border-r border-slate-200 relative flex flex-col z-10" style={{ width: dayWidth }}'
);

fs.writeFileSync('src/App.tsx', content);
