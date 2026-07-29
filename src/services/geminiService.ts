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

import { proposeChangesLogic, refineLogic } from './aiLogic';

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
    const req = {
      body: {
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
      }
    };
    
    return await proposeChangesLogic(req);
  },

  async refineSuggestions(
    event: any,
    refinePrompt: string
  ): Promise<any[]> {
    const req = {
      body: {
        event,
        refinePrompt,
      }
    };
    
    return await refineLogic(req);
  }
};
