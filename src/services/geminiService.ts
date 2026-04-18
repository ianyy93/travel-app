import { GoogleGenAI, Type } from "@google/genai";
import { DayPlan, TripMember } from "../constants";
import { jsonrepair } from "jsonrepair";
import firebaseConfig from "../../firebase-applet-config.json";

const GEMINI_KEY =
  import.meta.env.VITE_GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY;

// Log which key source is being used (obfuscated for safety)
console.log('Gemini initialized with key source:', 
  import.meta.env.VITE_GEMINI_API_KEY ? 'Cloudflare Build Var' : 
  process.env.GEMINI_API_KEY ? 'AI Studio Secret' : 'NONE - Key Missing'
);

if (!GEMINI_KEY) {
  console.warn("Gemini API key is missing. Please add VITE_GEMINI_API_KEY to your environment settings.");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY || 'MISSING_KEY' });

export interface GeminiSuggestion {
  id: string;
  text: string;
  type: 'activity' | 'flight' | 'stay' | 'other';
  relatedId?: string; // ID of the event in the proposed itinerary if it's an addition
}

export interface GeminiProposal {
  itinerary: DayPlan[];
  explanation: string;
  assumptions: string[];
  suggestions: GeminiSuggestion[];
  title?: string;
  dates?: string;
  shortlist?: any[];
  flightInfo?: any;
  rentalInfo?: any;
  stays?: any[];
  restaurants?: any[];
  members?: TripMember[];
  modelInfo?: {
    name: string;
    quotaRemaining?: number;
  };
}

export type GenerationMode = 'full' | 'details' | 'places' | 'navigation' | 'shortlist' | 'autofill';

const QUOTA_LIMITS: Record<string, number> = {
  "gemini-3-flash-preview": 20,
  "gemini-3.1-flash-lite-preview": 500,
  "gemini-2.5-flash-preview": 20,
  "gemini-2.5-flash-lite-preview": 500
};

const trackUsage = (modelName: string) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const key = `gemini_usage_${today}`;
    const usage = JSON.parse(localStorage.getItem(key) || '{}');
    usage[modelName] = (usage[modelName] || 0) + 1;
    localStorage.setItem(key, JSON.stringify(usage));
    
    const limit = QUOTA_LIMITS[modelName] || 20;
    return Math.max(0, limit - usage[modelName]);
  } catch (e) {
    return undefined;
  }
};

const getRemainingQuota = (modelName: string) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const key = `gemini_usage_${today}`;
    const usage = JSON.parse(localStorage.getItem(key) || '{}');
    const limit = QUOTA_LIMITS[modelName] || 20;
    return Math.max(0, limit - (usage[modelName] || 0));
  } catch (e) {
    return undefined;
  }
};

export const geminiService = {
  async proposeChanges(
    model: string,
    currentItinerary: DayPlan[],
    userPrompt: string,
    mode: GenerationMode = 'full',
    pastTripsSummary?: string,
    currentMembers: TripMember[] = [],
    currentShortlist: any[] = [],
    currentStays: any[] = [],
    currentFlightInfo: any = null,
    currentRentalInfo: any = null,
    currentRestaurants: any[] = [],
    currentExperiences: any[] = []
  ): Promise<GeminiProposal> {
    if (!GEMINI_KEY) {
      throw new Error("Gemini API key is missing. Please add VITE_GEMINI_API_KEY to your environment settings.");
    }

    const isNewTripRequest = currentItinerary.length === 0 || 
      userPrompt.toLowerCase().includes('new trip') || 
      userPrompt.toLowerCase().includes('plan a trip') ||
      userPrompt.toLowerCase().includes('create a trip');

    // Truncate current itinerary if it's too large to avoid prompt bloat
    const contextItinerary = currentItinerary.length > 31 ? currentItinerary.slice(0, 31) : currentItinerary;

    let modeInstruction = '';
    if (mode === 'details') {
      modeInstruction = 'FOCUS ONLY on extracting booking details (flights, stays, rentals, restaurants) and trip members. Do not modify the itinerary events unless necessary for consistency.';
    } else if (mode === 'places') {
      modeInstruction = 'FOCUS ONLY on adding or modifying itinerary events (places, activities). Do not add navigation/travel events between them yet.';
    } else if (mode === 'navigation') {
      modeInstruction = 'FOCUS ONLY on adding navigation/travel events (drive, walk, transit) between existing activities in the itinerary. Do not add new activities.';
    } else if (mode === 'autofill') {
      modeInstruction = 'FOCUS ON filling gaps in the current itinerary. Prioritize using places from the provided Shortlist and any other logical suggestions. Add 3 meals per day and activities to fill empty time slots.';
    }

    const systemInstruction = `
      You are an expert travel assistant. Build or modify a travel itinerary based on user requirements.
      
      ${isNewTripRequest ? 'NEW TRIP: Ignore existing context.' : `
      Current Itinerary: ${JSON.stringify(contextItinerary)}
      Current Stays: ${JSON.stringify(currentStays)}
      Current Flights: ${JSON.stringify(currentFlightInfo)}
      Current Rental: ${JSON.stringify(currentRentalInfo)}
      Current Dining: ${JSON.stringify(currentRestaurants)}
      Current Experiences: ${JSON.stringify(currentExperiences)}
      `}
      Current Members: ${JSON.stringify(currentMembers)}
      Shortlist: ${JSON.stringify(currentShortlist)}
      ${pastTripsSummary ? `Past Trips: ${pastTripsSummary}` : ''}
      
      MODE: ${mode} (${modeInstruction})

      Rules:
      1. RETURN JSON: Strictly follow the schema. Ensure valid JSON.
      2. CATEGORIES: 'flight', 'drive', 'stay', 'activity', 'food', 'walk', 'transit', 'logistics', 'work'.
      3. CORE vs OPTIONAL (CRITICAL):
         - ONLY schedule on the calendar what the user explicitly mentions in their prompt. These MUST have "status": "confirmed".
         - Everything else you think would be nice goes in the top-level 'suggestions' array ONLY.
         - For vaguely requested time blocks or placeholder activities, add an event with "status": "suggestion", and MUST provide 3-5 options inside its 'suggestions' array. NEVER add a suggestion directly to the itinerary as a confirmed event!
      4. MEALS (MANDATORY):
         - Include "Breakfast", "Lunch", and "Dinner" for EVERY day. Leave 'location' field empty for core placeholders. 
         - These must have "status": "pending-meal". You MUST provide 3-5 specific restaurant options inside the event's 'suggestions' array.
         - If a meal is explicitly requested by the user, set "status": "confirmed".
      5. TRAVEL & ROUTES (STRICT): Use 'type: travel' for events connecting locations. Use categories 'walk', 'transit' (Subway/Bus), or 'drive' (Taxi/Uber). Add travel for EVERY location change, including back-to-back suggested activities. Separate travel for split members is required if they go to different places.
      6. STAYS & LOGISTICS: Every day MUST end with a 'stay'. If members move hotels, explicitly add a 'logistics' or 'stay' event reflecting this change in the itinerary.
      7. FULL DATE RANGE: Include EVERY single day mentioned in the prompt from start to end. Never end the itinerary early; including travel days.
      8. ASSUMPTIONS: List logical assumptions in the 'assumptions' array (e.g. "Assuming everyone stays together at the hotel").
      9. MEMBER ASSIGNMENT (CRITICAL): Assign 'memberIds' strictly as requested. Every member, including pets if mentioned, MUST be assigned to the activities they are attending. For days where members split, ensure events identify who is attending what. Stays and shared meals should usually include 'everyone' unless specified.
     10. TITLE FORMAT (STRICT): Trip title MUST follow this exact format: "[Primary Destination(s)] [Year]" (e.g., "Tokyo 2026", "NYC & Boston 2026"). Never use words like "Adventure", "Journey", "Trip", "Itinerary", "Arrival", "New". List up to 3 cities separated by " & ". Always include the 4-digit year.
     11. TRIP END: Stop all activities/meals once the return flight or final travel home begins. 
     12. PLACES SHORTLIST: Return a 'shortlist' array of objects (name, category, description, location: {lat, lng}) for all suggested or requested locations mentioned in the itinerary. This ensures the Places tab is populated.
     13. RESERVATIONS & BOOKINGS: If the user's prompt contains flight numbers, hotels, or restaurants already booked, populate the 'flightInfo', 'stays', 'restaurants', or 'experiences' root fields in the JSON response.
    `;

    try {
      console.log(`Attempting generation with model: ${model}`);
      const response = await ai.models.generateContent({
        model: model,
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          maxOutputTokens: 8000,
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
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("AI returned an empty response.");
      }

      try {
        const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
        const parsed = JSON.parse(jsonrepair(cleaned)) as GeminiProposal;
        
        parsed.modelInfo = { 
          name: model,
          quotaRemaining: trackUsage(model)
        };
        
        return parsed;
      } catch (parseError) {
        console.warn(`Initial JSON parse failed for ${model}, attempting repair...`, parseError);
        const repaired = jsonrepair(text);
        const parsed = JSON.parse(repaired) as GeminiProposal;
        parsed.modelInfo = { 
          name: model,
          quotaRemaining: trackUsage(model)
        };
        return parsed;
      }
    } catch (error: any) {
      console.warn(`Model ${model} failed:`, error.message);
      throw error;
    }
  },
  async refineSuggestions(
    event: any,
    refinePrompt: string
  ): Promise<any[]> {
    if (!GEMINI_KEY) {
      throw new Error("Gemini API key is missing. Please add VITE_GEMINI_API_KEY to your environment settings.");
    }

    const systemInstruction = `
      You are a travel expert. The user wants to refine the restaurant or activity suggestions for a specific event.
      Event: ${JSON.stringify(event)}
      User Request: ${refinePrompt}
      
      Return a JSON array of 4 specific suggestions. Each suggestion MUST have:
      - name: string
      - lat: number
      - lng: number
      - description: string (one short sentence)
      
      Prioritize the user's specific request while keeping the suggestions relevant to the event's location and time.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: "Refine suggestions based on: " + refinePrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
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
        }
      });

      const text = response.text;
      if (!text) return [];
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(jsonrepair(cleaned));
    } catch (e) {
      console.error("Refine Suggestions Error:", e);
      return [];
    }
  }
};
