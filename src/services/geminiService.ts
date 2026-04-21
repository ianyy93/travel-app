import { GoogleGenAI, Type } from "@google/genai";
import { DayPlan, TripMember } from "../constants";
import { jsonrepair } from "jsonrepair";

const GEMINI_KEY =
  import.meta.env.VITE_GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY;

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
  relatedId?: string;
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
  experiences?: any[];
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

    const contextItinerary = currentItinerary.length > 31 ? currentItinerary.slice(0, 31) : currentItinerary;

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
      3. TIME FORMAT (STRICT): You MUST format \`startTime\` and \`endTime\` EXACTLY as 'HH:MM AM/PM' (e.g. '08:00 AM', '02:30 PM'). Do NOT use ISO dates or 24-hour time for these fields.
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

    try {
      console.log(`Attempting generation with model: ${model}`);
      const response = await ai.models.generateContent({
        model: model,
        contents: userPrompt,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }, { urlContext: {} }],
          responseMimeType: "application/json",
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
          tools: [{ googleSearch: {} }, { urlContext: {} }],
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
