import { GoogleGenAI, Type } from "@google/genai";
import { DayPlan, TripMember } from "../constants";
import { jsonrepair } from "jsonrepair";
import firebaseConfig from "../../firebase-applet-config.json";

const GEMINI_KEY =
  import.meta.env.VITE_GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY ||
  firebaseConfig.apiKey;

// Log which key source is being used (obfuscated for safety)
console.log('Gemini initialized with key source:', 
  import.meta.env.VITE_GEMINI_API_KEY ? 'Cloudflare Build Var' : 
  process.env.GEMINI_API_KEY ? 'AI Studio Secret' : 'Firebase Fallback'
);

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

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
}

export type GenerationMode = 'full' | 'details' | 'places' | 'navigation' | 'shortlist' | 'autofill';

export const geminiService = {
  async proposeChanges(
    // Triggering fresh build with VITE_GEMINI_API_KEY
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
      throw new Error("GEMINI_API_KEY is not configured. Please add it in the Settings menu.");
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
      1. Return JSON matching the schema.
      2. Every 'activity' MUST have 'location' with 'name', 'lat', 'lng'.
      3. MANDATORY EXPLANATION: Describe exactly what you changed/added in the 'explanation' field.
      4. CATEGORIES: 'flight', 'drive', 'stay', 'activity', 'food', 'walk', 'transit', 'logistics', 'work'.
      5. BASELINE vs SUGGESTIONS: Distinguish between the 'Core Itinerary' and 'Optional Suggestions'.
         - 'Core Itinerary' (NO top-level suggestion): 
            * Explicitly requested events (e.g. Flight PD 605, Remote Work, Ian @ Conference).
            * Baseline Meal Placeholders (Breakfast 8AM, Lunch 12PM, Dinner 7PM).
            * Checkout/Stay events.
         - 'Optional Suggestions' (MUST have top-level suggestion with 'relatedId'):
            * AI-added leisure activities not in prompt.
            * Logistical suggestions like "Transfer to New Hotel".
            * Specific restaurant recommendations.
      6. DATE FORMAT: "Month Day" (e.g., "May 14").
      7. NAVIGATION & TRANSFERS: Add 'travel' events between locations. Proactively suggest "Move to [Hotel Name]" as a 'suggestion' if stay locations change between days.
      8. MEALS: Always include 3 meal placeholders per day in the 'Core Itinerary'. 
         - Title: "Breakfast", "Lunch", or "Dinner".
         - Recommendations: Provide 3 specific restaurant options in the 'event.suggestions' array inside that meal event.
      9. STRICT PROMPT ADHERENCE: Do NOT add leisure activities that weren't requested. If "Remote Work" is in the prompt, it must be a Core activity for those members.
     10. TIMES: Every event MUST have 'startTime' and 'endTime' (AM/PM). Use realistic times.
     11. SHORTLIST: Add places mentioned without a specific time to 'shortlist' ONLY. 
     12. MEMBERSHIP: Ensure 'memberIds' strictly match the prompt. (e.g. Carrie & Pepper work remote, Ian at Javits).
     13. NO SKIPPING DAYS: Include every day between start/end dates. Every day must at least have meals and a 'stay' event.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
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
                          }
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
        return JSON.parse(jsonrepair(cleaned));
      } catch (parseError) {
        console.warn("Initial JSON parse failed, attempting repair with jsonrepair...", parseError);
        try {
          const repaired = jsonrepair(text);
          return JSON.parse(repaired);
        } catch (repairError) {
          console.error("jsonrepair failed:", repairError);
          throw new Error("The AI response was invalid or truncated. Please try a shorter request or ask for fewer days.");
        }
      }
    } catch (e: any) {
      console.error("Gemini API Error:", e);
      if (e.message?.includes('Rpc failed') || e.message?.includes('xhr error')) {
        throw new Error("The AI service is temporarily busy or the request was too large. Please try a shorter prompt or try again in a moment.");
      }
      throw e;
    }
  },
  async refineSuggestions(
    event: any,
    refinePrompt: string
  ): Promise<any[]> {
    if (!GEMINI_KEY) {
      throw new Error("GEMINI_API_KEY is not configured.");
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
