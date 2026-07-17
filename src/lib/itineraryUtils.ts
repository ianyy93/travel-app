import { DayPlan, Location, TripCategory, TripEvent } from '../constants';
import { expandMembers } from '../utils/memberUtils';
import { toMinutes } from './utils';
import { getRealTravelTimeMins } from '../services/routingService';

export const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const estimateTravelMinutes = (distKm: number, mode: string) => {
  switch (mode) {
    case 'walk': return Math.round((distKm / 5) * 60);
    case 'bike': return Math.round((distKm / 15) * 60) + 2;
    case 'drive': return Math.round((distKm / 40) * 60) + 5;
    case 'rideshare': return Math.round((distKm / 35) * 60) + 6;
    case 'transit': return Math.round((distKm / 20) * 60) + 10;
    case 'flight': return Math.round((distKm / 800) * 60) + 120;
    default: return Math.round((distKm / 40) * 60);
  }
};

export const getTravelModeLabel = (mode: string) => {
  switch (mode) {
    case 'walk': return 'Walk';
    case 'bike': return 'Bike';
    case 'drive': return 'Drive';
    case 'rideshare': return 'Rideshare';
    case 'transit': return 'Transit';
    case 'flight': return 'Flight';
    default: return 'Drive';
  }
};

export const inferTravelMode = (
  prevLoc?: Location,
  currLoc?: Location,
  fallbackMode?: TripCategory,
  hasRentalInfo?: boolean
): TripCategory => {
  if (!prevLoc || !currLoc) return fallbackMode || 'drive';
  const distKm = getDistanceKm(prevLoc.lat, prevLoc.lng, currLoc.lat, currLoc.lng);
  if (distKm > 500) return 'flight';
  if (distKm < 1.0) return 'walk';
  if (fallbackMode === 'drive' || hasRentalInfo) return 'drive';
  if (distKm < 10) return 'rideshare';
  return 'transit';
};

export const buildTravelModeChange = async (
  event: TripEvent,
  newMode: 'transit' | 'drive' | 'walk' | 'flight' | 'bike' | 'rideshare',
  hasRentalInfo?: boolean
) => {
  const modeLabels: Record<string, string> = {
    transit: 'Transit',
    drive: 'Drive',
    rideshare: 'Rideshare',
    walk: 'Walk',
    bike: 'Bike',
    flight: 'Flight'
  };

  const dist = event.origin && event.destination ? getDistanceKm(event.origin.lat, event.origin.lng, event.destination.lat, event.destination.lng) : 0;
  let estimatedMins = estimateTravelMinutes(dist, newMode);

  if (event.origin && event.destination) {
    const realMins = await getRealTravelTimeMins(
      event.origin.lat,
      event.origin.lng,
      event.destination.lat,
      event.destination.lng,
      newMode
    );
    if (realMins !== null) {
      estimatedMins = realMins + (newMode === 'drive' ? 5 : 0);
    }
  }

  const updatedEvent = {
    ...event,
    category: newMode,
    title: `${modeLabels[newMode]} to ${event.destination?.name || 'Destination'}`
  } as TripEvent;

  if (updatedEvent.startTime) {
    const startMins = toMinutes(updatedEvent.startTime);
    const endMins = startMins + estimatedMins;
    const hrs = Math.floor(endMins / 60) % 24;
    const mins = endMins % 60;
    updatedEvent.endTime = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  return { updatedEvent, estimatedMins };
};

export const buildNavigationEventsForDay = (
  day: DayPlan,
  dayIdx: number,
  allDays: DayPlan[],
  masterTravellers: Array<{ id: string }>,
  hasRentalInfo?: boolean
): DayPlan => {
  const nonTravelEvents = day.events.filter(e => e.type !== 'travel');
  const existingTravelEvents = day.events.filter(e => e.type === 'travel');
  const travelEvents: TripEvent[] = [];
  const sortedActivities = [...nonTravelEvents].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  const lastEventPerMember: Record<string, (TripEvent & { isCrossDay?: boolean }) | null> = {};

  const isRoutableEvent = (e: TripEvent) =>
    !e.hidden &&
    !!e.location?.lat &&
    !!e.location?.lng &&
    (e.status === undefined || e.status === 'confirmed' || e.status === 'pending-meal');

  if (dayIdx > 0) {
    let prevDayIdx = dayIdx - 1;
    while (prevDayIdx >= 0) {
      const prevDayEvents = [...allDays[prevDayIdx].events].sort((a, b) => toMinutes(b.startTime) - toMinutes(a.startTime));
      const prevDayRoutable = prevDayEvents.filter(isRoutableEvent);
      if (prevDayRoutable.length > 0) {
        prevDayRoutable.forEach(e => {
          const mIds = expandMembers(e.memberIds, masterTravellers as any);
          mIds.forEach(mid => {
            if (!lastEventPerMember[mid]) {
              lastEventPerMember[mid] = { ...e, isCrossDay: true };
            }
          });
        });
        if (Object.keys(lastEventPerMember).length > 0) break;
      }
      prevDayIdx--;
    }
  }

  const routableActivities = sortedActivities.filter(isRoutableEvent);
  routableActivities.forEach(current => {
    const currentMemberIds = expandMembers(current.memberIds, masterTravellers as any);
    if (!isRoutableEvent(current)) return;
    if (!current.location || !current.location.lat || !current.location.lng) return;
    currentMemberIds.forEach(mid => {
      const prev = lastEventPerMember[mid];
      if (prev && prev.location) {
        const prevLoc = prev.location;
        const currLoc = current.location!;
        const isDifferentPlace =
          Math.abs(prevLoc.lat - currLoc.lat) > 0.0001 ||
          Math.abs(prevLoc.lng - currLoc.lng) > 0.0001 ||
          prevLoc.name.toLowerCase() !== currLoc.name.toLowerCase();
        if (isDifferentPlace) {
          let startTime = prev.endTime || prev.startTime;
          let gap = toMinutes(current.startTime) - toMinutes(startTime);
          if (prev.isCrossDay) {
            gap = 999;
            const currentMin = toMinutes(current.startTime);
            const travelStartMins = Math.max(0, currentMin - 30);
            const hrs = Math.floor(travelStartMins / 60);
            const mins = travelStartMins % 60;
            startTime = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
          }
          const endTime = current.startTime;
          if (gap >= 0) {
            const existingNav = existingTravelEvents.find(t => {
              const idMatch = t.id.startsWith(`nav-${prev.id}-${current.id}`);
              const sharedPair = (t.origin?.name && prevLoc.name && t.origin.name === prevLoc.name && t.destination?.name && currLoc.name && t.destination.name === currLoc.name);
              return idMatch || sharedPair;
            });
            let navEvent: TripEvent;
            if (existingNav && existingNav.category !== 'flight') {
              let reusedTitle = existingNav.title;
              const oldDest = existingNav.destination?.name || '';
              if (oldDest && currLoc.name !== oldDest && reusedTitle.endsWith(oldDest)) {
                reusedTitle = reusedTitle.substring(0, reusedTitle.length - oldDest.length) + currLoc.name;
              }
              navEvent = { ...existingNav, title: reusedTitle, origin: prevLoc, destination: currLoc, startTime, endTime };
            } else {
              const inferredMode = inferTravelMode(prevLoc, currLoc, hasRentalInfo ? 'drive' : 'transit', hasRentalInfo);
              navEvent = {
                id: `nav-${prev.id}-${current.id}-${Date.now()}`,
                type: 'travel',
                category: inferredMode,
                title: `${getTravelModeLabel(inferredMode)} to ${currLoc.name}`,
                origin: prevLoc,
                destination: currLoc,
                startTime,
                endTime,
                memberIds: [mid]
              };
            }
            const navMembers = travelEvents.find(t => t.id === navEvent.id) || travelEvents.find(t => t.origin?.name === navEvent.origin?.name && t.destination?.name === navEvent.destination?.name);
            if (navMembers) {
              if (!navMembers.memberIds) navMembers.memberIds = [];
              if (!navMembers.memberIds.includes(mid)) navMembers.memberIds.push(mid);
            } else {
              if (!navEvent.memberIds) navEvent.memberIds = [];
              if (!navEvent.memberIds.includes(mid)) navEvent.memberIds.push(mid);
              travelEvents.push(navEvent);
            }
          }
        }
      }
      lastEventPerMember[mid] = current;
    });
  });

  const updatedDay = {
    ...day,
    events: [...nonTravelEvents, ...travelEvents].sort((a, b) => {
      const timeA = toMinutes(a.startTime);
      const timeB = toMinutes(b.startTime);
      if (timeA !== timeB) return timeA - timeB;
      if (a.type === 'travel' && b.type !== 'travel') return 1;
      if (a.type !== 'travel' && b.type === 'travel') return -1;
      return 0;
    })
  } as DayPlan;

  return updatedDay;
};

export const syncNavigationEvents = (inputItin: DayPlan[], masterTravellers: Array<{ id: string }>, hasRentalInfo?: boolean) => {
  let nextItin = [...inputItin];
  for (let dayIdx = 0; dayIdx < nextItin.length; dayIdx++) {
    nextItin[dayIdx] = buildNavigationEventsForDay(nextItin[dayIdx], dayIdx, nextItin, masterTravellers, hasRentalInfo);
  }
  return nextItin;
};
