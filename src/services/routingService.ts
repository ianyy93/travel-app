import { getApiBaseUrl } from "../utils/api";

export type TravelMode = 'drive' | 'walk' | 'bike' | 'transit' | 'flight' | 'rideshare';

export async function getRealTravelTimeMins(
  lat1: number, lon1: number, 
  lat2: number, lon2: number, 
  mode: TravelMode
): Promise<number | null> {
  let profile = 'driving';
  if (mode === 'walk') profile = 'foot';
  if (mode === 'bike') profile = 'cycling';
  
  if (mode === 'transit' || mode === 'flight') {
    return null; // OSRM doesn't support transit/flights, fallback to math
  }

  try {
    // Fetch via backend proxy to bypass CORS/sandboxed iframe fetch blocks
    const response = await fetch(`${getApiBaseUrl()}/api/routing?profile=${profile}&coordinates=${lon1},${lat1};${lon2},${lat2}`, {
      credentials: "include"
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.routes && data.routes[0]) {
      // duration is in seconds
      return Math.round(data.routes[0].duration / 60);
    }
    return null;
  } catch (error) {
    console.warn("OSRM routing failed", error);
    return null;
  }
}
