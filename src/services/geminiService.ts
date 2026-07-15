import { DayPlan, TripMember } from "../constants";

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
    const response = await fetch("/api/gemini/propose", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        model,
        currentItinerary,
        userPrompt,
        mode,
        pastTripsSummary,
        currentMembers,
        currentShortlist,
        currentStays,
        currentFlightInfo,
        currentRentalInfo,
        currentRestaurants,
        currentExperiences,
      }),
    });

    if (!response.ok) {
      let errorMessage = `Failed to propose changes: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        // Fallback if not JSON
        const text = await response.text().catch(() => "");
        if (text && text.length < 200 && text.includes("{")) {
           errorMessage = `Server Error (${response.status}): ${text}`;
        }
      }
      throw new Error(errorMessage);
    }

    
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return response.json();
    } else {
      const text = await response.text();
      throw new Error("Server returned non-JSON response: " + text.substring(0, 100));
    }

  },

  async refineSuggestions(
    event: any,
    refinePrompt: string
  ): Promise<any[]> {
    const response = await fetch("/api/gemini/refine", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        event,
        refinePrompt,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to refine suggestions: ${response.statusText}`);
    }

    
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return response.json();
    } else {
      const text = await response.text();
      throw new Error("Server returned non-JSON response for refine: " + text.substring(0, 100));
    }
  }
};
