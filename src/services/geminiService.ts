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

import { getApiBaseUrl } from '../utils/api';

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
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/gemini/propose`, {
      method: "POST",
      credentials: "include",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
      },
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
      if (response.status === 405 || response.status === 403 || response.type === 'opaqueredirect') {
        // AI Studio's auth proxy intercepts API requests if the session expires or cookies are missing.
        // It redirects (302) to an HTML cookie check page. Since this is a POST request, the browser
        // follows the redirect with a POST, which the static HTML page rejects with a 405 Method Not Allowed.
        // The fix is to reload the page to restore the authentication session.
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
        throw new Error("Session expired. Reloading the page to authenticate...");
      }

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
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/gemini/refine`, {
      method: "POST",
      credentials: "include",
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event,
        refinePrompt,
      }),
    });

    if (!response.ok) {
      if (response.status === 405 || response.status === 403 || response.type === 'opaqueredirect') {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
        throw new Error("Session expired. Reloading the page to authenticate...");
      }

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
