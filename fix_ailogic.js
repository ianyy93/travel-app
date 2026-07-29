const fs = require('fs');
let code = fs.readFileSync('src/services/aiLogic.ts', 'utf8');

// Find the index of "// API Endpoint for Propose Changes"
const proposeIdx = code.indexOf('// API Endpoint for Propose Changes');
if (proposeIdx === -1) {
  console.error("Could not find proposeIdx");
  process.exit(1);
}

// Keep everything before proposeIdx
let newCode = code.substring(0, proposeIdx);

// Append the new functions
newCode += `
export async function proposeChangesLogic(body: any) {
  try {
    if (!GEMINI_KEY) {
      throw new Error("Gemini API key is missing. Please add VITE_GEMINI_API_KEY to your environment settings.");
    }
    
    const { 
      model, currentItinerary, userPrompt, mode, pastTripsSummary, 
      currentMembers, currentShortlist, currentStays, currentFlightInfo, 
      currentRentalInfo, currentRestaurants, currentExperiences 
    } = body;
    
    const isNewTrip = !currentItinerary || currentItinerary.length === 0;
    const isReservationImport = isReservationImportPrompt(userPrompt);
    const tools = shouldEnableSearch(userPrompt, isNewTrip) && !isReservationImport ? [{ googleSearch: {} }] : undefined;

    const prunedItinerary = pruneItinerary(currentItinerary);
    
    const systemInstruction = \`
      You are an expert AI travel planner and an intelligent state-engine for a travel app.
      \${isNewTrip ? "The user is planning a NEW trip." : "The user is modifying their EXISTING itinerary."}
      
      [... system instruction truncated for brevity, but actually we should keep the same prompt if possible ...]
    \`;

    // Wait, the prompt is huge. I should just use Regex to transform app.post into export async function.
`;
