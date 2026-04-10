import { GoogleGenAI, Type } from "@google/genai";
import { DayPlan } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface GeminiProposal {
  itinerary: DayPlan[];
  explanation: string;
}

export const geminiService = {
  async proposeChanges(
    currentItinerary: DayPlan[],
    userPrompt: string,
    pastTripsSummary?: string
  ): Promise<GeminiProposal> {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured. Please add it in the Settings menu.");
    }

    const isNewTripRequest = currentItinerary.length === 0 || 
      userPrompt.toLowerCase().includes('new trip') || 
      userPrompt.toLowerCase().includes('plan a trip') ||
      userPrompt.toLowerCase().includes('create a trip');

    const systemInstruction = `
      You are an expert travel assistant. Your task is to modify or build a travel itinerary based on user requirements.
      
      ${isNewTripRequest ? 'The user wants to create a NEW trip. Ignore any existing itinerary context if provided.' : `Current Itinerary: ${JSON.stringify(currentItinerary)}`}
      ${pastTripsSummary ? `Past Trips Summary (for context): ${pastTripsSummary}` : ''}
      
      Guidelines:
      1. Return a valid JSON object matching the schema provided.
      2. Ensure all locations have lat/lng coordinates.
      3. Maintain the structure of DayPlan and TripEvent.
      4. If the user asks for changes, apply them logically.
      5. Provide a brief explanation of what you changed or created.
      6. Use categories: 'flight', 'drive', 'stay', 'activity', 'food', 'walk', 'transit', 'logistics'.
      7. Use types: 'activity', 'travel'.
      8. For new trips, generate a logical sequence of days and events.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: userPrompt,
        config: {
          systemInstruction,
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
                            }
                          },
                          origin: {
                            type: Type.OBJECT,
                            properties: {
                              name: { type: Type.STRING },
                              lat: { type: Type.NUMBER },
                              lng: { type: Type.NUMBER }
                            }
                          },
                          destination: {
                            type: Type.OBJECT,
                            properties: {
                              name: { type: Type.STRING },
                              lat: { type: Type.NUMBER },
                              lng: { type: Type.NUMBER }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              },
              explanation: { type: Type.STRING }
            },
            required: ["itinerary", "explanation"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("AI returned an empty response.");
      }

      return JSON.parse(text);
    } catch (e) {
      console.error("Gemini API Error:", e);
      if (e instanceof Error) {
        throw e;
      }
      throw new Error("AI Assistant failed to generate a proposal. Please try again.");
    }
  }
};
