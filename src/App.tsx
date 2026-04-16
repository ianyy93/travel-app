/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  ArrowLeft,
  Clock,
  ExternalLink,
  Edit2,
  Plus,
  RefreshCw,
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
  Navigation,
  History,
  ShoppingBag,
  Home,
  Filter,
  Cloud,
  CloudRain,
  Snowflake,
  CloudLightning,
  Route,
  Users,
  Bookmark,
  Ticket
} from 'lucide-react';
import { 
  ITINERARY_DATA, 
  FLIGHT_DETAILS, 
  RENTAL_DETAILS, 
  STAY_DETAILS,
  RESTAURANT_DETAILS,
  GAS_STATIONS, 
  TEMPLATE_VERSION,
  DayPlan, 
  TripEvent,
  TripCategory,
  Location,
  TripMember
} from './constants';
import { cn } from './lib/utils';
import { db, auth } from './firebase';
import { doc, onSnapshot, setDoc, getDoc, collection, deleteDoc, query, orderBy, limit, getDocs, writeBatch } from 'firebase/firestore';
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
import { weatherService, WeatherInfo } from './services/weatherService';
import { geminiService, GeminiProposal, GenerationMode } from './services/geminiService';
import { Fuel, Share2 } from 'lucide-react';

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
  `https://maps.apple.com/?q=${encodeURIComponent(loc.name)}&ll=${loc.lat},${loc.lng}&t=m`;

const getGoogleMapsUrl = (loc: Location) => 
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.name)}`;

const getDayRouteUrl = (events: TripEvent[], provider: 'apple' | 'google') => {
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
                  <a 
                    href={`https://www.gasbuddy.com/home?search=${encodeURIComponent(item.name + ' ' + item.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-blue-600 font-bold hover:underline mt-1 inline-block"
                  >
                    View Latest Prices on GasBuddy
                  </a>
                </div>
                <div className="text-right flex flex-col gap-2">
                  <p className="text-lg font-black text-slate-900">{item.regular}</p>
                  <div className="flex gap-1">
                    <a 
                      href={getAppleMapsUrl({ name: item.name, lat: item.lat, lng: item.lng })} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="p-1.5 bg-slate-100 rounded-lg text-slate-600"
                    >
                      <Navigation className="w-3 h-3" />
                    </a>
                    <a href={`https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`} target="_blank" rel="noreferrer" className="p-1.5 bg-slate-100 rounded-lg text-slate-600"><MapIcon className="w-3 h-3" /></a>
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
    case 'work': return <Briefcase className="w-4 h-4" />;
    case 'activity': return <Sun className="w-4 h-4" />;
    default: return <Sparkles className="w-4 h-4" />;
  }
};

const WeatherIcon = ({ icon, className }: { icon: string, className?: string }) => {
  switch (icon) {
    case 'Sun': return <Sun className={className} />;
    case 'Cloud': return <Cloud className={className} />;
    case 'CloudRain': return <CloudRain className={className} />;
    case 'Snowflake': return <Snowflake className={className} />;
    case 'CloudLightning': return <CloudLightning className={className} />;
    default: return <Sun className={className} />;
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
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full" title="Close"><X className="w-5 h-5" /></button>
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
                <option value="work">Work</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Manual Category (Places Tab)</label>
              <select 
                value={edited.manualCategory || ''}
                onChange={e => setEdited({ ...edited, manualCategory: e.target.value || undefined })}
                className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Auto (Based on Category)</option>
                <option value="attraction">Attraction</option>
                <option value="restaurant">Restaurant</option>
                <option value="shopping">Shopping</option>
                <option value="stay">Stay</option>
                <option value="logistics">Logistics</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
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

const AddPlaceModal = ({ onClose, onSave }: { onClose: () => void, onSave: (place: any) => void }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'attraction' | 'restaurant' | 'shopping' | 'stay' | 'logistics'>('attraction');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4 sm:p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, y: 100, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 100, scale: 0.95 }}
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden p-6 space-y-6"
      >
        <div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight">Add Place</h3>
          <p className="text-xs text-slate-400 font-medium">Add a new place to your shortlist</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase">Name</label>
            <input 
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g. Local Coffee Shop"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase">Category</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {['attraction', 'restaurant', 'shopping', 'stay', 'logistics'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat as any)}
                  className={cn(
                    "py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                    category === cat 
                      ? "bg-slate-900 text-white border-slate-900" 
                      : "bg-white text-slate-400 border-slate-100"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Latitude</label>
              <input 
                type="text"
                value={lat}
                onChange={e => setLat(e.target.value)}
                className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="34.0522"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Longitude</label>
              <input 
                type="text"
                value={lng}
                onChange={e => setLng(e.target.value)}
                className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="-118.2437"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button onClick={onClose} className="flex-1 py-4 bg-slate-50 text-slate-600 rounded-2xl font-bold">Cancel</button>
          <button 
            onClick={() => onSave({ name, category, location: lat && lng ? { name, lat: parseFloat(lat), lng: parseFloat(lng) } : undefined })}
            className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200"
          >
            Add to Shortlist
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const PlacesView = ({ 
  itinerary, 
  shortlist, 
  onAddShortlist, 
  onRemoveShortlist,
  isAdmin,
  onUpdateItinerary,
  onSaveToFirestore,
  onNavigateToEvent
}: { 
  itinerary: DayPlan[], 
  shortlist: any[], 
  onAddShortlist: (place: any) => void,
  onRemoveShortlist: (id: string) => void,
  isAdmin: boolean,
  onUpdateItinerary: (newItinerary: DayPlan[]) => void,
  onSaveToFirestore: (newItinerary: DayPlan[]) => void,
  onNavigateToEvent: (dayIdx: number, eventId: string) => void
}) => {
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Extract all places from itinerary
    const itineraryPlaces = useMemo(() => {
    if (!itinerary || !Array.isArray(itinerary)) return [];
    const places: any[] = [];
    const seen = new Map<string, any>();
    
    // Rule #2: Logistics keywords
    const isLogistics = (name: string | undefined, category: string | undefined) => {
      if (category === 'flight' || category === 'transit' || category === 'drive') return true;
      if (!name) return false;
      const lowerName = name.toLowerCase();
      const logisticsKeywords = ['airport', 'rental car', 'gas station', 'parking', 'shuttle', 'yyz', 'phx', 'jfk', 'lax', 'sfo', 'lga', 'ewr', 'flight', 'transit', 'uber', 'lyft', 'taxi', 'terminal', 'shuttle', 'subway station', 'train station', 'bus station', 'car center'];
      return logisticsKeywords.some(k => lowerName.includes(k));
    };

    // Rule #5: Shopping keywords
    const isShopping = (name: string | undefined, description: string | undefined) => {
      const lowerName = (name || '').toLowerCase();
      const lowerDesc = (description || '').toLowerCase();
      const shopKeywords = ['shop', 'store', 'mall', 'market', 'boutique', 'plaza', 'outlet', 'trading post', 'gallery', 'tlaquepaque'];
      return shopKeywords.some(k => lowerName.includes(k) || lowerDesc.includes(k));
    };

    const addPlace = (loc: Location, category: string, id: string, dayDate: string, description?: string, manualCategory?: string, eventId?: string, dayIdx?: number) => {
      if (!loc || !loc.name) return;
      
      const key = `${loc.name}-${loc.lat || 0}-${loc.lng || 0}`;
      const existing = seen.get(key);
      
      if (existing) {
        // Add visit to existing place
        if (dayIdx !== undefined && eventId && !existing.visits.some((v: any) => v.dayIdx === dayIdx && v.eventId === eventId)) {
          existing.visits.push({ dayDate, dayIdx, eventId });
          // Sort visits by dayIdx
          existing.visits.sort((a: any, b: any) => a.dayIdx - b.dayIdx);
        }
        // If this visit has a manual category and the existing one doesn't, update it
        if (manualCategory && !existing.manualCategory) {
          existing.manualCategory = manualCategory;
          existing.category = manualCategory;
        }
        return;
      }
      
      const newPlace = {
        id,
        name: loc.name,
        category: manualCategory || category,
        location: loc,
        source: 'itinerary',
        visits: dayIdx !== undefined && eventId ? [{ dayDate, dayIdx, eventId }] : [],
        description: description || loc.description,
        manualCategory,
        eventId,
        dayIdx
      };
      
      seen.set(key, newPlace);
      places.push(newPlace);
    };

    itinerary.forEach((day, dayIdx) => {
      if (!day || !day.events) return;
      day.events.forEach(event => {
        // Rule #3: Skip meal suggestion tiles without selection
        // A suggestion tile is one with suggestions but no specific location (or generic location)
        const lowerLoc = event.location?.name.toLowerCase() || '';
        const isGeneric = event.location && (
          (lowerLoc.includes(' area') || lowerLoc.includes(' neighborhood')) ||
          (lowerLoc.split(',').length <= 2 && /\d{5}/.test(lowerLoc)) // Generic if it's just "City, ST Zip"
        );
        const isUnselectedSuggestion = event.suggestions && event.suggestions.length > 0 && (!event.location || (isGeneric && !event.manualCategory));
        
        if (isUnselectedSuggestion) return;

        // Skip generic locations unless manually overridden
        if (event.location && isGeneric && !event.manualCategory) return;
        
        if (event.location) {
          let cat = 'attraction'; // Rule #6: Default
          
          // Manual Override always first
          if (event.manualCategory) {
            cat = event.manualCategory;
          } else {
            // Rule #1: Stays
            if (event.category === 'stay') {
              cat = 'stay';
            }
            // Rule #2: Logistics
            else if (isLogistics(event.location.name, event.category)) {
              cat = 'logistics';
            }
            // Rule #4: Restaurants
            else if (event.category === 'food') {
              cat = 'restaurant';
            }
            // Rule #5: Shopping
            else if (isShopping(event.location.name, event.description)) {
              cat = 'shopping';
            }
          }
          
          addPlace(event.location, cat, `itinerary-${event.id}`, day.date, event.description, event.manualCategory, event.id, dayIdx);
        }
        
        if (event.waypoints && event.waypoints.length > 0) {
          event.waypoints.forEach((wp, wpIdx) => {
            addPlace(wp, 'attraction', `itinerary-${event.id}-wp-${wpIdx}`, day.date, event.description, undefined, event.id, dayIdx);
          });
        }
        
        // Handle travel events (only if they are stays or logistics)
        if (!event.manualCategory) {
          if (event.origin && event.category === 'stay') {
            addPlace(event.origin, 'stay', `itinerary-${event.id}-origin`, day.date, event.description, undefined, event.id, dayIdx);
          }
          if (event.destination && event.category === 'stay') {
            addPlace(event.destination, 'stay', `itinerary-${event.id}-dest`, day.date, event.description, undefined, event.id, dayIdx);
          }
        }
      });
    });
    return places;
  }, [itinerary]);

  const allPlaces = [...itineraryPlaces, ...(Array.isArray(shortlist) ? shortlist : []).map(p => ({ ...p, source: 'shortlist' }))];

  const filteredPlaces = allPlaces.filter(p => {
    const matchesFilter = filter === 'all' || p.category === filter;
    const matchesSearch = (p.name || '').toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="w-full">
      {/* Sticky Header */}
      <div className="sticky top-0 z-[100] bg-slate-50/95 backdrop-blur-md p-6 pb-4 space-y-6 border-b border-slate-100 shadow-sm w-full">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Places</h2>
          <div className="flex gap-2">
            <button 
              onClick={() => {
                // Force a re-render of itineraryPlaces by slightly modifying search (hacky but works for quick sync)
                setSearch(s => s + ' ');
                setTimeout(() => setSearch(s => s.trim()), 10);
              }}
              className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"
              title="Refresh from itinerary"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            {isAdmin && (
              <button 
                onClick={() => setShowAddModal(true)}
                className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Search & Filter */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search places..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">
            {['all', 'attraction', 'restaurant', 'shopping', 'stay', 'logistics', 'work'].map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={cn(
                  "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap",
                  filter === cat 
                    ? "bg-slate-900 text-white border-slate-900" 
                    : "bg-white text-slate-400 border-slate-100"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Places List */}
      <div className="p-6 pb-32 grid gap-4 w-full max-w-full overflow-x-hidden">
        {filteredPlaces.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 border-dashed">
            <p className="text-slate-400 text-sm">No places found matching your filter.</p>
          </div>
        ) : (
          filteredPlaces.map((place, idx) => (
            <div key={idx} className="bg-white p-4 rounded-3xl border border-slate-100 flex items-start justify-between group w-full max-w-full overflow-hidden">
              <div className="flex items-start gap-4 min-w-0 flex-1">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 mt-1",
                  place.category === 'restaurant' ? "bg-orange-50 text-orange-600" :
                  place.category === 'shopping' ? "bg-purple-50 text-purple-600" :
                  place.category === 'stay' ? "bg-blue-50 text-blue-600" :
                  place.category === 'logistics' ? "bg-slate-100 text-slate-600" :
                  place.category === 'work' ? "bg-blue-50 text-blue-600" :
                  "bg-green-50 text-green-600"
                )}>
                  {place.category === 'restaurant' ? <Utensils className="w-5 h-5" /> :
                   place.category === 'shopping' ? <ShoppingBag className="w-5 h-5" /> :
                   place.category === 'stay' ? <Home className="w-5 h-5" /> :
                   place.category === 'logistics' ? <Plane className="w-5 h-5" /> :
                   place.category === 'work' ? <Briefcase className="w-5 h-5" /> :
                   <MapPin className="w-5 h-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-slate-900 leading-tight break-words">{place.name}</h4>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {place.source === 'itinerary' && isAdmin ? (
                      <select 
                        value={place.manualCategory || ''}
                        onChange={(e) => {
                          const newCat = e.target.value || undefined;
                          const newItinerary = itinerary.map((d, dIdx) => {
                            if (dIdx !== place.dayIdx) return d;
                            return {
                              ...d,
                              events: d.events.map(ev => {
                                if (ev.id !== place.eventId) return ev;
                                return { ...ev, manualCategory: newCat };
                              })
                            };
                          });
                          onUpdateItinerary(newItinerary);
                          onSaveToFirestore(newItinerary);
                        }}
                        className="text-[10px] font-black uppercase tracking-tighter text-blue-600 bg-blue-50 border-none p-0 focus:ring-0 cursor-pointer hover:underline"
                      >
                        <option value="">Auto: {place.category}</option>
                        <option value="attraction">Attraction</option>
                        <option value="restaurant">Restaurant</option>
                        <option value="shopping">Shopping</option>
                        <option value="stay">Stay</option>
                        <option value="logistics">Logistics</option>
                        <option value="work">Work</option>
                      </select>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-tighter text-slate-400">
                        {place.category}
                      </span>
                    )}
                    {place.visits && place.visits.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {place.visits.map((visit: any, vIdx: number) => (
                          <button
                            key={vIdx}
                            onClick={() => onNavigateToEvent(visit.dayIdx, visit.eventId)}
                            className="text-[10px] font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-colors whitespace-nowrap"
                          >
                            {visit.dayDate}
                          </button>
                        ))}
                      </div>
                    ) : place.dayDate && (
                      <span className="text-[10px] font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full whitespace-nowrap mt-1">
                        {place.dayDate}
                      </span>
                    )}
                  </div>
                  {place.description && (
                    <p className="text-[10px] text-slate-500 mt-2 italic bg-slate-50 p-2 rounded-lg border border-slate-100 break-words">
                      <span className="font-bold not-italic text-slate-400 mr-1">Note:</span>
                      {place.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2 mt-1">
                {place.location && (
                  <div className="flex gap-1">
                    <a 
                      href={getAppleMapsUrl(place.location)}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 hover:bg-slate-50 rounded-xl text-slate-300 hover:text-blue-600 transition-all"
                      title="Apple Maps"
                    >
                      <Navigation className="w-4 h-4" />
                    </a>
                    <a 
                      href={getGoogleMapsUrl(place.location)}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 hover:bg-slate-50 rounded-xl text-slate-300 hover:text-blue-600 transition-all"
                      title="Google Maps"
                    >
                      <MapIcon className="w-4 h-4" />
                    </a>
                  </div>
                )}
                {place.source === 'shortlist' && isAdmin && (
                  <button 
                    onClick={() => onRemoveShortlist(place.id)}
                    className="p-2 hover:bg-red-50 rounded-xl text-slate-300 hover:text-red-600 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Place Modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddPlaceModal 
            onClose={() => setShowAddModal(false)}
            onSave={(p) => {
              onAddShortlist(p);
              setShowAddModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Main App ---

const TravellersView = ({ travellers, onUpdate }: { travellers: TripMember[], onUpdate: (list: TripMember[]) => void }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newInitials, setNewInitials] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');

  const handleAdd = () => {
    if (!newName || !newInitials) return;
    const newMember: TripMember = {
      id: newName.toLowerCase().replace(/\s+/g, '-'),
      name: newName,
      initials: newInitials.toUpperCase().slice(0, 2),
      color: newColor
    };
    onUpdate([...travellers, newMember]);
    setNewName('');
    setNewInitials('');
    setIsAdding(false);
  };

  const handleRemove = (id: string) => {
    if (window.confirm('Remove this traveller from the master list?')) {
      onUpdate(travellers.filter(t => t.id !== id));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Travellers</h2>
          <p className="text-xs text-slate-400 font-medium">Manage your master list of travellers</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="p-2 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-100"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="grid gap-4">
        {travellers.map(t => (
          <div key={t.id} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-inner"
                style={{ backgroundColor: t.color }}
              >
                {t.initials}
              </div>
              <div>
                <h3 className="font-bold text-slate-900">{t.name}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.id}</p>
              </div>
            </div>
            <button 
              onClick={() => handleRemove(t.id)}
              className="p-2 text-slate-300 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden p-6 space-y-6"
            >
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Add Traveller</h3>
                <p className="text-xs text-slate-400 font-medium">Add a new person to your master list</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Name</label>
                  <input 
                    type="text"
                    value={newName}
                    onChange={e => {
                      setNewName(e.target.value);
                      if (!newInitials) setNewInitials(e.target.value.charAt(0).toUpperCase());
                    }}
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Full Name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Initials</label>
                    <input 
                      type="text"
                      value={newInitials}
                      onChange={e => setNewInitials(e.target.value.toUpperCase().slice(0, 2))}
                      className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="I"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Color</label>
                    <input 
                      type="color"
                      value={newColor}
                      onChange={e => setNewColor(e.target.value)}
                      className="w-full h-[46px] p-1 bg-slate-50 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setIsAdding(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAdd}
                  className="flex-[2] py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200"
                >
                  Add Traveller
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'itinerary' | 'gas' | 'info' | 'places'>('itinerary');
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [itinerary, setItinerary] = useState<DayPlan[]>(ITINERARY_DATA);
  const [user, setUser] = useState<User | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingActivity, setEditingActivity] = useState<{ dayIdx: number, actIdx: number | null } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [view, setView] = useState<'itinerary' | 'list' | 'travellers'>('list');
  const [lastTripView, setLastTripView] = useState<'itinerary' | 'list'>('list');
  const [currentTripId, setCurrentTripId] = useState<string>('main');
  const [shortlist, setShortlist] = useState<any[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [expandedTrips, setExpandedTrips] = useState<Set<string>>(new Set());
  const [tripsList, setTripsList] = useState<{id: string, title: string, date: string, year?: string}[]>([]);
  const [tripTitle, setTripTitle] = useState('');
  const [isLoadingTrip, setIsLoadingTrip] = useState(true);
  const [tripDates, setTripDates] = useState('');
  const [activeGroupIndices, setActiveGroupIndices] = useState<Record<string, number>>({});
  const [refinePrompt, setRefinePrompt] = useState('');
  const [isRefining, setIsRefining] = useState<string | null>(null);
  const [flightInfo, setFlightInfo] = useState<any>(null);
  const [rentalInfo, setRentalInfo] = useState<any>(null);
  const [stays, setStays] = useState<any[]>([]);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [experiences, setExperiences] = useState<any[]>([]);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [masterTravellers, setMasterTravellers] = useState<TripMember[]>([]);
  const [itineraryHistory, setItineraryHistory] = useState<DayPlan[][]>([]);
  const [dbHistory, setDbHistory] = useState<{id: string, days: DayPlan[], timestamp: string, updatedBy: string}[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [aiProposal, setAiProposal] = useState<GeminiProposal | null>(null);
  const [rejectedSuggestionIds, setRejectedSuggestionIds] = useState<string[]>([]);
  const [rejectedAssumptionIdxs, setRejectedAssumptionIdxs] = useState<number[]>([]);
  const [rejectedCoreIds, setRejectedCoreIds] = useState<string[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [activeColumnIdx, setActiveColumnIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [weatherData, setWeatherData] = useState<Record<number, WeatherInfo>>({});

  const [activeFilter, setActiveFilter] = useState<string>('all');

  const isAdmin = useMemo(() => {
    const admins = ['ianyy93@gmail.com', 'wingin.carrie@gmail.com'];
    return user && admins.includes(user.email || '');
  }, [user]);

  useEffect(() => {
    if (isAdmin && tripsList.length > 0) {
      console.log('--- Firestore Trips List ---');
      tripsList.forEach(t => console.log(`ID: ${t.id} | Title: ${t.title} | Date: ${t.date}`));
      console.log('---------------------------');
    }
  }, [tripsList, isAdmin]);

  const hasDriving = useMemo(() => {
    return itinerary.some(day => day.events.some(event => event.category === 'drive'));
  }, [itinerary]);

  const hasFlightInfo = useMemo(() => {
    if (!flightInfo) return false;
    const hasOutbound = flightInfo.outbound && (flightInfo.outbound.number || flightInfo.outbound.from || flightInfo.outbound.to);
    const hasReturn = flightInfo.return && (flightInfo.return.number || flightInfo.return.from || flightInfo.return.to);
    return !!(hasOutbound || hasReturn);
  }, [flightInfo]);

  const hasRentalInfo = useMemo(() => {
    if (!rentalInfo) return false;
    // Be strict: only show if there's a company or car that isn't just a generic placeholder
    const company = rentalInfo.company?.toLowerCase();
    if (!company || company === 'rental car' || company === 'tbd' || company === 'not specified' || company === 'none') {
      if (!rentalInfo.car && !rentalInfo.confirmation) return false;
    }
    return !!(rentalInfo.company || rentalInfo.car || rentalInfo.confirmation);
  }, [rentalInfo]);

  useEffect(() => {
    const fetchWeather = async () => {
      const newWeather: Record<number, WeatherInfo> = {};
      for (let i = 0; i < itinerary.length; i++) {
        const day = itinerary[i];
        // Find a location for this day
        const loc = day.events.find(e => e.location)?.location || 
                    day.events.find(e => e.destination)?.destination ||
                    day.events.find(e => e.origin)?.origin;
        
        if (loc) {
          const info = await weatherService.getWeatherForDay(loc, day.date);
          if (info) {
            newWeather[i] = info;
          }
        }
      }
      setWeatherData(newWeather);
    };
    fetchWeather();
  }, [itinerary]);
  
  const handleUndo = async () => {
    if (itineraryHistory.length > 0) {
      const prev = itineraryHistory[itineraryHistory.length - 1];
      setItinerary(prev);
      setItineraryHistory(prevHistory => prevHistory.slice(0, -1));
      saveToFirestore(prev);
    } else if (dbHistory.length > 1) {
      // If local history is empty, try pulling from DB history
      // dbHistory[0] is current, dbHistory[1] is previous
      const prev = dbHistory[1].days;
      setItinerary(prev);
      saveToFirestore(prev);
    }
  };

  const handleRefineSuggestions = async (dayIdx: number, eventId: string) => {
    if (!refinePrompt.trim()) return;
    setIsRefining(eventId);
    try {
      const day = itinerary[dayIdx];
      const event = day.events.find(e => e.id === eventId);
      if (!event) return;

      const newSuggestions = await geminiService.refineSuggestions(event, refinePrompt);
      if (newSuggestions.length > 0) {
        const newItinerary = [...itinerary];
        const eventIdx = newItinerary[dayIdx].events.findIndex(e => e.id === eventId);
        newItinerary[dayIdx].events[eventIdx] = {
          ...newItinerary[dayIdx].events[eventIdx],
          suggestions: newSuggestions
        };
        setItinerary(newItinerary);
        saveToFirestore(newItinerary);
      }
      setRefinePrompt('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefining(null);
    }
  };

  const handleAiAction = async (mode: GenerationMode = 'full', customPrompt?: string) => {
    if (!aiPrompt.trim() && !customPrompt && mode !== 'navigation' && mode !== 'autofill') return;
    setIsAiLoading(true);
    try {
      const pastTripsSummary = tripsList.map(t => `${t.title} (${t.date})`).join(', ');
      // If we are in list view, we are likely creating a new trip, so pass an empty itinerary
      const contextItinerary = view === 'list' ? [] : itinerary;
      const contextMembers = members.length > 0 ? members : masterTravellers;
      const finalPrompt = customPrompt || aiPrompt.trim() || (mode === 'autofill' ? 'Auto-fill the rest of my itinerary using my shortlist and logical suggestions.' : aiPrompt);
      
      console.log('AI Action:', mode, 'Prompt:', finalPrompt);
      const proposal = await geminiService.proposeChanges(
        contextItinerary, 
        finalPrompt, 
        mode, 
        pastTripsSummary, 
        contextMembers, 
        shortlist,
        stays,
        flightInfo,
        rentalInfo,
        restaurants,
        experiences
      );
      console.log('AI Proposal received:', proposal);
      
      setAiProposal(proposal);
      setRejectedSuggestionIds([]); // Reset rejections for new proposal
      setRejectedAssumptionIdxs([]); // Reset assumption rejections for new proposal
      setShowAiAssistant(true); // Ensure panel is open to show proposal
      setAiPrompt('');
    } catch (err) {
      console.error('AI Action Error:', err);
      const errorMessage = err instanceof Error ? err.message : "AI Assistant failed to generate a proposal. Please try again.";
      alert(errorMessage);
    } finally {
      setIsAiLoading(false);
    }
  };

    const applyAiProposal = async () => {
      if (!aiProposal) return;
      
      const firstDayDate = aiProposal.itinerary[0]?.date || '';
      const lastDayDate = aiProposal.itinerary[aiProposal.itinerary.length - 1]?.date || '';
      const inferredDates = firstDayDate && lastDayDate ? `${firstDayDate} - ${lastDayDate}` : '';

      // Filter out rejected suggestions and unrequested core activities from itinerary
      const filteredItinerary = aiProposal.itinerary.map(day => ({
        ...day,
        events: day.events.filter(event => {
          if (rejectedCoreIds.includes(event.id)) {
            return false;
          }
          const suggestion = aiProposal.suggestions?.find(s => s.relatedId === event.id);
          if (suggestion && rejectedSuggestionIds.includes(suggestion.id)) {
            return false;
          }
          return true;
        })
      }));

      // Filter out generic neighborhoods from shortlist just in case AI pollutes it
      const genericTerms = ['neighborhood', 'area', 'district', 'region', 'downtown', 'midtown', 'uptown', 'west', 'east', 'north', 'south'];
      const filteredAiShortlist = (aiProposal.shortlist || []).filter(p => {
        const name = p.name?.toLowerCase() || '';
        const isGeneric = genericTerms.some(term => name.includes(term) && name.split(' ').length <= 2);
        if (isGeneric) return false;
        
        // Also filter if it's a rejected suggestion
        const suggestion = aiProposal.suggestions?.find(s => s.text.includes(p.name));
        if (suggestion && rejectedSuggestionIds.includes(suggestion.id)) {
          return false;
        }
        return true;
      });

      let finalTitle = aiProposal.title;
      const isGenericTitle = (t: string | undefined) => !t || 
                            t.toLowerCase().includes('arizona') || 
                            t.toLowerCase().includes('arrival') || 
                            t.toLowerCase().includes('new trip') ||
                            t.toLowerCase().includes('itinerary') ||
                            t.length < 3;

      if (isGenericTitle(finalTitle)) {
        // Try to find a better title from the first day or destination
        const firstDayTitle = aiProposal.itinerary[0]?.title;
        const hasPlaceInTitle = (t: string | undefined) => t && !isGenericTitle(t);
        
        if (hasPlaceInTitle(firstDayTitle)) {
          finalTitle = firstDayTitle;
        } else if (hasPlaceInTitle(tripTitle)) {
          finalTitle = tripTitle;
        } else {
          // Look for the most frequent location name in the itinerary
          const locations = aiProposal.itinerary.flatMap(d => d.events.map(e => e.location?.name || e.destination?.name)).filter(Boolean);
          if (locations.length > 0) {
            const counts: Record<string, number> = {};
            locations.forEach(loc => { counts[loc!] = (counts[loc!] || 0) + 1; });
            const topLoc = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
            const year = new Date().getFullYear();
            finalTitle = `${topLoc} ${year}`;
          } else {
            finalTitle = 'New Trip';
          }
        }
      }

      // Ensure dates are correct
      const finalDates = aiProposal.dates || inferredDates;

      if (view === 'list') {
        // Create a new trip from proposal
        const newId = finalTitle.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substr(2, 5);
        
        const aiShortlist = filteredAiShortlist.map(p => ({
          ...p,
          id: p.id || Math.random().toString(36).substr(2, 9),
          addedAt: new Date().toISOString()
        }));
        
        // Save first, then switch to ensure data is ready for the listener
        await saveToFirestore(filteredItinerary, finalTitle, finalDates, false, aiShortlist, newId, aiProposal.flightInfo || null, aiProposal.rentalInfo || null, aiProposal.stays || [], aiProposal.restaurants || [], aiProposal.experiences || [], aiProposal.members || []);
        
        setCurrentTripId(newId);
        setItinerary(filteredItinerary);
        setTripTitle(finalTitle);
        setTripDates(finalDates);
        setShortlist(aiShortlist);
        setFlightInfo(aiProposal.flightInfo || null);
        setRentalInfo(aiProposal.rentalInfo || null);
        setStays(aiProposal.stays || []);
        setRestaurants(aiProposal.restaurants || []);
        setExperiences(aiProposal.experiences || []);
        setMembers(aiProposal.members || []);
        
        setView('itinerary');
      } else {
        setItineraryHistory(prev => [...prev, itinerary]);
        setItinerary(filteredItinerary);
        
        const aiShortlist = filteredAiShortlist.map(p => ({
          ...p,
          id: p.id || Math.random().toString(36).substr(2, 9),
          addedAt: new Date().toISOString()
        }));
        
        const updatedShortlist = [
          ...shortlist, 
          ...aiShortlist.filter(p => !shortlist.some(s => s.name === p.name))
        ];
          
        setShortlist(updatedShortlist);
        
        setTripTitle(finalTitle);
        setTripDates(finalDates);
        setFlightInfo(aiProposal.flightInfo || flightInfo);
        setRentalInfo(aiProposal.rentalInfo || rentalInfo);
        setStays(aiProposal.stays || stays);
        setRestaurants(aiProposal.restaurants || restaurants);
        setExperiences(aiProposal.experiences || experiences);
        setMembers(aiProposal.members || members);
        
        saveToFirestore(filteredItinerary, finalTitle, finalDates, false, updatedShortlist, undefined, aiProposal.flightInfo || flightInfo, aiProposal.rentalInfo || rentalInfo, aiProposal.stays || stays, aiProposal.restaurants || restaurants, aiProposal.experiences || experiences, aiProposal.members || members);
      }
      
      setAiProposal(null);
      setRejectedSuggestionIds([]);
      setRejectedCoreIds([]);
      setShowAiAssistant(false);
    };

  // Helper to remove undefined values for Firestore
  const sanitizeForFirestore = (obj: any): any => {
    if (Array.isArray(obj)) {
      return obj.map(sanitizeForFirestore);
    } else if (obj !== null && typeof obj === 'object') {
      return Object.entries(obj).reduce((acc: any, [key, value]) => {
        if (value !== undefined) {
          acc[key] = sanitizeForFirestore(value);
        }
        return acc;
      }, {});
    }
    return obj;
  };

  const saveToFirestore = async (data: DayPlan[], title?: string, dates?: string, isAutoSync = false, currentShortlist?: any[], tripIdOverride?: string, currentFlightInfo?: any, currentRentalInfo?: any, currentStays?: any[], currentRestaurants?: any[], currentExperiences?: any[], currentMembers?: TripMember[]) => {
    if (!auth.currentUser) return;
    if (!isAdmin) {
      console.error("Unauthorized: You do not have permission to save changes.");
      return;
    }
    const targetId = tripIdOverride || currentTripId;
    const path = `trips/${targetId}`;
    const tripDoc = doc(db, 'trips', targetId);
    
    try {
      // If this is a structural update or manual save, we might want to record history
      // For now, let's just save the main document
      const saveData: any = sanitizeForFirestore({ 
        days: data,
        templateVersion: TEMPLATE_VERSION,
        lastUpdated: new Date().toISOString(),
        updatedBy: auth.currentUser.email,
        isAutoSync,
        shortlist: currentShortlist !== undefined ? currentShortlist : shortlist,
        flightInfo: currentFlightInfo !== undefined ? currentFlightInfo : flightInfo,
        rentalInfo: currentRentalInfo !== undefined ? currentRentalInfo : rentalInfo,
        stays: currentStays !== undefined ? currentStays : stays,
        restaurants: currentRestaurants !== undefined ? currentRestaurants : restaurants,
        experiences: currentExperiences !== undefined ? currentExperiences : experiences,
        members: currentMembers !== undefined ? currentMembers : members
      });

      if (title !== undefined && title !== 'Loading...') {
        saveData.title = title;
      } else if (tripIdOverride) {
        saveData.title = 'New Trip';
      } else if (tripTitle && tripTitle !== 'Loading...') {
        saveData.title = tripTitle;
      }

      if (dates !== undefined) {
        saveData.dates = dates;
      } else if (tripIdOverride) {
        saveData.dates = 'Dates TBD';
      } else {
        saveData.dates = tripDates;
      }

      await setDoc(tripDoc, saveData, { merge: true });

      // Record history for manual changes (not auto-syncs)
      if (!isAutoSync) {
        // Prune history if it exceeds 50 versions to save space
        if (dbHistory.length >= 50) {
          const oldest = dbHistory[dbHistory.length - 1];
          await deleteDoc(doc(db, 'trips', targetId, 'history', oldest.id));
        }

        const historyRef = doc(collection(db, 'trips', targetId, 'history'));
        await setDoc(historyRef, {
          days: data,
          timestamp: new Date().toISOString(),
          updatedBy: auth.currentUser.email,
          title: title || tripTitle
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleSelectSuggestion = (dayIdx: number, eventId: string, suggestion: Location) => {
    const newItinerary = [...itinerary];
    const day = newItinerary[dayIdx];
    if (!day) return;

    const newEvents = day.events.map((event) => {
      if (event.id === eventId) {
        const isSelected = event.location?.name === suggestion.name;
        const newLoc = isSelected ? undefined : suggestion;
        
        // Update title if it's a generic meal title
        let newTitle = event.title;
        const genericTitles = ['Quick Lunch', 'Lunch', 'Dinner', 'Breakfast', 'Meal', 'Food Stop', 'Meal Selection'];
        
        if (!isSelected && (genericTitles.includes(event.title) || event.title.toLowerCase().includes('lunch') || event.title.toLowerCase().includes('dinner'))) {
          // Store original title in a data attribute or just use a fallback
          if (!event.originalTitle) {
            event.originalTitle = event.title;
          }
          newTitle = suggestion.name;
        } else if (isSelected && event.originalTitle) {
          // Revert to original title if unselecting
          newTitle = event.originalTitle;
        }

        return { ...event, title: newTitle, location: newLoc };
      }
      return event;
    });

    // Rebuild navigation for this day
    const finalEvents: TripEvent[] = [];
    const baseEvents = newEvents.filter(e => e.type !== 'travel');
    
    // Determine travel mode
    const travelMode = hasRentalInfo ? 'drive' : 'transit';
    const travelTitle = hasRentalInfo ? 'Drive' : 'Transit';

    for (let i = 0; i < baseEvents.length; i++) {
      const current = baseEvents[i];
      finalEvents.push(current);
      
      const next = baseEvents[i+1];
      if (next && !current.hidden && !next.hidden) {
        const currentLoc = current.location;
        const nextLoc = next.location;
        
        if (currentLoc && nextLoc && (currentLoc.lat !== nextLoc.lat || currentLoc.lng !== nextLoc.lng)) {
          finalEvents.push({
            id: `nav-${current.id}-${next.id}`,
            type: 'travel',
            category: travelMode,
            title: `${travelTitle} to ${nextLoc.name}`,
            origin: currentLoc,
            destination: nextLoc,
            startTime: current.endTime || current.startTime,
            endTime: next.startTime,
            memberIds: current.memberIds // Keep members consistent
          });
        }
      }
    }

    newItinerary[dayIdx] = { ...day, events: finalEvents };
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

  const handleDeleteTrip = async (tripId: string) => {
    console.log('--- DELETE PROCESS START ---');
    console.log('Target Trip ID:', tripId);
    console.log('Current User:', auth.currentUser?.email);
    console.log('Is Admin:', isAdmin);

    if (!isAdmin) {
      console.error('Delete aborted: User is not an admin.');
      setLoginError("You do not have permission to delete trips.");
      return;
    }
    
    try {
      console.log('Executing Firestore deleteDoc...');
      const docRef = doc(db, 'trips', tripId);
      await deleteDoc(docRef);
      console.log('Firestore deleteDoc successful.');
      
      if (currentTripId === tripId) {
        console.log('Current trip was deleted, redirecting to main...');
        setCurrentTripId('main');
      }
      console.log('--- DELETE PROCESS COMPLETE ---');
    } catch (error) {
      console.error('Firestore deleteDoc FAILED:', error);
      handleFirestoreError(error, OperationType.DELETE, `trips/${tripId}`);
    }
  };

  const isEventExpandable = (event: TripEvent) => {
    const hasDescription = !!(event.description && event.description.trim().length > 0);
    const hasSuggestions = !!(event.suggestions && event.suggestions.length > 0);
    const isDogFriendly = !!(event.description?.toLowerCase().includes('dog'));
    
    if (hasSuggestions || isDogFriendly) return true;
    
    if (hasDescription) {
      // Only expandable if description is long/complex enough to be worth expanding
      return event.description!.length > 60 || 
             event.description!.includes('\n') || 
             event.description!.includes('http');
    }
    
    return false;
  };

  const handleGenerateNavigation = () => {
    console.log('UI: handleGenerateNavigation called');
    // 1. Check for missing locations first to warn user
    const missingLocations: string[] = [];
    itinerary.forEach(day => {
      day.events.forEach(e => {
        if ((e.type === 'activity' || e.type === 'food' || e.type === 'stay') && (!e.location || !e.location.lat || !e.location.lng)) {
          missingLocations.push(e.title);
        }
      });
    });

    if (missingLocations.length > 0) {
      console.warn(`Missing locations for: ${missingLocations.join(', ')}`);
    }

    // Determine default travel mode
    const defaultMode = hasRentalInfo ? 'drive' : 'transit';
    const defaultTitle = hasRentalInfo ? 'Drive' : 'Transit';

    // Track the last event for each member to link them across days
    const lastEventPerMember: Record<string, TripEvent> = {};

    const toMinutes = (timeStr: string) => {
      if (!timeStr) return 0;
      try {
        const [time, modifier] = timeStr.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
        return hours * 60 + minutes;
      } catch (e) {
        return 0;
      }
    };

    const newItinerary = itinerary.map(day => {
      const events = day.events || [];
      const nonTravelEvents = events.filter(e => e.type !== 'travel');
      const travelEvents = [...events.filter(e => e.type === 'travel')];
      
      // We need to process events in chronological order
      const sortedActivities = [...nonTravelEvents].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

      sortedActivities.forEach(current => {
        if (current.hidden) return;
        if (!current.location || !current.location.lat || !current.location.lng) return;

        // Get actual member IDs (expand 'everyone' if needed)
        let currentMemberIds = current.memberIds || [];
        if (currentMemberIds.length === 0 || currentMemberIds.includes('everyone')) {
          currentMemberIds = masterTravellers.map(m => m.id);
        }

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
              const endTime = current.startTime;
              
              // If prev was from a previous day, set startTime to 12:00 AM of current day
              // to ensure it sorts correctly at the beginning of the day
              const prevDayIdx = itinerary.findIndex(d => d.events.some(e => e.id === prev.id));
              const currentDayIdx = itinerary.indexOf(day);
              if (prevDayIdx !== -1 && prevDayIdx < currentDayIdx) {
                startTime = "12:00 AM";
              }

              // Check if we already have a travel event between these two activities for this member
              const existingNav = travelEvents.find(t => {
                const tStart = toMinutes(t.startTime);
                const tEnd = toMinutes(t.endTime || t.startTime);
                const pEnd = toMinutes(prev.endTime || prev.startTime);
                const cStart = toMinutes(current.startTime);
                
                // It's a match if it's roughly between the two activities and shares at least one location name
                return (tStart >= pEnd - 10 && tEnd <= cStart + 10) && 
                       (t.origin?.name === prevLoc.name || t.destination?.name === currLoc.name);
              });

              if (existingNav) {
                if (!existingNav.memberIds) existingNav.memberIds = [];
                if (!existingNav.memberIds.includes(mid)) {
                  existingNav.memberIds.push(mid);
                }
              } else {
                travelEvents.push({
                  id: `nav-${prev.id}-${current.id}-${mid}-${Date.now()}`,
                  type: 'travel',
                  category: defaultMode,
                  title: `${defaultTitle} to ${currLoc.name}`,
                  origin: prevLoc,
                  destination: currLoc,
                  startTime,
                  endTime,
                  memberIds: [mid]
                });
              }
            }
          }
          lastEventPerMember[mid] = current;
        });
      });

      // Combine and re-sort
      const finalEvents = [...nonTravelEvents, ...travelEvents].sort((a, b) => {
        const timeA = toMinutes(a.startTime);
        const timeB = toMinutes(b.startTime);
        if (timeA !== timeB) return timeA - timeB;
        if (a.type === 'travel' && b.type !== 'travel') return 1;
        if (a.type !== 'travel' && b.type === 'travel') return -1;
        return 0;
      });

      return { ...day, events: finalEvents };
    });

    setItinerary(newItinerary);
    saveToFirestore(newItinerary);
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
        
        // Auto-sync logic: If template version in DB is older than code, update it
        const dbVersion = data.templateVersion || 0;
        if (dbVersion < TEMPLATE_VERSION && isAdmin) {
          console.log(`Auto-syncing itinerary from version ${dbVersion} to ${TEMPLATE_VERSION}`);
          
          // Save current state to history before overwriting
          const historyRef = doc(collection(db, 'trips', currentTripId, 'history'));
          setDoc(historyRef, {
            days: data.days,
            timestamp: new Date().toISOString(),
            updatedBy: 'System (Auto-Sync)',
            title: data.title,
            isAutoBackup: true
          }).then(() => {
            saveToFirestore(ITINERARY_DATA, data.title, data.dates, true);
          });
        }

        setItinerary(data.days);
        
        // Robust title handling: never accept "Loading..." from DB
        let finalTitle = data.title;
        if (!finalTitle || finalTitle === 'Loading...') {
          finalTitle = currentTripId === 'main' ? 'Arizona 2026' : 'Untitled Trip';
        }

        // Robust dates handling: ensure dates are never missing for main trip
        let finalDates = data.dates;
        if (!finalDates || finalDates === 'Dates TBD') {
          finalDates = currentTripId === 'main' ? 'May 14 - May 19' : 'Dates TBD';
        }

        setTripTitle(finalTitle);
        setTripDates(finalDates);
        setShortlist(data.shortlist || []);
        
        // Robust reservation handling: check for empty objects
        const hasFlights = data.flightInfo && Object.keys(data.flightInfo).length > 0;
        const hasRental = data.rentalInfo && Object.keys(data.rentalInfo).length > 0;
        const hasStays = data.stays && data.stays.length > 0;
        const hasRestaurants = data.restaurants && data.restaurants.length > 0;

        const finalFlights = hasFlights ? data.flightInfo : (currentTripId === 'main' ? FLIGHT_DETAILS : null);
        const finalRental = hasRental ? data.rentalInfo : (currentTripId === 'main' ? RENTAL_DETAILS : null);
        const finalStays = hasStays ? data.stays : (currentTripId === 'main' ? STAY_DETAILS : []);
        const finalRestaurants = hasRestaurants ? data.restaurants : (currentTripId === 'main' ? RESTAURANT_DETAILS : []);

        setFlightInfo(finalFlights);
        setRentalInfo(finalRental);
        setStays(finalStays);
        setRestaurants(finalRestaurants);
        
        setExperiences(data.experiences || []);
        setMembers(data.members || []);
        setIsLoadingTrip(false);

        // Debug log for verification
        console.log(`[Firestore Sync] Trip: "${finalTitle}" | Dates: "${finalDates}" | Flights: ${hasFlights ? 'YES' : 'FALLBACK'} | Stays: ${hasStays ? 'YES' : 'FALLBACK'}`);

        // If we had to use fallbacks for the main trip, push them to Firestore once to "fix" the backend.
        if (currentTripId === 'main' && isAdmin && (
          data.title === 'Loading...' || !data.title || 
          !data.dates || data.dates === 'Dates TBD' ||
          !hasFlights || !hasRental || !hasStays
        )) {
          console.warn("Main trip data incomplete in Firestore. Pushing correct data now...");
          saveToFirestore(
            data.days, 
            finalTitle, 
            finalDates, 
            true, 
            data.shortlist, 
            undefined,
            finalFlights,
            finalRental,
            finalStays,
            finalRestaurants
          );
        }
      } else if (currentTripId === 'main') {
        // Only initialize if we have a user and they are an admin
        if (auth.currentUser && isAdmin) {
          setDoc(tripDoc, { 
            days: ITINERARY_DATA,
            title: 'Arizona 2026',
            dates: 'May 14 - May 19',
            templateVersion: TEMPLATE_VERSION,
            lastUpdated: new Date().toISOString(),
            updatedBy: auth.currentUser.email,
            stays: STAY_DETAILS,
            flightInfo: FLIGHT_DETAILS,
            rentalInfo: RENTAL_DETAILS
          }).catch(err => handleFirestoreError(err, OperationType.WRITE, path));
        }
      } else {
        // Trip doesn't exist and it's not 'main'
        setTripTitle('New Trip');
        setTripDates('Dates TBD');
        setItinerary([]);
        setIsLoadingTrip(false);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    // Sync History
    const historyCollection = collection(db, 'trips', currentTripId, 'history');
    const historyQuery = query(historyCollection, orderBy('timestamp', 'desc'), limit(50));
    const unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
      const history = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      setDbHistory(history);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `${path}/history`);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeSync();
      unsubscribeHistory();
    };
  }, [currentTripId, isAdmin]);

  // Sync Master Travellers
  useEffect(() => {
    if (!user) return;
    const travellersDoc = doc(db, 'settings', 'travellers');
    const unsubscribe = onSnapshot(travellersDoc, (snapshot) => {
      if (snapshot.exists()) {
        setMasterTravellers(snapshot.data().list || []);
      } else if (isAdmin) {
        // Initialize with defaults
        const defaults: TripMember[] = [
          { id: 'ian', name: 'Ian', initials: 'I', color: '#2563eb' },
          { id: 'carrie', name: 'Carrie', initials: 'C', color: '#db2777' },
          { id: 'pepper', name: 'Pepper', initials: 'P', color: '#ea580c' }
        ];
        setDoc(travellersDoc, { list: defaults }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'settings/travellers'));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/travellers');
    });
    return () => unsubscribe();
  }, [user, isAdmin]);

  // Fetch all trips
  useEffect(() => {
    if (!user) return;
    
    const tripsCollection = collection(db, 'trips');
    const unsubscribe = onSnapshot(tripsCollection, (snapshot) => {
      const trips = snapshot.docs.map(doc => {
        const data = doc.data();
        const title = data.title || (doc.id === 'main' ? 'Arizona 2026' : 'New Trip');
        const dates = data.dates || (doc.id === 'main' ? 'May 14 - May 19' : 'Dates TBD');
        const yearMatch = title.match(/\d{4}/) || dates.match(/\d{4}/);
        const year = yearMatch ? yearMatch[0] : new Date().getFullYear().toString();
        
        return {
          id: doc.id,
          title,
          date: dates,
          year
        };
      });
      setTripsList(trips);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });

    return () => unsubscribe();
  }, [user]);

  const toggleEventExpansion = (id: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTripExpansion = (id: string) => {
    setExpandedTrips(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddTrip = () => {
    const id = prompt("Enter a unique ID for the new trip (e.g. japan-2027):");
    if (id) {
      setCurrentTripId(id);
      setView('itinerary');
    }
  };

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

  const handleAddShortlist = (place: any) => {
    const newShortlist = [...shortlist, { ...place, id: Math.random().toString(36).substr(2, 9), addedAt: new Date().toISOString() }];
    setShortlist(newShortlist);
    saveToFirestore(itinerary, tripTitle, tripDates, false, newShortlist);
  };

  const handleRemoveShortlist = (id: string) => {
    const newShortlist = shortlist.filter(p => p.id !== id);
    setShortlist(newShortlist);
    saveToFirestore(itinerary, tripTitle, tripDates, false, newShortlist);
  };

  const handleClearHistory = async () => {
    if (!isAdmin) return;
    if (!window.confirm('Are you sure you want to clear all version history? This cannot be undone.')) return;
    
    try {
      const historyCollection = collection(db, 'trips', currentTripId, 'history');
      const snapshot = await getDocs(historyCollection);
      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `trips/${currentTripId}/history`);
    }
  };

  const handleDeleteActivity = () => {
    if (!editingActivity || editingActivity.actIdx === null) return;
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
  const parseTime = (timeStr: string) => {
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    const d = new Date(currentTime);
    d.setHours(hours, minutes, 0, 0);
    return d;
  };

  // Helper to format date for the day buttons (MMM DD)
  const formatDateButton = (dateStr: string) => {
    try {
      // Handle "Tue Jul 28, 2026" or "Jul 28" or "July 28, 2026"
      const clean = dateStr.includes(',') ? dateStr.split(',')[0].trim() : dateStr.trim();
      
      // If it looks like "Tue Jul 28", we want "Jul 28"
      const parts = clean.split(' ');
      if (parts.length >= 3) {
        // Assume format "Day Month Date" or "Month Date Year"
        // Try to find the month and date
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const fullMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        
        let month = '';
        let day = '';
        
        for (const p of parts) {
          const mIdx = monthNames.findIndex(m => p.startsWith(m));
          const fmIdx = fullMonthNames.findIndex(m => p.startsWith(m));
          if (mIdx !== -1 || fmIdx !== -1) {
            month = monthNames[mIdx !== -1 ? mIdx : fmIdx];
          } else if (!isNaN(parseInt(p))) {
            day = p;
          }
        }
        
        if (month && day) return `${month} ${day}`;
      }
      
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  const isCurrentEvent = (event: TripEvent) => {
    if (!event.startTime || !activeDay) return false;
    
    const tripYear = 2026;
    const tripMonth = 4; // May (0-indexed is 4)
    const day = parseInt(activeDay.date.split(' ')[1]);
    
    // Check if it's the right day
    if (currentTime.getFullYear() !== tripYear || currentTime.getMonth() !== tripMonth || currentTime.getDate() !== day) {
      return false;
    }

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

  const EventTile = ({ 
    event, 
    dayIdx, 
    eventIdx, 
    isGrouped = false 
  }: { 
    event: TripEvent, 
    dayIdx: number, 
    eventIdx: number, 
    isGrouped?: boolean 
  }) => {
    const isCurrent = isCurrentEvent(event);
    const expandable = isEventExpandable(event);

    const getDurationMinutes = (start?: string, end?: string) => {
      if (!start || !end) return 60;
      try {
        const s = parseTime(start);
        const e = parseTime(end);
        const diff = (e.getTime() - s.getTime()) / (1000 * 60);
        return Math.max(diff, 30);
      } catch (e) {
        return 60;
      }
    };

    const duration = getDurationMinutes(event.startTime, event.endTime);
    const heightScale = isGrouped ? 0.6 : 1.2; // Reduced scale for grouped events to prevent excessive height
    const minHeight = isGrouped ? 80 : 100;
    const maxHeight = isGrouped ? 300 : 600; // Cap the height
    const calculatedHeight = Math.min(maxHeight, Math.max(minHeight, duration * heightScale));

    return (
      <div 
        id={event.id}
        onClick={() => expandable && toggleEventExpansion(event.id)}
        className={cn(
          "rounded-2xl transition-all relative w-full border p-4 pl-12",
          event.type === 'travel' 
            ? "bg-transparent border-dashed border-slate-200" 
            : "bg-white border-slate-100 shadow-xl shadow-slate-200/50",
          isCurrent && "ring-2 ring-blue-500/30 border-blue-300",
          event.hidden && "opacity-50 grayscale",
          expandable && "cursor-pointer active:scale-[0.99]"
        )}
        style={{ 
          minHeight: isGrouped ? `${calculatedHeight}px` : 'auto'
        }}
      >
        {/* Category Icon - On the edge */}
        <div className={cn(
          "absolute left-2 top-4 w-8 h-8 rounded-xl flex items-center justify-center border transition-all",
          isCurrent ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-100" : 
          event.type === 'travel' ? "bg-slate-50 border-slate-100 text-slate-400" :
          event.category === 'flight' ? "bg-purple-50 border-purple-100 text-purple-600" :
          event.category === 'drive' ? "bg-orange-50 border-orange-100 text-orange-600" :
          event.category === 'stay' ? "bg-indigo-50 border-indigo-100 text-indigo-600" :
          event.category === 'food' ? "bg-rose-50 border-rose-100 text-rose-600" :
          event.category === 'work' ? "bg-blue-50 border-blue-100 text-blue-600" :
          "bg-emerald-50 border-emerald-100 text-emerald-600"
        )}>
          <EventIcon category={event.category} />
        </div>
        
        {/* Member Initials - Top Right Inside */}
        {event.memberIds && event.memberIds.length > 0 && (
          <div className="absolute top-4 right-4 flex -space-x-1.5 z-20">
            {(event.memberIds.includes('everyone') ? masterTravellers.map(m => m.id) : event.memberIds).map(mid => {
              const member = masterTravellers.find(m => m.id === mid);
              if (!member) return null;
              return (
                <div 
                  key={mid}
                  className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-black text-white shadow-sm"
                  style={{ backgroundColor: member.color }}
                  title={member.name}
                >
                  {member.initials}
                </div>
              );
            })}
          </div>
        )}

        {/* Edit Button */}
        {isEditing && isAdmin && eventIdx !== undefined && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setEditingActivity({ dayIdx, actIdx: eventIdx });
            }}
            className="absolute -top-1 -right-1 p-1.5 bg-blue-600 text-white rounded-full shadow-lg z-30"
            title="Edit Event"
          >
            <Edit2 className="w-2.5 h-2.5" />
          </button>
        )}

        {/* Content Area */}
        <div className={cn("flex flex-col gap-0 min-w-0", event.memberIds && event.memberIds.length > 0 ? "pr-20" : "pr-4")}>
          {/* Header: Title & Time */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
              <h4 className={cn(
                "text-sm font-bold text-slate-800 leading-tight break-words overflow-hidden",
                event.hidden && "line-through"
              )}>
                {event.title}
              </h4>
              {event.suggestions && event.suggestions.length > 0 && (
                <span className="text-[8px] font-black text-blue-600 uppercase tracking-tighter bg-blue-50 px-1 rounded border border-blue-100 shrink-0">
                  Suggestions
                </span>
              )}
              {event.hidden && (
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter bg-slate-100 px-1 rounded border border-slate-200 shrink-0">
                  Cancelled
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {event.type === 'activity' && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleHide(dayIdx, event.id);
                  }}
                  className={cn(
                    "p-1 transition-colors",
                    event.hidden ? "text-red-500 hover:text-red-600" : "text-slate-400 hover:text-blue-600"
                  )}
                  title={event.hidden ? "Restore activity" : "Cancel/Hide activity"}
                >
                  {event.hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>
          {(event.startTime || event.endTime) && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <Clock className="w-2.5 h-2.5" />
              {event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}
            </div>
          )}
          {/* Description */}
          {event.description && (
            <div className={cn(
              "text-[11px] text-slate-500 mt-1 leading-relaxed",
              !expandedEvents.has(event.id) && "line-clamp-1"
            )}>
              {event.description.split(/(https?:\/\/[^\s]+)/g).map((part, i) => 
                part.match(/^https?:\/\//) ? (
                  <a key={i} href={part} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline" onClick={(e) => e.stopPropagation()}>
                    {part}
                  </a>
                ) : part
              )}
            </div>
          )}

          {/* Location / Travel Details */}
          {event.type === 'travel' ? (
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider min-w-0">
                <span className="truncate">{event.origin?.name}</span>
                <ArrowRight className="w-3 h-3 shrink-0" />
                <span className="truncate">{event.destination?.name}</span>
              </div>
              {event.origin && event.destination && (
                <div className="flex gap-1 shrink-0">
                  <a 
                    href={(() => {
                      const mode = event.category === 'walk' ? 'w' : event.category === 'transit' ? 'r' : 'd';
                      const saddr = event.origin ? encodeURIComponent(event.origin.name) : '';
                      const daddr = event.destination ? encodeURIComponent(event.destination.name) : '';
                      let url = `https://maps.apple.com/?saddr=${saddr}&daddr=${daddr}&ll=${event.destination?.lat},${event.destination?.lng}&dirflg=${mode}`;
                      if (event.waypoints && event.waypoints.length > 0) {
                        url += `&to=${event.waypoints.map(w => encodeURIComponent(w.name)).join("&to=")}`;
                      }
                      return url;
                    })()}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 bg-white rounded-lg text-slate-400 hover:text-blue-600 border border-slate-100 shadow-sm"
                    title="Apple Maps Directions"
                  >
                    <Navigation className="w-3 h-3" />
                  </a>
                  <a 
                    href={(() => {
                      const mode = event.category === 'walk' ? 'walking' : event.category === 'transit' ? 'transit' : 'driving';
                      const waypointsStr = event.waypoints?.map(w => encodeURIComponent(w.name)).join('|');
                      return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(event.origin?.name || '')}&destination=${encodeURIComponent(event.destination?.name || '')}${waypointsStr ? `&waypoints=${waypointsStr}` : ''}&travelmode=${mode}`;
                    })()}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 bg-white rounded-lg text-slate-400 hover:text-blue-600 border border-slate-100 shadow-sm"
                    title="Google Maps Directions"
                  >
                    <MapIcon className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          ) : (
            event.location && (
              <div className="mt-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 uppercase tracking-wider min-w-0">
                  <MapPin className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{event.location.name}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <a 
                    href={getAppleMapsUrl(event.location)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 bg-white rounded-lg text-slate-400 hover:text-blue-600 border border-slate-100 shadow-sm"
                    title="Apple Maps"
                  >
                    <Navigation className="w-3 h-3" />
                  </a>
                  <a 
                    href={getGoogleMapsUrl(event.location)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 bg-white rounded-lg text-slate-400 hover:text-blue-600 border border-slate-100 shadow-sm"
                    title="Google Maps"
                  >
                    <MapIcon className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )
          )}
        </div>

        {/* Expanded Content */}
        {expandedEvents.has(event.id) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="overflow-hidden"
          >
            {event.description?.toLowerCase().includes('dog') && (
              <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-600 text-[8px] font-black uppercase rounded-full">
                <Dog className="w-2 h-2" /> Dog Friendly
              </div>
            )}

            {event.suggestions && event.suggestions.length > 0 && (
              <div className="mt-2 space-y-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Suggestions</p>
                <div className="grid grid-cols-1 gap-2">
                  {event.suggestions.map((sug, sIdx) => (
                    <button
                      key={sIdx}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectSuggestion(dayIdx, event.id, sug);
                      }}
                      className={cn(
                        "text-left p-2.5 rounded-xl border transition-all",
                        event.location?.name === sug.name 
                          ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-100' 
                          : 'bg-slate-50 border-slate-100 hover:border-slate-200'
                      )}
                    >
                      <div className="flex justify-between items-start">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-700 truncate">{sug.name}</p>
                          <p className="text-[9px] text-slate-400 truncate">{sug.description}</p>
                        </div>
                        <div className="flex gap-1 shrink-0 ml-2">
                          <a 
                            href={getAppleMapsUrl(sug)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-slate-400 hover:text-blue-600"
                          >
                            <Navigation className="w-2.5 h-2.5" />
                          </a>
                          <a 
                            href={getGoogleMapsUrl(sug)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-slate-400 hover:text-blue-600"
                          >
                            <MapIcon className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Refine Suggestions Input */}
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="relative">
                    <input 
                      type="text"
                      value={isRefining === event.id ? refinePrompt : ''}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        setRefinePrompt(e.target.value);
                        setIsRefining(event.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleRefineSuggestions(dayIdx, event.id);
                        }
                      }}
                      placeholder="Refine suggestions (e.g., 'Italian food')"
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-[10px] focus:ring-2 focus:ring-blue-500 outline-none"
                      disabled={isRefining === event.id && refinePrompt === ''}
                    />
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRefineSuggestions(dayIdx, event.id);
                      }}
                      disabled={isRefining === event.id || !refinePrompt.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-600 disabled:opacity-30"
                    >
                      {isRefining === event.id ? (
                        <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Wand2 className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    );
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
              <button 
                onClick={() => setShowAiAssistant(false)} 
                className="p-1 hover:bg-blue-500 rounded-lg transition-colors"
                title="Close AI Assistant"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {aiProposal ? (
                <div className="space-y-4">
                  <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                    <div className="flex justify-between items-start mb-2">
                       <h3 className="font-bold text-blue-900 flex items-center gap-2">
                        <Wand2 className="w-4 h-4" />
                        Proposed Changes
                      </h3>
                      {aiProposal.modelInfo && (
                        <div className="text-right">
                          <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">{aiProposal.modelInfo.name.replace('-preview', '')}</p>
                          {aiProposal.modelInfo.quotaRemaining !== undefined && (
                            <p className="text-[8px] font-bold text-blue-300">Quota: {aiProposal.modelInfo.quotaRemaining} left today</p>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-blue-800 mb-4 italic">"{aiProposal.explanation || "I've updated your itinerary based on your request. Review the changes below."}"</p>
                    
                    {aiProposal.assumptions && aiProposal.assumptions.length > 0 && (
                      <div className="mb-4 text-left">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">Assumptions</h4>
                        <ul className="space-y-1">
                          {aiProposal.assumptions.map((a, i) => (
                            <li key={i} className={cn(
                              "group text-xs flex items-start gap-2 p-1.5 rounded-xl transition-all",
                              rejectedAssumptionIdxs.includes(i) ? "bg-red-50 text-red-700 opacity-60" : "bg-blue-50/50 text-blue-700"
                            )}>
                              <button 
                                onClick={() => {
                                  if (rejectedAssumptionIdxs.includes(i)) {
                                    setRejectedAssumptionIdxs(prev => prev.filter(idx => idx !== i));
                                  } else {
                                    setRejectedAssumptionIdxs(prev => [...prev, i]);
                                  }
                                }}
                                className={cn(
                                  "mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                  rejectedAssumptionIdxs.includes(i) 
                                    ? "bg-red-500 border-red-500 text-white" 
                                    : "bg-white border-blue-200 text-blue-500"
                                )}
                              >
                                {rejectedAssumptionIdxs.includes(i) ? <X className="w-2.5 h-2.5" /> : <Check className="w-2.5 h-2.5" />}
                              </button>
                              <span className="flex-1 leading-relaxed">{a}</span>
                              <button 
                                onClick={() => setAiPrompt(prev => prev ? `${prev}\n\nRe: Assumption "${a}": ` : `Re: Assumption "${a}": `)}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-100 rounded text-blue-400 transition-opacity"
                                title="Add feedback for this assumption"
                              >
                                <MessageSquare className="w-3 h-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                        {/* Consistently handled below */}
                      </div>
                    )}

                    {aiProposal.suggestions && aiProposal.suggestions.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">Optional Suggestions</h4>
                        <div className="space-y-2">
                          {aiProposal.suggestions.map((s) => (
                            <div 
                              key={s.id} 
                              className={cn(
                                "p-3 rounded-xl border transition-all flex items-center justify-between gap-3",
                                rejectedSuggestionIds.includes(s.id) 
                                  ? "bg-slate-50 border-slate-100 opacity-60" 
                                  : "bg-white border-blue-100 shadow-sm"
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                  s.type === 'activity' ? "bg-green-50 text-green-600" :
                                  s.type === 'food' ? "bg-orange-50 text-orange-600" :
                                  "bg-blue-50 text-blue-600"
                                )}>
                                  {s.type === 'activity' ? <MapPin className="w-4 h-4" /> :
                                   s.type === 'food' ? <Utensils className="w-4 h-4" /> :
                                   <Sparkles className="w-4 h-4" />}
                                </div>
                                <p className="text-xs font-medium text-slate-700 leading-tight">{s.text}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={() => setAiPrompt(prev => prev ? `${prev}\n\nRe: Suggestion "${s.text}": ` : `Re: Suggestion "${s.text}": `)}
                                  className="p-1 px-2 hover:bg-blue-50 rounded-lg text-blue-400 transition-colors"
                                  title="Add feedback for this suggestion"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => {
                                    if (rejectedSuggestionIds.includes(s.id)) {
                                      setRejectedSuggestionIds(prev => prev.filter(id => id !== s.id));
                                    } else {
                                      setRejectedSuggestionIds(prev => [...prev, s.id]);
                                    }
                                  }}
                                  className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center transition-colors shadow-sm",
                                    rejectedSuggestionIds.includes(s.id)
                                      ? "bg-slate-200 text-slate-500"
                                      : "bg-blue-600 text-white"
                                  )}
                                  title={rejectedSuggestionIds.includes(s.id) ? "Approve suggestion" : "Reject suggestion"}
                                >
                                  {rejectedSuggestionIds.includes(s.id) ? <Plus className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {(() => {
                      const coreEvents = aiProposal.itinerary
                        .flatMap(d => d.events)
                        .filter(e => !aiProposal.suggestions?.some(s => s.relatedId === e.id));
                      
                      const nonMealCore = coreEvents.filter(e => 
                        e.category !== 'food' && 
                        e.category !== 'stay' && 
                        e.category !== 'travel' && 
                        e.category !== 'walk' && 
                        e.category !== 'transit' && 
                        e.category !== 'drive'
                      );
                      
                      if (nonMealCore.length > 0) {
                        return (
                          <div className="mb-4">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">Planned Activities (From Prompt)</h4>
                            <div className="flex flex-wrap gap-2">
                              {nonMealCore.map((e, idx) => (
                                <div 
                                  key={idx} 
                                  className={cn(
                                    "px-2 py-1 border rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-sm transition-all",
                                    rejectedCoreIds.includes(e.id)
                                      ? "bg-slate-50 border-slate-100 text-slate-400 line-through opacity-60"
                                      : "bg-white border-blue-100 text-blue-700"
                                  )}
                                >
                                  {e.category === 'flight' || e.category === 'logistics' ? <Plane className="w-2.5 h-2.5" /> : 
                                   e.category === 'work' ? <Briefcase className="w-2.5 h-2.5" /> :
                                   <MapPin className="w-2.5 h-2.5" />}
                                  {e.title}
                                  <button 
                                    onClick={() => {
                                      if (rejectedCoreIds.includes(e.id)) {
                                        setRejectedCoreIds(prev => prev.filter(id => id !== e.id));
                                      } else {
                                        setRejectedCoreIds(prev => [...prev, e.id]);
                                      }
                                    }}
                                    className="ml-1 hover:text-red-500 transition-colors"
                                  >
                                    {rejectedCoreIds.includes(e.id) ? <Plus className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Consistently handled below */}

                    {(rejectedAssumptionIdxs.length > 0 || rejectedSuggestionIds.length > 0 || rejectedCoreIds.length > 0) && (
                      <div className="mb-4 p-4 bg-red-50 rounded-2xl border border-red-100 shadow-sm text-center">
                        <button 
                          onClick={() => {
                            const assumptionRejections = rejectedAssumptionIdxs.map(idx => aiProposal?.assumptions[idx]).join('; ');
                            const suggestionRejections = rejectedSuggestionIds.map(id => aiProposal?.suggestions?.find(s => s.id === id)?.text).filter(Boolean).join('; ');
                            const coreRejections = rejectedCoreIds.map(id => {
                              const event = aiProposal.itinerary.flatMap(d => d.events).find(ev => ev.id === id);
                              return event?.title;
                            }).filter(Boolean).join('; ');
                            
                            let feedback = '';
                            if (assumptionRejections) feedback += `REJECT ASSUMPTIONS: ${assumptionRejections}. `;
                            if (suggestionRejections) feedback += `REJECT SUGGESTIONS: ${suggestionRejections}. `;
                            if (coreRejections) feedback += `REJECT PLANNED ACTIVITIES (I didn't ask for these): ${coreRejections}. `;
                            feedback += `Please rethink the itinerary and provide alternatives or adjustments.`;
                            
                            setAiPrompt(prev => prev ? `${prev}\n\n${feedback}` : feedback);
                            handleAiAction('full', (aiPrompt ? aiPrompt + '\n\n' : '') + feedback);
                          }}
                          className="w-full py-3 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-2 active:scale-95"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Regenerate Proposal with Feedback
                        </button>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button 
                        onClick={applyAiProposal}
                        className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors"
                        title="Apply these changes to your itinerary"
                      >
                        <Check className="w-4 h-4" /> Apply Changes
                      </button>
                      <button 
                        onClick={() => {
                          setAiProposal(null);
                          setRejectedSuggestionIds([]);
                        }}
                        className="flex-1 bg-white text-slate-600 py-2.5 rounded-xl font-bold border border-slate-200 flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
                        title="Discard these changes"
                      >
                        <X className="w-4 h-4" /> Discard
                      </button>
                    </div>
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

            <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-3">
              <div className="relative">
                <textarea 
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g., 'Add a nice dinner spot on Day 1' or 'Make Day 2 more relaxing'"
                  className="w-full bg-white border border-slate-200 rounded-2xl p-3 pr-12 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none h-24"
                  disabled={isAiLoading}
                />
                {isAiLoading && (
                  <div className="absolute right-3 bottom-3">
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {!isAiLoading && (
                <div className="space-y-2">
                  <button 
                    onClick={() => handleAiAction('full')}
                    className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95"
                    title="Generate an itinerary using your prompt"
                  >
                    <Wand2 className="w-3.5 h-3.5" /> {view === 'list' ? 'Create Trip' : 'Update Itinerary'}
                  </button>
                  
                  {view === 'itinerary' && !aiPrompt.trim() && (
                    <button 
                      onClick={() => handleAiAction('autofill')}
                      className="w-full py-2.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-blue-100 transition-all active:scale-95"
                      title="Auto-fill gaps in your itinerary using shortlist and suggestions"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Auto-fill Itinerary
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="px-6 pt-6 pb-4 bg-white border-b border-slate-100 shrink-0 z-[70]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3 min-w-0">
            {view === 'itinerary' && (
              <button 
                onClick={() => setView('list')}
                className="p-2 -ml-2 bg-slate-50 text-slate-600 rounded-full hover:bg-blue-50 hover:text-blue-600 transition-colors"
                title="Back to Trips List"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
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
                ) : (isLoadingTrip ? 'Loading...' : (tripTitle || 'Untitled Trip'))
              )}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-full">
                <button 
                  onClick={() => setShowAiAssistant(!showAiAssistant)}
                  className={cn(
                    "p-2 rounded-full transition-all",
                    showAiAssistant ? "bg-blue-600 text-white shadow-md" : "text-slate-600 hover:bg-white hover:shadow-sm"
                  )}
                  title="AI Assistant"
                >
                  <Sparkles className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setIsEditing(!isEditing)}
                  className={cn(
                    "p-2 rounded-full transition-all",
                    isEditing ? "bg-blue-600 text-white shadow-md" : "text-slate-600 hover:bg-white hover:shadow-sm"
                  )}
                  title={isEditing ? "Stop Editing" : "Enable Editing"}
                >
                  <Edit2 className="w-5 h-5" />
                </button>
              </div>
            )}
            {view === 'itinerary' && isAdmin && (
              <div className="flex gap-1">
                {itineraryHistory.length > 0 && (
                  <button 
                    onClick={handleUndo}
                    className="p-2 bg-slate-100 rounded-full text-slate-600 hover:bg-orange-50 hover:text-orange-600 transition-all"
                    title="Undo last change"
                  >
                    <Undo className="w-5 h-5" />
                  </button>
                )}
              </div>
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
                        className="fixed inset-0 z-[80]" 
                        onClick={() => setShowUserMenu(false)} 
                      />
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-[90] overflow-hidden"
                      >
                        <div className="px-4 py-2 border-b border-slate-50 mb-1">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Account</p>
                          <p className="text-xs font-bold text-slate-700 truncate">{user.email}</p>
                        </div>
                        
                        {isAdmin && (
                          <button 
                            onClick={() => {
                              if (view !== 'travellers') setLastTripView(view as 'itinerary' | 'list');
                              setView('travellers');
                              setShowUserMenu(false);
                            }}
                            className={cn(
                              "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
                              view === 'travellers' ? "text-blue-600 bg-blue-50" : "text-slate-600 hover:bg-slate-50"
                            )}
                            title="Manage Travellers"
                          >
                            <Users className="w-4 h-4" />
                            Travellers
                          </button>
                        )}

                        <button 
                          onClick={() => {
                            setView(lastTripView);
                            setShowUserMenu(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
                            (view === 'list' || view === 'itinerary') ? "text-blue-600 bg-blue-50" : "text-slate-600 hover:bg-slate-50"
                          )}
                          title="View Trips"
                        >
                          <Briefcase className="w-4 h-4" />
                          Trips
                        </button>

                        {view === 'itinerary' && (
                          <button 
                            onClick={() => {
                              setShowHistory(true);
                              setShowUserMenu(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                            title="View previous versions of this itinerary"
                          >
                            <History className="w-4 h-4" />
                            Edit History
                          </button>
                        )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button onClick={() => handleLogin()} className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors" title="Log in with Google">
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
        {view === 'itinerary' && activeTab === 'itinerary' && (
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

      {view === 'travellers' ? (
        <TravellersView 
          travellers={masterTravellers} 
          onUpdate={(list) => {
            setMasterTravellers(list);
            setDoc(doc(db, 'settings', 'travellers'), { list }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'settings/travellers'));
          }} 
        />
      ) : view === 'list' ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {tripsList.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 border-dashed">
              <p className="text-slate-400 text-sm">No trips found. Create your first one!</p>
            </div>
          ) : (
            <div className="space-y-8">
              {(Object.entries(
                tripsList.reduce((acc, trip) => {
                  const year = trip.year || trip.title.match(/\d{4}/)?.[0] || 'Other';
                  if (!acc[year]) acc[year] = [];
                  acc[year].push(trip);
                  return acc;
                }, {} as Record<string, typeof tripsList>)
              ) as [string, typeof tripsList][]).sort((a, b) => b[0].localeCompare(a[0])).map(([year, yearTrips]) => (
                <div key={year} className="space-y-4">
                  <div className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-md py-2 -mx-6 px-6">
                    <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">{year}</h2>
                  </div>
                  <div className="grid gap-4">
                    {yearTrips.map(trip => {
                      // Strip year from title for display
                      const displayTitle = trip.title.replace(/\s*\d{4}\s*/g, ' ').trim();
                      return (
                        <div key={trip.id} className="relative overflow-hidden rounded-3xl group">
                          {/* Delete Action (Behind) */}
                          <div className="absolute inset-0 bg-red-500 flex items-center justify-end px-6 z-0">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log('UI: Delete button clicked for trip:', trip.id);
                                handleDeleteTrip(trip.id);
                              }}
                              className="text-white flex flex-col items-center gap-1 cursor-pointer relative z-10 p-4 active:scale-90 transition-transform"
                            >
                              <Trash2 className="w-6 h-6" />
                              <span className="text-[10px] font-black uppercase tracking-tighter">Delete</span>
                            </button>
                          </div>

                          <motion.div
                            drag="x"
                            dragConstraints={{ left: -100, right: 0 }}
                            dragElastic={0.1}
                            className={cn(
                              "relative w-full text-left p-5 rounded-3xl border transition-all",
                              currentTripId === trip.id 
                                ? "bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-100" 
                                : "bg-white border-slate-100 hover:border-blue-200 text-slate-900"
                            )}
                            onClick={() => {
                              setCurrentTripId(trip.id);
                              setView('itinerary');
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className={cn(
                                  "text-[10px] font-black uppercase tracking-tighter mb-1",
                                  currentTripId === trip.id ? "text-blue-200" : "text-slate-400"
                                )}>
                                  {trip.date}
                                </p>
                                <h3 className="text-lg font-black tracking-tight leading-tight">{displayTitle}</h3>
                              </div>
                              <ChevronRight className={cn(
                                "w-5 h-5 transition-transform group-hover:translate-x-1",
                                currentTripId === trip.id ? "text-blue-200" : "text-slate-300"
                              )} />
                            </div>
                          </motion.div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {isAdmin && (
                <div className="mt-12 p-4 bg-slate-100 rounded-2xl border border-slate-200">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Admin: Raw Firestore Data</h3>
                  <div className="space-y-4">
                    {tripsList.map(t => (
                      <div key={t.id} className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[10px] font-mono text-slate-400 truncate">{t.id}</p>
                          <p className="text-xs font-bold text-slate-700 truncate">{t.title}</p>
                        </div>
                        <button 
                          onClick={() => {
                            if (window.confirm(`FORCE DELETE trip: ${t.id}?`)) {
                              handleDeleteTrip(t.id);
                            }
                          }}
                          className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-tight hover:bg-red-100 transition-colors shrink-0"
                        >
                          Force Delete
                        </button>
                      </div>
                    ))}
                    <pre className="text-[10px] text-slate-600 overflow-x-auto whitespace-pre-wrap font-mono bg-slate-50 p-3 rounded-xl border border-slate-200 mt-4">
                      {JSON.stringify(tripsList, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Day Tabs */}
          {activeTab === 'itinerary' && (
            <div className="space-y-2">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide py-2 px-6">
                {itinerary.map((day, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveDayIdx(i)}
                    className={cn(
                      "flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                      activeDayIdx === i 
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-200 scale-105" 
                        : "bg-slate-100 text-slate-500"
                    )}
                    title={`View Day ${i + 1}: ${day.date}`}
                  >
                    <span className="text-[10px] sm:text-xs font-black tracking-tighter whitespace-nowrap">
                      {formatDateButton(day.date)}
                    </span>
                    {weatherData[i] ? (
                      <WeatherIcon icon={weatherData[i].icon} className="w-3 h-3 opacity-80" />
                    ) : (
                      <span className="text-[10px] opacity-40">-</span>
                    )}
                  </button>
                ))}
              </div>
              
              {/* Filter Pills */}
              <div className="flex gap-2 overflow-x-auto scrollbar-hide px-6 pb-2">
                {[
                  { id: 'all', label: 'All', icon: <Check className="w-3 h-3" /> },
                  { id: 'activity', label: 'Activities', icon: <Sun className="w-3 h-3" /> },
                  { id: 'food', label: 'Meals', icon: <Utensils className="w-3 h-3" /> },
                  { id: 'travel', label: 'Travel', icon: <Car className="w-3 h-3" /> },
                  { id: 'flight', label: 'Flights', icon: <Plane className="w-3 h-3" /> },
                  { id: 'stay', label: 'Stay', icon: <Moon className="w-3 h-3" /> },
                  { id: 'work', label: 'Work', icon: <Briefcase className="w-3 h-3" /> },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setActiveFilter(f.id)}
                    className={cn(
                      "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border",
                      activeFilter === f.id 
                        ? "bg-slate-900 text-white border-slate-900 shadow-sm" 
                        : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
                    )}
                    title={`Filter by ${f.label}`}
                  >
                    {f.icon}
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto scrollbar-hide">
        <AnimatePresence mode="wait">
          {activeTab === 'itinerary' && (
            activeDay ? (
              <motion.div 
                key={`day-${activeDayIdx}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="pb-32"
              >
              <div className="sticky top-0 z-[60] bg-white/80 backdrop-blur-md px-6 py-4 border-b border-slate-50 mb-6">
                <div className="flex justify-between items-start">
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
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-slate-500 font-medium">Day {activeDayIdx + 1} • {activeDay.date}</p>
                        {weatherData[activeDayIdx] ? (
                          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 rounded-full text-blue-600" title={weatherData[activeDayIdx].condition}>
                            <WeatherIcon icon={weatherData[activeDayIdx].icon} className="w-3 h-3" />
                            <span className="text-[10px] font-bold">{weatherData[activeDayIdx].minTemp}-{weatherData[activeDayIdx].maxTemp}°C</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-300">-</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isAdmin && (
                      <div className="flex gap-1">
                        <button 
                          onClick={handleGenerateNavigation}
                          className="p-2 bg-blue-50 rounded-xl text-blue-600 hover:bg-blue-100 transition-colors"
                          title="Generate Navigation"
                        >
                          <Route className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            if (window.confirm('Auto-fill the rest of your itinerary? This will use your shortlisted places and logical suggestions to complete the plan.')) {
                              handleAiAction('autofill');
                            }
                          }}
                          className="p-2 bg-blue-50 rounded-xl text-blue-600 hover:bg-blue-100 transition-colors"
                          title="Auto-fill Itinerary"
                        >
                          <Sparkles className="w-4 h-4" />
                        </button>
                      </div>
                    )}
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
              </div>
              <div className="px-6">
                <div className="space-y-4">
                  {(() => {
                    const eventsWithIdx = (activeDay.events || []).map((e, idx) => ({ ...e, originalIdx: idx }));
                                      // Group events by startTime for overlapping tiles
                    const rawGroups: (TripEvent & { originalIdx: number })[][] = [];
                    let i = 0;
                    while (i < eventsWithIdx.length) {
                      const current = eventsWithIdx[i];
                      const group = [current];
                      let j = i + 1;
                      
                      const toMinutes = (timeStr: string) => {
                        if (!timeStr) return 0;
                        const parts = timeStr.split(' ');
                        const time = parts[0];
                        const modifier = parts[1];
                        let [hours, minutes] = time.split(':').map(Number);
                        if (modifier === 'PM' && hours < 12) hours += 12;
                        if (modifier === 'AM' && hours === 12) hours = 0;
                        return hours * 60 + minutes;
                      };

                      const overlaps = (e1: TripEvent, e2: TripEvent) => {
                        if (!e1.startTime || !e2.startTime) return false;
                        
                        try {
                          const s1 = toMinutes(e1.startTime);
                          const e1_end = toMinutes(e1.endTime || e1.startTime);
                          const s2 = toMinutes(e2.startTime);
                          const e2_end = toMinutes(e2.endTime || e2.startTime);

                          if (s1 === s2) return true;

                          const m1 = e1.memberIds || [];
                          const m2 = e2.memberIds || [];
                          const differentMembers = m1.length > 0 && m2.length > 0 && 
                            (m1.some(id => !m2.includes(id)) || m2.some(id => !m1.includes(id)));

                          if (differentMembers) {
                            return (s1 < e2_end && s2 < e1_end) || Math.abs(s1 - s2) <= 30;
                          }

                          return s1 < e2_end && s2 < e1_end && Math.abs(s1 - s2) < 5;
                        } catch (e) {
                          return false;
                        }
                      };

                      while (j < eventsWithIdx.length && 
                             group.some(e => overlaps(e, eventsWithIdx[j]))) {
                        group.push(eventsWithIdx[j]);
                        j++;
                      }
                      rawGroups.push(group);
                      i = j;
                    }

                    // Deduplicate identical events across members within each group
                    const groupedEvents = rawGroups.map(group => {
                      const deduped: (TripEvent & { originalIdx: number })[] = [];
                      group.forEach(event => {
                        const existing = deduped.find(d => 
                          d.title === event.title && 
                          d.startTime === event.startTime && 
                          d.endTime === event.endTime &&
                          d.location?.name === event.location?.name &&
                          d.type === event.type
                        );
                        if (existing) {
                          // Merge members
                          const allMembers = Array.from(new Set([...(existing.memberIds || []), ...(event.memberIds || [])]));
                          existing.memberIds = allMembers;
                        } else {
                          deduped.push({ ...event });
                        }
                      });
                      return deduped;
                    });

                    return (
                      <div className="space-y-3">
                        {groupedEvents
                          .map((group) => group.filter(event => {
                            if (activeFilter === 'all') return true;
                            if (activeFilter === 'activity') return event.category === 'activity' || event.category === 'walk';
                            if (activeFilter === 'food') return event.category === 'food';
                            if (activeFilter === 'travel') return event.type === 'travel' || event.category === 'drive' || event.category === 'transit';
                            if (activeFilter === 'flight') return event.category === 'flight';
                            if (activeFilter === 'stay') return event.category === 'stay';
                            return true;
                          }))
                          .filter(group => group.length > 0)
                          .map((group, groupIdx) => {
                            const mainEvent = group[0];
                            const isMainCurrent = isCurrentEvent(mainEvent);
                            
                            const groupId = `${activeDayIdx}-${groupIdx}`;
                            const activeIdx = activeGroupIndices[groupId] ?? 0;

                             return (
                              <div key={groupIdx} className="relative">
                                {group.length > 1 ? (
                                  <div className="relative">
                                    <div 
                                      ref={scrollRef}
                                      onScroll={(e) => {
                                        const scrollLeft = e.currentTarget.scrollLeft;
                                        const width = e.currentTarget.offsetWidth;
                                        const idx = Math.round(scrollLeft / width);
                                        setActiveColumnIdx(idx);
                                      }}
                                      className="flex gap-4 items-stretch overflow-x-auto scrollbar-hide snap-x snap-mandatory -mx-6 px-6 pb-6"
                                    >
                                      {(() => {
                                        // Get all unique members involved in this group
                                        const involvedMemberIds = new Set<string>();
                                        group.forEach(event => {
                                          if (event.memberIds && event.memberIds.length > 0) {
                                            event.memberIds.forEach(id => {
                                              if (id !== 'everyone') involvedMemberIds.add(id);
                                            });
                                          }
                                        });

                                        // Check if all events in the group are shared by all involved members
                                        const allEventsShared = group.every(event => {
                                          const eventMembers = event.memberIds || [];
                                          if (eventMembers.length === 0 || eventMembers.includes('everyone')) return true;
                                          return Array.from(involvedMemberIds).every(id => eventMembers.includes(id));
                                        });

                                        // If no specific members, or only 'everyone', or all events are shared, just show one column
                                        if (involvedMemberIds.size <= 1 || allEventsShared) {
                                          return (
                                            <div className="flex-1 min-w-[280px] snap-center flex flex-col gap-2">
                                              {group.map((event) => (
                                                <div key={`${event.id}-shared`} className="flex-1 flex flex-col">
                                                  <EventTile 
                                                    event={event} 
                                                    dayIdx={activeDayIdx}
                                                    eventIdx={event.originalIdx!}
                                                    isGrouped={true}
                                                  />
                                                </div>
                                              ))}
                                            </div>
                                          );
                                        }

                                        // Create a column for each involved member
                                        const sortedMemberIds = Array.from(involvedMemberIds).sort((a, b) => {
                                          const aIdx = masterTravellers.findIndex(m => m.id === a);
                                          const bIdx = masterTravellers.findIndex(m => m.id === b);
                                          return aIdx - bIdx;
                                        });

                                        // Group members by their event lists
                                        const memberGroups: { memberIds: string[], events: TripEvent[] }[] = [];
                                        
                                        sortedMemberIds.forEach(mid => {
                                          const memberEvents = group.filter(e => 
                                            !e.memberIds || 
                                            e.memberIds.length === 0 || 
                                            e.memberIds.includes('everyone') || 
                                            e.memberIds.includes(mid)
                                          );
                                          
                                          if (memberEvents.length === 0) return;

                                          // Find if another member has the exact same events
                                          const existingGroup = memberGroups.find(mg => {
                                            if (mg.events.length !== memberEvents.length) return false;
                                            return mg.events.every((e, i) => e.id === memberEvents[i].id);
                                          });

                                          if (existingGroup) {
                                            existingGroup.memberIds.push(mid);
                                          } else {
                                            memberGroups.push({ memberIds: [mid], events: memberEvents });
                                          }
                                        });

                                        return memberGroups.map((mg, colIdx) => {
                                          const groupKey = mg.memberIds.join('-');
                                          const isActive = activeColumnIdx === colIdx;
                                          
                                          return (
                                            <motion.div 
                                              key={groupKey} 
                                              animate={{ 
                                                scale: isActive ? 1 : 0.9,
                                                opacity: isActive ? 1 : 0.5,
                                                x: isActive ? 0 : (colIdx < activeColumnIdx ? 10 : -10)
                                              }}
                                              className={cn(
                                                "flex-1 min-w-[85%] snap-center flex flex-col gap-2 transition-all duration-300",
                                                !isActive && "cursor-pointer"
                                              )}
                                              onClick={() => {
                                                if (!isActive && scrollRef.current) {
                                                  scrollRef.current.scrollTo({
                                                    left: colIdx * scrollRef.current.offsetWidth,
                                                    behavior: 'smooth'
                                                  });
                                                }
                                              }}
                                            >
                                              <div className={cn(
                                                "px-3 py-1.5 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-2",
                                                isActive ? "bg-white border-slate-100 shadow-sm" : "bg-slate-50 border-transparent"
                                              )}>
                                                <div className="flex items-center gap-2 min-w-0">
                                                  <div className="flex -space-x-1.5">
                                                    {mg.memberIds.map(mid => {
                                                      const member = masterTravellers.find(m => m.id === mid);
                                                      return (
                                                        <div 
                                                          key={mid}
                                                          className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                                                          style={{ backgroundColor: member?.color || '#cbd5e1' }}
                                                        >
                                                          {member?.initials}
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                  {isActive && (
                                                    <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest truncate">
                                                      {mg.memberIds.map(mid => masterTravellers.find(m => m.id === mid)?.name || mid).join(' & ')}
                                                    </p>
                                                  )}
                                                </div>
                                                
                                                <div className="flex gap-1">
                                                  {Array.from(new Set(mg.events.map(e => e.category))).slice(0, 3).map(cat => (
                                                    <div key={cat} className={cn(isActive ? "text-slate-400" : "text-slate-300")}>
                                                      {cat === 'food' ? <Utensils className="w-3 h-3" /> :
                                                       cat === 'stay' ? <Home className="w-3 h-3" /> :
                                                       cat === 'logistics' ? <Plane className="w-3 h-3" /> :
                                                       <MapPin className="w-3 h-3" />}
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                              
                                              <div className={cn(
                                                "flex-1 flex flex-col gap-2 transition-all duration-500",
                                                isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none overflow-hidden h-0"
                                              )}>
                                                {mg.events.map((event) => (
                                                  <div key={`${event.id}-${groupKey}`} className="flex-1 flex flex-col">
                                                    <EventTile 
                                                      event={event} 
                                                      dayIdx={activeDayIdx}
                                                      eventIdx={event.originalIdx!}
                                                      isGrouped={true}
                                                    />
                                                  </div>
                                                ))}
                                              </div>
                                              
                                              {!isActive && (
                                                <div className="flex-1 flex flex-col items-center justify-center py-8 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/50">
                                                  <div className="flex flex-col items-center gap-2 opacity-40">
                                                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                                                      <ChevronRight className={cn("w-4 h-4 text-slate-400", colIdx < activeColumnIdx && "rotate-180")} />
                                                    </div>
                                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">View Itinerary</span>
                                                  </div>
                                                </div>
                                              )}
                                            </motion.div>
                                          );
                                        });
                                      })()}
                                    </div>
                                    
                                    {/* Column Indicators */}
                                    <div className="flex justify-center gap-1.5 mt-2">
                                      {(() => {
                                        // Need to recalculate memberGroups for indicators
                                        const involvedMemberIds = new Set<string>();
                                        group.forEach(event => {
                                          if (event.memberIds && event.memberIds.length > 0) {
                                            event.memberIds.forEach(id => {
                                              if (id !== 'everyone') involvedMemberIds.add(id);
                                            });
                                          }
                                        });
                                        const sortedMemberIds = Array.from(involvedMemberIds).sort((a, b) => {
                                          const aIdx = masterTravellers.findIndex(m => m.id === a);
                                          const bIdx = masterTravellers.findIndex(m => m.id === b);
                                          return aIdx - bIdx;
                                        });
                                        const memberGroups: string[] = [];
                                        const processedMids = new Set<string>();
                                        sortedMemberIds.forEach(mid => {
                                          if (processedMids.has(mid)) return;
                                          const memberEvents = group.filter(e => !e.memberIds || e.memberIds.length === 0 || e.memberIds.includes('everyone') || e.memberIds.includes(mid));
                                          const sameEventsMids = sortedMemberIds.filter(otherMid => {
                                            const otherEvents = group.filter(e => !e.memberIds || e.memberIds.length === 0 || e.memberIds.includes('everyone') || e.memberIds.includes(otherMid));
                                            if (otherEvents.length !== memberEvents.length) return false;
                                            return otherEvents.every((e, i) => e.id === memberEvents[i].id);
                                          });
                                          memberGroups.push(sameEventsMids.join('-'));
                                          sameEventsMids.forEach(id => processedMids.add(id));
                                        });

                                        if (memberGroups.length <= 1) return null;

                                        return memberGroups.map((_, idx) => (
                                          <div 
                                            key={idx} 
                                            className={cn(
                                              "w-1.5 h-1.5 rounded-full transition-all duration-300",
                                              activeColumnIdx === idx ? "bg-blue-600 w-4" : "bg-slate-200"
                                            )} 
                                          />
                                        ));
                                      })()}
                                    </div>
                                  </div>
                                ) : (
                                  <EventTile 
                                    event={group[0]} 
                                    dayIdx={activeDayIdx}
                                    eventIdx={group[0].originalIdx!}
                                  />
                                )}
                              </div>
                            );
                          })}
                      </div>
                    );
                  })()}
                </div>
    
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
            </motion.div>
          ) : (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-slate-200" />
              </div>
              <p className="text-slate-400 text-sm">No itinerary data available for this day.</p>
              <button 
                onClick={() => setView('list')}
                className="mt-4 text-blue-600 text-xs font-bold hover:underline"
              >
                Back to Trips
              </button>
            </div>
          )
        )}

          {activeTab === 'places' && (
            <motion.div key="places" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
              <PlacesView 
                itinerary={itinerary}
                shortlist={shortlist}
                onAddShortlist={handleAddShortlist}
                onRemoveShortlist={handleRemoveShortlist}
                isAdmin={isAdmin}
                onUpdateItinerary={setItinerary}
                onSaveToFirestore={saveToFirestore}
                onNavigateToEvent={(dayIdx, eventId) => {
                  setActiveDayIdx(dayIdx);
                  setActiveTab('itinerary');
                  // Give it a moment to switch tabs and render
                  setTimeout(() => {
                    const el = document.getElementById(eventId);
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      // Add a brief highlight effect
                      el.classList.add('ring-4', 'ring-blue-400', 'ring-offset-2');
                      setTimeout(() => {
                        el.classList.remove('ring-4', 'ring-blue-400', 'ring-offset-2');
                      }, 2000);
                    }
                  }, 300); // Slightly longer timeout to ensure tab transition completes
                }}
              />
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
                {/* Trip Members */}
                {members && members.length > 0 && (
                  <section>
                    <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Briefcase className="w-5 h-5 text-blue-600" /> Trip Members
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                      {members.map((member) => (
                        <div key={member.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
                          <div 
                            className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-black text-white shadow-sm shrink-0"
                            style={{ backgroundColor: member.color }}
                          >
                            {member.initials}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate">{member.name}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Member</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {hasFlightInfo && (
                  <section>
                    <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Plane className="w-5 h-5 text-blue-600" /> Flight Info
                    </h2>
                    <div className="space-y-3">
                      {flightInfo.outbound && (
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                          <div className="flex justify-between items-start mb-2">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Outbound • {flightInfo.outbound.date || 'TBD'}</p>
                            <div className="text-right">
                              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Ref: {flightInfo.outbound.confirmation || 'N/A'}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div><p className="text-xl font-bold text-slate-900">{flightInfo.outbound.from || 'TBD'}</p></div>
                            <div className="flex flex-col items-center px-4 flex-1">
                              <p className="text-[10px] font-bold text-blue-600 mb-1">{flightInfo.outbound.number || '---'}</p>
                              <div className="w-full h-[1px] bg-slate-200 relative"><Plane className="w-3 h-3 text-slate-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white" /></div>
                            </div>
                            <div className="text-right"><p className="text-xl font-bold text-slate-900">{flightInfo.outbound.to || 'TBD'}</p></div>
                          </div>
                        </div>
                      )}
                      {flightInfo.return && (
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                          <div className="flex justify-between items-start mb-2">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Return • {flightInfo.return.date || 'TBD'}</p>
                            <div className="text-right">
                              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Ref: {flightInfo.return.confirmation || 'N/A'}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div><p className="text-xl font-bold text-slate-900">{flightInfo.return.from || 'TBD'}</p></div>
                            <div className="flex flex-col items-center px-4 flex-1">
                              <p className="text-[10px] font-bold text-blue-600 mb-1">{flightInfo.return.number || '---'}</p>
                              <div className="w-full h-[1px] bg-slate-200 relative rotate-180"><Plane className="w-3 h-3 text-slate-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white" /></div>
                            </div>
                            <div className="text-right"><p className="text-xl font-bold text-slate-900">{flightInfo.return.to || 'TBD'}</p></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                )}
                
                {hasRentalInfo && (
                  <section>
                    <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Car className="w-5 h-5 text-blue-600" /> Rental Car
                    </h2>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="font-bold text-slate-900">{rentalInfo.company || 'Rental Car'}</h3>
                          <p className="text-xs text-slate-500">{rentalInfo.car || 'Vehicle Details'}</p>
                          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mt-1">Ref: {rentalInfo.confirmation || 'N/A'}</p>
                        </div>
                        <div className="p-2 bg-blue-50 rounded-full"><Car className="w-5 h-5 text-blue-600" /></div>
                      </div>
                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-400 font-bold uppercase">Pickup</span>
                          <span className="text-slate-700 font-medium">{rentalInfo.pickup || 'TBD'}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-slate-400 font-bold uppercase">Dropoff</span>
                          <span className="text-slate-700 font-medium">{rentalInfo.dropoff || 'TBD'}</span>
                        </div>
                      </div>
                      {rentalInfo.phone && (
                        <a href={`tel:${rentalInfo.phone}`} className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold">Call {rentalInfo.company} <ExternalLink className="w-4 h-4" /></a>
                      )}
                    </div>
                  </section>
                )}

                {stays && stays.length > 0 && (
                  <section>
                    <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Home className="w-5 h-5 text-blue-600" /> Stays
                    </h2>
                    <div className="space-y-3">
                      {stays.map((stay, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-bold text-slate-900">{stay.name}</h3>
                            <div className="p-2 bg-blue-50 rounded-full"><Home className="w-4 h-4 text-blue-600" /></div>
                          </div>
                          <div className="space-y-1 mb-3">
                            <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> {stay.location}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stay.checkIn} — {stay.checkOut}</p>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Ref: {stay.confirmation || 'N/A'}</p>
                            {stay.phone && (
                              <a href={`tel:${stay.phone}`} className="text-[10px] font-bold text-slate-900 flex items-center gap-1">
                                <ExternalLink className="w-3 h-3" /> Call
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {restaurants && restaurants.length > 0 && (
                  <section>
                    <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Utensils className="w-5 h-5 text-blue-600" /> Dining Reservations
                    </h2>
                    <div className="space-y-3">
                      {restaurants.map((res, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-bold text-slate-900">{res.name}</h3>
                            <div className="p-2 bg-blue-50 rounded-full"><Utensils className="w-4 h-4 text-blue-600" /></div>
                          </div>
                          <div className="flex items-center gap-3 mb-3">
                            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              <Calendar className="w-3 h-3" /> {res.date}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              <Clock className="w-3 h-3" /> {res.time}
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Ref: {res.confirmation || 'N/A'}</p>
                            {res.phone && (
                              <a href={`tel:${res.phone}`} className="text-[10px] font-bold text-slate-900 flex items-center gap-1">
                                <ExternalLink className="w-3 h-3" /> Call
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {experiences && experiences.length > 0 && (
                  <section>
                    <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Ticket className="w-5 h-5 text-blue-600" /> Experiences
                    </h2>
                    <div className="space-y-3">
                      {experiences.map((exp, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-bold text-slate-900">{exp.name}</h3>
                            <div className="p-2 bg-blue-50 rounded-full"><Ticket className="w-4 h-4 text-blue-600" /></div>
                          </div>
                          <div className="space-y-1 mb-3">
                            <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> {exp.location || 'TBD'}</p>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <Calendar className="w-3 h-3" /> {exp.date}
                              </div>
                              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                <Clock className="w-3 h-3" /> {exp.time}
                              </div>
                            </div>
                          </div>
                          {exp.confirmation && (
                            <div className="pt-2 border-t border-slate-50">
                              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Ref: {exp.confirmation}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {!hasFlightInfo && !hasRentalInfo && (!stays || stays.length === 0) && (!restaurants || restaurants.length === 0) && (!experiences || experiences.length === 0) && (
                  <section className="text-center py-12 bg-white rounded-3xl border border-slate-100 border-dashed">
                    <p className="text-slate-400 text-sm">No reservation details available for this trip.</p>
                  </section>
                )}

                {isAdmin && (
                  <section className="pt-4 border-t border-slate-200">
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                      <h3 className="text-sm font-bold text-blue-900 mb-1 flex items-center gap-2">
                        <Sparkles className="w-4 h-4" /> Admin Tools
                      </h3>
                      <p className="text-xs text-blue-700 mb-4">
                        If the itinerary data seems out of sync or you want to reset to the default template, use the button below.
                      </p>
                      <button 
                        onClick={() => {
                          if (window.confirm('Reset current trip to the default template? This will overwrite any manual changes in Firestore.')) {
                            setItinerary(ITINERARY_DATA);
                            setStays(STAY_DETAILS);
                            setRestaurants(RESTAURANT_DETAILS);
                            saveToFirestore(ITINERARY_DATA, 'Arizona 2026', 'May 14 - May 19', false, [], undefined, FLIGHT_DETAILS, RENTAL_DETAILS, STAY_DETAILS, RESTAURANT_DETAILS);
                            alert('Itinerary reset to template successfully.');
                          }
                        }}
                        className="w-full py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md active:scale-95 transition-transform"
                      >
                        Reset to Template
                      </button>
                    </div>
                  </section>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </>
  )}

      {/* Modals */}
      <AnimatePresence>
        {showHistory && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Version History</h3>
                  <p className="text-xs text-slate-400 font-medium">Restore previous versions of your trip</p>
                </div>
                <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              {isAdmin && dbHistory.length > 0 && (
                <div className="px-6 py-2 bg-slate-50 border-b border-slate-100 flex justify-end">
                  <button 
                    onClick={handleClearHistory}
                    className="text-[10px] font-black text-red-400 hover:text-red-600 uppercase tracking-widest transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Clear All History
                  </button>
                </div>
              )}
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                {dbHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <History className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 text-sm">No history found yet.</p>
                  </div>
                ) : (
                  dbHistory.map((version, i) => (
                    <div 
                      key={version.id}
                      className={cn(
                        "bg-white p-4 rounded-2xl border transition-all",
                        i === 0 ? "border-blue-200 ring-1 ring-blue-50" : "border-slate-100"
                      )}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-xs font-bold text-slate-700">
                            {new Date(version.timestamp).toLocaleString()}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            By {version.updatedBy}
                          </p>
                        </div>
                        {i === 0 ? (
                          <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                            Current
                          </span>
                        ) : (
                          <button 
                            onClick={() => {
                              if (window.confirm('Restore this version?')) {
                                setItinerary(version.days);
                                saveToFirestore(version.days);
                                setShowHistory(false);
                              }
                            }}
                            className="text-[10px] font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest bg-slate-50 hover:bg-blue-50 px-3 py-1 rounded-lg border border-slate-100 transition-all"
                          >
                            Restore
                          </button>
                        )}
                      </div>
                      <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                        {version.days.map((day, dIdx) => (
                          <div key={dIdx} className="shrink-0 px-2 py-1 bg-slate-50 rounded text-[8px] font-bold text-slate-500 border border-slate-100">
                            {day.date}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
      {view === 'itinerary' && (
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/80 backdrop-blur-xl border-t border-slate-100 px-6 py-4 pb-10 flex justify-around items-center z-50">
          <button onClick={() => setActiveTab('itinerary')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'itinerary' ? "text-blue-600" : "text-slate-400")} title="View Itinerary">
            <Calendar className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Itinerary</span>
          </button>
          <button onClick={() => setActiveTab('places')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'places' ? "text-blue-600" : "text-slate-400")} title="View Shortlisted Places">
            <MapPin className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Places</span>
          </button>
          {hasDriving && rentalInfo && (
            <button onClick={() => setActiveTab('gas')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'gas' ? "text-blue-600" : "text-slate-400")} title="Gas & Logistics">
              <Fuel className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Gas</span>
            </button>
          )}
          <button onClick={() => setActiveTab('info')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'info' ? "text-blue-600" : "text-slate-400")} title="Reservations & Bookings">
            <Info className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Reservations</span>
          </button>
        </nav>
      )}
    </div>
  );
}
