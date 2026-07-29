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
    const reqBody = {
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
    };
    
    const response = await fetch('/api/proposeChanges', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reqBody)
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      let errorMsg = `Server error: ${response.status} ${response.statusText}`;
      try {
        const parsed = JSON.parse(responseText);
        if (parsed.error) errorMsg = parsed.error;
      } catch (_) {
        if (responseText) errorMsg += ` - ${responseText}`;
      }
      console.error("[geminiService] proposeChanges failed:", response.status, responseText);
      throw new Error(errorMsg);
    }

    return await response.json();
  },

  async refineSuggestions(
    event: any,
    refinePrompt: string
  ): Promise<any[]> {
    const reqBody = {
      event,
      refinePrompt,
    };
    
    const response = await fetch('/api/refineSuggestions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reqBody)
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      let errorMsg = `Server error: ${response.status} ${response.statusText}`;
      try {
        const parsed = JSON.parse(responseText);
        if (parsed.error) errorMsg = parsed.error;
      } catch (_) {
        if (responseText) errorMsg += ` - ${responseText}`;
      }
      console.error("[geminiService] refineSuggestions failed:", response.status, responseText);
      throw new Error(errorMsg);
    }

    return await response.json();
  }
};
