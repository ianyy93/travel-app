import { GoogleGenAI, Type } from "@google/genai";
import { DayPlan, TripMember } from "../constants";
import { jsonrepair } from "jsonrepair";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

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
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured. Please add it in the Settings menu.");
    }

    const isNewTripRequest = currentItinerary.length === 0 || 
      userPrompt.toLowerCase().includes('new trip') || 
      userPrompt.toLowerCase().includes('plan a trip') ||
      userPrompt.toLowerCase().includes('create a trip');

    // Truncate current itinerary if it's too large to avoid prompt bloat
    const contextItinerary = currentItinerary.length > 15 ? currentItinerary.slice(0, 15) : currentItinerary;

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
      4. ASSUMPTIONS & SUGGESTIONS: You MUST populate the 'assumptions' and 'suggestions' arrays.
         - 'assumptions': List any logical guesses you made (e.g. "Assumed you want to stay in Midtown").
         - 'suggestions': List specific additions or changes you are proposing (e.g. "Suggested a visit to the Museum of the Dog"). 
         - For every new activity you add to the itinerary that wasn't explicitly in the prompt, you MUST create a corresponding 'suggestion' with a 'relatedId' matching the event's 'id'.
      5. Categories: 'flight', 'drive', 'stay', 'activity', 'food', 'walk', 'transit', 'logistics', 'work'.
      5. Date format: "Month Day" (e.g., "May 14").
      6. NAVIGATION: ${mode === 'navigation' || mode === 'full' || mode === 'autofill' ? "Add 'travel' events ONLY between confirmed locations (where 'location' is set). Do NOT add travel to/from suggestion tiles. Factor in realistic travel time (min 20-40m for cities)." : "No travel events."}
      7. MEALS & GENERIC LOCATIONS: Include 3 meals/day. For generic meals, provide 3-4 specific options in 'suggestions'. CRITICAL: Do NOT use generic area names as the primary 'location' for a meal event. Leave 'location' empty for these. Do NOT add meal suggestions for members attending full-day events (e.g. conferences) unless requested.
      8. STRICT PROMPT ADHERENCE: Do NOT add any activities, sights, or locations that were not explicitly mentioned in the user prompt or provided links. If the user provides a link to a 'French Bistro' but the name is not in the text, do NOT guess the name. Instead, use 'French Bistro (from link)' as the title. NEVER add 'High Line', 'Dog Runs', or other 'helpful' suggestions unless they are in the prompt.
      9. TIMES: Every event MUST have 'startTime' and 'endTime' (AM/PM). Use realistic times (e.g. check-out by 11 AM/12 PM).
     10. SHORTLIST & SCHEDULING: Add places mentioned without a specific time to 'shortlist' ONLY. Do NOT 'propose' a time for them in the itinerary.
     11. SPLIT ITINERARIES: Ensure NO time overlaps for any member. If multiple people are on the trip, they can have separate activities at the same time.
     12. TITLE & DATES: For new trips, use "[Place] [Year]" format.
     13. NO FILLING GAPS & STAY TIMING: Unless mode is 'autofill', do NOT add any activities to fill empty time. If a day has no requested activities, it should only contain the 'stay' event and necessary travel. The 'stay' event should start AFTER all other activities and meals are finished (typically 9:00 PM or later).
     14. RESERVATIONS: Extract ALL flights, stays, rentals, and bookings into the root-level reservation fields.
     15. TRAVEL MODE: Default to 'transit' or 'walk' unless 'rentalInfo' (rental car) is explicitly provided. Do NOT use 'drive' if the user is flying and has no rental car.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
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
    if (!process.env.GEMINI_API_KEY) {
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
        model: "gemini-2.0-flash",
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
