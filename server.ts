import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { jsonrepair } from "jsonrepair";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

const GEMINI_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({
  apiKey: GEMINI_KEY || 'MISSING_KEY',
  httpOptions: {
    timeout: 300000, // 5 minutes
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const QUOTA_LIMITS: Record<string, number> = {
  "gemini-3-flash-preview": 20,
  "gemini-3.1-flash-lite-preview": 500,
  "gemini-2.5-flash-preview": 20,
  "gemini-2.5-flash-lite-preview": 500
};

// Simple quota / usage tracking in memory or local-like on server
const trackUsage = (modelName: string) => {
  return 500; // Return a default mock quota remaining
};

// Helper function to return user-friendly API error messages, especially for quota exceeded errors
function getFriendlyErrorMessage(error: any): string {
  const msg = error.message ? String(error.message) : String(error);
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
    return "Gemini API Quota Exceeded (Rate Limit / 429): You have exceeded the free tier quota limits for this Gemini API key. Please check your billing settings or wait 1-2 minutes before retrying. Alternatively, you can configure your own pay-as-you-go Gemini API key in Google AI Studio Settings.";
  }
  return msg;
}

// Helper to prune and compress itinerary data to minimize input token size
function pruneItinerary(itinerary: any[]) {
  if (!Array.isArray(itinerary)) return [];
  return itinerary.map(day => ({
    dayNumber: day.dayNumber,
    date: day.date,
    title: day.title,
    events: Array.isArray(day.events) ? day.events.map((e: any) => ({
      id: e.id,
      type: e.type,
      category: e.category,
      startTime: e.startTime,
      endTime: e.endTime,
      title: e.title,
      description: e.description,
      status: e.status,
      location: e.location ? {
        name: e.location.name,
        lat: e.location.lat,
        lng: e.location.lng,
      } : undefined,
      memberIds: e.memberIds,
    })) : []
  }));
}

// Helper to prune stays
function pruneStays(stays: any[]) {
  if (!Array.isArray(stays)) return [];
  return stays.map(s => ({
    name: s.name,
    location: s.location,
    checkIn: s.checkIn,
    checkOut: s.checkOut,
  }));
}

// Helper to prune shortlist items
function pruneShortlist(list: any[]) {
  if (!Array.isArray(list)) return [];
  return list.map(item => ({
    name: item.name,
    category: item.category,
    description: item.description,
  }));
}

// Helper to prune dining
function pruneDining(dining: any[]) {
  if (!Array.isArray(dining)) return [];
  return dining.map(d => ({
    name: d.name,
    date: d.date,
    time: d.time,
  }));
}

// Helper to prune experiences
function pruneExperiences(exp: any[]) {
  if (!Array.isArray(exp)) return [];
  return exp.map(e => ({
    name: e.name,
    date: e.date,
    time: e.time,
    location: e.location,
  }));
}

// Helper to determine if we actually need Google Search grounding for the prompt
function shouldEnableSearch(prompt: string, isNewTrip: boolean): boolean {
  if (isNewTrip) return true;
  if (!prompt) return false;
  const p = prompt.toLowerCase();
  const keywords = [
    "search", "find", "google", "look up", "recommend", "latest", "recent", "current",
    "weather", "now", "real-time", "live", "news", "restaurants", "activities in", "places in",
    "near by", "nearby", "where is", "best ", "top ", "plan", "trip", "itinerary", "visit",
    "go to", "travel to", "stay at", "hotel", "flight", "booking", "reservation"
  ];
  return keywords.some(keyword => p.includes(keyword));
}

// Detect copy-pasted reservation/booking emails, flight tickets, rentals, or hotel stays
function isReservationImportPrompt(prompt: string): boolean {
  if (!prompt) return false;
  const p = prompt.toLowerCase();
  
  // Conversational indicators - if any of these are present, it's likely a conversational request, not a raw copy-pasted email/ticket
  const conversationalIndicators = [
    "please plan", "can you", "suggest", "recommend", "what should we", "how about", 
    "i'm planning", "i want to", "help me", "create a trip", "plan a trip", "ideas for",
    "should we", "would be nice to", "could you", "give me", "show me", "what are some",
    "modify my", "change my", "update the", "add a", "remove the", "delete the"
  ];
  
  const isConversational = conversationalIndicators.some(indicator => p.includes(indicator));
  if (isConversational) return false;

  // Extremely high-signal indicators of an actual receipt/ticket/confirmation email
  const highSignal = [
    "confirmation number", "booking reference", "ticket number", "record locator",
    "booking confirmation", "reservation confirmation", "pnr", "boarding pass",
    "reservation code", "itinerary number", "flight confirmation"
  ];
  
  const hasHighSignal = highSignal.some(sig => p.includes(sig));
  if (hasHighSignal) return true;

  // Medium-signal indicators
  const medSignal = [
    "from:", "subject:", "passenger details", "dear guest", "dear traveler",
    "thank you for your booking", "check-in:", "check-out:", "checkout:", 
    "billing address", "total paid", "amount paid", "party of", "table reserved",
    "grand banks reservation"
  ];

  const lowSignal = [
    "airbnb", "booking.com", "expedia", "resy", "opentable", "rentalcar", "hotel stay"
  ];

  const medCount = medSignal.filter(sig => p.includes(sig)).length;
  const lowCount = lowSignal.filter(sig => p.includes(sig)).length;

  // If we have a mix of medium and low signal indicators in a structured looking block
  if (medCount >= 2) return true;
  if (medCount >= 1 && lowCount >= 1) return true;
  
  // A raw email copy-paste is typically long and contains headers like check-in/check-out and dates
  if (p.length > 500 && (p.includes("check-in") || p.includes("check out") || p.includes("flight")) && (medCount + lowCount >= 2)) {
    return true;
  }

  return false;
}

// Insert parsed reservation events into the correct day of the existing itinerary
function insertNewEventsIntoItinerary(itinerary: any[], newEvents: any[]) {
  if (!Array.isArray(itinerary) || !Array.isArray(newEvents)) return itinerary;
  
  const nextItinerary = JSON.parse(JSON.stringify(itinerary));
  
  for (const event of newEvents) {
    if (!event.date) continue;
    
    let targetDay = nextItinerary.find((day: any) => {
      const dayDateClean = (day.date || '').toLowerCase();
      const eventDateClean = event.date.toLowerCase();
      return dayDateClean.includes(eventDateClean) || eventDateClean.includes(dayDateClean);
    });
    
    if (!targetDay) {
      // If no matching day found, create a new day if it's a reasonably structured date
      // This allows return flights on the day after the current itinerary ends to be added
      const newDay = {
        id: nextItinerary.length + 1,
        date: event.date,
        title: "Added from Reservation",
        events: []
      };
      nextItinerary.push(newDay);
      targetDay = newDay;
      
      // Re-sort itinerary by date if possible (very basic sort)
      nextItinerary.sort((a: any, b: any) => {
        const da = new Date(a.date);
        const db = new Date(b.date);
        if (!isNaN(da.getTime()) && !isNaN(db.getTime())) return da.getTime() - db.getTime();
        return a.id - b.id;
      });
    }
    
    if (targetDay) {
      if (!Array.isArray(targetDay.events)) {
        targetDay.events = [];
      }
      
      const isDuplicate = targetDay.events.some((e: any) => 
        (e.title || '').toLowerCase() === (event.title || '').toLowerCase() &&
        (e.startTime === event.startTime)
      );
      
      if (!isDuplicate) {
        const uuid = "evt_" + Math.random().toString(36).substring(2, 9);
        const newEventObj: any = {
          id: uuid,
          type: "activity",
          category: event.category || "activity",
          startTime: event.startTime || "12:00",
          endTime: event.endTime || "13:30",
          title: event.title,
          description: event.description || "",
          status: "confirmed"
        };
        
        if (event.locationName && typeof event.lat === 'number' && typeof event.lng === 'number') {
          newEventObj.location = {
            name: event.locationName,
            lat: event.lat,
            lng: event.lng,
            description: event.description || ""
          };
        } else if (event.location) {
          // Normalize if AI provided location as a string or object
          if (typeof event.location === 'string') {
            newEventObj.location = { name: event.location };
          } else if (typeof event.location === 'object') {
            newEventObj.location = {
              name: event.location.name || event.location.locationName || "Location",
              lat: event.location.lat,
              lng: event.location.lng
            };
          }
        }
        
        // Handle travel type events (origin/destination)
        if (event.origin) {
          newEventObj.origin = typeof event.origin === 'string' ? { name: event.origin } : event.origin;
        }
        if (event.destination) {
          newEventObj.destination = typeof event.destination === 'string' ? { name: event.destination } : event.destination;
        }
        
        targetDay.events.push(newEventObj);
        targetDay.events.sort((a: any, b: any) => {
          const aMin = (a.startTime || "00:00").split(":").map(Number).reduce((h, m) => h * 60 + m, 0);
          const bMin = (b.startTime || "00:00").split(":").map(Number).reduce((h, m) => h * 60 + m, 0);
          return aMin - bMin;
        });
      }
    }
  }
  
  return nextItinerary;
}

// Automatic retry function with exponential backoff and model fallbacks to recover from 429 and 503 errors seamlessly
async function generateContentWithRetry(params: any, retries = 3, initialDelay = 1500): Promise<any> {
  let lastError: any = null;
  const originalModel = params.model;
  
  // Define fallback models in order of priority to handle quota exhaustion or temporary server high demand dynamically
  const fallbackChain = [
    originalModel,
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-flash-preview",
    "gemini-2.5-flash-lite-preview"
  ].filter((model, idx, self) => self.indexOf(model) === idx); // Deduplicate while maintaining original model as first choice
  
  for (const currentModel of fallbackChain) {
    params.model = currentModel;
    console.log(`[Server] Attempting generateContent with model: ${params.model}`);
    
    for (let i = 0; i < retries; i++) {
      try {
        const response = await ai.models.generateContent(params);
        return response;
      } catch (error: any) {
        lastError = error;
        
        const isTransientOrQuota = error.name === 'HeadersTimeoutError' || error.message?.includes('fetch failed') || error.message?.includes('Timeout') || error.message?.includes('Unexpected token') || error.message?.includes('is not valid JSON') || error.status === 429 || 
                                   error.status === 503 ||
                                   error.status === 504 ||
                                   error.code === 503 ||
                                   error.code === 429 ||
                                   (error.message && (
                                     error.message.includes("429") || 
                                     error.message.includes("503") || 
                                     error.message.toLowerCase().includes("quota") ||
                                     error.message.toLowerCase().includes("exhausted") ||
                                     error.message.toLowerCase().includes("rate limit") ||
                                     error.message.toLowerCase().includes("demand") ||
                                     error.message.toLowerCase().includes("temporary") ||
                                     error.message.toLowerCase().includes("spikes") ||
                                     error.message.toLowerCase().includes("unavailable") ||
                                     error.message.toLowerCase().includes("overloaded")
                                   ));
        
        if (isTransientOrQuota) {
          // If we have search grounding tools enabled, strip them on the very first transient error attempt to bypass search quota/limits immediately
          if (params && params.config && params.config.tools) {
            console.warn(`[Server] Transient error hit for ${params.model}. Stripping Google Search grounding tool and retrying immediately...`);
            delete params.config.tools;
            i--; // Decrement so we don't consume a retry attempt
            continue;
          }

          if (i < retries - 1) {
            const backoff = initialDelay * Math.pow(2, i);
            console.warn(`[Server] Encountered transient/quota error on model ${params.model}. Retrying in ${backoff}ms... (Attempt ${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, backoff));
          } else {
            console.warn(`[Server] Exceeded retries for model ${params.model}. Moving to next fallback model in the chain if available...`);
          }
        } else {
          // If it's not a transient or quota error, propagate it immediately as it might be a malformed prompt or schema error that won't benefit from fallbacks
          throw error;
        }
      }
    }
  }
  
  throw lastError || new Error("Failed to generate content after attempting all fallback models.");
}


// Dynamically chunk generations that exceed MAX_TOKENS

async function generateAndParseJSON(params: any, maxRetries = 2): Promise<{parsed: any, text: string}> {
  let attempts = 0;
  let lastError: any = null;
  let lastText = "";
  
  while (attempts < maxRetries) {
    attempts++;
    try {
      const response = await generateFullContent(params);
      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini.");
      }
      lastText = text;
      const parsed = safeParseJSON(text);
      return { parsed, text };
    } catch (err: any) {
      console.warn(`[Server] JSON parsing failed on attempt ${attempts}/${maxRetries}. Error:`, err.message);
      lastError = err;
      if (attempts >= maxRetries) {
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  const err: any = new Error("Failed to parse JSON response from Gemini model.");
  err.rawText = lastText;
  err.originalError = lastError;
  throw err;
}

async function generateFullContent(params: any): Promise<{text: string}> {
  let fullText = "";
  let currentParams = JSON.parse(JSON.stringify(params)); // deep copy
  let chunks = 0;
  
  while (chunks < 5) { // max 5 chunks
    const response = await generateContentWithRetry(currentParams);
    if (!response || !response.text) {
      if (chunks === 0) return response;
      break;
    }
    
    // Clean up markdown wrapper from continuation chunks if the model added it
    let chunkText = response.text;
    if (chunks > 0) {
       chunkText = chunkText.replace(/^\s*```json\n?|\n?```\s*$/g, '');
    }
    
    fullText += chunkText;
    
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason !== 'MAX_TOKENS') {
       break;
    }
    
    console.warn("[Server] Hit MAX_TOKENS. Dynamically fetching continuation chunk " + (chunks + 1));
    chunks++;
    
    // Convert current contents to a conversation array if it isn't already
    let messages = [];
    if (Array.isArray(currentParams.contents)) {
       messages = [...currentParams.contents];
    } else {
       messages = [{ role: 'user', parts: [{ text: currentParams.contents }] }];
    }
    messages.push({ role: 'model', parts: [{ text: fullText }] });
    messages.push({ role: 'user', parts: [{ text: "Your JSON got cut off due to token limits. Continue exactly from where you left off. Output only the raw JSON continuation characters. Do not output any markdown blocks or intro text." }] });
    
    currentParams.contents = messages;
    
    // Crucial: we MUST remove schema/json enforcement on continuations, because it's just a fragment!
    if (currentParams.config) {
       delete currentParams.config.responseSchema;
       delete currentParams.config.responseMimeType;
    }
  }
  
  return { text: fullText };
}

// Adapter for Gemma models that do not support responseSchema, tools, etc.
function prepareGenerateParams(model: string, contents: string, baseConfig: any) {
  const isGemma = model.toLowerCase().includes("gemma");
  
  if (!isGemma) {
    return {
      model,
      contents,
      config: baseConfig
    };
  }
  
  const configCopy = { ...baseConfig };
  delete configCopy.responseMimeType;
  delete configCopy.responseSchema;
  delete configCopy.tools;
  
  let finalContents = contents;
  if (configCopy.systemInstruction) {
    let systemText = "";
    if (typeof configCopy.systemInstruction === "string") {
      systemText = configCopy.systemInstruction;
    } else if (configCopy.systemInstruction.parts) {
      systemText = configCopy.systemInstruction.parts.map((p: any) => p.text).join("\n");
    }
    
    finalContents = `SYSTEM INSTRUCTION:\n${systemText}\n\nUSER REQUEST:\n${contents}\n\nIMPORTANT: You must return ONLY a valid, raw JSON object or array matching the schema/structure requested. Do not include any conversation, markdown, prefix, or suffix. Ensure you output standard valid JSON.`;
    delete configCopy.systemInstruction;
  } else {
    finalContents = `${contents}\n\nIMPORTANT: You must return ONLY a valid, raw JSON object or array matching the structure requested. Do not include any conversation, markdown, prefix, or suffix.`;
  }
  
  return {
    model,
    contents: finalContents,
    config: configCopy
  };
}

// Extract JSON from output text safely
function extractJSON(text: string, findEnd: boolean = true): string {
  if (!text) return "";
  
  // Clean up common AI noise like markdown wrappers and intro text
  let cleaned = text.trim();
  
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIdx = -1;
  let endIdx = -1;
  
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = cleaned.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = cleaned.lastIndexOf(']');
  }
  
  if (startIdx !== -1) {
    if (findEnd && endIdx !== -1 && endIdx > startIdx) {
      return cleaned.substring(startIdx, endIdx + 1);
    }
    return cleaned.substring(startIdx);
  }
  
  // Fallback for markdown blocks if indices failed
  const jsonMatch = cleaned.match(/```json\n([\s\S]*?)\n```/) || cleaned.match(/```([\s\S]*?)```/);
  if (jsonMatch) return jsonMatch[1].trim();
  
  return cleaned.replace(/```json\n?|\n?```/g, '').trim();
}

// Parse JSON safely, utilizing jsonrepair on syntax errors (like unterminated strings or trailing commas)
function safeParseJSON(text: string): any {
  if (!text) throw new Error("Empty text provided to safeParseJSON");
  
  // First attempt: try finding the exact end bracket (works for complete JSON with trailing conversational text)
  const exactCleaned = extractJSON(text, true);
  try {
    return JSON.parse(exactCleaned);
  } catch (err: any) {
    console.warn(`[safeParseJSON] Standard parse failed. Error: ${err.message}. Possibly truncated. Attempting jsonrepair...`);
    
    // Second attempt: get everything from the first bracket onwards to avoid truncating incomplete JSON
    const fullCleaned = extractJSON(text, false);
    try {
      const repaired = jsonrepair(fullCleaned);
      return JSON.parse(repaired);
    } catch (err2: any) {
      console.warn(`[safeParseJSON] jsonrepair failed. Error: ${err2.message}. Attempting recovery from exact cleaned...`);
      try {
        const repairedRaw = jsonrepair(exactCleaned);
        return JSON.parse(repairedRaw);
      } catch (err3) {
        console.error("[safeParseJSON] All JSON parsing and repair attempts failed.");
        throw err; // throw original parse error to show syntax details
      }
    }
  }
}

// API Endpoint for Proposing Changes
app.post("/api/gemini/propose", async (req, res) => {
  try {
    if (!GEMINI_KEY) {
      return res.status(500).json({ 
        error: "Gemini API key is missing. Please add GEMINI_API_KEY to your environment settings." 
      });
    }

    const {
      model,
      currentItinerary,
      userPrompt,
      mode = 'full',
      pastTripsSummary,
      currentMembers = [],
      currentShortlist = [],
      currentStays = [],
      currentFlightInfo = null,
      currentRentalInfo = null,
      currentRestaurants = [],
      currentExperiences = []
    } = req.body;

    const isNewTripRequest = currentItinerary.length === 0 || 
      userPrompt.toLowerCase().includes('new trip') || 
      userPrompt.toLowerCase().includes('plan a trip') ||
      userPrompt.toLowerCase().includes('create a trip');

    // SPECIALIZED RESERVATION / CONFIRMATION EMAIL PARSER
    // Intercepts extraction prompts and routes them to a highly-specialized, ultra-lightweight prompt
    if (mode === 'details' || (mode !== 'full' && isReservationImportPrompt(userPrompt))) {
      console.log(`[Server] Routing prompt to Specialized Reservation Parser...`);
      
      const availableDates = currentItinerary.map((d: any) => ({
        date: d.date, // e.g. "Jul 28"
        title: d.title // e.g. "Day 1 - Arrival"
      }));

      const reservationParserSystemInstruction = `
        You are an expert booking and reservation data extractor. 
        Your job is to extract reservation, booking, and schedule details from the provided text (such as confirmation emails, receipts, tickets, or text confirmations) and map them to the trip's available dates.
        
        Available itinerary dates for this trip:
        ${JSON.stringify(availableDates)}
        
        IMPORTANT RULES:
        1. RELEVANCE: Only extract items that are relevant to a travel itinerary. 
           - IGNORE dental appointments, doctor visits, local hair appointments, or gym classes unless they are explicitly part of the travel destination.
        2. CANCELLATIONS & CHANGES: If the text indicates a CANCELLATION, set the event's "status" to "hidden" or "cancelled". 
           - If it indicates a CHANGE (e.g. "Your flight has changed"), update the extraction with the NEW details.
        3. DUPLICATES: If multiple emails for the same reservation exist, use the LATEST one by date.
        4. OUTPUT: Output a JSON object containing stays, flightInfo, rentalInfo, restaurants, and experiences.
        5. ITINERARY: Additionally, generate an array "newEvents" containing a corresponding itinerary event for each reservation (flights, stays, car rentals, etc.). 
           - For "date", use the exact date from the reservation (e.g., "Aug 02"). 
           - If a reservation spans multiple days (like a hotel stay), create an event for the Check-in day.
           - For "location", you MUST provide an object: {"name": "Location Name", "lat": 0, "lng": 0}. You MUST use Google Search to find the exact coordinates. 
           - For flights, the "location" should be the destination airport with its coordinates.
           - Ensure EVERY reservation in stays, flightInfo, rentalInfo, restaurants, and experiences has a matching entry in newEvents.
        
        If this is a new trip or dates are empty, propose a reasonable title (e.g. "NYC 2026") and dates (e.g. "Jul 28 - Aug 02") based on the reservation.
      `;

      const reservationConfig = {
        systemInstruction: reservationParserSystemInstruction,
        responseMimeType: "application/json",
        maxOutputTokens: 2048,
        temperature: 0.1,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            stays: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  location: { type: Type.STRING },
                  checkIn: { type: Type.STRING },
                  checkOut: { type: Type.STRING },
                  confirmation: { type: Type.STRING },
                  phone: { type: Type.STRING }
                }
              }
            },
            flightInfo: {
              type: Type.OBJECT,
              properties: {
                outbound: {
                  type: Type.OBJECT,
                  properties: {
                    number: { type: Type.STRING },
                    from: { type: Type.STRING },
                    to: { type: Type.STRING },
                    date: { type: Type.STRING },
                    confirmation: { type: Type.STRING }
                  }
                },
                return: {
                  type: Type.OBJECT,
                  properties: {
                    number: { type: Type.STRING },
                    from: { type: Type.STRING },
                    to: { type: Type.STRING },
                    date: { type: Type.STRING },
                    confirmation: { type: Type.STRING }
                  }
                }
              }
            },
            rentalInfo: {
              type: Type.OBJECT,
              properties: {
                company: { type: Type.STRING },
                car: { type: Type.STRING },
                pickup: { type: Type.STRING },
                dropoff: { type: Type.STRING },
                phone: { type: Type.STRING },
                confirmation: { type: Type.STRING }
              }
            },
            restaurants: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  date: { type: Type.STRING },
                  time: { type: Type.STRING },
                  confirmation: { type: Type.STRING },
                  phone: { type: Type.STRING }
                }
              }
            },
            experiences: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  date: { type: Type.STRING },
                  time: { type: Type.STRING },
                  location: { type: Type.STRING },
                  confirmation: { type: Type.STRING }
                }
              }
            },
            newEvents: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING },
                  category: { type: Type.STRING },
                  startTime: { type: Type.STRING },
                  endTime: { type: Type.STRING },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  locationName: { type: Type.STRING },
                  lat: { type: Type.NUMBER },
                  lng: { type: Type.NUMBER }
                },
                required: ["date", "category", "startTime", "endTime", "title"]
              }
            },
            explanation: { type: Type.STRING },
            title: { type: Type.STRING },
            dates: { type: Type.STRING }
          }
        }
      };

      const activeModel = model || 'gemini-3.5-flash';
      const params = prepareGenerateParams(activeModel, userPrompt, reservationConfig);
            let parsed;
      let rawResponseText = '';
      try {
        const result = await generateAndParseJSON(params, 2);
        parsed = result.parsed;
        rawResponseText = result.text;
      } catch (err: any) {
        return res.status(500).json({ error: "Specialized Reservation Parser returned unparsable response.", rawText: err.rawText });
      }
      try {

        // Merge extracted root fields with existing ones
        const mergedStays = [...(currentStays || [])];
        if (parsed.stays && Array.isArray(parsed.stays)) {
          for (const s of parsed.stays) {
            if (!mergedStays.some(existing => (existing.name || '').toLowerCase() === (s.name || '').toLowerCase())) {
              mergedStays.push(s);
            }
          }
        }

        const mergedRestaurants = [...(currentRestaurants || [])];
        if (parsed.restaurants && Array.isArray(parsed.restaurants)) {
          for (const r of parsed.restaurants) {
            if (!mergedRestaurants.some(existing => (existing.name || '').toLowerCase() === (r.name || '').toLowerCase() && existing.date === r.date)) {
              mergedRestaurants.push(r);
            }
          }
        }

        const mergedExperiences = [...(currentExperiences || [])];
        if (parsed.experiences && Array.isArray(parsed.experiences)) {
          for (const e of parsed.experiences) {
            if (!mergedExperiences.some(existing => (existing.name || '').toLowerCase() === (e.name || '').toLowerCase() && existing.date === e.date)) {
              mergedExperiences.push(e);
            }
          }
        }

        const mergedFlightInfo = { ...(currentFlightInfo || {}) };
        if (parsed.flightInfo) {
          if (parsed.flightInfo.outbound) {
            mergedFlightInfo.outbound = { ...(mergedFlightInfo.outbound || {}), ...parsed.flightInfo.outbound };
          }
          if (parsed.flightInfo.return) {
            mergedFlightInfo.return = { ...(mergedFlightInfo.return || {}), ...parsed.flightInfo.return };
          }
        }

        const mergedRentalInfo = parsed.rentalInfo ? { ...(currentRentalInfo || {}), ...parsed.rentalInfo } : currentRentalInfo;

        // Insert new events into the existing itinerary
        const updatedItinerary = insertNewEventsIntoItinerary(currentItinerary, parsed.newEvents || []);

        const finalResponse = {
          itinerary: updatedItinerary,
          explanation: parsed.explanation || "Successfully imported reservation details.",
          assumptions: [],
          suggestions: [],
          title: parsed.title || req.body.title || "Trip Plans",
          dates: parsed.dates || req.body.dates || "Dates TBD",
          shortlist: currentShortlist || [],
          flightInfo: mergedFlightInfo,
          rentalInfo: mergedRentalInfo,
          stays: mergedStays,
          restaurants: mergedRestaurants,
          experiences: mergedExperiences,
          members: currentMembers,
          modelInfo: { 
            name: activeModel,
            quotaRemaining: trackUsage(activeModel)
          }
        };

        return res.json(finalResponse);
      } catch (parseError: any) {
        console.warn(`Reservation JSON parse failed, falling back to raw output`, parseError);
        console.warn(`[DEBUG Reservation Raw Text]: unavailable`);
        return res.status(500).json({ 
          error: "Failed to parse JSON response from Reservation Parser.", 
          rawText: 'unavailable' 
        });
      }
    }

    // Compress input data to stay safely within rate/token limits and avoid 429 issues
    const prunedItinerary = pruneItinerary(currentItinerary);
    const contextItinerary = prunedItinerary.length > 31 ? prunedItinerary.slice(0, 31) : prunedItinerary;
    const contextStays = pruneStays(currentStays);
    const contextShortlist = pruneShortlist(currentShortlist);
    const contextDining = pruneDining(currentRestaurants);
    const contextExperiences = pruneExperiences(currentExperiences);

    let modeInstruction = '';
    if (mode === 'details') {
      modeInstruction = 'FOCUS ONLY on extracting booking details (flights, stays, rentals, restaurants) and trip members. Do not modify the itinerary events unless necessary for consistency.';
    } else if (mode === 'places') {
      modeInstruction = 'FOCUS ONLY on adding or modifying itinerary events (places, activities). Do not add navigation/travel events between them yet.';
    } else if (mode === 'navigation') {
      modeInstruction = 'FOCUS ONLY on adding navigation/travel events (drive, walk, transit) between existing activities in the itinerary. Do not add new activities.';
    } else if (mode === 'autofill') {
      modeInstruction = 'FOCUS ON identifying gaps in the itinerary. Add placeholder events ("pending-meal", "suggestion") with 3-5 options based on the Shortlist and logical suggestions. DO NOT invent confirmed activities.';
    }

    const systemInstruction = `
      You are an expert travel assistant. Build or modify a travel itinerary based on user requirements.
      
      ${isNewTripRequest ? 'NEW TRIP: Ignore existing context.' : `
      Current Itinerary: ${JSON.stringify(contextItinerary)}
      Current Stays: ${JSON.stringify(contextStays)}
      Current Flights: ${JSON.stringify(currentFlightInfo)}
      Current Rental: ${JSON.stringify(currentRentalInfo)}
      Current Dining: ${JSON.stringify(contextDining)}
      Current Experiences: ${JSON.stringify(contextExperiences)}
      `}
      Current Members: ${JSON.stringify(currentMembers)}
      Shortlist: ${JSON.stringify(contextShortlist)}
      ${pastTripsSummary ? `Past Trips: ${pastTripsSummary}` : ''}
      
      MODE: ${mode} (${modeInstruction})

      Rules:
      1. RETURN JSON: Strictly follow the schema. Ensure valid JSON.
      2. CATEGORIES: 'flight', 'drive', 'stay', 'activity', 'food', 'walk', 'transit', 'logistics', 'work'.
      3. TIME FORMAT (STRICT): You MUST format \`startTime\` and \`endTime\` EXACTLY as 'HH:MM' in 24-hour format (e.g. '08:00', '14:30'). Do NOT use AM/PM or ISO dates.
      4. CORE vs OPTIONAL (ABSOLUTE RULE - DO NOT BREAK):
         - An event in the itinerary is CONFIRMED ("status": "confirmed") ONLY if the user's prompt EXPLICITLY names it by activity or place name AND includes a specific date or time/time-of-day.
         - If a place is mentioned as "want to visit" but has NO specified date/time in the prompt, DO NOT put it in the itinerary. Put it in the ROOT-level 'shortlist' array and mention it in the ROOT-level 'suggestions' array instead.
         - LOGISTICS EXCEPTION: You MUST insert a confirmed hotel-arrival / check-in logistics event if travelers arrive at a hotel/accommodation before a later dinner or activity on the same day. This is a mandatory structural event.
         - If you think an activity is nice but the user did NOT explicitly request it with a date/time, you MUST NOT place it in the itinerary as confirmed. Put it in 'suggestions'.
      5. MEALS (MANDATORY):
         - Include "Breakfast", "Lunch", and "Dinner" placeholder tiles for EVERY day (except arrival/departure times where they are on a plane).
         - These MUST have "status": "pending-meal". You MUST provide EXACTLY 3 specific restaurant options inside the event's 'suggestions' array. Double check that you provided 3 options.
         - If a SPECIFIC restaurant is explicitly requested by name, set "status": "confirmed".
      6. TRAVEL & ROUTES: DO NOT generate any events representing travel, transit, driving, flights, or walking. Never use type 'travel' and never create 'activity' events meant for commuting. 
         - The frontend routing engine will mathematically calculate all commuting times and draw the connecting routes between your activities, meals, and hotels automatically. 
         - Your job is ONLY to provide the destinations and waypoints (the activities, food, and stays).
      7. MANDATORY DAY-ENDING STAY & COORDINATES:
         - Every single day MUST have a 'stay' event as the ABSOLUTE LAST event of that day (except the final night if they fly home).
         - Even if the user checked into the hotel earlier in the afternoon, you MUST create a final "Return to Hotel" event at the end of the day (e.g. 10:00 PM) to close the loop so the front-end can draw a route back to the hotel.
         - Every confirmed activity and stay MUST have a specific named location with valid coordinates (lat/lng). You MUST use Google Search tools to find the exact coordinates for every place.
      8. PRESERVE ITINERARY & FULL DATE RANGE (CRITICAL): You MUST output the ENTIRE itinerary. Include EVERY single day from start to end. Count carefully. 
         EXAMPLE: Jul 28 - Aug 2 is: Jul 28 (Day 1), Jul 29 (Day 2), Jul 30 (Day 3), Jul 31 (Day 4), Aug 1 (Day 5), Aug 2 (Day 6). 
         YOU MUST GENERATE 6 OBJECTS IN THE ITINERARY ARRAY. DO NOT END AT AUG 1.
      9. ASSUMPTIONS: List logical assumptions in 'assumptions'.
     10. MEMBER ASSIGNMENT (CRITICAL FOR SPLIT VIEW): Assign 'memberIds' strictly as requested. 
         - If a meal or suggestion applies only to a subset of travellers (e.g., Carrie and Pepper having lunch while Ian is elsewhere), you MUST set the 'memberIds' of that meal/suggestion to match the subset. Do not default to 'everyone'.
         - If the user says "Carrie and Ian arriving at hotel while Pepper stays at dog park", CREATE TWO SEPARATE EVENTS at the same time with different 'memberIds' arrays. 
         - EVERY MEMBER MUST BE ASSIGNED: Do not leave any member idle during a split itinerary. If the party splits, ensure ALL members are assigned to their respective concurrent events. 
         - DO NOT GROUP THEM IF THEY ARE DOING DIFFERENT THINGS. 
         - If everyone is together, use their names (e.g., ["ian", "carrie", "pepper"]) or a specific list of IDs.
     11. TITLE FORMAT: The ONLY acceptable format is "[City Name(s)] [Year]" (e.g., "NYC 2026", "Toronto & NYC 2026"). 
         - ABSOLUTELY NO hotel names, neighborhood names (e.g., Manhattan, Midtown), or words like 'by', 'Hotel', 'Trip'.
         - WRONG: "four seasons new york downtown & courtyard by marriott new york manhattanmidtown west 2026"
         - RIGHT: "NYC 2026"
     12. FLIGHTS & DEPARTURES: 
         - You MUST schedule the INBOUND arriving flight (e.g., to the destination) on the FIRST day of the trip if mentioned in the prompt. Set "type": "activity" and "category": "flight" and provide the arrival airport under "location" with its coordinates.
         - You MUST schedule the OUTBOUND departure flight back home on the FINAL day of the trip if mentioned. Set "type": "activity" and "category": "flight" and provide the departure airport under "location" with its coordinates.
     13. MEAL SUGGESTIONS: For pending-meal or suggestion events, DO NOT provide a location object for the core event itself. Leave it empty so they don't get routed to until the user explicitly selects one of the nested suggestions.
     14. PLACES SHORTLIST & SEARCH GROUNDING: Return a 'shortlist' array for all requested or suggested locations. You MUST use Google Search to find accurate coordinates (lat, lng) and descriptions for every place you suggest or add to the itinerary.
     14b. CONCISENESS & TOKEN ECONOMY (CRITICAL):
         - Keep all event descriptions extremely short and compact (at most 1-2 brief sentences or 12 words).
         - Do NOT include 'suggestions', 'waypoints', 'origin', or 'destination' arrays/objects for standard confirmed activities. These fields MUST remain completely empty or omitted for standard activities.
         - ONLY generate 'suggestions' (exactly 3 options) for pending-meal events, or for events specifically marked as suggestions.
         - This token economy is absolutely mandatory to prevent the JSON output from getting truncated mid-generation.
     15. RESERVATIONS & BOOKINGS (CRITICAL): If the prompt mentions any flights, hotels, or restaurants, YOU MUST populate the 'flightInfo', 'stays', 'restaurants', and 'experiences' root fields in the JSON response. 
         - EXAMPLES: "PD 605 03:20 PM YYZ to LGA" -> Extract to flightInfo.outbound. "Four Seasons Hotel" -> Extract to stays: [{ name: "Four Seasons" }].
         - ALWAYS POPULATE THE \`stays\` ROOT ARRAY IF ANY ACCOMMODATION IS MENTIONED OR INFERRED. DO NOT LEAVE THESE EMPTY IF DATA IS PRESENT.
    `;

    const tools = shouldEnableSearch(userPrompt, isNewTripRequest) ? [{ googleSearch: {} }] : undefined;

    const config: any = {
      systemInstruction,
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
      temperature: 0.2,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          itinerary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                title: { type: Type.STRING },
                events: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      type: { type: Type.STRING },
                      category: { type: Type.STRING },
                      startTime: { type: Type.STRING },
                      endTime: { type: Type.STRING },
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      location: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          lat: { type: Type.NUMBER },
                          lng: { type: Type.NUMBER },
                          description: { type: Type.STRING }
                        },
                        required: ["name", "lat", "lng"]
                      },
                      memberIds: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                      },
                      origin: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          lat: { type: Type.NUMBER },
                          lng: { type: Type.NUMBER }
                        },
                        required: ["name", "lat", "lng"]
                      },
                      destination: {
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          lat: { type: Type.NUMBER },
                          lng: { type: Type.NUMBER }
                        },
                        required: ["name", "lat", "lng"]
                      },
                      waypoints: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            name: { type: Type.STRING },
                            lat: { type: Type.NUMBER },
                            lng: { type: Type.NUMBER }
                          },
                          required: ["name", "lat", "lng"]
                        }
                      },
                      suggestions: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            name: { type: Type.STRING },
                            lat: { type: Type.NUMBER },
                            lng: { type: Type.NUMBER },
                            description: { type: Type.STRING }
                          },
                          required: ["name", "lat", "lng"]
                        }
                      },
                      status: { type: Type.STRING }
                    },
                    required: ["id", "type", "category", "title", "startTime", "endTime"]
                  }
                }
              },
              required: ["date", "title", "events"]
            }
          },
          explanation: { type: Type.STRING },
          assumptions: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          suggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                text: { type: Type.STRING },
                type: { type: Type.STRING },
                relatedId: { type: Type.STRING }
              },
              required: ["id", "text", "type"]
            }
          },
          title: { type: Type.STRING },
          dates: { type: Type.STRING },
          shortlist: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                category: { type: Type.STRING },
                description: { type: Type.STRING },
                location: {
                  type: Type.OBJECT,
                  properties: {
                    lat: { type: Type.NUMBER },
                    lng: { type: Type.NUMBER }
                  }
                }
              }
            }
          },
          flightInfo: {
            type: Type.OBJECT,
            properties: {
              outbound: {
                type: Type.OBJECT,
                properties: {
                  number: { type: Type.STRING },
                  from: { type: Type.STRING },
                  to: { type: Type.STRING },
                  date: { type: Type.STRING },
                  confirmation: { type: Type.STRING }
                }
              },
              return: {
                type: Type.OBJECT,
                properties: {
                  number: { type: Type.STRING },
                  from: { type: Type.STRING },
                  to: { type: Type.STRING },
                  date: { type: Type.STRING },
                  confirmation: { type: Type.STRING }
                }
              }
            }
          },
          rentalInfo: {
            type: Type.OBJECT,
            properties: {
              company: { type: Type.STRING },
              car: { type: Type.STRING },
              pickup: { type: Type.STRING },
              dropoff: { type: Type.STRING },
              phone: { type: Type.STRING },
              confirmation: { type: Type.STRING }
            }
          },
          stays: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                location: { type: Type.STRING },
                checkIn: { type: Type.STRING },
                checkOut: { type: Type.STRING },
                confirmation: { type: Type.STRING },
                phone: { type: Type.STRING }
              }
            }
          },
          restaurants: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                date: { type: Type.STRING },
                time: { type: Type.STRING },
                confirmation: { type: Type.STRING },
                phone: { type: Type.STRING }
              }
            }
          },
          experiences: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                date: { type: Type.STRING },
                time: { type: Type.STRING },
                location: { type: Type.STRING },
                confirmation: { type: Type.STRING }
              }
            }
          },
          members: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                initials: { type: Type.STRING },
                color: { type: Type.STRING }
              }
            }
          }
        },
        required: ["itinerary", "explanation", "title", "dates"]
      }
    };

    if (tools) {
      config.tools = tools;
    }

    const activeModel = model || 'gemini-3.5-flash';
    console.log(`[Server] Generating content with model: ${activeModel}`);
    const params = prepareGenerateParams(activeModel, userPrompt, config);
        let parsed;
    let mainRawText = '';
    try {
      const result = await generateAndParseJSON(params, 2);
      parsed = result.parsed;
      mainRawText = result.text;
    } catch (parseError: any) {
      console.warn(`Initial JSON parse failed for ${activeModel}, sending raw text...`, parseError);
      return res.status(500).json({ 
        error: "Failed to parse JSON response from Gemini model.", 
        rawText: parseError.rawText 
      });
    }
    try {
      parsed.modelInfo = { 
        name: activeModel,
        quotaRemaining: trackUsage(activeModel)
      };
      return res.json(parsed);
    } catch (parseError: any) {
      console.warn(`Initial JSON parse failed for ${model}, sending raw text...`, parseError);
      console.warn(`[DEBUG Raw Text]: unavailable`);
      return res.status(500).json({ 
        error: "Failed to parse JSON response from Gemini model.", 
        rawText: 'unavailable' 
      });
    }
  } catch (error: any) {
    console.error(`[Server] Propose Changes Error:`, error);
    const friendlyMsg = getFriendlyErrorMessage(error);
    res.status(500).json({ error: friendlyMsg });
  }
});

// API Endpoint for Refining Suggestions
app.post("/api/gemini/refine", async (req, res) => {
  try {
    if (!GEMINI_KEY) {
      return res.status(500).json({ 
        error: "Gemini API key is missing. Please add GEMINI_API_KEY to your environment settings." 
      });
    }

    const { event, refinePrompt, model } = req.body;

    // Prune the event payload to keep it clean and minimal
    const prunedEvent = event ? {
      id: event.id,
      type: event.type,
      category: event.category,
      title: event.title,
      description: event.description,
      startTime: event.startTime,
      endTime: event.endTime,
      status: event.status,
      location: event.location ? {
        name: event.location.name,
        lat: event.location.lat,
        lng: event.location.lng,
      } : undefined,
    } : null;

    const systemInstruction = `
      You are a travel expert. The user wants to refine the restaurant or activity suggestions for a specific event.
      Event: ${JSON.stringify(prunedEvent)}
      User Request: ${refinePrompt}
      
      Return a JSON array of 4 specific suggestions. Each suggestion MUST have:
      - name: string
      - lat: number
      - lng: number
      - description: string (one short sentence)
      
      Prioritize the user's specific request while keeping the suggestions relevant to the event's location and time.
    `;

    const tools = shouldEnableSearch(refinePrompt, false) ? [{ googleSearch: {} }] : undefined;

    const config: any = {
      systemInstruction,
      responseMimeType: "application/json",
      maxOutputTokens: 1024,
      temperature: 0.2,
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            lat: { type: Type.NUMBER },
            lng: { type: Type.NUMBER },
            description: { type: Type.STRING }
          },
          required: ["name", "lat", "lng", "description"]
        }
      }
    };

    if (tools) {
      config.tools = tools;
    }

    const initialContents = "Refine suggestions based on: " + refinePrompt;
    const activeModel = model || 'gemini-3.5-flash';
    console.log(`[Server] Refining suggestions with model: ${activeModel}`);
    const params = prepareGenerateParams(activeModel, initialContents, config);
        try {
      const result = await generateAndParseJSON(params, 2);
      return res.json(result.parsed);
    } catch (parseError: any) {
      console.error("[Server] JSON parsing error in refine suggestions:", parseError);
      return res.json([]);
    }
  } catch (error: any) {
    console.error(`[Server] Refine Suggestions Error:`, error);
    const friendlyMsg = getFriendlyErrorMessage(error);
    res.status(500).json({ error: friendlyMsg });
  }
});

// Proxy endpoint for Weather API
app.get("/api/weather", async (req, res) => {
  try {
    const { lat, lng, date, isArchive } = req.query;
    if (!lat || !lng || !date) {
      return res.status(400).json({ error: "Missing required query parameters: lat, lng, date" });
    }

    const baseUrl = isArchive === "true"
      ? "https://archive-api.open-meteo.com/v1/archive"
      : "https://api.open-meteo.com/v1/forecast";

    const url = `${baseUrl}?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&start_date=${date}&end_date=${date}`;

    console.log(`[Server] Proxying weather request to: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Weather API returned status ${response.status}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error("[Server] Weather proxy error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch weather from proxy" });
  }
});

// Proxy endpoint for OSRM Routing API
app.get("/api/routing", async (req, res) => {
  try {
    const { profile, coordinates } = req.query;
    if (!profile || !coordinates) {
      return res.status(400).json({ error: "Missing required query parameters: profile, coordinates" });
    }
    const url = `https://router.project-osrm.org/route/v1/${profile}/${coordinates}?overview=false`;
    console.log(`[Server] Proxying routing request to: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OSRM routing API returned status ${response.status}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error("[Server] Routing proxy error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch route from proxy" });
  }
});

// Proxy endpoint for EIA Gas Price API
app.get("/api/gas", async (req, res) => {
  try {
    const apiKey = process.env.VITE_EIA_API_KEY || process.env.EIA_API_KEY || "DEMO_KEY";
    const url = `https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${apiKey}&frequency=weekly&data[0]=value&facets[series][]=EMM_EPMR_PTE_SAZ_DPG&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=1`;

    console.log(`[Server] Proxying gas request`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`EIA API returned status ${response.status}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error("[Server] Gas proxy error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch gas price from proxy" });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
