export type TravelMode = 'drive' | 'walk' | 'bike' | 'transit' | 'flight';

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
    // We use the OSRM public demo server. It is free and requires no API key.
    const response = await fetch(`https://router.project-osrm.org/route/v1/${profile}/${lon1},${lat1};${lon2},${lat2}?overview=false`);
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
