/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  Info, 
  Plane, 
  Car, 
  MapPin, 
  ChevronRight, 
  Sun, 
  Moon, 
  Dog,
  ArrowRight,
  Clock,
  ExternalLink,
  Edit2,
  Plus,
  Trash2,
  Save,
  X,
  LogIn,
  Bus,
  Sparkles,
  Send,
  Loader2,
  Search,
  Eye,
  EyeOff,
  Utensils,
  LogOut,
  ChevronDown,
  Briefcase,
  Undo,
  Check,
  Wand2,
  MessageSquare,
  MapIcon,
  Navigation
} from 'lucide-react';
import { 
  ITINERARY_DATA, 
  FLIGHT_DETAILS, 
  RENTAL_DETAILS, 
  GAS_STATIONS, 
  DayPlan, 
  TripEvent,
  TripCategory,
  Location
} from './constants';
import { cn } from './lib/utils';
import { db, auth } from './firebase';
import { doc, onSnapshot, setDoc, getDoc, collection } from 'firebase/firestore';
import { 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User,
  signOut
} from 'firebase/auth';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { geminiService, GeminiProposal } from './services/geminiService';
import { Fuel, Share2, Info as InfoIcon } from 'lucide-react';

// Fix Leaflet icon issues
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // We don't necessarily want to crash the whole app for a background sync error, 
  // but we should log it clearly as requested.
}

// --- Components ---

const getAppleMapsUrl = (loc: Location) => 
  `http://maps.apple.com/?q=${encodeURIComponent(loc.name)}&ll=${loc.lat},${loc.lng}`;

const getGoogleMapsUrl = (loc: Location) => 
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.name)}`;

const getDayRouteUrl = (events: TripEvent[], provider: 'apple' | 'google') => {
  // Collect all unique locations for the day (excluding flights and hidden events)
  const locations = events
    .filter(e => e.category !== 'flight' && !e.hidden)
    .flatMap(e => {
      if (e.type === 'travel') return [e.origin, e.destination];
      return [e.location];
    })
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
    let url = `http://maps.apple.com/?saddr=${origin.lat},${origin.lng}&daddr=${destination.lat},${destination.lng}&dirflg=d`;
    if (waypoints.length > 0) {
      url += `&to=${waypoints.map(w => `${w.lat},${w.lng}`).join("&to=")}`;
    }
    return url;
  } else {
    const waypointsStr = waypoints.map(w => encodeURIComponent(w.name)).join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin.name)}&destination=${encodeURIComponent(destination.name)}${waypointsStr ? `&waypoints=${waypointsStr}` : ''}&travelmode=driving`;
  }
};

// Helper to update map view when center changes
const ChangeView = ({ center, zoom }: { center: [number, number], zoom: number }) => {
  const map = useMap();
  map.setView(center, zoom);
  return null;
};

const GasPricesView = ({ userLoc }: { userLoc: [number, number] | null }) => {
  const [selectedStation, setSelectedStation] = useState<any>(null);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 3958.8; // Miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const sortedStations = useMemo(() => {
    if (!userLoc) return GAS_STATIONS;
    return [...GAS_STATIONS].sort((a, b) => {
      const distA = calculateDistance(userLoc[0], userLoc[1], a.lat, a.lng);
      const distB = calculateDistance(userLoc[0], userLoc[1], b.lat, b.lng);
      return distA - distB;
    });
  }, [userLoc]);

  const mapCenter: [number, number] = userLoc || [34.0489, -111.0937];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="p-4 bg-white border-b border-slate-200 shrink-0">
        <h2 className="text-xl font-bold text-slate-900">Gas Stations</h2>
        <p className="text-sm text-slate-500">Sorted by proximity to you</p>
      </div>
      
      <div className="h-[30vh] shrink-0 relative z-0">
        <MapContainer center={mapCenter} zoom={7} className="w-full h-full" zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {userLoc && <ChangeView center={userLoc} zoom={10} />}
          {GAS_STATIONS.map((station, i) => (
            <Marker 
              key={i} 
              position={[station.lat, station.lng]}
              eventHandlers={{ click: () => setSelectedStation(station) }}
            >
              <Popup>
                <div className="p-1">
                  <p className="text-sm font-bold">{station.name}</p>
                  <p className="text-xs text-blue-600 font-bold">{station.regular}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto pb-32">
        <div className="grid gap-3">
          {sortedStations.map((item, i) => {
            const dist = userLoc ? calculateDistance(userLoc[0], userLoc[1], item.lat, item.lng).toFixed(1) : null;
            return (
              <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.brand}</p>
                    {dist && <span className="text-[10px] font-bold text-blue-600 uppercase">{dist} mi away</span>}
                  </div>
                  <p className="font-bold text-slate-800">{item.name}</p>
                  <p className="text-[10px] text-slate-400">{item.address}</p>
                </div>
                <div className="text-right flex flex-col gap-2">
                  <p className="text-lg font-black text-slate-900">{item.regular}</p>
                  <div className="flex gap-1">
                    <a href={getAppleMapsUrl(item)} target="_blank" rel="noreferrer" className="p-1.5 bg-slate-100 rounded-lg text-slate-600"><Navigation className="w-3 h-3" /></a>
                    <a href={getGoogleMapsUrl(item)} target="_blank" rel="noreferrer" className="p-1.5 bg-slate-100 rounded-lg text-slate-600"><MapIcon className="w-3 h-3" /></a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const EventIcon = ({ category }: { category: TripCategory }) => {
  switch (category) {
    case 'flight': return <Plane className="w-4 h-4" />;
    case 'drive': return <Car className="w-4 h-4" />;
    case 'stay': return <Moon className="w-4 h-4" />;
    case 'food': return <Utensils className="w-4 h-4" />;
    case 'walk': return <MapPin className="w-4 h-4" />;
    case 'transit': return <Bus className="w-4 h-4" />;
    default: return <Sun className="w-4 h-4" />;
  }
};

const EditActivityModal = ({ 
  activity, 
  onSave, 
  onClose,
  onDelete
}: { 
  activity: Partial<TripEvent>; 
  onSave: (updated: TripEvent) => void; 
  onClose: () => void;
  onDelete?: () => void;
}) => {
  const [edited, setEdited] = useState<Partial<TripEvent>>({ ...activity });

  const handleLocationChange = (field: keyof Location, value: string | number) => {
    const currentLoc = edited.location || { name: '', lat: 0, lng: 0 };
    setEdited({
      ...edited,
      location: {
        ...currentLoc,
        [field]: field === 'lat' || field === 'lng' ? parseFloat(value as string) || 0 : value
      }
    });
  };

  const handleTravelLocationChange = (type: 'origin' | 'destination', field: keyof Location, value: string | number) => {
    const currentLoc = edited[type] || { name: '', lat: 0, lng: 0 };
    setEdited({
      ...edited,
      [type]: {
        ...currentLoc,
        [field]: field === 'lat' || field === 'lng' ? parseFloat(value as string) || 0 : value
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4">
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-900">{onDelete ? 'Edit Event' : 'Add Event'}</h3>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase">Title</label>
            <input 
              type="text" 
              value={edited.title || ''}
              onChange={e => setEdited({ ...edited, title: e.target.value })}
              className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {edited.type === 'activity' ? (
            <div className="space-y-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Location Details</p>
              <div>
                <input 
                  type="text" 
                  placeholder="Location Name"
                  value={edited.location?.name || ''}
                  onChange={e => handleLocationChange('name', e.target.value)}
                  className="w-full p-2 bg-white rounded-lg border border-slate-100 text-sm outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input 
                  type="number" 
                  placeholder="Latitude"
                  value={edited.location?.lat || ''}
                  onChange={e => handleLocationChange('lat', e.target.value)}
                  className="w-full p-2 bg-white rounded-lg border border-slate-100 text-sm outline-none"
                />
                <input 
                  type="number" 
                  placeholder="Longitude"
                  value={edited.location?.lng || ''}
                  onChange={e => handleLocationChange('lng', e.target.value)}
                  className="w-full p-2 bg-white rounded-lg border border-slate-100 text-sm outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Origin</p>
                <input 
                  type="text" 
                  placeholder="Name"
                  value={edited.origin?.name || ''}
                  onChange={e => handleTravelLocationChange('origin', 'name', e.target.value)}
                  className="w-full p-2 bg-white rounded-lg border border-slate-100 text-sm outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input 
                    type="number" 
                    placeholder="Lat"
                    value={edited.origin?.lat || ''}
                    onChange={e => handleTravelLocationChange('origin', 'lat', e.target.value)}
                    className="w-full p-2 bg-white rounded-lg border border-slate-100 text-sm outline-none"
                  />
                  <input 
                    type="number" 
                    placeholder="Lng"
                    value={edited.origin?.lng || ''}
                    onChange={e => handleTravelLocationChange('origin', 'lng', e.target.value)}
                    className="w-full p-2 bg-white rounded-lg border border-slate-100 text-sm outline-none"
                  />
                </div>
              </div>
              <div className="space-y-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Destination</p>
                <input 
                  type="text" 
                  placeholder="Name"
                  value={edited.destination?.name || ''}
                  onChange={e => handleTravelLocationChange('destination', 'name', e.target.value)}
                  className="w-full p-2 bg-white rounded-lg border border-slate-100 text-sm outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input 
                    type="number" 
                    placeholder="Lat"
                    value={edited.destination?.lat || ''}
                    onChange={e => handleTravelLocationChange('destination', 'lat', e.target.value)}
                    className="w-full p-2 bg-white rounded-lg border border-slate-100 text-sm outline-none"
                  />
                  <input 
                    type="number" 
                    placeholder="Lng"
                    value={edited.destination?.lng || ''}
                    onChange={e => handleTravelLocationChange('destination', 'lng', e.target.value)}
                    className="w-full p-2 bg-white rounded-lg border border-slate-100 text-sm outline-none"
                  />
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Start Time</label>
              <input 
                type="text" 
                value={edited.startTime || ''}
                onChange={e => setEdited({ ...edited, startTime: e.target.value })}
                placeholder="e.g. 09:30 AM"
                className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">End Time</label>
              <input 
                type="text" 
                value={edited.endTime || ''}
                onChange={e => setEdited({ ...edited, endTime: e.target.value })}
                placeholder="e.g. 11:00 AM"
                className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Type</label>
              <select 
                value={edited.type}
                onChange={e => setEdited({ ...edited, type: e.target.value as any })}
                className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="activity">Activity</option>
                <option value="travel">Travel</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Category</label>
              <select 
                value={edited.category}
                onChange={e => setEdited({ ...edited, category: e.target.value as any })}
                className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="activity">Activity</option>
                <option value="drive">Drive</option>
                <option value="flight">Flight</option>
                <option value="stay">Stay</option>
                <option value="food">Food</option>
                <option value="walk">Walk</option>
                <option value="transit">Transit</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Status</label>
              <button
                onClick={() => setEdited({ ...edited, hidden: !edited.hidden })}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border transition-all font-bold text-xs",
                  edited.hidden 
                    ? "bg-red-50 border-red-100 text-red-600" 
                    : "bg-emerald-50 border-emerald-100 text-emerald-600"
                )}
              >
                {edited.hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {edited.hidden ? "Cancelled" : "Active"}
              </button>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase">Description</label>
            <textarea 
              value={edited.description || ''}
              onChange={e => setEdited({ ...edited, description: e.target.value })}
              className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none h-24"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          {onDelete && (
            <button 
              onClick={onDelete}
              className="flex-1 py-4 bg-red-50 text-red-600 rounded-2xl font-bold flex items-center justify-center gap-2"
            >
              <Trash2 className="w-5 h-5" /> Delete
            </button>
          )}
          <button 
            onClick={() => onSave(edited as TripEvent)}
            className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
          >
            <Save className="w-5 h-5" /> Save Changes
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'itinerary' | 'gas' | 'info'>('itinerary');
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [itinerary, setItinerary] = useState<DayPlan[]>(ITINERARY_DATA);
  const [user, setUser] = useState<User | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingActivity, setEditingActivity] = useState<{ dayIdx: number, actIdx: number | null } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [view, setView] = useState<'itinerary' | 'list'>('itinerary');
  const [currentTripId, setCurrentTripId] = useState<string>('main');
  const [tripsList, setTripsList] = useState<{id: string, title: string, date: string}[]>([]);
  const [tripTitle, setTripTitle] = useState('Arizona 2026');
  const [tripDates, setTripDates] = useState('May 14 - May 21');
  const [itineraryHistory, setItineraryHistory] = useState<DayPlan[][]>([]);
  const [aiProposal, setAiProposal] = useState<GeminiProposal | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  const isAdmin = useMemo(() => {
    const admins = ['ianyy93@gmail.com', 'wingin.carrie@gmail.com'];
    return user && admins.includes(user.email || '');
  }, [user]);
  
  const handleUndo = () => {
    if (itineraryHistory.length === 0) return;
    const previous = itineraryHistory[itineraryHistory.length - 1];
    setItinerary(previous);
    setItineraryHistory(prev => prev.slice(0, -1));
    saveToFirestore(previous);
  };

  const handleAiAction = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiLoading(true);
    try {
      const pastTripsSummary = tripsList.map(t => `${t.title} (${t.date})`).join(', ');
      const proposal = await geminiService.proposeChanges(itinerary, aiPrompt, pastTripsSummary);
      setAiProposal(proposal);
      setAiPrompt('');
    } catch (err) {
      console.error(err);
      alert("AI Assistant failed to generate a proposal. Please try again.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const applyAiProposal = () => {
    if (!aiProposal) return;
    setItineraryHistory(prev => [...prev, itinerary]);
    setItinerary(aiProposal.itinerary);
    saveToFirestore(aiProposal.itinerary);
    setAiProposal(null);
    setShowAiAssistant(false);
  };

  const saveToFirestore = async (data: DayPlan[], title?: string, dates?: string) => {
    if (!auth.currentUser) return;
    if (!isAdmin) {
      console.error("Unauthorized: You do not have permission to save changes.");
      return;
    }
    const path = `trips/${currentTripId}`;
    const tripDoc = doc(db, 'trips', currentTripId);
    try {
      await setDoc(tripDoc, { 
        days: data,
        title: title || tripTitle,
        dates: dates || tripDates,
        lastUpdated: new Date().toISOString(),
        updatedBy: auth.currentUser.email
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleSelectSuggestion = (dayId: number, eventId: string, suggestion: Location) => {
    const newItinerary = itinerary.map(day => {
      if (day.id !== dayId) return day;
      
      const newEvents = day.events.map((event, idx) => {
        if (event.id === eventId) {
          const isSelected = event.location?.name === suggestion.name;
          return { ...event, location: isSelected ? undefined : suggestion };
        }
        const prevEvent = day.events[idx - 1];
        if (prevEvent && prevEvent.id === eventId && event.type === 'travel') {
          const isSelected = prevEvent.location?.name === suggestion.name;
          if (isSelected) {
            let lastLoc: Location | undefined;
            for (let i = idx - 2; i >= 0; i--) {
              const e = day.events[i];
              if (e.location) { lastLoc = e.location; break; }
              if (e.destination) { lastLoc = e.destination; break; }
            }
            return { ...event, origin: lastLoc };
          }
          return { ...event, origin: suggestion };
        }
        return event;
      });

      return { ...day, events: newEvents };
    });
    setItinerary(newItinerary);
    saveToFirestore(newItinerary);
  };

  const handleAddManualSuggestion = (dayId: number, eventId: string) => {
    const url = window.prompt("Paste Google Maps link (or enter name):");
    if (!url) return;

    let name = url;
    let lat = 0;
    let lng = 0;

    // Try to parse coordinates from URL
    // Format 1: @lat,lng
    const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    // Format 2: !3dlat!4dlng
    const bangMatch = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);

    if (atMatch) {
      lat = parseFloat(atMatch[1]);
      lng = parseFloat(atMatch[2]);
    } else if (bangMatch) {
      lat = parseFloat(bangMatch[1]);
      lng = parseFloat(bangMatch[2]);
    }

    // Try to parse name from URL (usually after /place/ and before /@)
    const nameMatch = url.match(/\/place\/([^/]+)/);
    if (nameMatch) {
      name = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
    }

    if (lat === 0 && lng === 0) {
      // Fallback if no coordinates found in URL
      const manualName = window.prompt("Could not find coordinates in link. Enter name manually:", name);
      if (!manualName) return;
      name = manualName;
      lat = parseFloat(window.prompt("Enter latitude:") || "0");
      lng = parseFloat(window.prompt("Enter longitude:") || "0");
    }

    const description = "Added via Google Maps link";
    const newSuggestion: Location = { name, lat, lng, description };

    const updatedItinerary = itinerary.map(day => {
      if (day.id !== dayId) return day;
      return {
        ...day,
        events: day.events.map(e => {
          if (e.id === eventId) {
            return { ...e, suggestions: [...(e.suggestions || []), newSuggestion] };
          }
          return e;
        })
      };
    });

    setItinerary(updatedItinerary);
    // We'll trigger the selection after state update or just do it here
    // To be safe and simple, let's just update the specific event in the new array
    const finalItinerary = updatedItinerary.map(day => {
      if (day.id !== dayId) return day;
      return {
        ...day,
        events: day.events.map(e => {
          if (e.id === eventId) {
            return { ...e, location: newSuggestion };
          }
          return e;
        })
      };
    });
    setItinerary(finalItinerary);
    saveToFirestore(finalItinerary);
  };

  const handleToggleHide = (dayIdx: number, eventId: string) => {
    const newItinerary = itinerary.map((day, dIdx) => {
      if (dIdx !== dayIdx) return day;
      
      const newEvents = day.events.map((event) => {
        if (event.id === eventId) {
          return { ...event, hidden: !event.hidden };
        }
        return event;
      });

      // Update travel events to skip hidden activities
      const fixedEvents = newEvents.map((event, idx) => {
        if (event.type !== 'travel') return event;

        let newOrigin = event.origin;
        let newDestination = event.destination;

        // If the activity this travel leads to is hidden, find the next visible one
        const nextEvent = newEvents[idx + 1];
        if (nextEvent && nextEvent.hidden) {
          for (let i = idx + 1; i < newEvents.length; i++) {
            const e = newEvents[i];
            if (!e.hidden) {
              if (e.location) { newDestination = e.location; break; }
              if (e.origin) { newDestination = e.origin; break; }
            }
          }
        }

        // If the activity this travel comes from is hidden, find the previous visible one
        const prevEvent = newEvents[idx - 1];
        if (prevEvent && prevEvent.hidden) {
          for (let i = idx - 1; i >= 0; i--) {
            const e = newEvents[i];
            if (!e.hidden) {
              if (e.location) { newOrigin = e.location; break; }
              if (e.destination) { newOrigin = e.destination; break; }
            }
          }
        }

        // If either the origin or destination activity is hidden and we couldn't find a replacement,
        // or if this travel event itself is now redundant, we might want to hide it.
        // For now, we just update the coordinates.
        return { ...event, origin: newOrigin, destination: newDestination };
      });

      return { ...day, events: fixedEvents };
    });
    setItinerary(newItinerary);
    saveToFirestore(newItinerary);
  };

  // Update current time for position indicator
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Get user location
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLoc([pos.coords.latitude, pos.coords.longitude]),
      (err) => console.error("Geolocation failed", err)
    );
  }, []);

  // Auth & Sync
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => setUser(u));
    
    // Handle redirect result
    getRedirectResult(auth).catch((err) => {
      console.error("Redirect login failed", err);
      setLoginError("Redirect login failed: " + err.message);
    });

    const path = `trips/${currentTripId}`;
    const tripDoc = doc(db, 'trips', currentTripId);
    
    const unsubscribeSync = onSnapshot(tripDoc, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setItinerary(data.days);
        setTripTitle(data.title || 'Arizona 2026');
        setTripDates(data.dates || 'May 14 - May 21');
      } else if (currentTripId === 'main') {
        // Only initialize if we have a user and they are an admin
        if (auth.currentUser && isAdmin) {
          setDoc(tripDoc, { 
            days: ITINERARY_DATA,
            title: 'Arizona 2026',
            dates: 'May 14 - May 21',
            lastUpdated: new Date().toISOString(),
            updatedBy: auth.currentUser.email
          }).catch(err => handleFirestoreError(err, OperationType.WRITE, path));
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeSync();
    };
  }, [currentTripId, isAdmin]);

  // Fetch all trips
  useEffect(() => {
    if (!user) return;
    
    const tripsCollection = collection(db, 'trips');
    const unsubscribe = onSnapshot(tripsCollection, (snapshot) => {
      const trips = snapshot.docs.map(doc => ({
        id: doc.id,
        title: doc.data().title || doc.data().days?.[0]?.title || 'Untitled Trip',
        date: doc.data().dates || doc.data().days?.[0]?.date || 'No Date'
      }));
      setTripsList(trips);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async (method: 'popup' | 'redirect' = 'popup') => {
    setLoginError(null);
    console.log(`Attempting ${method} login...`);
    const provider = new GoogleAuthProvider();
    
    // Force select account to help with "invalid action" errors
    provider.setCustomParameters({
      prompt: 'select_account'
    });

    try {
      if (method === 'popup') {
        await signInWithPopup(auth, provider);
      } else {
        // Redirect login is often blocked in iframes. 
        // We warn the user if they are in an iframe.
        if (window.self !== window.top) {
          setLoginError("Redirect login cannot work inside this preview. Please use 'Open in New Tab' first.");
          return;
        }
        await signInWithRedirect(auth, provider);
      }
    } catch (err: any) {
      console.error("Login failed", err);
      
      if (err.code === 'auth/popup-closed-by-user') {
        return;
      }

      let message = `Login failed (${err.code}). `;
      if (err.code === 'auth/operation-not-allowed') {
        message += "Google login is not enabled in Firebase Console.";
      } else if (err.code === 'auth/unauthorized-domain') {
        message += `Domain "${window.location.hostname}" is not authorized. Check Firebase Console > Auth > Settings.`;
      } else if (err.code === 'auth/invalid-api-key') {
        message += "Invalid Firebase API key.";
      } else {
        message += err.message;
      }
      
      setLoginError(message);
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setShowUserMenu(false);
      setIsEditing(false);
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  const handleUpdateActivity = (updated: TripEvent) => {
    if (!editingActivity) return;
    const isAdmin = user?.email === 'ianyy93@gmail.com';
    if (!isAdmin) {
      setLoginError("You do not have permission to edit this itinerary.");
      setEditingActivity(null);
      return;
    }
    const { dayIdx, actIdx } = editingActivity;
    const newItinerary = [...itinerary];
    if (actIdx === null) {
      newItinerary[dayIdx].events.push({ ...updated, id: Math.random().toString(36).substr(2, 9) });
    } else {
      newItinerary[dayIdx].events[actIdx] = updated;
    }
    setItinerary(newItinerary);
    saveToFirestore(newItinerary);
    setEditingActivity(null);
  };

  const handleDeleteActivity = () => {
    if (!editingActivity || editingActivity.actIdx === null) return;
    const isAdmin = user?.email === 'ianyy93@gmail.com';
    if (!isAdmin) {
      setLoginError("You do not have permission to edit this itinerary.");
      setEditingActivity(null);
      return;
    }
    const { dayIdx, actIdx } = editingActivity;
    const newItinerary = [...itinerary];
    newItinerary[dayIdx].events.splice(actIdx, 1);
    setItinerary(newItinerary);
    saveToFirestore(newItinerary);
    setEditingActivity(null);
  };

  const activeDay = itinerary[activeDayIdx];

  // Check if an event is "current"
  const isCurrentEvent = (event: TripEvent) => {
    if (!event.startTime) return false;
    
    const tripYear = 2026;
    const tripMonth = 4; // May (0-indexed is 4)
    const day = parseInt(activeDay.date.split(' ')[1]);
    
    // Check if it's the right day
    if (currentTime.getFullYear() !== tripYear || currentTime.getMonth() !== tripMonth || currentTime.getDate() !== day) {
      return false;
    }

    const parseTime = (timeStr: string) => {
      const [time, modifier] = timeStr.split(' ');
      let [hours, minutes] = time.split(':').map(Number);
      if (modifier === 'PM' && hours < 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;
      const d = new Date(currentTime);
      d.setHours(hours, minutes, 0, 0);
      return d;
    };

    try {
      const start = parseTime(event.startTime);
      const now = currentTime;
      
      if (event.endTime) {
        const end = parseTime(event.endTime);
        return now >= start && now <= end;
      } else {
        // If no end time, assume it's current for 1 hour
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        return now >= start && now <= end;
      }
    } catch (e) {
      return false;
    }
  };

  return (
    <div className="max-w-md mx-auto h-[100dvh] bg-slate-50 flex flex-col font-sans shadow-2xl overflow-hidden relative">
      {/* AI Assistant Panel */}
      <AnimatePresence>
        {showAiAssistant && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-4 right-4 bg-white rounded-3xl shadow-2xl border border-slate-100 z-50 overflow-hidden flex flex-col max-h-[60vh]"
          >
            <div className="p-4 bg-blue-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                <span className="font-bold">Magic Itinerary Assistant</span>
              </div>
              <button onClick={() => setShowAiAssistant(false)} className="p-1 hover:bg-blue-500 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {aiProposal ? (
                <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                  <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                    <Wand2 className="w-4 h-4" />
                    Proposed Changes
                  </h3>
                  <p className="text-sm text-blue-800 mb-4 italic">"{aiProposal.explanation}"</p>
                  <div className="flex gap-2">
                    <button 
                      onClick={applyAiProposal}
                      className="flex-1 bg-blue-600 text-white py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors"
                    >
                      <Check className="w-4 h-4" /> Apply
                    </button>
                    <button 
                      onClick={() => setAiProposal(null)}
                      className="flex-1 bg-white text-slate-600 py-2 rounded-xl font-bold border border-slate-200 flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
                    >
                      <X className="w-4 h-4" /> Discard
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <MessageSquare className="w-6 h-6 text-blue-600" />
                  </div>
                  <p className="text-sm text-slate-500">
                    Tell me what you want to change. I can add activities, optimize routes, or build a plan from scratch!
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <div className="relative">
                <textarea 
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g., 'Add a nice dinner spot on Day 1' or 'Make Day 2 more relaxing'"
                  className="w-full bg-white border border-slate-200 rounded-2xl p-3 pr-12 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none h-20"
                  disabled={isAiLoading}
                />
                <button 
                  onClick={handleAiAction}
                  disabled={isAiLoading || !aiPrompt.trim()}
                  className="absolute right-2 bottom-2 p-2 bg-blue-600 text-white rounded-xl disabled:opacity-50 disabled:bg-slate-400 transition-all hover:scale-105 active:scale-95"
                >
                  {isAiLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="px-6 pt-6 pb-4 bg-white border-b border-slate-100 shrink-0 z-40">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {view === 'list' ? 'My Trips' : (
              isEditing ? (
                <input 
                  type="text"
                  value={tripTitle}
                  onChange={(e) => {
                    setTripTitle(e.target.value);
                    saveToFirestore(itinerary, e.target.value, tripDates);
                  }}
                  className="bg-transparent border-none p-0 focus:ring-0 w-full"
                />
              ) : tripTitle
            )}
          </h1>
          <div className="flex items-center gap-2">
            {view === 'itinerary' && isAdmin && (
              <button 
                onClick={() => setShowAiAssistant(!showAiAssistant)}
                className={cn(
                  "p-2 rounded-full transition-all",
                  showAiAssistant ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600"
                )}
                title="AI Assistant"
              >
                <Sparkles className="w-5 h-5" />
              </button>
            )}
            {itineraryHistory.length > 0 && view === 'itinerary' && isAdmin && (
              <button 
                onClick={handleUndo}
                className="p-2 bg-slate-100 rounded-full text-slate-600 hover:bg-orange-50 hover:text-orange-600 transition-all"
                title="Undo last change"
              >
                <Undo className="w-5 h-5" />
              </button>
            )}
            {user ? (
              <div className="relative">
                <button 
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 p-1 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"
                >
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt={user.displayName || 'User'} 
                      className="w-7 h-7 rounded-full border border-white"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                      {user.email?.[0].toUpperCase()}
                    </div>
                  )}
                  <ChevronDown className={cn("w-3 h-3 text-slate-400 transition-transform", showUserMenu && "rotate-180")} />
                </button>

                <AnimatePresence>
                  {showUserMenu && (
                    <>
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowUserMenu(false)} 
                      />
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-50 overflow-hidden"
                      >
                        <div className="px-4 py-2 border-b border-slate-50 mb-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Account</p>
                          <p className="text-xs font-bold text-slate-700 truncate">{user.email}</p>
                        </div>
                        
                        {isAdmin && (
                          <button 
                            onClick={() => {
                              setIsEditing(!isEditing);
                              setShowUserMenu(false);
                            }}
                            className={cn(
                              "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
                              isEditing ? "text-blue-600 bg-blue-50" : "text-slate-600 hover:bg-slate-50"
                            )}
                          >
                            <Edit2 className="w-4 h-4" />
                            {isEditing ? "Stop Editing" : "Enable Editing"}
                          </button>
                        )}

                        <button 
                          onClick={() => {
                            setView(view === 'list' ? 'itinerary' : 'list');
                            setShowUserMenu(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
                            view === 'list' ? "text-blue-600 bg-blue-50" : "text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          <Briefcase className="w-4 h-4" />
                          {view === 'list' ? "Back to Itinerary" : "View all my trips"}
                        </button>

                        <button 
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors border-t border-slate-50 mt-1"
                        >
                          <LogOut className="w-4 h-4" />
                          Log off
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button onClick={() => handleLogin()} className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors">
                <LogIn className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        
        {loginError && (
          <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-xl flex flex-col gap-2 text-red-600 text-[10px] font-medium">
            <div className="flex items-center gap-2">
              <Info className="w-3 h-3 shrink-0" />
              <div className="flex-1">
                {loginError}
                <div className="mt-1 opacity-60 font-mono text-[8px]">
                  Current Domain: {window.location.hostname}
                </div>
              </div>
              <button onClick={() => setLoginError(null)} className="p-1 hover:bg-red-100 rounded">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex gap-2 mt-1">
              <button 
                onClick={() => handleLogin('redirect')}
                className="flex-1 py-1.5 bg-red-600 text-white rounded-lg font-black uppercase tracking-tighter shadow-sm active:scale-95 transition-transform"
              >
                Try Redirect Login
              </button>
              <a 
                href={window.location.href}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg font-black uppercase tracking-tighter text-center shadow-sm active:scale-95 transition-transform"
              >
                Open in Browser
              </a>
            </div>
          </div>
        )}
        {view === 'itinerary' && (
          <div className="mt-1">
            {isEditing ? (
              <input 
                type="text"
                value={tripDates}
                onChange={(e) => {
                  setTripDates(e.target.value);
                  saveToFirestore(itinerary, tripTitle, e.target.value);
                }}
                className="text-xs font-bold text-blue-600 bg-transparent border-none p-0 focus:ring-0 w-full"
              />
            ) : (
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">{tripDates}</p>
            )}
          </div>
        )}
      </header>

      {view === 'list' ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-wider">Your Adventures</h2>
            {isAdmin && (
              <button 
                onClick={() => {
                  const id = prompt("Enter a unique ID for the new trip (e.g. japan-2027):");
                  if (id) {
                    setCurrentTripId(id);
                    setView('itinerary');
                  }
                }}
                className="p-2 bg-blue-600 text-white rounded-full shadow-lg"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
          
          {tripsList.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 border-dashed">
              <p className="text-slate-400 text-sm">No trips found. Create your first one!</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {tripsList.map(trip => (
                <button
                  key={trip.id}
                  onClick={() => {
                    setCurrentTripId(trip.id);
                    setView('itinerary');
                  }}
                  className={cn(
                    "w-full text-left p-5 rounded-3xl border transition-all group",
                    currentTripId === trip.id 
                      ? "bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-100" 
                      : "bg-white border-slate-100 hover:border-blue-200 text-slate-900"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={cn(
                        "text-[10px] font-black uppercase tracking-tighter mb-1",
                        currentTripId === trip.id ? "text-blue-200" : "text-slate-400"
                      )}>
                        {trip.date}
                      </p>
                      <h3 className="text-lg font-black tracking-tight leading-tight">{trip.title}</h3>
                    </div>
                    <ChevronRight className={cn(
                      "w-5 h-5 transition-transform group-hover:translate-x-1",
                      currentTripId === trip.id ? "text-blue-200" : "text-slate-300"
                    )} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Day Tabs */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide py-2 px-6">
          {itinerary.map((day, i) => (
            <button
              key={i}
              onClick={() => setActiveDayIdx(i)}
              className={cn(
                "flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all",
                activeDayIdx === i 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-200 scale-105" 
                  : "bg-slate-100 text-slate-500"
              )}
            >
              {day.date}
            </button>
          ))}
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto scrollbar-hide">
        <AnimatePresence mode="wait">
          {activeTab === 'itinerary' && (
            <motion.div 
              key={`day-${activeDayIdx}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6 pb-32"
            >
              <div className="mb-6 flex justify-between items-start">
                <div>
                  {isEditing ? (
                    <input 
                      type="text"
                      value={activeDay.title}
                      onChange={(e) => {
                        const newItinerary = [...itinerary];
                        newItinerary[activeDayIdx].title = e.target.value;
                        setItinerary(newItinerary);
                        saveToFirestore(newItinerary);
                      }}
                      className="text-xl font-bold text-slate-900 bg-transparent border-none p-0 focus:ring-0 w-full"
                    />
                  ) : (
                    <h2 className="text-xl font-bold text-slate-900">{activeDay.title}</h2>
                  )}
                  {isEditing ? (
                    <input 
                      type="text"
                      value={activeDay.date}
                      onChange={(e) => {
                        const newItinerary = [...itinerary];
                        newItinerary[activeDayIdx].date = e.target.value;
                        setItinerary(newItinerary);
                        saveToFirestore(newItinerary);
                      }}
                      className="text-sm text-slate-500 bg-transparent border-none p-0 focus:ring-0 w-full"
                    />
                  ) : (
                    <p className="text-sm text-slate-500">Day {activeDayIdx + 1} • {activeDay.date}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <a 
                    href={getDayRouteUrl(activeDay.events, 'apple') || '#'} 
                    target="_blank" 
                    rel="noreferrer"
                    className="p-2 bg-slate-100 rounded-xl text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    title="Apple Maps Route"
                  >
                    <Navigation className="w-4 h-4" />
                  </a>
                  <a 
                    href={getDayRouteUrl(activeDay.events, 'google') || '#'} 
                    target="_blank" 
                    rel="noreferrer"
                    className="p-2 bg-slate-100 rounded-xl text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    title="Google Maps Route"
                  >
                    <MapIcon className="w-4 h-4" />
                  </a>
                </div>
              </div>

              <div className="relative">
                {/* Timeline Line */}
                <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-slate-100" />

                <div className="space-y-4">
                  {activeDay.events.map((event, idx) => {
                    const isCurrent = isCurrentEvent(event);
                    
                    if (event.type === 'travel') {
                      if (event.hidden) return null;
                      return (
                        <div key={event.id} className="relative pl-10 py-2">
                          <div className={cn(
                            "absolute left-0 top-1/2 -translate-y-1/2 w-10 flex justify-center z-10 transition-all",
                            isCurrent && "scale-110"
                          )}>
                            <div className={cn(
                              "p-1 rounded-full border transition-all",
                              isCurrent ? "bg-blue-600 border-blue-400 shadow-lg shadow-blue-100" : "bg-slate-50 border-slate-100"
                            )}>
                              <div className={isCurrent ? "text-white" : "text-slate-400"}>
                                <EventIcon category={event.category} />
                              </div>
                            </div>
                          </div>
                          <div className={cn(
                            "flex items-center justify-between rounded-xl p-3 border border-dashed transition-all",
                            isCurrent ? "bg-blue-50/50 border-blue-200 ring-1 ring-blue-100" : "bg-slate-50/50 border-slate-200"
                          )}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  <span>{event.origin?.name}</span>
                                  <ArrowRight className="w-3 h-3" />
                                  <span>{event.destination?.name}</span>
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                  <h5 className="text-xs font-bold text-slate-600">{event.title}</h5>
                                  {(event.startTime || event.endTime) && (
                                    <span className="text-[9px] font-medium text-slate-400 flex items-center gap-1">
                                      <Clock className="w-2.5 h-2.5" />
                                      {event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}
                                    </span>
                                  )}
                                </div>
                                {event.description && (
                                  <p className="text-[10px] text-slate-400 mt-0.5">
                                    {event.description.split(/(https?:\/\/[^\s]+)/g).map((part, i) => 
                                      part.match(/^https?:\/\//) ? (
                                        <a key={i} href={part} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                                          {part}
                                        </a>
                                      ) : part
                                    )}
                                  </p>
                                )}
                              </div>
                            {event.origin && event.destination && (
                              <div className="flex gap-1 ml-2">
                                <a 
                                  href={(() => {
                                    const mode = event.category === 'walk' ? 'w' : event.category === 'transit' ? 'r' : 'd';
                                    let url = `http://maps.apple.com/?saddr=${event.origin.lat},${event.origin.lng}&daddr=${event.destination.lat},${event.destination.lng}&dirflg=${mode}`;
                                    if (event.waypoints && event.waypoints.length > 0) {
                                      url += `&to=${event.waypoints.map(w => `${w.lat},${w.lng}`).join("&to=")}`;
                                    }
                                    return url;
                                  })()}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 bg-white rounded-lg text-slate-400 hover:text-blue-600 border border-slate-100 shadow-sm"
                                  title="Apple Maps Directions"
                                >
                                  <Navigation className="w-3 h-3" />
                                </a>
                                <a 
                                  href={(() => {
                                    const mode = event.category === 'walk' ? 'walking' : event.category === 'transit' ? 'transit' : 'driving';
                                    const waypointsStr = event.waypoints?.map(w => encodeURIComponent(w.name)).join('|');
                                    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(event.origin.name)}&destination=${encodeURIComponent(event.destination.name)}${waypointsStr ? `&waypoints=${waypointsStr}` : ''}&travelmode=${mode}`;
                                  })()}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 bg-white rounded-lg text-slate-400 hover:text-blue-600 border border-slate-100 shadow-sm"
                                  title="Google Maps Directions"
                                >
                                  <MapIcon className="w-3 h-3" />
                                </a>
                              </div>
                            )}
                          </div>
                          {isEditing && user?.email === 'ianyy93@gmail.com' && (
                            <button 
                              onClick={() => setEditingActivity({ dayIdx: activeDayIdx, actIdx: idx })}
                              className="absolute -top-1 -right-1 p-1.5 bg-blue-600 text-white rounded-full shadow-lg z-20"
                            >
                              <Edit2 className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div key={event.id} className="relative pl-10 group">
                        {/* Timeline Dot */}
                        <div className={cn(
                          "absolute left-0 top-5 w-10 h-10 -ml-[1px] rounded-full border-4 border-white z-10 flex items-center justify-center transition-all",
                          isCurrent ? "bg-blue-600 scale-110 shadow-lg shadow-blue-100" : "bg-slate-200"
                        )}>
                          <div className={cn("w-2 h-2 rounded-full", isCurrent ? "bg-white" : "bg-slate-400")} />
                        </div>

                        {/* Current Indicator Label */}
                        {isCurrent && (
                          <div className="absolute -left-2 top-0 text-[8px] font-black text-blue-600 uppercase tracking-tighter bg-white px-1 rounded border border-blue-100 z-20">
                            Now
                          </div>
                        )}

                        <div className={cn(
                          "bg-white p-4 rounded-2xl border shadow-sm transition-all",
                          isCurrent ? "border-blue-100 ring-1 ring-blue-50" : "border-slate-100",
                          event.hidden && "opacity-50 grayscale"
                        )}>
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "mt-1 p-2 rounded-xl shrink-0",
                              event.category === 'flight' ? "bg-purple-50 text-purple-600" :
                              event.category === 'drive' ? "bg-orange-50 text-orange-600" :
                              event.category === 'stay' ? "bg-indigo-50 text-indigo-600" :
                              event.category === 'food' ? "bg-rose-50 text-rose-600" :
                              "bg-emerald-50 text-emerald-600"
                            )}>
                              <EventIcon category={event.category} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2 min-w-0">
                                  <h4 className={cn(
                                    "text-sm font-bold text-slate-800 leading-tight",
                                    event.hidden && "line-through"
                                  )}>
                                    {event.title}
                                  </h4>
                                  {event.hidden && (
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter bg-slate-100 px-1 rounded border border-slate-200 shrink-0">
                                      Cancelled
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {(event.startTime || event.endTime) && (
                                    <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                                      <Clock className="w-3 h-3" /> 
                                      {event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}
                                    </span>
                                  )}
                                  <button 
                                    onClick={() => handleToggleHide(activeDayIdx, event.id)}
                                    className={cn(
                                      "p-1 transition-colors",
                                      event.hidden ? "text-red-500 hover:text-red-600" : "text-slate-400 hover:text-blue-600"
                                    )}
                                    title={event.hidden ? "Show activity" : "Hide/Cancel activity"}
                                  >
                                    {event.hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                              
                              {event.description && (
                                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                  {event.description.split(/(https?:\/\/[^\s]+)/g).map((part, i) => 
                                    part.match(/^https?:\/\//) ? (
                                      <a key={i} href={part} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                                        {part}
                                      </a>
                                    ) : part
                                  )}
                                </p>
                              )}

                              {event.location && (
                                <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
                                  <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> {event.location.name}
                                  </span>
                                  <div className="flex gap-2">
                                    <a 
                                      href={getAppleMapsUrl(event.location)} 
                                      target="_blank" 
                                      rel="noreferrer"
                                      className="p-1.5 bg-slate-50 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
                                    >
                                      <Navigation className="w-3 h-3" />
                                    </a>
                                    <a 
                                      href={getGoogleMapsUrl(event.location)} 
                                      target="_blank" 
                                      rel="noreferrer"
                                      className="p-1.5 bg-slate-50 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
                                    >
                                      <MapIcon className="w-3 h-3" />
                                    </a>
                                  </div>
                                </div>
                              )}

                              {event.description?.toLowerCase().includes('dog') && (
                                <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-600 text-[8px] font-black uppercase rounded-full">
                                  <Dog className="w-2 h-2" /> Dog Friendly
                                </div>
                              )}

                              {event.suggestions && (
                                <div className="mt-4 space-y-2">
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Suggestions</p>
                                  <div className="grid grid-cols-1 gap-2">
                                    {event.suggestions.map((sug, sIdx) => (
                                      <button
                                        key={sIdx}
                                        onClick={() => handleSelectSuggestion(activeDay.id, event.id, sug)}
                                        className={cn(
                                          "text-left p-2.5 rounded-xl border transition-all",
                                          event.location?.name === sug.name 
                                            ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-100' 
                                            : 'bg-slate-50 border-slate-100 hover:border-slate-200'
                                        )}
                                      >
                                        <div className="flex justify-between items-start">
                                          <span className="text-xs font-bold text-slate-700">{sug.name}</span>
                                          <div className="flex gap-1">
                                            <a 
                                              href={getGoogleMapsUrl(sug)}
                                              target="_blank"
                                              rel="noreferrer"
                                              onClick={(e) => e.stopPropagation()}
                                              className="p-1 text-slate-400 hover:text-blue-600"
                                            >
                                              <ExternalLink className="w-3 h-3" />
                                            </a>
                                          </div>
                                        </div>
                                        {sug.description && (
                                          <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{sug.description}</p>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex gap-2">
                                    <a 
                                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.title)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex-1 py-2 border border-dashed border-slate-200 rounded-xl text-[10px] font-bold text-slate-400 uppercase tracking-wider hover:border-blue-200 hover:text-blue-500 transition-all flex items-center justify-center gap-1"
                                    >
                                      <MapIcon className="w-3 h-3" /> Search on Google Maps
                                    </a>
                                    {user?.email === 'ianyy93@gmail.com' && (
                                      <button 
                                        onClick={() => handleAddManualSuggestion(activeDay.id, event.id)}
                                        className="px-3 py-2 border border-dashed border-slate-200 rounded-xl text-[10px] font-bold text-slate-400 uppercase tracking-wider hover:border-blue-200 hover:text-blue-500 transition-all flex items-center justify-center gap-1"
                                      >
                                        <Plus className="w-3 h-3" /> Add via Link
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        {isEditing && (
                          <button 
                            onClick={() => setEditingActivity({ dayIdx: activeDayIdx, actIdx: idx })}
                            className="absolute -top-2 -right-2 p-2 bg-blue-600 text-white rounded-full shadow-lg z-10"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  
                  {isEditing && (
                    <div className="pl-10">
                      <button 
                        onClick={() => setEditingActivity({ dayIdx: activeDayIdx, actIdx: null })}
                        className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 flex items-center justify-center gap-2 font-bold hover:border-blue-400 hover:text-blue-500 transition-colors"
                      >
                        <Plus className="w-5 h-5" /> Add Event
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'gas' && (
            <motion.div key="gas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full pb-32">
              <GasPricesView userLoc={userLoc} />
            </motion.div>
          )}

          {activeTab === 'info' && (
            <motion.div key="info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full">
              <div className="p-6 space-y-8 bg-slate-50 min-h-full pb-32">
                <section>
                  <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Plane className="w-5 h-5 text-blue-600" /> Flight Info
                  </h2>
                  <div className="space-y-3">
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Outbound • {FLIGHT_DETAILS.outbound.date}</p>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Ref: {FLIGHT_DETAILS.outbound.confirmation}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div><p className="text-xl font-bold text-slate-900">YYZ</p><p className="text-xs text-slate-500">09:30 AM</p></div>
                        <div className="flex flex-col items-center px-4 flex-1">
                          <p className="text-[10px] font-bold text-blue-600 mb-1">{FLIGHT_DETAILS.outbound.number}</p>
                          <div className="w-full h-[1px] bg-slate-200 relative"><Plane className="w-3 h-3 text-slate-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white" /></div>
                        </div>
                        <div className="text-right"><p className="text-xl font-bold text-slate-900">PHX</p><p className="text-xs text-slate-500">11:04 AM</p></div>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Return • {FLIGHT_DETAILS.return.date}</p>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Ref: {FLIGHT_DETAILS.return.confirmation}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div><p className="text-xl font-bold text-slate-900">PHX</p><p className="text-xs text-slate-500">12:05 PM</p></div>
                        <div className="flex flex-col items-center px-4 flex-1">
                          <p className="text-[10px] font-bold text-blue-600 mb-1">{FLIGHT_DETAILS.return.number}</p>
                          <div className="w-full h-[1px] bg-slate-200 relative rotate-180"><Plane className="w-3 h-3 text-slate-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white" /></div>
                        </div>
                        <div className="text-right"><p className="text-xl font-bold text-slate-900">YYZ</p><p className="text-xs text-slate-500">07:19 PM</p></div>
                      </div>
                    </div>
                  </div>
                </section>
                <section>
                  <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Car className="w-5 h-5 text-blue-600" /> Rental Car
                  </h2>
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-slate-900">{RENTAL_DETAILS.company}</h3>
                        <p className="text-xs text-slate-500">{RENTAL_DETAILS.car}</p>
                        <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mt-1">Ref: {RENTAL_DETAILS.confirmation}</p>
                      </div>
                      <div className="p-2 bg-blue-50 rounded-full"><Car className="w-5 h-5 text-blue-600" /></div>
                    </div>
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400 font-bold uppercase">Pickup</span>
                        <span className="text-slate-700 font-medium">{RENTAL_DETAILS.pickup}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400 font-bold uppercase">Dropoff</span>
                        <span className="text-slate-700 font-medium">{RENTAL_DETAILS.dropoff}</span>
                      </div>
                    </div>
                    <a href={`tel:${RENTAL_DETAILS.phone}`} className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold">Call Alamo <ExternalLink className="w-4 h-4" /></a>
                  </div>
                </section>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </>
  )}

      {/* Modals */}
      {editingActivity && (
        <EditActivityModal 
          activity={editingActivity.actIdx !== null 
            ? itinerary[editingActivity.dayIdx].events[editingActivity.actIdx] 
            : { title: '', type: 'activity', category: 'activity', description: '', startTime: '', endTime: '' }
          }
          onSave={handleUpdateActivity}
          onClose={() => setEditingActivity(null)}
          onDelete={editingActivity.actIdx !== null ? handleDeleteActivity : undefined}
        />
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/80 backdrop-blur-xl border-t border-slate-100 px-6 py-4 pb-10 flex justify-around items-center z-50">
        <button onClick={() => setActiveTab('itinerary')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'itinerary' ? "text-blue-600" : "text-slate-400")}>
          <Calendar className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Itinerary</span>
        </button>
        <button onClick={() => setActiveTab('gas')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'gas' ? "text-blue-600" : "text-slate-400")}>
          <Fuel className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Gas</span>
        </button>
        <button onClick={() => setActiveTab('info')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'info' ? "text-blue-600" : "text-slate-400")}>
          <Info className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Details</span>
        </button>
      </nav>
    </div>
  );
}
