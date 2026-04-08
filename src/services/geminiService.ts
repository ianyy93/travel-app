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
    const systemInstruction = `
      You are an expert travel assistant. Your task is to modify or build a travel itinerary based on user requirements.
      
      Current Itinerary: ${JSON.stringify(currentItinerary)}
      ${pastTripsSummary ? `Past Trips Summary: ${pastTripsSummary}` : ''}
      
      Guidelines:
      1. Return a valid JSON object matching the schema provided.
      2. Ensure all locations have lat/lng coordinates.
      3. Maintain the structure of DayPlan and TripEvent.
      4. If the user asks for changes, apply them logically.
      5. Provide a brief explanation of what you changed.
      6. Use categories: 'flight', 'drive', 'stay', 'activity', 'food', 'walk', 'transit'.
      7. Use types: 'activity', 'travel'.
    `;

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

    try {
      return JSON.parse(response.text);
    } catch (e) {
      console.error("Failed to parse Gemini response:", response.text);
      throw new Error("AI returned an invalid response format.");
    }
  }
};
