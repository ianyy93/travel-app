import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

const GEMINI_KEY = process.env.GEMINI_API_KEY;

const ai = new GoogleGenAI({
  apiKey: GEMINI_KEY || 'MISSING_KEY',
  httpOptions: {
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
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota") || error.status === 429) {
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
function shouldEnableSearch(prompt: string): boolean {
  if (!prompt) return false;
  const p = prompt.toLowerCase();
  const keywords = [
    "search", "find", "google", "look up", "recommend", "latest", "recent", "current",
    "weather", "now", "real-time", "live", "news", "restaurants", "activities in", "places in",
    "near by", "nearby", "where is", "best ", "top "
  ];
  return keywords.some(keyword => p.includes(keyword));
}

// Automatic retry function with exponential backoff to recover from 429 errors seamlessly
async function generateContentWithRetry(params: any, retries = 3, initialDelay = 1500): Promise<any> {
  let lastError: any = null;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await ai.models.generateContent(params);
      return response;
    } catch (error: any) {
      lastError = error;
      const is429 = error.status === 429 || 
                    (error.message && (
                      error.message.includes("429") || 
                      error.message.toLowerCase().includes("quota") ||
                      error.message.toLowerCase().includes("exhausted") ||
                      error.message.toLowerCase().includes("rate limit")
                    ));
      
      if (is429) {
        // If we have tools (like search grounding) enabled, disable them on first 429 attempt to bypass search quota limits immediately!
        if (params && params.config && params.config.tools) {
          console.warn(`[Server] 429 rate limit hit. Stripping Google Search grounding tool and retrying immediately...`);
          delete params.config.tools;
          // Decrement the loop counter so this fallback retry doesn't eat into our standard backoff retries count
          i--;
          continue;
        }

        if (i < retries - 1) {
          const backoff = initialDelay * Math.pow(2, i);
          console.warn(`[Server] Encountered 429 rate limit. Retrying in ${backoff}ms... (Attempt ${i + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, backoff));
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }
  throw lastError || new Error("Failed to generate content after retries.");
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
function extractJSON(text: string): string {
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  let startIdx = -1;
  let endIdx = -1;
  
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = text.lastIndexOf('}');
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = text.lastIndexOf(']');
  }
  
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return text.substring(startIdx, endIdx + 1);
  }
  
  return text.replace(/```json\n?|\n?```/g, '').trim();
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
      7. MANDATORY DAY-ENDING STAY:
         - Every single day MUST have a 'stay' event as the ABSOLUTE LAST event of that day (except the final night if they fly home).
         - Even if the user checked into the hotel earlier in the afternoon, you MUST create a final "Return to Hotel" event at the end of the day (e.g. 10:00 PM) to close the loop so the front-end can draw a route back to the hotel.
         - The stay MUST have "status": "confirmed", "category": "stay", and a specific named location with coordinates.
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
         - You MUST schedule the INBOUND arriving flight (e.g., to the destination) on the FIRST day of the trip if mentioned in the prompt. Set "type": "activity" and "category": "flight" and provide the arrival airport under "location".
         - You MUST schedule the OUTBOUND departure flight back home on the FINAL day of the trip if mentioned. Set "type": "activity" and "category": "flight" and provide the departure airport under "location".
     13. MEAL SUGGESTIONS: For pending-meal or suggestion events, DO NOT provide a location object for the core event itself. Leave it empty so they don't get routed to until the user explicitly selects one of the nested suggestions.
     14. PLACES SHORTLIST: Return a 'shortlist' array for all requested or suggested locations.
     15. RESERVATIONS & BOOKINGS (CRITICAL): If the prompt mentions any flights, hotels, or restaurants, YOU MUST populate the 'flightInfo', 'stays', 'restaurants', and 'experiences' root fields in the JSON response. 
         - EXAMPLES: "PD 605 03:20 PM YYZ to LGA" -> Extract to flightInfo.outbound. "Four Seasons Hotel" -> Extract to stays: [{ name: "Four Seasons" }].
         - ALWAYS POPULATE THE \`stays\` ROOT ARRAY IF ANY ACCOMMODATION IS MENTIONED OR INFERRED. DO NOT LEAVE THESE EMPTY IF DATA IS PRESENT.
    `;

    const tools = shouldEnableSearch(userPrompt) ? [{ googleSearch: {} }] : undefined;

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
    const response = await generateContentWithRetry(params);

    const text = response.text;
    if (!text) {
      return res.status(500).json({ error: "Gemini returned an empty response." });
    }

    try {
      const cleaned = extractJSON(text);
      const parsed = JSON.parse(cleaned);
      parsed.modelInfo = { 
        name: activeModel,
        quotaRemaining: trackUsage(activeModel)
      };
      return res.json(parsed);
    } catch (parseError: any) {
      console.warn(`Initial JSON parse failed for ${model}, sending raw text...`, parseError);
      return res.status(500).json({ 
        error: "Failed to parse JSON response from Gemini model.", 
        rawText: text 
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

    const tools = shouldEnableSearch(refinePrompt) ? [{ googleSearch: {} }] : undefined;

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
    const response = await generateContentWithRetry(params);

    const text = response.text;
    if (!text) {
      return res.json([]);
    }

    try {
      const cleaned = extractJSON(text);
      return res.json(JSON.parse(cleaned));
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
