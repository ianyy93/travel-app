const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const oldEventTileSig = `  const EventTile = ({ 
    event, 
    dayIdx, 
    eventIdx, 
    isGrouped = false,
    tabId
  }: { 
    event: TripEvent, 
    dayIdx: number, 
    eventIdx: number, 
    isGrouped?: boolean,
    tabId?: string,
    key?: string | number
  }) => {`;

const newEventTileSig = `  const EventTile = ({ 
    event, 
    dayIdx, 
    eventIdx, 
    isGrouped = false,
    tabId,
    isGridMode = false
  }: { 
    event: TripEvent, 
    dayIdx: number, 
    eventIdx: number, 
    isGrouped?: boolean,
    tabId?: string,
    isGridMode?: boolean,
    key?: string | number
  }) => {`;

code = code.replace(oldEventTileSig, newEventTileSig);

const oldEventTileStyle = `        style={{ 
          minHeight: isGrouped ? \`\${calculatedHeight}px\` : 'auto'
        }}`;

const newEventTileStyle = `        style={{ 
          minHeight: isGrouped ? \`\${calculatedHeight}px\` : 'auto',
          height: isGridMode ? '100%' : 'auto'
        }}`;

code = code.replace(oldEventTileStyle, newEventTileStyle);

fs.writeFileSync('src/App.tsx', code);
console.log("Updated EventTile for grid mode");
