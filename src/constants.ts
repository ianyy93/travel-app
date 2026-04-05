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
        type: 'flight'
      },
      {
        time: "12:00 PM",
        title: "Pick up Rental Car",
        description: "Alamo (Hyundai Kona or similar). Sky Harbor Intl. Airport.",
        type: 'drive'
      },
      {
        time: "01:00 PM",
        title: "Drive to Grand Canyon",
        description: "Approx. 4 hours drive to South Rim.",
        type: 'drive'
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
        type: 'activity'
      },
      {
        time: "10:00 AM",
        title: "Desert View Drive",
        description: "Scenic drive with stops: Grandview, Moran, Lipan, Navajo, Watchtower.",
        type: 'drive'
      },
      {
        time: "01:00 PM",
        title: "Drive to Scottsdale",
        description: "Approx. 4 hours drive back south.",
        type: 'drive'
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
        type: 'activity'
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
        type: 'drive'
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
        type: 'drive'
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
        type: 'activity'
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
        type: 'drive'
      },
      {
        time: "10:30 AM",
        title: "Return Rental Car",
        description: "Sky Harbor Intl. Airport.",
        type: 'drive'
      },
      {
        time: "12:05 PM",
        title: "Flight PHX → YYZ",
        description: "Porter PD 642. Arrive at 07:19 PM.",
        type: 'flight'
      }
    ]
  }
];

export const FLIGHT_DETAILS = {
  outbound: {
    number: "PD 641",
    from: "YYZ (09:30 AM)",
    to: "PHX (11:04 AM)",
    date: "May 14, 2026"
  },
  return: {
    number: "PD 642",
    from: "PHX (12:05 PM)",
    to: "YYZ (07:19 PM)",
    date: "May 19, 2026"
  }
};

export const RENTAL_DETAILS = {
  company: "Alamo",
  car: "Hyundai Kona (Compact SUV)",
  pickup: "May 14, 12:00 PM @ PHX",
  dropoff: "May 19, 12:00 PM @ PHX",
  phone: "844-370-9817"
};
