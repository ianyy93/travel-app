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
  ArrowLeft,
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
  Navigation,
  History,
  ShoppingBag,
  Home,
  Filter
} from 'lucide-react';
import { 
  ITINERARY_DATA, 
  FLIGHT_DETAILS, 
  RENTAL_DETAILS, 
  GAS_STATIONS, 
  TEMPLATE_VERSION,
  DayPlan, 
  TripEvent,
  TripCategory,
  Location
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
  isAdmin 
}: { 
  itinerary: DayPlan[], 
  shortlist: any[], 
  onAddShortlist: (place: any) => void,
  onRemoveShortlist: (id: string) => void,
  isAdmin: boolean 
}) => {
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Extract all places from itinerary
  const itineraryPlaces = useMemo(() => {
    const places: any[] = [];
    const seen = new Set<string>();

    const addPlace = (loc: Location, category: string, id: string, dayDate: string) => {
      const key = `${loc.name}-${loc.lat}-${loc.lng}`;
      if (seen.has(key)) return;
      seen.add(key);
      places.push({
        id,
        name: loc.name,
        category,
        location: loc,
        source: 'itinerary',
        dayDate
      });
    };

    const isLogistics = (name: string, eventCat: string) => {
      const lowerName = name.toLowerCase();
      const logisticsKeywords = ['airport', 'rental', 'station', 'terminal', 'gas', 'parking', 'shuttle', 'yyz', 'phx'];
      if (logisticsKeywords.some(k => lowerName.includes(k))) return true;
      if (eventCat === 'flight' || eventCat === 'transit') return true;
      return false;
    };

    itinerary.forEach(day => {
      day.events.forEach(event => {
        if (event.location) {
          let cat = 'attraction';
          if (event.category === 'food') cat = 'restaurant';
          if (event.category === 'stay') cat = 'stay';
          if (isLogistics(event.location.name, event.category)) cat = 'logistics';
          addPlace(event.location, cat, `itinerary-${event.id}`, day.date);
        }
        if (event.origin) {
          let cat = isLogistics(event.origin.name, event.category) ? 'logistics' : 'attraction';
          addPlace(event.origin, cat, `itinerary-${event.id}-origin`, day.date);
        }
        if (event.destination) {
          let cat = isLogistics(event.destination.name, event.category) ? 'logistics' : 'attraction';
          addPlace(event.destination, cat, `itinerary-${event.id}-dest`, day.date);
        }
      });
    });
    return places;
  }, [itinerary]);

  const allPlaces = [...itineraryPlaces, ...shortlist.map(p => ({ ...p, source: 'shortlist' }))];

  const filteredPlaces = allPlaces.filter(p => {
    const matchesFilter = filter === 'all' || p.category === filter;
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 pb-32 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Places</h2>
        {isAdmin && (
          <button 
            onClick={() => setShowAddModal(true)}
            className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-100"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}
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
          {['all', 'attraction', 'restaurant', 'shopping', 'stay', 'logistics'].map(cat => (
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

      {/* Places List */}
      <div className="grid gap-4">
        {filteredPlaces.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 border-dashed">
            <p className="text-slate-400 text-sm">No places found matching your filter.</p>
          </div>
        ) : (
          filteredPlaces.map((place, idx) => (
            <div key={idx} className="bg-white p-4 rounded-3xl border border-slate-100 flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center",
                  place.category === 'restaurant' ? "bg-orange-50 text-orange-600" :
                  place.category === 'shopping' ? "bg-purple-50 text-purple-600" :
                  place.category === 'stay' ? "bg-blue-50 text-blue-600" :
                  place.category === 'logistics' ? "bg-slate-100 text-slate-600" :
                  "bg-green-50 text-green-600"
                )}>
                  {place.category === 'restaurant' ? <Utensils className="w-5 h-5" /> :
                   place.category === 'shopping' ? <ShoppingBag className="w-5 h-5" /> :
                   place.category === 'stay' ? <Home className="w-5 h-5" /> :
                   place.category === 'logistics' ? <Plane className="w-5 h-5" /> :
                   <MapPin className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 leading-tight">{place.name}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-black uppercase tracking-tighter text-slate-400">
                      {place.category}
                    </span>
                    {place.dayDate && (
                      <span className="text-[10px] font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                        {place.dayDate}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
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
  const [view, setView] = useState<'itinerary' | 'list'>('list');
  const [currentTripId, setCurrentTripId] = useState<string>('main');
  const [shortlist, setShortlist] = useState<any[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [expandedTrips, setExpandedTrips] = useState<Set<string>>(new Set());
  const [tripsList, setTripsList] = useState<{id: string, title: string, date: string, year?: string}[]>([]);
  const [tripTitle, setTripTitle] = useState('Arizona 2026');
  const [tripDates, setTripDates] = useState('May 14 - May 21');
  const [itineraryHistory, setItineraryHistory] = useState<DayPlan[][]>([]);
  const [dbHistory, setDbHistory] = useState<{id: string, days: DayPlan[], timestamp: string, updatedBy: string}[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [aiProposal, setAiProposal] = useState<GeminiProposal | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  const [activeFilter, setActiveFilter] = useState<string>('all');

  const isAdmin = useMemo(() => {
    const admins = ['ianyy93@gmail.com', 'wingin.carrie@gmail.com'];
    return user && admins.includes(user.email || '');
  }, [user]);
  
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
    
    if (view === 'list') {
      // Create a new trip from proposal
      const baseTitle = aiProposal.itinerary[0]?.title || 'New Trip';
      const newId = baseTitle.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substr(2, 5);
      setCurrentTripId(newId);
      setItinerary(aiProposal.itinerary);
      saveToFirestore(aiProposal.itinerary, undefined, undefined, false, [], newId);
      setView('itinerary');
    } else {
      setItineraryHistory(prev => [...prev, itinerary]);
      setItinerary(aiProposal.itinerary);
      saveToFirestore(aiProposal.itinerary);
    }
    
    setAiProposal(null);
    setShowAiAssistant(false);
  };

  const saveToFirestore = async (data: DayPlan[], title?: string, dates?: string, isAutoSync = false, currentShortlist?: any[], tripIdOverride?: string) => {
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
      await setDoc(tripDoc, { 
        days: data,
        title: title || tripTitle,
        dates: dates || tripDates,
        templateVersion: TEMPLATE_VERSION,
        lastUpdated: new Date().toISOString(),
        updatedBy: auth.currentUser.email,
        isAutoSync,
        shortlist: currentShortlist || shortlist
      }, { merge: true });

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

  const handleDeleteTrip = async (tripId: string) => {
    if (!isAdmin) {
      setLoginError("You do not have permission to delete trips.");
      return;
    }
    if (!window.confirm('Are you sure you want to delete this trip?')) return;
    
    try {
      await deleteDoc(doc(db, 'trips', tripId));
    } catch (error) {
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
        setTripTitle(data.title || 'Arizona 2026');
        setTripDates(data.dates || 'May 14 - May 19');
        setShortlist(data.shortlist || []);
      } else if (currentTripId === 'main') {
        // Only initialize if we have a user and they are an admin
        if (auth.currentUser && isAdmin) {
          setDoc(tripDoc, { 
            days: ITINERARY_DATA,
            title: 'Arizona 2026',
            dates: 'May 14 - May 19',
            templateVersion: TEMPLATE_VERSION,
            lastUpdated: new Date().toISOString(),
            updatedBy: auth.currentUser.email
          }).catch(err => handleFirestoreError(err, OperationType.WRITE, path));
        }
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

  // Fetch all trips
  useEffect(() => {
    if (!user) return;
    
    const tripsCollection = collection(db, 'trips');
    const unsubscribe = onSnapshot(tripsCollection, (snapshot) => {
      const trips = snapshot.docs.map(doc => {
        const data = doc.data();
        const title = data.title || (doc.id === 'main' ? 'Arizona 2026' : 'Untitled Trip');
        const dates = data.dates || 'May 14 - May 19';
        const yearMatch = title.match(/\d{4}/) || dates.match(/\d{4}/);
        const year = yearMatch ? yearMatch[0] : 'Other';
        
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

  const isCurrentEvent = (event: TripEvent) => {
    if (!event.startTime) return false;
    
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
          <div className="flex items-center gap-3 min-w-0">
            {view === 'itinerary' && (
              <button 
                onClick={() => setView('list')}
                className="p-2 -ml-2 bg-slate-50 text-slate-600 rounded-full hover:bg-blue-50 hover:text-blue-600 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-2xl font-black text-slate-900 tracking-tight truncate">
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
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
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

      {view === 'list' ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {tripsList.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 border-dashed">
              <p className="text-slate-400 text-sm">No trips found. Create your first one!</p>
            </div>
          ) : (
            <div className="space-y-8">
              {(Object.entries(
                tripsList.reduce((acc, trip) => {
                  const year = trip.year || 'Other';
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
                          <div className="absolute inset-0 bg-red-500 flex items-center justify-end px-6">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTrip(trip.id);
                              }}
                              className="text-white flex flex-col items-center gap-1"
                            >
                              <Trash2 className="w-5 h-5" />
                              <span className="text-[8px] font-black uppercase tracking-tighter">Delete</span>
                            </button>
                          </div>

                          <motion.div
                            drag="x"
                            dragConstraints={{ left: -80, right: 0 }}
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
              
              {/* Filter Pills */}
              <div className="flex gap-2 overflow-x-auto scrollbar-hide px-6 pb-2">
                {[
                  { id: 'all', label: 'All', icon: <Check className="w-3 h-3" /> },
                  { id: 'activity', label: 'Activities', icon: <Sun className="w-3 h-3" /> },
                  { id: 'food', label: 'Meals', icon: <Utensils className="w-3 h-3" /> },
                  { id: 'travel', label: 'Travel', icon: <Car className="w-3 h-3" /> },
                  { id: 'flight', label: 'Flights', icon: <Plane className="w-3 h-3" /> },
                  { id: 'stay', label: 'Stay', icon: <Moon className="w-3 h-3" /> },
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
            <motion.div 
              key={`day-${activeDayIdx}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x > 100) {
                  if (activeDayIdx > 0) {
                    setActiveDayIdx(activeDayIdx - 1);
                  } else {
                    setView('list');
                  }
                } else if (info.offset.x < -100) {
                  if (activeDayIdx < itinerary.length - 1) {
                    setActiveDayIdx(activeDayIdx + 1);
                  }
                }
              }}
              className="pb-32"
            >
              <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md px-6 py-4 border-b border-slate-50 mb-6">
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
                      <p className="text-sm text-slate-500 font-medium">Day {activeDayIdx + 1} • {activeDay.date}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isAdmin && (
                      <div className="flex gap-1">
                        <button 
                          onClick={() => setShowHistory(true)}
                          className="p-2 bg-slate-50 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors"
                          title="Version History"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            if (window.confirm('Update itinerary from code template? This fixes location and structure issues but resets manual edits.')) {
                              setItinerary(ITINERARY_DATA);
                              saveToFirestore(ITINERARY_DATA);
                            }
                          }}
                          className="p-2 bg-blue-50 rounded-xl text-blue-600 hover:bg-blue-100 transition-colors"
                          title="Sync with Template"
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
                    const events = activeDay.events;
                    const processed: (TripEvent & { isAuto?: boolean; originalIdx?: number })[] = [];
                    
                    for (let i = 0; i < events.length; i++) {
                      let current = { ...events[i] };
                      
                      // For travel events, ensure they have origin/destination
                      if (current.type === 'travel') {
                        // Only auto-fill if not already defined in the data
                        if (!current.origin) {
                          // Look at the immediately preceding event
                          const prev = events[i - 1];
                          if (prev) {
                            if (prev.type === 'activity' && prev.location) {
                              current.origin = prev.location;
                            } else if (prev.type === 'travel' && prev.destination) {
                              current.origin = prev.destination;
                            }
                          }
                          
                          // If still not found, look further back for the last known activity
                          if (!current.origin) {
                            for (let j = i - 1; j >= 0; j--) {
                              if (events[j].type === 'activity' && !events[j].hidden && events[j].location) {
                                current.origin = events[j].location;
                                break;
                              }
                            }
                          }
                        }

                        if (!current.destination) {
                          // Look at the immediately succeeding event
                          const next = events[i + 1];
                          if (next) {
                            if (next.type === 'activity' && next.location) {
                              current.destination = next.location;
                            } else if (next.type === 'travel' && next.origin) {
                              current.destination = next.origin;
                            }
                          }

                          // If still not found, look further forward for the next known activity
                          if (!current.destination) {
                            for (let j = i + 1; j < events.length; j++) {
                              if (events[j].type === 'activity' && !events[j].hidden && events[j].location) {
                                current.destination = events[j].location;
                                break;
                              }
                            }
                          }
                        }
                      }

                      processed.push({ ...current, originalIdx: i });

                      const next = events[i + 1];
                      if (next && current.type === 'activity' && next.type === 'activity' && !current.hidden && !next.hidden) {
                        const currentLoc = current.location;
                        const nextLoc = next.location;
                        
                        if (currentLoc && nextLoc && (currentLoc.lat !== nextLoc.lat || currentLoc.lng !== nextLoc.lng)) {
                          processed.push({
                            id: `auto-travel-${current.id}-${next.id}`,
                            type: 'travel',
                            category: 'drive',
                            title: `Drive to ${nextLoc.name}`,
                            origin: currentLoc,
                            destination: nextLoc,
                            startTime: current.endTime,
                            endTime: next.startTime,
                            isAuto: true
                          });
                        }
                      }
                    }

                    return processed
                      .filter(event => {
                        if (activeFilter === 'all') return true;
                        if (activeFilter === 'activity') return event.category === 'activity' || event.category === 'walk';
                        if (activeFilter === 'food') return event.category === 'food';
                        if (activeFilter === 'travel') return event.type === 'travel' || event.category === 'drive' || event.category === 'transit';
                        if (activeFilter === 'flight') return event.category === 'flight';
                        if (activeFilter === 'stay') return event.category === 'stay';
                        return true;
                      })
                      .map((event, idx) => {
                      const isCurrent = isCurrentEvent(event);
                      
                      if (event.hidden && event.type === 'travel') return null;

                      return (
                        <div 
                          key={event.id} 
                          onClick={() => isEventExpandable(event) && toggleEventExpansion(event.id)}
                          className={cn(
                            "relative pl-12 transition-all",
                            isEventExpandable(event) && "cursor-pointer active:scale-[0.99]"
                          )}
                        >
                        {/* Icon & Chevron Column */}
                        <div className="absolute left-0 top-1 w-10 flex flex-col items-center gap-1.5 z-10">
                          <div className={cn(
                            "p-2 rounded-xl transition-all border",
                            isCurrent ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-100 scale-110" : 
                            event.type === 'travel' ? "bg-slate-50 border-slate-100 text-slate-400" :
                            event.category === 'flight' ? "bg-purple-50 border-purple-100 text-purple-600" :
                            event.category === 'drive' ? "bg-orange-50 border-orange-100 text-orange-600" :
                            event.category === 'stay' ? "bg-indigo-50 border-indigo-100 text-indigo-600" :
                            event.category === 'food' ? "bg-rose-50 border-rose-100 text-rose-600" :
                            "bg-emerald-50 border-emerald-100 text-emerald-600"
                          )}>
                            <EventIcon category={event.category} />
                          </div>
                          {isEventExpandable(event) && (
                            <ChevronDown className={cn(
                              "w-3.5 h-3.5 text-slate-400 transition-transform duration-200",
                              expandedEvents.has(event.id) && "rotate-180"
                            )} />
                          )}
                        </div>

                        {/* Content Tile */}
                        <div 
                          className={cn(
                            "rounded-2xl p-4 transition-all",
                            event.type === 'travel' 
                              ? "bg-transparent border border-dashed border-slate-200" 
                              : "bg-white border border-slate-100 shadow-sm",
                            isCurrent && "ring-1 ring-blue-100 border-blue-200",
                            event.hidden && "opacity-50 grayscale"
                          )}
                        >
                          {/* Header: Title & Time */}
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
                              {event.type === 'activity' && (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleHide(activeDayIdx, event.id);
                                  }}
                                  className={cn(
                                    "p-1 transition-colors",
                                    event.hidden ? "text-red-500 hover:text-red-600" : "text-slate-400 hover:text-blue-600"
                                  )}
                                  title={event.hidden ? "Show activity" : "Hide/Cancel activity"}
                                >
                                  {event.hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* One-line Description */}
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
                            <div className="mt-2 flex items-center justify-between gap-2">
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
                                      // Using specific names and coordinate hinting for Apple Maps
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
                                      return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(event.origin.name)}&destination=${encodeURIComponent(event.destination.name)}${waypointsStr ? `&waypoints=${waypointsStr}` : ''}&travelmode=${mode}`;
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
                          ) : event.location && (
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1 min-w-0">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                <span className="text-[10px] text-slate-400 font-medium truncate">
                                  {event.location.name}
                                </span>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <a 
                                  href={getAppleMapsUrl(event.location)} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                                >
                                  <Navigation className="w-3 h-3" />
                                </a>
                                <a 
                                  href={getGoogleMapsUrl(event.location)} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                                >
                                  <MapIcon className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          )}

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
                                <div className="mt-4 space-y-2">
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Suggestions</p>
                                  <div className="grid grid-cols-1 gap-2">
                                    {event.suggestions.map((sug, sIdx) => (
                                      <button
                                        key={sIdx}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleSelectSuggestion(activeDay.id, event.id, sug);
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
                                </div>
                              )}
                            </motion.div>
                          )}
                        </div>

                        {/* Edit Button */}
                        {isEditing && isAdmin && event.originalIdx !== undefined && (
                          <button 
                            onClick={() => setEditingActivity({ dayIdx: activeDayIdx, actIdx: event.originalIdx! })}
                            className="absolute -top-1 -right-1 p-1.5 bg-blue-600 text-white rounded-full shadow-lg z-20"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    );
                  })
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
          )}

          {activeTab === 'places' && (
            <motion.div key="places" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full">
              <PlacesView 
                itinerary={itinerary}
                shortlist={shortlist}
                onAddShortlist={handleAddShortlist}
                onRemoveShortlist={handleRemoveShortlist}
                isAdmin={isAdmin}
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
                            saveToFirestore(ITINERARY_DATA);
                            alert('Itinerary reset to template successfully.');
                          }
                        }}
                        className="w-full py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md active:scale-95 transition-transform"
                      >
                        Sync with Template
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
          <button onClick={() => setActiveTab('itinerary')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'itinerary' ? "text-blue-600" : "text-slate-400")}>
            <Calendar className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Itinerary</span>
          </button>
          <button onClick={() => setActiveTab('places')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'places' ? "text-blue-600" : "text-slate-400")}>
            <MapPin className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Places</span>
          </button>
          <button onClick={() => setActiveTab('gas')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'gas' ? "text-blue-600" : "text-slate-400")}>
            <Fuel className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Gas</span>
          </button>
          <button onClick={() => setActiveTab('info')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'info' ? "text-blue-600" : "text-slate-400")}>
            <Info className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Details</span>
          </button>
        </nav>
      )}
    </div>
  );
}
