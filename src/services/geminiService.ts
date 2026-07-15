import { DayPlan, TripMember } from "../constants";
import { getApiBaseUrl } from "../utils/api";

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
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/gemini/propose`, {
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
        if (response.status === 405 && typeof window !== 'undefined') {
          const newUrl = window.prompt(
            "API Error 405: This usually means you are on a static host like Cloudflare and the backend URL is not configured.\n\nPlease enter your backend (Cloud Run) URL (e.g. https://your-app.run.app):",
            getApiBaseUrl()
          );
          if (newUrl) {
            localStorage.setItem('BACKEND_URL', newUrl);
            window.location.reload();
          }
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
    } catch (error: any) {
      const targetUrl = `${getApiBaseUrl()}/api/gemini/propose`;
      console.error(`[GeminiService] Connection error to ${targetUrl}:`, error);
      
      if (typeof window !== 'undefined' && (error.message === 'Failed to fetch' || error.message?.includes('NetworkError'))) {
        const newUrl = window.prompt(
          `Connection Error: Failed to reach the backend server at ${getApiBaseUrl() || 'local server'}.\n\nThis usually happens if the backend URL is not configured correctly on a static host or blocked by CORS.\n\nPlease enter your backend (Cloud Run) URL (e.g. https://your-app.run.app):`,
          getApiBaseUrl()
        );
        if (newUrl) {
          localStorage.setItem('BACKEND_URL', newUrl);
          window.location.reload();
        }
      }
      throw error;
    }
  },

  async refineSuggestions(
    event: any,
    refinePrompt: string
  ): Promise<any[]> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/gemini/refine`, {
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
    } catch (error: any) {
      const targetUrl = `${getApiBaseUrl()}/api/gemini/refine`;
      console.error(`[GeminiService] Connection error to ${targetUrl}:`, error);
      
      if (typeof window !== 'undefined' && (error.message === 'Failed to fetch' || error.message?.includes('NetworkError'))) {
        const newUrl = window.prompt(
          `Connection Error: Failed to reach the backend server at ${getApiBaseUrl() || 'local server'}.\n\nThis usually happens if the backend URL is not configured correctly on a static host or blocked by CORS.\n\nPlease enter your backend (Cloud Run) URL (e.g. https://your-app.run.app):`,
          getApiBaseUrl()
        );
        if (newUrl) {
          localStorage.setItem('BACKEND_URL', newUrl);
          window.location.reload();
        }
      }
      throw error;
    }
  }
};
