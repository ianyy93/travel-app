export interface Location {
  name: string;
  lat: number;
  lng: number;
  description?: string;
}

export type TripEventType = 'activity' | 'travel';
export type TripCategory = 'flight' | 'drive' | 'stay' | 'activity' | 'food' | 'walk' | 'transit' | 'logistics' | 'work';

export interface TripMember {
  id: string;
  name: string;
  initials: string;
  color: string;
}

export interface TripEvent {
  id: string;
  type: TripEventType;
  category: TripCategory;
  manualCategory?: string; // Manual override for Places tab categorization
  startTime?: string;
  endTime?: string;
  title: string;
  description?: string;
  location?: Location; // For activity
  origin?: Location; // For travel
  destination?: Location; // For travel
  waypoints?: Location[]; // For multi-stop travel
  suggestions?: Location[]; // For meal/activity options
  hidden?: boolean; // For cancelling/hiding events
  memberIds?: string[]; // IDs of members participating in this event
  originalIdx?: number; // Internal index for editing
  originalTitle?: string; // Original title before suggestion selection
  status?: 'confirmed' | 'suggestion' | 'pending-meal'; // Fix 2.2: Suggestion status
}

export interface DayPlan {
  id: number;
  date: string;
  title: string;
  events: TripEvent[];
}

export const TEMPLATE_VERSION = 7; // Increment this when making structural changes to the itinerary

export const ITINERARY_DATA: DayPlan[] = [
  {
    id: 1,
    date: "May 14",
    title: "Arrival & Grand Canyon Drive",
    events: [
      {
        id: "14-1",
        type: 'activity',
        category: 'flight',
        startTime: "09:30 AM",
        endTime: "11:04 AM",
        title: "Flight YYZ → PHX",
        description: "Porter PD 641. Terminal 3.",
        location: { name: "Phoenix Sky Harbor International Airport", lat: 33.4342, lng: -112.0081 }
      },
      {
        id: "14-2",
        type: 'travel',
        category: 'transit',
        startTime: "11:15 AM",
        endTime: "11:45 AM",
        title: "Shuttle to Rental Center",
        description: "Pick up: Outside baggage claim at Terminal 3 (Level 1). Drop off: Rental Car Center. Shuttle runs every 5-10 mins. More info: https://www.skyharbor.com/parking-transportation/rental-cars/",
        origin: { name: "Phoenix Sky Harbor International Airport", lat: 33.4342, lng: -112.0081 },
        destination: { name: "PHX Rental Car Center", lat: 33.4376, lng: -112.0222 }
      },
      {
        id: "14-3",
        type: 'activity',
        category: 'drive',
        startTime: "12:00 PM",
        endTime: "12:30 PM",
        title: "Pick up Rental Car",
        description: "Alamo (Hyundai Kona or similar).",
        location: { name: "PHX Rental Car Center", lat: 33.4376, lng: -112.0222 }
      },
      {
        id: "14-3b",
        type: 'activity',
        category: 'food',
        startTime: "12:30 PM",
        endTime: "01:15 PM",
        title: "Quick Lunch",
        description: "To-go or drive-through options near the airport for a fast start.",
        suggestions: [
          { name: "In-N-Out Burger, Phoenix, AZ", lat: 33.4594, lng: -112.0294, description: "Classic drive-through. Very close to the rental center." },
          { name: "Raising Cane's Chicken Fingers, Phoenix, AZ", lat: 33.4485, lng: -111.9261, description: "Fast and reliable drive-through on the way out." },
          { name: "Chipotle Mexican Grill, Phoenix, AZ (Online Order)", lat: 33.4515, lng: -112.0740, description: "Quick to-go pickup near the airport." }
        ]
      },
      {
        id: "14-4",
        type: 'travel',
        category: 'drive',
        startTime: "01:15 PM",
        endTime: "01:30 PM",
        title: "Drive to Trader Joe's",
        origin: { name: "PHX Rental Car Center", lat: 33.4376, lng: -112.0222 },
        destination: { name: "Trader Joe's, 4821 N 20th St, Phoenix, AZ", lat: 33.509, lng: -112.039 }
      },
      {
        id: "14-4a",
        type: 'activity',
        category: 'logistics',
        startTime: "01:30 PM",
        endTime: "02:15 PM",
        title: "Trader Joe's Grocery Run",
        description: "Stock up on water, snacks, trail mix, and campfire supplies.",
        location: { name: "Trader Joe's, 4821 N 20th St, Phoenix, AZ", lat: 33.509, lng: -112.039 }
      },
      {
        id: "14-4b",
        type: 'travel',
        category: 'drive',
        startTime: "02:15 PM",
        endTime: "05:15 PM",
        title: "Drive to Camp",
        origin: { name: "Trader Joe's, 4821 N 20th St, Phoenix, AZ", lat: 33.509, lng: -112.039 },
        destination: { name: "Under Canvas Grand Canyon, 979 Airfield Dr, Williams, AZ 86046", lat: 35.8592, lng: -112.1221 }
      },
      {
        id: "14-4c",
        type: 'activity',
        category: 'stay',
        startTime: "05:15 PM",
        endTime: "05:45 PM",
        title: "Check-in at Under Canvas",
        description: "Get settled, drop off groceries in the tent.",
        location: { name: "Under Canvas Grand Canyon, 979 Airfield Dr, Williams, AZ 86046", lat: 35.8592, lng: -112.1221 }
      },
      {
        id: "14-5a",
        type: 'travel',
        category: 'drive',
        startTime: "05:45 PM",
        endTime: "06:15 PM",
        title: "Drive to Park",
        origin: { name: "Under Canvas Grand Canyon, 979 Airfield Dr, Williams, AZ 86046", lat: 35.8592, lng: -112.1221 },
        destination: { name: "Mather Point, Grand Canyon Village, AZ 86023", lat: 36.0617, lng: -112.1077 }
      },
      {
        id: "14-5",
        type: 'activity',
        category: 'activity',
        startTime: "06:15 PM",
        endTime: "07:30 PM",
        title: "Sunset at Mather Point",
        description: "Short Rim Trail walk. Parking: Use Visitor Center Parking Lot 1 (closest) or Lot 4. Dog-friendly area.",
        location: { name: "Mather Point, Grand Canyon Village, AZ 86023", lat: 36.0617, lng: -112.1077 }
      },
      {
        id: "14-6",
        type: 'travel',
        category: 'drive',
        startTime: "07:45 PM",
        endTime: "08:15 PM",
        title: "Drive to Camp",
        origin: { name: "Mather Point, Grand Canyon Village, AZ 86023", lat: 36.0617, lng: -112.1077 },
        destination: { name: "Under Canvas Grand Canyon, 979 Airfield Dr, Williams, AZ 86046", lat: 35.8592, lng: -112.1221 }
      },
      {
        id: "14-7",
        type: 'activity',
        category: 'food',
        startTime: "08:30 PM",
        title: "Dinner at Camp",
        description: "On-site dining at Under Canvas. Seasonal, locally sourced menu. S'mores by the fire afterwards.",
        location: { name: "Under Canvas Grand Canyon, 979 Airfield Dr, Williams, AZ 86046", lat: 35.8592, lng: -112.1221 }
      },
      {
        id: "14-8",
        type: 'activity',
        category: 'stay',
        startTime: "09:30 PM",
        title: "Stay: Under Canvas Grand Canyon",
        description: "Glamping experience near the South Rim.",
        location: { name: "Under Canvas Grand Canyon, 979 Airfield Dr, Williams, AZ 86046", lat: 35.8592, lng: -112.1221 }
      }
    ]
  },
  {
    id: 2,
    date: "May 15",
    title: "Grand Canyon Exploration",
    events: [
      {
        id: "15-0",
        type: 'activity',
        category: 'activity',
        startTime: "06:00 AM",
        endTime: "07:00 AM",
        title: "Slow Morning at Camp",
        description: "Coffee + relax. Take photos around the tent and enjoy the morning scenery.",
        location: { name: "Under Canvas Grand Canyon, 979 Airfield Dr, Williams, AZ 86046", lat: 35.8592, lng: -112.1221 }
      },
      {
        id: "15-0b",
        type: 'travel',
        category: 'drive',
        startTime: "07:00 AM",
        endTime: "07:30 AM",
        title: "Drive to Park",
        description: "Head to Visitor Center parking. Check for availability in Lot 1 or 4.",
        origin: { name: "Under Canvas Grand Canyon, 979 Airfield Dr, Williams, AZ 86046", lat: 35.8592, lng: -112.1221 },
        destination: { name: "Grand Canyon Visitor Center, South Rim, 450 Mather Point Rd, Grand Canyon Village, AZ 86023", lat: 36.0591, lng: -112.1093 }
      },
      {
        id: "15-1",
        type: 'travel',
        category: 'walk',
        startTime: "07:30 AM",
        endTime: "11:30 AM",
        title: "Rim Trail Walk",
        description: "Visitor Center Parking → Mather Point → Yavapai Point → Back to Visitor Center. Dog-friendly trail.",
        origin: { name: "Grand Canyon Visitor Center, South Rim, 450 Mather Point Rd, Grand Canyon Village, AZ 86023", lat: 36.0591, lng: -112.1093 },
        destination: { name: "Grand Canyon Visitor Center, South Rim, 450 Mather Point Rd, Grand Canyon Village, AZ 86023", lat: 36.0591, lng: -112.1093 },
        waypoints: [
          { name: "Mather Point, Grand Canyon Village, AZ 86023", lat: 36.0617, lng: -112.1077 },
          { name: "Yavapai Point, Grand Canyon Village, AZ 86023", lat: 36.0661, lng: -112.1173 }
        ]
      },
      {
        id: "15-11b",
        type: 'activity',
        category: 'food',
        startTime: "11:30 AM",
        endTime: "12:30 PM",
        title: "Picnic Lunch",
        description: "Select your lunch spot. Canyon Village is a backtrack, while Cameron is on the way to Scottsdale.",
        suggestions: [
          { name: "Cameron Trading Post Restaurant", lat: 35.8754, lng: -111.4124, description: "4.4★ • Famous Navajo Tacos. Perfect stop on the way to Scottsdale (East Exit)." },
          { name: "El Tovar Dining Room (To-Go)", lat: 36.0577, lng: -112.1351, description: "4.5★ • Historic lodge. Grab high-quality sandwiches for a rim-side picnic." },
          { name: "Canyon Village Market & Deli", lat: 36.0544, lng: -112.1401, description: "4.2★ • Most convenient for a quick grab-and-go before heading East." }
        ]
      },
      {
        id: "15-2",
        type: 'travel',
        category: 'drive',
        startTime: "12:30 PM",
        endTime: "12:45 PM",
        title: "Desert View Drive",
        origin: { name: "Grand Canyon Visitor Center, South Rim, 450 Mather Point Rd, Grand Canyon Village, AZ 86023", lat: 36.0591, lng: -112.1093 },
        destination: { name: "Grandview Point, Grand Canyon Village, AZ 86023", lat: 35.9984, lng: -111.9872 }
      },
      {
        id: "15-3",
        type: 'activity',
        category: 'activity',
        startTime: "12:45 PM",
        endTime: "01:00 PM",
        title: "Grandview Point",
        location: { name: "Grandview Point, Grand Canyon Village, AZ 86023", lat: 35.9984, lng: -111.9872 }
      },
      {
        id: "15-4",
        type: 'travel',
        category: 'drive',
        startTime: "01:00 PM",
        endTime: "01:10 PM",
        title: "Drive to Moran Point",
        origin: { name: "Grandview Point, Grand Canyon Village, AZ 86023", lat: 35.9984, lng: -111.9872 },
        destination: { name: "Moran Point, Grand Canyon Village, AZ 86023", lat: 36.0048, lng: -111.9241 }
      },
      {
        id: "15-5",
        type: 'activity',
        category: 'activity',
        startTime: "01:10 PM",
        endTime: "01:25 PM",
        title: "Moran Point",
        location: { name: "Moran Point, Grand Canyon Village, AZ 86023", lat: 36.0048, lng: -111.9241 }
      },
      {
        id: "15-6",
        type: 'travel',
        category: 'drive',
        startTime: "01:25 PM",
        endTime: "01:35 PM",
        title: "Drive to Lipan Point",
        origin: { name: "Moran Point, Grand Canyon Village, AZ 86023", lat: 36.0048, lng: -111.9241 },
        destination: { name: "Lipan Point, Grand Canyon Village, AZ 86023", lat: 36.0328, lng: -111.8524 }
      },
      {
        id: "15-7",
        type: 'activity',
        category: 'activity',
        startTime: "01:35 PM",
        endTime: "01:50 PM",
        title: "Lipan Point",
        location: { name: "Lipan Point, Grand Canyon Village, AZ 86023", lat: 36.0328, lng: -111.8524 }
      },
      {
        id: "15-8",
        type: 'travel',
        category: 'drive',
        startTime: "01:50 PM",
        endTime: "02:00 PM",
        title: "Drive to Navajo Point",
        origin: { name: "Lipan Point, Grand Canyon Village, AZ 86023", lat: 36.0328, lng: -111.8524 },
        destination: { name: "Navajo Point, Grand Canyon Village, AZ 86023", lat: 36.0361, lng: -111.8344 }
      },
      {
        id: "15-9",
        type: 'activity',
        category: 'activity',
        startTime: "02:00 PM",
        endTime: "02:15 PM",
        title: "Navajo Point",
        location: { name: "Navajo Point, Grand Canyon Village, AZ 86023", lat: 36.0361, lng: -111.8344 }
      },
      {
        id: "15-10",
        type: 'travel',
        category: 'drive',
        startTime: "02:15 PM",
        endTime: "02:25 PM",
        title: "Drive to Watchtower",
        origin: { name: "Navajo Point, Grand Canyon Village, AZ 86023", lat: 36.0361, lng: -111.8344 },
        destination: { name: "Desert View Watchtower, Grand Canyon Village, AZ 86023", lat: 36.0412, lng: -111.8268 }
      },
      {
        id: "15-11",
        type: 'activity',
        category: 'activity',
        startTime: "02:25 PM",
        endTime: "03:00 PM",
        title: "Desert View Watchtower",
        description: "Large lot available at Desert View area.",
        location: { name: "Desert View Watchtower, Grand Canyon Village, AZ 86023", lat: 36.0412, lng: -111.8268 }
      },
      {
        id: "15-12",
        type: 'travel',
        category: 'drive',
        startTime: "03:00 PM",
        endTime: "07:00 PM",
        title: "Drive to Scottsdale",
        description: "Approx. 4 hours drive south.",
        origin: { name: "Desert View Watchtower, Grand Canyon National Park, AZ", lat: 36.0412, lng: -111.8268 },
        destination: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 }
      },
      {
        id: "15-12b",
        type: 'activity',
        category: 'food',
        startTime: "07:30 PM",
        title: "Dinner in Scottsdale",
        description: "Try 'Proof' at the Four Seasons for an American canteen experience.",
        location: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 }
      },
      {
        id: "15-13",
        type: 'activity',
        category: 'stay',
        startTime: "08:30 PM",
        title: "Stay: Four Seasons Scottsdale",
        description: "Check-in at Troon North.",
        location: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 }
      }
    ]
  },
  {
    id: 3,
    date: "May 16",
    title: "Scottsdale Relaxation",
    events: [
      {
        id: "16-0",
        type: 'activity',
        category: 'food',
        startTime: "08:00 AM",
        title: "Breakfast at Resort",
        description: "Relaxed breakfast at the Four Seasons.",
        location: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 }
      },
      {
        id: "16-1",
        type: 'activity',
        category: 'activity',
        startTime: "09:00 AM",
        endTime: "11:30 AM",
        title: "Pinnacle Peak Park",
        description: "Hiking with the dog. Parking: Dedicated lot at the trailhead.",
        location: { name: "Pinnacle Peak Park, Scottsdale, AZ", lat: 33.7275, lng: -111.8519 }
      },
      {
        id: "16-2",
        type: 'travel',
        category: 'drive',
        startTime: "11:30 AM",
        endTime: "11:45 AM",
        title: "Return to Resort",
        origin: { name: "Pinnacle Peak Park, Scottsdale, AZ", lat: 33.7275, lng: -111.8519 },
        destination: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 }
      },
      {
        id: "16-2b",
        type: 'activity',
        category: 'food',
        startTime: "12:30 PM",
        title: "Poolside Lunch",
        description: "Casual lunch by the pool at the resort.",
        location: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 }
      },
      {
        id: "16-3",
        type: 'activity',
        category: 'activity',
        startTime: "01:30 PM",
        endTime: "05:00 PM",
        title: "Resort Time",
        description: "Pool and spa at Four Seasons.",
        location: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 }
      },
      {
        id: "16-4",
        type: 'travel',
        category: 'drive',
        startTime: "05:30 PM",
        endTime: "06:00 PM",
        title: "Drive to Old Town",
        origin: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 },
        destination: { name: "Old Town Scottsdale, AZ", lat: 33.4932, lng: -111.9261 }
      },
      {
        id: "16-5",
        type: 'activity',
        category: 'activity',
        startTime: "06:00 PM",
        endTime: "08:00 PM",
        title: "Old Town Scottsdale",
        description: "Exploring art galleries and shops. Parking: Multiple free public parking garages available.",
        location: { name: "Old Town Scottsdale, AZ", lat: 33.4932, lng: -111.9261 }
      },
      {
        id: "16-5b",
        type: 'activity',
        category: 'food',
        startTime: "08:00 PM",
        title: "Dinner in Old Town",
        description: "Try 'The Mission' for modern Latin cuisine or 'Olive & Ivy' for Mediterranean.",
        location: { name: "Old Town Scottsdale, AZ", lat: 33.4932, lng: -111.9261 }
      },
      {
        id: "16-6",
        type: 'travel',
        category: 'drive',
        startTime: "09:30 PM",
        endTime: "10:00 PM",
        title: "Return to Resort",
        origin: { name: "Old Town Scottsdale, AZ", lat: 33.4932, lng: -111.9261 },
        destination: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 }
      },
      {
        id: "16-7",
        type: 'activity',
        category: 'stay',
        startTime: "10:30 PM",
        title: "Stay: Four Seasons Scottsdale",
        location: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 }
      }
    ]
  },
  {
    id: 4,
    date: "May 17",
    title: "Sedona Day Trip",
    events: [
      {
        id: "17-0",
        type: 'activity',
        category: 'food',
        startTime: "07:00 AM",
        title: "Early Breakfast",
        description: "Quick bite before heading to Sedona.",
        location: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 }
      },
      {
        id: "17-2",
        type: 'travel',
        category: 'drive',
        startTime: "08:00 AM",
        endTime: "10:15 AM",
        title: "Drive to Sedona",
        description: "Approx. 2 hours 15 mins drive.",
        origin: { name: "Four Seasons Resort Scottsdale at Troon North, AZ", lat: 33.7258, lng: -111.8542 },
        destination: { name: "Mescal Trailhead, Sedona, AZ", lat: 34.9016, lng: -111.8267 }
      },
      {
        id: "17-3",
        type: 'activity',
        category: 'activity',
        startTime: "10:15 AM",
        endTime: "11:30 AM",
        title: "Mescal Trailhead",
        description: "Great hiking area connecting to trails like Chuckwagon and Devil's Bridge. Beautiful red rock scenery. Best to do this first before it gets too hot.",
        location: { name: "Mescal Trailhead, Sedona, AZ", lat: 34.9016, lng: -111.8267 }
      },
      {
        id: "17-4",
        type: 'travel',
        category: 'drive',
        startTime: "11:30 AM",
        endTime: "11:50 AM",
        title: "Drive to Secret Slickrock",
        origin: { name: "Mescal Trailhead, Sedona, AZ", lat: 34.9016, lng: -111.8267 },
        destination: { name: "Secret Slickrock Trailhead, Sedona, AZ", lat: 34.8256, lng: -111.8080 }
      },
      {
        id: "17-5",
        type: 'activity',
        category: 'activity',
        startTime: "11:50 AM",
        endTime: "12:30 PM",
        title: "Secret Slickrock Trailhead",
        description: "Short, easy trail offering stunning views of Cathedral Rock reflected in Oak Creek pools.",
        location: { name: "Secret Slickrock Trailhead, Sedona, AZ", lat: 34.8256, lng: -111.8080 }
      },
      {
        id: "17-6",
        type: 'travel',
        category: 'drive',
        startTime: "12:30 PM",
        endTime: "12:45 PM",
        title: "Drive to McDonald's",
        origin: { name: "Secret Slickrock Trailhead, Sedona, AZ", lat: 34.8256, lng: -111.8080 },
        destination: { name: "McDonald's, 2380 W State Route 89A, Sedona, AZ", lat: 34.8635, lng: -111.7946 }
      },
      {
        id: "17-7",
        type: 'activity',
        category: 'food',
        startTime: "12:45 PM",
        endTime: "01:45 PM",
        title: "Lunch in Sedona",
        description: "Grab a bite near West Sedona. The Blue Arches McDonald's is a fun novelty stop.",
        location: { name: "McDonald's, 2380 W State Route 89A, Sedona, AZ", lat: 34.8635, lng: -111.7946 },
        suggestions: [
          { name: "McDonald's (Blue Arches)", lat: 34.8635, lng: -111.7946, description: "The only McDonald's in the world with teal-blue arches to blend in with the red rock scenery." },
          { name: "The Hudson", lat: 34.8697, lng: -111.7610, description: "Upscale American eatery with great views from the deck." },
          { name: "Elote Cafe", lat: 34.8698, lng: -111.7608, description: "Highly-rated modern Mexican cuisine (reservations highly recommended)." }
        ]
      },
      {
        id: "17-8",
        type: 'travel',
        category: 'drive',
        startTime: "01:45 PM",
        endTime: "01:55 PM",
        title: "Drive to Tlaquepaque",
        origin: { name: "McDonald's, 2380 W State Route 89A, Sedona, AZ", lat: 34.8635, lng: -111.7946 },
        destination: { name: "Tlaquepaque Arts & Shopping Village, 336 AZ-179, Sedona, AZ", lat: 34.8617, lng: -111.7635 }
      },
      {
        id: "17-9",
        type: 'activity',
        category: 'activity',
        startTime: "01:55 PM",
        endTime: "03:00 PM",
        title: "Tlaquepaque Arts & Shopping Village",
        description: "Authentic Mexican-style village with art galleries, cobblestone paths, and craft shops.",
        location: { name: "Tlaquepaque Arts & Shopping Village, 336 AZ-179, Sedona, AZ", lat: 34.8617, lng: -111.7635 }
      },
      {
        id: "17-10",
        type: 'travel',
        category: 'drive',
        startTime: "03:00 PM",
        endTime: "03:10 PM",
        title: "Drive to Chapel",
        origin: { name: "Tlaquepaque Arts & Shopping Village, 336 AZ-179, Sedona, AZ", lat: 34.8617, lng: -111.7635 },
        destination: { name: "Chapel of the Holy Cross, 780 Chapel Rd, Sedona, AZ", lat: 34.8320, lng: -111.7667 }
      },
      {
        id: "17-11",
        type: 'activity',
        category: 'activity',
        startTime: "03:10 PM",
        endTime: "04:00 PM",
        title: "Chapel of the Holy Cross",
        description: "Stunning chapel built directly into the red stone cliffs. Great panoramic views from the south.",
        location: { name: "Chapel of the Holy Cross, 780 Chapel Rd, Sedona, AZ", lat: 34.8320, lng: -111.7667 }
      },
      {
        id: "17-12",
        type: 'travel',
        category: 'drive',
        startTime: "04:00 PM",
        endTime: "06:00 PM",
        title: "Return to Scottsdale",
        description: "Head south on AZ-179 back onto I-17 South.",
        origin: { name: "Chapel of the Holy Cross, 780 Chapel Rd, Sedona, AZ", lat: 34.8320, lng: -111.7667 },
        destination: { name: "Four Seasons Resort Scottsdale at Troon North, AZ", lat: 33.7258, lng: -111.8542 }
      },
      {
        id: "17-13",
        type: 'activity',
        category: 'food',
        startTime: "07:30 PM",
        title: "Dinner at Resort",
        description: "Relaxing dinner after the day trip.",
        location: { name: "Four Seasons Resort Scottsdale at Troon North, AZ", lat: 33.7258, lng: -111.8542 }
      },
      {
        id: "17-14",
        type: 'activity',
        category: 'stay',
        startTime: "08:30 PM",
        title: "Stay: Four Seasons Scottsdale",
        location: { name: "Four Seasons Resort Scottsdale at Troon North, AZ", lat: 33.7258, lng: -111.8542 }
      }
    ]
  },
  {
    id: 5,
    date: "May 18",
    title: "Final Relax",
    events: [
      {
        id: "18-0",
        type: 'activity',
        category: 'food',
        startTime: "09:00 AM",
        title: "Leisurely Breakfast",
        location: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 }
      },
      {
        id: "18-1",
        type: 'activity',
        category: 'activity',
        startTime: "10:00 AM",
        endTime: "01:00 PM",
        title: "Relax at Four Seasons",
        description: "Pool time or short walk.",
        location: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 }
      },
      {
        id: "18-1b",
        type: 'activity',
        category: 'food',
        startTime: "01:00 PM",
        title: "Lunch",
        location: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 }
      },
      {
        id: "18-1c",
        type: 'activity',
        category: 'activity',
        startTime: "02:00 PM",
        endTime: "06:00 PM",
        title: "Optional Exploring",
        description: "Visit Taliesin West or Scottsdale Quarter.",
        location: { name: "Scottsdale, AZ", lat: 33.4942, lng: -111.9261 }
      },
      {
        id: "18-1d",
        type: 'activity',
        category: 'food',
        startTime: "07:30 PM",
        title: "Farewell Dinner",
        description: "Celebrate the last night in Arizona.",
        location: { name: "Scottsdale, AZ", lat: 33.4942, lng: -111.9261 }
      },
      {
        id: "18-2",
        type: 'activity',
        category: 'stay',
        startTime: "09:00 PM",
        title: "Stay: Four Seasons Scottsdale",
        location: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 }
      }
    ]
  },
  {
    id: 6,
    date: "May 19",
    title: "Departure",
    events: [
      {
        id: "19-0",
        type: 'activity',
        category: 'food',
        startTime: "08:00 AM",
        title: "Final Breakfast",
        location: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 }
      },
      {
        id: "19-1",
        type: 'activity',
        category: 'stay',
        startTime: "09:30 AM",
        endTime: "10:00 AM",
        title: "Check out",
        location: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 }
      },
      {
        id: "19-2",
        type: 'travel',
        category: 'drive',
        startTime: "10:00 AM",
        endTime: "10:30 AM",
        title: "Drive to Airport",
        origin: { name: "Four Seasons Resort Scottsdale at Troon North, 10600 E Crescent Moon Dr, Scottsdale, AZ 85262", lat: 33.7258, lng: -111.8542 },
        destination: { name: "PHX Rental Car Center", lat: 33.4376, lng: -112.0222 }
      },
      {
        id: "19-3",
        type: 'activity',
        category: 'drive',
        startTime: "10:30 AM",
        endTime: "11:00 AM",
        title: "Return Rental Car",
        location: { name: "PHX Rental Car Center", lat: 33.4376, lng: -112.0222 }
      },
      {
        id: "19-4",
        type: 'travel',
        category: 'transit',
        startTime: "11:15 AM",
        endTime: "11:30 AM",
        title: "Shuttle to Terminal",
        description: "Pick up: Rental Car Center. Drop off: Terminal 3 (Porter Airlines). Shuttle runs every 5-10 mins. More info: https://www.skyharbor.com/parking-transportation/rental-cars/",
        origin: { name: "PHX Rental Car Center", lat: 33.4376, lng: -112.0222 },
        destination: { name: "Phoenix Sky Harbor International Airport", lat: 33.4342, lng: -112.0081 }
      },
      {
        id: "19-4b",
        type: 'activity',
        category: 'food',
        startTime: "11:30 AM",
        title: "Airport Snack",
        description: "Grab a quick bite at Terminal 3 before the flight.",
        location: { name: "PHX Airport", lat: 33.4342, lng: -112.0081 }
      },
      {
        id: "19-5",
        type: 'activity',
        category: 'flight',
        startTime: "12:05 PM",
        endTime: "07:19 PM",
        title: "Flight PHX → YYZ",
        description: "Porter PD 642.",
        location: { name: "Phoenix Sky Harbor International Airport", lat: 33.4342, lng: -112.0081 }
      }
    ]
  }
];

// --- ARIZONA 2026 ONLY ---
// These details are specific to the default template trip. 
// DO NOT use them as fallbacks for other trips.
export const FLIGHT_DETAILS = {
  outbound: {
    number: "PD 641",
    from: "YYZ (09:30 AM)",
    to: "PHX (11:04 AM)",
    date: "May 14, 2026",
    confirmation: "PRT-77291X"
  },
  return: {
    number: "PD 642",
    from: "PHX (12:05 PM)",
    to: "YYZ (07:19 PM)",
    date: "May 19, 2026",
    confirmation: "PRT-77291X"
  }
};

export const RENTAL_DETAILS = {
  company: "Alamo",
  car: "Hyundai Kona (Compact SUV)",
  pickup: "May 14, 12:00 PM @ PHX",
  dropoff: "May 19, 12:00 PM @ PHX",
  phone: "844-370-9817",
  confirmation: "ALM-992104B"
};

export const STAY_DETAILS = [
  {
    name: "Under Canvas Grand Canyon",
    location: "Valle, AZ",
    checkIn: "May 14",
    checkOut: "May 15",
    confirmation: "UC-GC-2026-X",
    phone: "888-496-1700"
  },
  {
    name: "Four Seasons Resort Scottsdale",
    location: "Scottsdale, AZ",
    checkIn: "May 15",
    checkOut: "May 19",
    confirmation: "FS-SCO-2026-Q",
    phone: "480-515-5700"
  }
];

export const RESTAURANT_DETAILS = [];
// --- END ARIZONA ONLY ---

export const GAS_STATIONS = [
  { name: "Costco Gas", address: "Phoenix, AZ", lat: 33.4484, lng: -112.0740, regular: "$3.85", brand: "Costco" },
  { name: "Chevron", address: "Grand Canyon Village, AZ", lat: 36.0544, lng: -112.1401, regular: "$4.45", brand: "Chevron" },
  { name: "Shell", address: "Sedona, AZ", lat: 34.8697, lng: -111.7610, regular: "$4.15", brand: "Shell" },
  { name: "QuikTrip", address: "Scottsdale, AZ", lat: 33.4942, lng: -111.9261, regular: "$3.95", brand: "QuikTrip" },
  { name: "Circle K", address: "Phoenix, AZ", lat: 33.5000, lng: -112.1000, regular: "$3.89", brand: "Circle K" },
  { name: "Maverik", address: "Flagstaff, AZ", lat: 35.1983, lng: -111.6513, regular: "$4.05", brand: "Maverik" },
];
