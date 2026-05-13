import { Location, TripEvent } from '../constants';

export const getAppleMapsUrl = (loc: Location) => 
  `https://maps.apple.com/?q=${encodeURIComponent(loc.name)}&ll=${loc.lat},${loc.lng}&t=m`;

export const getGoogleMapsUrl = (loc: Location) => {
  if (loc.lat && loc.lng) {
    // using the base maps URL instead of maps/search/ gives us more control over exact pinging via 'query' combined with 'll' parameter bounding
    return `https://maps.google.com/?q=${encodeURIComponent(loc.name)}&ll=${loc.lat},${loc.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.name)}`;
};

export const getDayRouteUrl = (events: TripEvent[], provider: 'apple' | 'google') => {
  // Collect all unique locations from non-hidden activities (excluding flights)
  // We ignore travel origin/destination to ensure consistency with the activities they connect
  const locations = events
    .filter(e => e.type === 'activity' && e.category !== 'flight' && !e.hidden)
    .map(e => e.location)
    .filter((loc): loc is Location => !!loc);

  if (locations.length < 2) return null;
  
  // Remove sequential duplicates
  const uniquePoints: Location[] = [];
  locations.forEach((loc) => {
    if (uniquePoints.length === 0 || 
        uniquePoints[uniquePoints.length - 1].lat !== loc.lat || 
        uniquePoints[uniquePoints.length - 1].lng !== loc.lng) {
      uniquePoints.push(loc);
    }
  });

  if (uniquePoints.length < 2) return null;

  const origin = uniquePoints[0];
  const destination = uniquePoints[uniquePoints.length - 1];
  const waypoints = uniquePoints.slice(1, -1);

  if (provider === 'apple') {
    // Using specific names and coordinate hinting for Apple Maps
    const saddr = encodeURIComponent(origin.name);
    const daddr = encodeURIComponent(destination.name);
    let url = `https://maps.apple.com/?saddr=${saddr}&daddr=${daddr}&ll=${destination.lat},${destination.lng}&dirflg=d`;
    if (waypoints.length > 0) {
      url += `&to=${waypoints.map(w => encodeURIComponent(w.name)).join("&to=")}`;
    }
    return url;
  } else {
    const waypointsStr = waypoints.map(w => encodeURIComponent(w.name)).join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin.name)}&destination=${encodeURIComponent(destination.name)}${waypointsStr ? `&waypoints=${waypointsStr}` : ''}&travelmode=driving`;
  }
};
