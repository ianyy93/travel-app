export interface Location {
  name: string;
  lat: number;
  lng: number;
  description?: string;
}

export interface Activity {
  time?: string;
  title: string;
  description?: string;
  location?: Location;
  type: 'flight' | 'drive' | 'stay' | 'activity' | 'food';
}

export interface DayPlan {
  date: string;
  title: string;
  activities: Activity[];
}

export const ITINERARY_DATA: DayPlan[] = [
  {
    date: "May 14",
    title: "Arrival & Grand Canyon Drive",
    activities: [
      {
        time: "09:30 AM",
        title: "Flight YYZ → PHX",
        description: "Porter PD 641. Arrive at 11:04 AM (Terminal 3).",
        type: 'flight',
        location: { name: "Phoenix Sky Harbor International Airport", lat: 33.4342, lng: -112.0081 }
      },
      {
        time: "12:00 PM",
        title: "Pick up Rental Car",
        description: "Alamo (Hyundai Kona or similar). Sky Harbor Intl. Airport.",
        type: 'drive',
        location: { name: "PHX Rental Car Center", lat: 33.4376, lng: -112.0222 }
      },
      {
        time: "01:00 PM",
        title: "Drive to Grand Canyon",
        description: "Approx. 4 hours drive to South Rim.",
        type: 'drive',
        location: { name: "Grand Canyon South Rim Entrance", lat: 35.9899, lng: -112.1211 }
      },
      {
        time: "06:30 PM",
        title: "Sunset at Mather Point",
        description: "Short Rim Trail walk. Dog-friendly.",
        type: 'activity',
        location: { name: "Mather Point", lat: 36.0617, lng: -112.1077 }
      },
      {
        title: "Stay: Under Canvas Grand Canyon",
        description: "Glamping experience near the South Rim.",
        type: 'stay',
        location: { name: "Under Canvas Grand Canyon", lat: 35.8592, lng: -112.1221 }
      }
    ]
  },
  {
    date: "May 15",
    title: "Grand Canyon Exploration",
    activities: [
      {
        time: "06:30 AM",
        title: "Early Entry & Rim Trail",
        description: "Mather → Yavapai → Village. Avoid midday heat.",
        type: 'activity',
        location: { name: "Grand Canyon Village", lat: 36.0544, lng: -112.1401 }
      },
      {
        time: "10:00 AM",
        title: "Desert View Drive: Grandview Point",
        description: "First major stop on Desert View Drive.",
        type: 'activity',
        location: { name: "Grandview Point", lat: 35.9984, lng: -111.9872 }
      },
      {
        time: "10:30 AM",
        title: "Desert View Drive: Moran Point",
        description: "Great views of the Colorado River.",
        type: 'activity',
        location: { name: "Moran Point", lat: 36.0048, lng: -111.9241 }
      },
      {
        time: "11:00 AM",
        title: "Desert View Drive: Lipan Point",
        description: "One of the widest views of the canyon.",
        type: 'activity',
        location: { name: "Lipan Point", lat: 36.0328, lng: -111.8524 }
      },
      {
        time: "11:30 AM",
        title: "Desert View Drive: Navajo Point",
        description: "Highest point on the South Rim.",
        type: 'activity',
        location: { name: "Navajo Point", lat: 36.0361, lng: -111.8344 }
      },
      {
        time: "12:00 PM",
        title: "Desert View Watchtower",
        description: "Historic 70-foot stone tower.",
        type: 'activity',
        location: { name: "Desert View Watchtower", lat: 36.0412, lng: -111.8268 }
      },
      {
        time: "01:00 PM",
        title: "Drive to Scottsdale",
        description: "Approx. 4 hours drive back south.",
        type: 'drive',
        location: { name: "Scottsdale", lat: 33.4942, lng: -111.9261 }
      },
      {
        title: "Stay: Four Seasons Scottsdale",
        description: "Check-in at Troon North.",
        type: 'stay',
        location: { name: "Four Seasons Scottsdale", lat: 33.7247, lng: -111.8542 }
      }
    ]
  },
  {
    date: "May 16",
    title: "Scottsdale Relaxation",
    activities: [
      {
        time: "Morning",
        title: "Pinnacle Peak Park",
        description: "Hiking with the dog.",
        type: 'activity',
        location: { name: "Pinnacle Peak Park", lat: 33.7275, lng: -111.8519 }
      },
      {
        time: "Afternoon",
        title: "Resort Time",
        description: "Pool and spa at Four Seasons.",
        type: 'activity',
        location: { name: "Four Seasons Scottsdale", lat: 33.7247, lng: -111.8542 }
      },
      {
        time: "Evening",
        title: "Old Town Scottsdale",
        description: "Exploring and dinner.",
        type: 'activity',
        location: { name: "Old Town Scottsdale", lat: 33.4932, lng: -111.9261 }
      },
      {
        title: "Stay: Four Seasons Scottsdale",
        description: "Troon North.",
        type: 'stay',
        location: { name: "Four Seasons Scottsdale", lat: 33.7247, lng: -111.8542 }
      }
    ]
  },
  {
    date: "May 17",
    title: "Sedona Day Trip",
    activities: [
      {
        time: "Early",
        title: "Drive to Sedona",
        description: "Approx. 2 hours drive.",
        type: 'drive',
        location: { name: "Sedona", lat: 34.8697, lng: -111.7610 }
      },
      {
        title: "Sedona Highlights",
        description: "Cathedral Rock, Bell Rock, Chapel of the Holy Cross.",
        type: 'activity',
        location: { name: "Sedona", lat: 34.8697, lng: -111.7610 }
      },
      {
        time: "Late PM",
        title: "Return to Scottsdale",
        type: 'drive',
        location: { name: "Four Seasons Scottsdale", lat: 33.7247, lng: -111.8542 }
      },
      {
        title: "Stay: Four Seasons Scottsdale",
        description: "Troon North.",
        type: 'stay',
        location: { name: "Four Seasons Scottsdale", lat: 33.7247, lng: -111.8542 }
      }
    ]
  },
  {
    date: "May 18",
    title: "Final Relax",
    activities: [
      {
        title: "Relax at Four Seasons",
        description: "Optional Scottsdale/Phoenix exploring.",
        type: 'activity',
        location: { name: "Four Seasons Scottsdale", lat: 33.7247, lng: -111.8542 }
      },
      {
        title: "Stay: Four Seasons Scottsdale",
        description: "Troon North.",
        type: 'stay',
        location: { name: "Four Seasons Scottsdale", lat: 33.7247, lng: -111.8542 }
      }
    ]
  },
  {
    date: "May 19",
    title: "Departure",
    activities: [
      {
        time: "09:30 AM",
        title: "Depart Scottsdale",
        type: 'drive',
        location: { name: "Four Seasons Scottsdale", lat: 33.7247, lng: -111.8542 }
      },
      {
        time: "10:30 AM",
        title: "Return Rental Car",
        description: "Sky Harbor Intl. Airport.",
        type: 'drive',
        location: { name: "PHX Rental Car Center", lat: 33.4376, lng: -112.0222 }
      },
      {
        time: "12:05 PM",
        title: "Flight PHX → YYZ",
        description: "Porter PD 642. Arrive at 07:19 PM.",
        type: 'flight',
        location: { name: "Phoenix Sky Harbor International Airport", lat: 33.4342, lng: -112.0081 }
      }
    ]
  }
];

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

export const GAS_STATIONS = [
  { name: "Costco Gas", address: "Phoenix, AZ", lat: 33.4484, lng: -112.0740, regular: "$3.85", brand: "Costco" },
  { name: "Chevron", address: "Grand Canyon Village, AZ", lat: 36.0544, lng: -112.1401, regular: "$4.45", brand: "Chevron" },
  { name: "Shell", address: "Sedona, AZ", lat: 34.8697, lng: -111.7610, regular: "$4.15", brand: "Shell" },
  { name: "QuikTrip", address: "Scottsdale, AZ", lat: 33.4942, lng: -111.9261, regular: "$3.95", brand: "QuikTrip" },
  { name: "Circle K", address: "Phoenix, AZ", lat: 33.5000, lng: -112.1000, regular: "$3.89", brand: "Circle K" },
  { name: "Maverik", address: "Flagstaff, AZ", lat: 35.1983, lng: -111.6513, regular: "$4.05", brand: "Maverik" },
];
