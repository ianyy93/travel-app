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
  Compass,
  ArrowRight,
  ZoomIn,
  ZoomOut,
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
  Ticket,
  Download,
  Footprints,
  Bike
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
import { getAppleMapsUrl, getGoogleMapsUrl, getDayRouteUrl } from './utils/mapUtils';
import { sanitizeForFirestore } from './utils/sanitizeForFirestore';
import { expandMembers } from './utils/memberUtils';
import { cn, parseItineraryDate, parseTime, toMinutes } from './lib/utils';
import { db, auth } from './firebase';
import { doc, onSnapshot, setDoc, getDoc, collection, deleteDoc, query, orderBy, limit, getDocs, writeBatch, updateDoc } from 'firebase/firestore';
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
import { getRealTravelTimeMins } from './services/routingService';
import { gasService } from './services/gasService';
import { Fuel, Share2 } from 'lucide-react';
import { GmailImport } from './components/GmailImport';

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

// Helper to update map view when center changes
const ChangeView = ({ center, zoom }: { center: [number, number], zoom: number }) => {
  const map = useMap();
  map.setView(center, zoom);
  return null;
};

const GasPricesView = ({ userLoc }: { userLoc: [number, number] | null }) => {
  const [selectedStation, setSelectedStation] = useState<any>(null);
  const [avgPrice, setAvgPrice] = useState<string | null>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(true);

  useEffect(() => {
    gasService.getArizonaAverage().then(price => {
      setAvgPrice(price);
      setIsLoadingPrice(false);
    });
  }, []);

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
      <div className="p-4 bg-white border-b border-slate-200 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Gas Stations</h2>
          <p className="text-sm text-slate-500">Sorted by proximity to you</p>
        </div>
        {!isLoadingPrice && avgPrice && (
          <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-100 flex flex-col items-end text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider">Avg. AZ Price</span>
            <span className="text-lg font-black leading-none">${avgPrice}</span>
          </div>
        )}
        {!isLoadingPrice && !avgPrice && (
          <div className="bg-slate-50 text-slate-500 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
            Price data unavailable
          </div>
        )}
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
                <div className="text-right flex flex-col gap-2 items-end">
                  <a 
                    href={`https://www.gasbuddy.com/home?search=${encodeURIComponent(item.name + ' ' + item.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-lg font-bold hover:bg-blue-100 transition-colors"
                  >
                    Check Live Price
                  </a>
                  <div className="flex gap-1 justify-end">
                    <a 
                      href={getAppleMapsUrl({ name: item.name, lat: item.lat, lng: item.lng })} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="p-1.5 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      <Navigation className="w-3 h-3" />
                    </a>
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="p-1.5 bg-slate-100 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      <MapIcon className="w-3 h-3" />
                    </a>
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

const EventIcon = ({ category, className }: { category: TripCategory; className?: string }) => {
  const cnStr = className || "w-4 h-4";
  switch (category) {
    case 'flight': return <Plane className={cnStr} />;
    case 'drive': return <Car className={cnStr} />;
    case 'rideshare': return <Car className={cnStr} />;
    case 'stay': return <Moon className={cnStr} />;
    case 'food': return <Utensils className={cnStr} />;
    case 'walk': return <MapPin className={cnStr} />;
    case 'transit': return <Bus className={cnStr} />;
    case 'work': return <Briefcase className={cnStr} />;
    case 'activity': return <Sun className={cnStr} />;
    default: return <Sparkles className={cnStr} />;
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
        // Skip suggestion events entirely
        if (event.status === 'suggestion') return;

        // Skip logistics keywords unless manually set
        if (isLogistics(event.location?.name, event.category) && !event.manualCategory && event.status !== 'confirmed') return;

        // Skip generic locations unless manually overridden
        const lowerLoc = event.location?.name.toLowerCase() || '';
        const isGeneric = event.location && (
          (lowerLoc.includes(' area') || lowerLoc.includes(' neighborhood')) ||
          (lowerLoc.split(',').length <= 2 && /\d{5}/.test(lowerLoc))
        );
        if (event.location && isGeneric && !event.manualCategory && event.status !== 'confirmed') return;
        
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
  const [activeTab, setActiveTab] = useState<'calendar' | 'places' | 'info'>('calendar');
  const [calendarViewMode, setCalendarViewMode] = useState<'schedule' | 'grid'>('schedule');
  const [hourHeight, setHourHeight] = useState<number>(80);
  const calendarGridHeaderHeight = 72;
  const [selectedEventForModal, setSelectedEventForModal] = useState<{ event: TripEvent, dayIdx: number, eventIdx: number } | null>(null);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [activeDayIdx, setActiveDayIdx] = useState(-1);
  const [itinerary, setItinerary] = useState<DayPlan[]>(ITINERARY_DATA);
  const [user, setUser] = useState<User | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [editingActivity, setEditingActivity] = useState<{ dayIdx: number, actIdx: number | null } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null);
  const [deletingTripIds, setDeletingTripIds] = useState<Set<string>>(new Set());
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [view, setView] = useState<'itinerary' | 'list' | 'travellers'>('list');
  const [lastTripView, setLastTripView] = useState<'itinerary' | 'list'>('list');
  const [currentTripId, setCurrentTripId] = useState<string>('main');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [shortlist, setShortlist] = useState<any[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [expandedTrips, setExpandedTrips] = useState<Set<string>>(new Set());
  const [tripsList, setTripsList] = useState<{id: string, title: string, date: string, year?: string}[]>([]);
  const [tripTitle, setTripTitle] = useState('');
  const [isLoadingTrip, setIsLoadingTrip] = useState(true);
  const [tripDates, setTripDates] = useState('');
  const [activeGroupTabs, setActiveGroupTabs] = useState<Record<string, string>>({});
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
  const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiPrompt, setAiPrompt] = useState('');
  
  const displayItinerary = aiProposal ? (aiProposal.itinerary || itinerary) : itinerary;

  const scrollRef = useRef<HTMLDivElement>(null);
  const gridScrollContainerRef = useRef<HTMLDivElement>(null);
  const [weatherData, setWeatherData] = useState<Record<number, WeatherInfo>>({});

  const [activeFilter, setActiveFilter] = useState<string>('all');

  // Refs for AI Proposal application to avoid stale closures
  const itineraryRef = useRef(itinerary);
  const shortlistRef = useRef(shortlist);
  const flightInfoRef = useRef(flightInfo);
  const rentalInfoRef = useRef(rentalInfo);
  const staysRef = useRef(stays);
  const restaurantsRef = useRef(restaurants);
  const experiencesRef = useRef(experiences);
  const membersRef = useRef(members);
  const tripTitleRef = useRef(tripTitle);

  useEffect(() => { itineraryRef.current = itinerary; }, [itinerary]);
  useEffect(() => { shortlistRef.current = shortlist; }, [shortlist]);
  useEffect(() => { flightInfoRef.current = flightInfo; }, [flightInfo]);
  useEffect(() => { rentalInfoRef.current = rentalInfo; }, [rentalInfo]);
  useEffect(() => { staysRef.current = stays; }, [stays]);
  useEffect(() => { restaurantsRef.current = restaurants; }, [restaurants]);
  useEffect(() => { experiencesRef.current = experiences; }, [experiences]);
  useEffect(() => { membersRef.current = members; }, [members]);
  useEffect(() => { tripTitleRef.current = tripTitle; }, [tripTitle]);

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
          const info = await weatherService.getWeatherForDay(loc, day.date, tripDates);
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
      const finalPrompt = customPrompt || aiPrompt.trim() || (mode === 'autofill' ? 'Review my current itinerary and create only pending suggestion slots and optional suggestions for open gaps. Do not add confirmed activities unless explicitly requested.' : aiPrompt);
      
      const isNewTrip = view === 'list' || itinerary.length === 0;
      const targetModel = 'gemini-3.5-flash';
      
      console.log('AI Action:', mode, 'Model:', targetModel, 'Prompt:', finalPrompt);
      
      // Clear existing trip context when creating a brand-new trip from the list view,
      // otherwise the AI inherits the current trip's data (e.g. Arizona details bleed into NYC).
      const isCreatingNewTrip = view === 'list' || contextItinerary.length === 0;
      const proposal = await geminiService.proposeChanges(
        targetModel,
        contextItinerary,
        finalPrompt,
        mode,
        pastTripsSummary,
        contextMembers,
        isCreatingNewTrip ? [] : shortlist,
        isCreatingNewTrip ? [] : stays,
        isCreatingNewTrip ? null : flightInfo,
        isCreatingNewTrip ? null : rentalInfo,
        isCreatingNewTrip ? [] : restaurants,
        isCreatingNewTrip ? [] : experiences
      );
      console.log('AI Proposal received:', proposal);
      
      setAiProposal(proposal);
      setRejectedSuggestionIds([]); // Reset rejections for new proposal
      setRejectedAssumptionIdxs([]); // Reset assumption rejections for new proposal
      setIsAiAssistantOpen(true); // Ensure panel is open to show proposal
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
      
      // Safety guard: If the existing itinerary is non-empty, but the AI proposal's itinerary is empty or has no events,
      // we must NOT wipe out the existing itinerary. We should warn the user or fall back to preserving the existing itinerary.
      if (view !== 'list' && itinerary.length > 0 && (!aiProposal.itinerary || aiProposal.itinerary.length === 0)) {
        console.warn("[applyAiProposal] AI Proposal itinerary is empty or invalid, preserving existing itinerary to protect user data.");
        aiProposal.itinerary = JSON.parse(JSON.stringify(itinerary));
      }
      
      const firstDayDate = aiProposal.itinerary[0]?.date || '';
      const lastDayDate = aiProposal.itinerary[aiProposal.itinerary.length - 1]?.date || '';
      const inferredDates = firstDayDate && lastDayDate ? `${firstDayDate} - ${lastDayDate}` : '';

      // Filter out rejected suggestions and AI-generated travel events from itinerary
      const filteredItinerary = aiProposal.itinerary.map(day => ({
        ...day,
        events: day.events.filter(event => {
          if (event.title.toLowerCase().startsWith('transit to') || event.title.toLowerCase().startsWith('travel to') || event.title.toLowerCase().startsWith('drive to')) {
            return false;
          }
          if (!event.location && (event.category === 'transit' || event.category === 'drive')) {
            return false; // Transit/Drive without location is usually a placeholder
          }
          const suggestion = aiProposal.suggestions?.find(s => s.relatedId === event.id);
          if (suggestion && rejectedSuggestionIds.includes(suggestion.id)) {
            return false;
          }
          return true;
        }).map(event => {
          if (event.status === 'pending-meal' || event.status === 'suggestion') {
            return { ...event, location: undefined };
          }
          return event;
        })
      }));

      // Filter out generic neighborhoods from shortlist just in case AI pollutes it
      const genericTerms = ['neighborhood', 'area', 'district', 'region', 'downtown', 'midtown', 'uptown', 'west', 'east', 'north', 'south'];
      const filteredAiShortlist = (aiProposal.shortlist || []).filter(p => {
        const name = p.name?.toLowerCase() || '';
        const isGeneric = genericTerms.some(term => name.includes(term) && name.split(' ').length <= 2);
        if (isGeneric) return false;
        
        // Also filter if it's a rejected suggestion
        const suggestion = aiProposal.suggestions?.find(s => (s.text || '').includes(p.name));
        if (suggestion && rejectedSuggestionIds.includes(suggestion.id)) {
          return false;
        }
        return true;
      });

      const normalizeTripTitle = (rawTitle: string | undefined, locations: (string | undefined)[], fallback: string | undefined): string => {
        const currentYear = new Date().getFullYear().toString();
        const yearMatch = (rawTitle || '').match(/\b(20\d{2})\b/) || (fallback || '').match(/\b(20\d{2})\b/);
        const year = yearMatch ? yearMatch[1] : currentYear;

        const cleanPart = (t: string) => {
          let c = t.replace(/\b(New Trip|New Destination|New Itinerary|New Adventure|New Journey|Untitled Trip|Loading\.\.\.)\b/ig, '');
          const forbiddenRegex = /\b(Adventure|Journey|Trip|Itinerary|Arrival\s*Day|Arrival|Departure\s*Day|Departure|Drive|Explore|Exploration|Travel|Vacation|Holiday|Weekend|Getaway|Tour|Day\s*\d*|Hotel|Courtyard|Marriott|Seasons|Stay|Staycation|In|Inn|Suites|Hilton|Hyatt|Westin|Sheraton|Residence|Towers|Condo|Apartment|Airbnb|Hostel|Motel|Lodge|Resort|Spa)\b/ig;
          c = c.replace(forbiddenRegex, '');
          c = c.replace(new RegExp(`\\b${year}\\b`, 'g'), '');
          c = c.replace(/[^a-zA-Z\s&,-]/g, '').trim(); 
          c = c.replace(/^[\s&,-]+|[\s&,-]+$/g, ''); 
          c = c.replace(/\s{2,}/g, ' ');
          
          // Final safety: if it still has "Four" or "by", or it's just garbage, return empty
          if (c.toLowerCase().includes('four') || c.toLowerCase().includes(' downtown') || c.toLowerCase().includes(' by ')) {
            return '';
          }
          return c;
        };

        let candidate = cleanPart(rawTitle || '');

        if (!candidate || candidate.length < 3) {
          candidate = cleanPart(fallback || '');
        }

        if (!candidate || candidate.length < 3) {
          const validLocs = locations.filter(Boolean) as string[];
          if (validLocs.length > 0) {
            const counts: Record<string, number> = {};
            validLocs.forEach(loc => {
              const city = loc.split(',')[0].trim();
              counts[city] = (counts[city] || 0) + 1;
            });
            const topLocs = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            const selected = topLocs.slice(0, 2).map(e => cleanPart(e[0])).filter(Boolean);
            if (selected.length > 0) {
              candidate = selected.join(' & ');
            }
          }
        }

        if (!candidate || candidate.length < 3) {
          candidate = 'Untitled Destination';
        } else {
          const parts = candidate.split('&').map(s => s.trim()).filter(Boolean);
          candidate = parts.slice(0, 3).join(' & ');
        }

        return `${candidate} ${year}`;
      };

      const allLocations = aiProposal.itinerary.flatMap(d => d.events.map(e => e.location?.name || e.destination?.name));
      // When creating a new trip from the list, don't fall back to the currently-loaded
      // trip's title (e.g. "AI-tinerary") — use an empty string so the AI title wins.
      const titleFallback = view === 'list' ? '' : tripTitleRef.current;
      const finalTitle = normalizeTripTitle(aiProposal.title, allLocations, titleFallback);

      // Ensure dates are correct
      const finalDates = aiProposal.dates || inferredDates;

      if (view === 'list') {
        const newId = finalTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).substr(2, 5);
        
        const aiShortlist = filteredAiShortlist.map(p => ({
          ...p,
          id: p.id || Math.random().toString(36).substr(2, 9),
          addedAt: new Date().toISOString()
        }));

        let nextItin = filteredItinerary;
        for (let i = 0; i < nextItin.length; i++) {
          nextItin = recalculateRoutesAroundEvent(i, '', nextItin, aiProposal.rentalInfo);
        }
        const finalizedItinerary = nextItin;
        
        await saveToFirestore(finalizedItinerary, finalTitle, finalDates, false, aiShortlist, newId, aiProposal.flightInfo || null, aiProposal.rentalInfo || null, aiProposal.stays || [], aiProposal.restaurants || [], aiProposal.experiences || [], aiProposal.members || []);
        
        setCurrentTripId(newId);
        setItinerary(finalizedItinerary);
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
        setTripDates(finalDates);
        const isValidObj = (obj: any) => {
          if (!obj) return false;
          const vals = Object.values(obj);
          if (vals.length === 0) return false;
          // Check if at least one property is a non-empty string/number or non-empty object
          return vals.some(v => {
            if (typeof v === 'string') return v.trim() !== '';
            if (typeof v === 'number') return true;
            if (typeof v === 'object' && v !== null) return Object.values(v).some(inner => typeof inner === 'string' && inner.trim() !== '');
            return false;
          });
        };

        const finalFlightInfo = isValidObj(aiProposal.flightInfo) ? aiProposal.flightInfo : flightInfoRef.current;
        const finalRentalInfo = isValidObj(aiProposal.rentalInfo) ? aiProposal.rentalInfo : rentalInfoRef.current;
        const finalStays = (aiProposal.stays && aiProposal.stays.length > 0) ? aiProposal.stays : staysRef.current;
        const finalRestaurants = (aiProposal.restaurants && aiProposal.restaurants.length > 0) ? aiProposal.restaurants : restaurantsRef.current;
        const finalExperiences = (aiProposal.experiences && aiProposal.experiences.length > 0) ? aiProposal.experiences : experiencesRef.current;
        const finalMembers = (aiProposal.members && aiProposal.members.length > 0) ? aiProposal.members : membersRef.current;

        let nextItin = filteredItinerary;
        for (let i = 0; i < nextItin.length; i++) {
          nextItin = recalculateRoutesAroundEvent(i, '', nextItin, finalRentalInfo);
        }
        const finalizedItinerary = nextItin;

        setItineraryHistory(prev => [...prev, itineraryRef.current]);
        setItinerary(finalizedItinerary);
        
        const aiShortlist = filteredAiShortlist.map(p => ({
          ...p,
          id: p.id || Math.random().toString(36).substr(2, 9),
          addedAt: new Date().toISOString()
        }));
        
        const updatedShortlist = [
          ...shortlistRef.current, 
          ...aiShortlist.filter(p => !shortlistRef.current.some(s => s.name === p.name))
        ];
          
        setShortlist(updatedShortlist);
        
        setTripTitle(finalTitle);
        setTripDates(finalDates);

        setFlightInfo(finalFlightInfo);
        setRentalInfo(finalRentalInfo);
        setStays(finalStays);
        setRestaurants(finalRestaurants);
        setExperiences(finalExperiences);
        setMembers(finalMembers);
        
        saveToFirestore(finalizedItinerary, finalTitle, finalDates, false, updatedShortlist, undefined, finalFlightInfo, finalRentalInfo, finalStays, finalRestaurants, finalExperiences, finalMembers);
      }
      
      setAiProposal(null);
      setRejectedSuggestionIds([]);
      setIsAiAssistantOpen(false);
    };

  const saveToFirestore = async (data: DayPlan[], title?: string, dates?: string, isAutoSync = false, currentShortlist?: any[], tripIdOverride?: string, currentFlightInfo?: any, currentRentalInfo?: any, currentStays?: any[], currentRestaurants?: any[], currentExperiences?: any[], currentMembers?: TripMember[]) => {
    if (!auth.currentUser) return;
    if (!isAdmin) {
      console.error("Unauthorized: You do not have permission to save changes.");
      return;
    }
    const targetId = tripIdOverride || currentTripId;
    if (deletingTripIds.has(targetId)) {
      console.log(`UI: Skipping save for ${targetId} as it is being deleted.`);
      return;
    }
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
        await setDoc(historyRef, sanitizeForFirestore({
          days: data,
          timestamp: new Date().toISOString(),
          updatedBy: auth.currentUser?.email || 'unknown',
          title: title || tripTitle || 'Untitled Trip'
        }));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleSelectSuggestion = (dayIdx: number, eventId: string, suggestion: Location) => {
    let newItinerary = [...itinerary];
    const day = newItinerary[dayIdx];
    if (!day) return;

    const newEvents = day.events.map((event) => {
      if (event.id === eventId) {
        const isSelected = event.location?.name === suggestion.name;
        const newLoc = isSelected ? undefined : suggestion;
        
        let newTitle = event.title;
        let newStatus = isSelected 
           ? (event.category === 'food' ? 'pending-meal' : 'suggestion') as any 
           : 'confirmed';

        const genericTitles = ['Quick Lunch', 'Lunch', 'Dinner', 'Breakfast', 'Meal', 'Food Stop', 'Meal Selection'];
        
        if (!isSelected && (genericTitles.includes(event.title) || event.title.toLowerCase().includes('lunch') || event.title.toLowerCase().includes('dinner'))) {
          if (!event.originalTitle) {
            event.originalTitle = event.title;
          }
          newTitle = suggestion.name;
        } else if (isSelected && event.originalTitle) {
          newTitle = event.originalTitle;
        }

        return { ...event, title: newTitle, location: newLoc, status: newStatus };
      }
      return event;
    });

    newItinerary[dayIdx] = { ...day, events: newEvents };
    
    // Rebuild navigation for the whole itinerary so any new location change gets a matching travel segment
    newItinerary = syncNavigationEvents(newItinerary);
    
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
    const rebuiltItinerary = syncNavigationEvents(finalItinerary);
    setItinerary(rebuiltItinerary);
    saveToFirestore(rebuiltItinerary);
  };

  const handleDeleteTrip = async (tripId: string) => {
    console.log('--- DELETE PROCESS START ---');
    console.log('Target Trip ID:', tripId);
    
    if (!isAdmin) {
      console.error('Delete aborted: User is not an admin.');
      setLoginError("You do not have permission to delete trips.");
      alert("You do not have permission to delete trips.");
      return;
    }

    // Mark as deleting to prevent accidental recreation by auto-save
    setDeletingTripIds(prev => {
      const next = new Set(prev);
      next.add(tripId);
      return next;
    });
    
    try {
      console.log(`UI: Attempting to delete trip ${tripId}...`);
      // Update local state immediately for instant feedback
      setTripsList(prev => prev.filter(t => t.id !== tripId));

      // Clear current trip ID first if we are deleting the active trip 
      const wasActiveTrip = currentTripId === tripId;
      if (wasActiveTrip) {
        setCurrentTripId('main');
        setView('list');
      }

      console.log('Executing Firestore deleteDoc for main doc...');
      const docRef = doc(db, 'trips', tripId);
      
      // Also try to clear history subcollection if possible (best effort)
      try {
        const historyRef = collection(db, 'trips', tripId, 'history');
        const historySnap = await getDocs(historyRef);
        if (!historySnap.empty) {
          const batch = writeBatch(db);
          historySnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
          console.log('History subcollection cleared.');
        }
      } catch (hErr) {
        console.warn('Failed to clear history subcollection (might be empty or restricted):', hErr);
      }

      await deleteDoc(docRef);
      console.log('Firestore deleteDoc successful.');
      console.log('--- DELETE PROCESS COMPLETE ---');
    } catch (error) {
      console.error('Firestore deleteDoc FAILED:', error);
      setLoginError(`Failed to delete trip: ${error instanceof Error ? error.message : String(error)}`);
      handleFirestoreError(error, OperationType.DELETE, `trips/${tripId}`);
      
      // Remove from deleting set so user can try again if it failed
      setDeletingTripIds(prev => {
        const next = new Set(prev);
        next.delete(tripId);
        return next;
      });
    } finally {
      // Keep in deleting set for a bit longer to catch late auto-saves
      setTimeout(() => {
        setDeletingTripIds(prev => {
          const next = new Set(prev);
          next.delete(tripId);
          return next;
        });
      }, 5000);
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

  const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c;
  };

  const estimateTravelMinutes = (distKm: number, mode: string) => {
    switch (mode) {
      case 'walk': return Math.round((distKm / 5) * 60);
      case 'bike': return Math.round((distKm / 15) * 60) + 2; // ~15km/h + buffer
      case 'drive': return Math.round((distKm / 40) * 60) + 5; // Add 5 mins buffer
      case 'rideshare': return Math.round((distKm / 35) * 60) + 6; // Slightly more than drive due to pickup/dropoff
      case 'transit': return Math.round((distKm / 20) * 60) + 10; // Add 10 mins buffer
      case 'flight': return Math.round((distKm / 800) * 60) + 120; // 2h overhead
      default: return Math.round((distKm / 40) * 60);
    }
  };

  const getTravelModeLabel = (mode: string) => {
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

  const inferTravelMode = (prevLoc?: Location, currLoc?: Location, fallbackMode?: TripCategory): TripCategory => {
    if (!prevLoc || !currLoc) return fallbackMode || 'drive';
    const distKm = getDistanceKm(prevLoc.lat, prevLoc.lng, currLoc.lat, currLoc.lng);
    if (distKm > 500) return 'flight';
    if (distKm < 1.0) return 'walk';
    if (fallbackMode === 'drive' || hasRentalInfo) return 'drive';
    if (distKm < 10) return 'rideshare';
    return 'transit';
  };

  const handleUpdateTravelMode = async (dayIdx: number, eventId: string, newMode: 'transit' | 'drive' | 'walk' | 'flight' | 'bike' | 'rideshare') => {
    let newItin = [...itinerary];
    const day = { ...newItin[dayIdx] };
    newItin[dayIdx] = day;
    const evIdx = day.events.findIndex(e => e.id === eventId);
    if (evIdx === -1) return;

    const event = day.events[evIdx];
    if (event.category === newMode) return;

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

    // Try to get real-time OSRM routing
    if (event.origin && event.destination) {
      const realMins = await getRealTravelTimeMins(
        event.origin.lat, event.origin.lng,
        event.destination.lat, event.destination.lng,
        newMode
      );
      if (realMins !== null) {
        estimatedMins = realMins + (newMode === 'drive' ? 5 : 0); // 5 min buffer for driving (parking etc)
      }
    }

    const oldStartMins = toMinutes(event.startTime);
    const oldEndMins = toMinutes(event.endTime);
    const oldDurationMins = Math.max(0, oldEndMins - oldStartMins);
    const diffMins = estimatedMins - oldDurationMins;

    // Update the travel event itself
    const updatedEvent = {
      ...event,
      category: newMode,
      title: `${modeLabels[newMode]} to ${event.destination?.name || 'Destination'}`
    };

    if (updatedEvent.startTime) {
      const startMins = toMinutes(updatedEvent.startTime);
      const endMins = startMins + estimatedMins;
      const hrs = Math.floor(endMins / 60) % 24;
      const mins = endMins % 60;
      updatedEvent.endTime = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }

    day.events[evIdx] = updatedEvent;

    // Shift subsequent events if travel duration changes
    if (Math.abs(diffMins) > 0) {
      day.events = day.events.map((e, idx) => {
        // Only shift events that start at or after the OLD end time of this travel segment
        // and aren't other travel segments (they get rebuilt anyway)
        if (idx !== evIdx && e.type !== 'travel' && toMinutes(e.startTime) >= oldEndMins) {
          const shiftTime = (timeStr: string) => {
            if (!timeStr) return timeStr;
            const tMins = toMinutes(timeStr) + diffMins;
            const hrs = Math.floor(Math.max(0, tMins) / 60) % 24;
            const mins = Math.max(0, tMins) % 60;
            return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
          };
          return {
            ...e,
            startTime: shiftTime(e.startTime),
            endTime: shiftTime(e.endTime)
          };
        }
        return e;
      });
    }
    
    setItinerary(newItin);
    
    // Also trigger routing logic to rebuild connecting travel events
    newItin = recalculateRoutesAroundEvent(dayIdx, eventId, newItin);
    
    setItinerary([...newItin]);
    saveToFirestore(newItin);
  };

  const recalculateRoutesAroundEvent = (dayIdx: number, eventId: string, inputItin: DayPlan[], explicitRentalInfo?: any) => {
    const hasRental = (explicitRentalInfo !== undefined && explicitRentalInfo !== null) ? 
       !!(explicitRentalInfo.company || explicitRentalInfo.car || explicitRentalInfo.confirmation) :
       hasRentalInfo;
    const baseMode: TripCategory = hasRental ? 'drive' : 'transit';
    const baseTitle = hasRental ? 'Drive' : 'Transit';

    const newItin = [...inputItin];
    const day = { ...newItin[dayIdx] };
    
    // We just recalculate all routes for the specific day to ensure absolute consistency
    // across all members, handling edge cases of multiple events hiding/showing.
    const nonTravelEvents = day.events.filter(e => e.type !== 'travel');
    const existingTravelEvents = day.events.filter(e => e.type === 'travel');
    
    // Wipe and recreate travel events that connect the non-travel events for the day
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
        const prevDayEvents = [...newItin[prevDayIdx].events].sort((a, b) => toMinutes(b.startTime) - toMinutes(a.startTime));
        const prevDayRoutable = prevDayEvents.filter(isRoutableEvent);
        
        if (prevDayRoutable.length > 0) {
          prevDayRoutable.forEach(e => {
            const mIds = expandMembers(e.memberIds, masterTravellers);
            mIds.forEach(mid => {
              if (!lastEventPerMember[mid]) {
                lastEventPerMember[mid] = { ...e, isCrossDay: true };
              }
            });
          });
          if (Object.keys(lastEventPerMember).length > 0) {
            break;
          }
        }
        prevDayIdx--;
      }
    }

    const routableActivities = sortedActivities.filter(isRoutableEvent);

    sortedActivities.forEach(current => {
      const currentMemberIds = expandMembers(current.memberIds, masterTravellers);

      if (!isRoutableEvent(current)) {
        return;
      }

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
              // Try to find if user customized an existing travel segment for these exact two events
              const existingNav = existingTravelEvents.find(t => {
                const idMatch = t.id.startsWith(`nav-${prev.id}-${current.id}`);
                const sharedPair = (t.origin?.name && prevLoc.name && t.origin.name === prevLoc.name && t.destination?.name && currLoc.name && t.destination.name === currLoc.name);
                return idMatch || sharedPair;
              });

              // Re-use or Create
              let navEvent: TripEvent;
              if (existingNav && existingNav.category !== 'flight') { // Don't override flight
                let reusedTitle = existingNav.title;
                const oldDest = existingNav.destination?.name || '';
                if (oldDest && currLoc.name !== oldDest && reusedTitle.endsWith(oldDest)) {
                  reusedTitle = reusedTitle.substring(0, reusedTitle.length - oldDest.length) + currLoc.name;
                }
                navEvent = { ...existingNav, title: reusedTitle, origin: prevLoc, destination: currLoc, startTime, endTime };
              } else {
                const inferredMode = inferTravelMode(prevLoc, currLoc, baseMode);
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

              // Aggregate members safely
              const navMembers = travelEvents.find(t => t.id === navEvent.id) 
                || travelEvents.find(t => t.origin?.name === navEvent.origin?.name && t.destination?.name === navEvent.destination?.name);

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

    const finalEvents = [...nonTravelEvents, ...travelEvents].sort((a, b) => {
      const timeA = toMinutes(a.startTime);
      const timeB = toMinutes(b.startTime);
      if (timeA !== timeB) return timeA - timeB;
      if (a.type === 'travel' && b.type !== 'travel') return 1;
      if (a.type !== 'travel' && b.type === 'travel') return -1;
      return 0;
    });

    newItin[dayIdx] = { ...day, events: finalEvents };
    return newItin;
  };

  const syncNavigationEvents = (inputItin: DayPlan[], explicitRentalInfo?: any) => {
    let nextItin = [...inputItin];
    for (let dayIdx = 0; dayIdx < nextItin.length; dayIdx++) {
      nextItin = recalculateRoutesAroundEvent(dayIdx, '', nextItin, explicitRentalInfo);
    }
    return nextItin;
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
        const currentMemberIds = expandMembers(current.memberIds, masterTravellers);

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
              
              if (toMinutes(endTime) - toMinutes(startTime) >= 5) {
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
                  const inferredMode = inferTravelMode(prevLoc, currLoc, defaultMode as TripCategory);
                  travelEvents.push({
                    id: `nav-${prev.id}-${current.id}-${mid}-${Date.now()}`,
                    type: 'travel',
                    category: inferredMode,
                    title: `${getTravelModeLabel(inferredMode)} to ${currLoc.name}`,
                    origin: prevLoc,
                    destination: currLoc,
                    startTime,
                    endTime,
                    memberIds: [mid]
                  });
                }
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
    let newItinerary = itinerary.map((day, dIdx) => {
      if (dIdx !== dayIdx) return day;
      
      const newEvents = day.events.map((event) => {
        if (event.id === eventId) {
          return { ...event, hidden: !event.hidden };
        }
        return event;
      });

      return { ...day, events: newEvents };
    });

    newItinerary = recalculateRoutesAroundEvent(dayIdx, eventId, newItinerary);
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
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLoc([pos.coords.latitude, pos.coords.longitude]),
        (err) => console.warn("Geolocation failed or denied, using defaults:", err)
      );
    } else {
      console.warn("Geolocation is not supported by this browser.");
    }
  }, []);

  // Auth Effect: Just watches for login/logout
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    
    // Handle redirect result
    getRedirectResult(auth).catch((err) => {
      console.error("Redirect login failed", err);
      if (err.code !== 'auth/popup-blocked') { // Noise reduction
        setLoginError("Redirect login failed: " + err.message);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Data Sync Effect: Runs after trip ID is set and auth is ready
  useEffect(() => {
    if (!isAuthReady) return;

    let isSubscribed = true;
    const path = `trips/${currentTripId}`;
    const tripDoc = doc(db, 'trips', currentTripId);
    
    const unsubscribeSync = onSnapshot(tripDoc, (snapshot) => {
      if (!isSubscribed) return;

      const currentAuthUser = auth.currentUser;
      const isAdminCheck = currentAuthUser && ['ianyy93@gmail.com', 'wingin.carrie@gmail.com'].includes(currentAuthUser.email || '');

      if (snapshot.exists()) {
        const data = snapshot.data();
        
        // Auto-sync logic for template upgrades
        if (currentTripId === 'main' && currentAuthUser && isAdminCheck && (data.templateVersion || 0) < TEMPLATE_VERSION) {
          console.log(`Updating main trip from version ${data.templateVersion || 0} to ${TEMPLATE_VERSION}...`);
          
          const newDays = [...data.days];
          // Overwrite with the latest structure from the constants
          newDays[0] = ITINERARY_DATA[0]; // Day 1
          newDays[3] = ITINERARY_DATA[3]; // Day 4 (Sedona Day Trip)

          updateDoc(tripDoc, {
             days: newDays,
             templateVersion: TEMPLATE_VERSION
          }).catch(err => console.error("Auto-sync error", err));
          
          return; // Skip the rest of the execution until the snapshot updates again
        }

        // Trigger local updates if user is not currently editing the title
        if (!isEditingTitle) {
          const loadedDays = Array.isArray(data.days) ? data.days : [];
          const normalizedDays = syncNavigationEvents(loadedDays);
          const needsSave = JSON.stringify(normalizedDays) !== JSON.stringify(loadedDays);
          setItinerary(normalizedDays);
          
          let finalTitle = data.title;
          if (!finalTitle || finalTitle === 'Loading...') {
            finalTitle = currentTripId === 'main' ? 'AI-tinerary' : 'Untitled Trip';
          }
          setTripTitle(finalTitle);

          // Robust dates handling: ensure dates are never missing for main trip
          let finalDates = data.dates;
          if (!finalDates || finalDates === 'Dates TBD') {
            finalDates = currentTripId === 'main' ? 'May 14 - May 19' : 'Dates TBD';
          }
          setTripDates(finalDates);

          if (needsSave && auth.currentUser && isAdmin) {
            saveToFirestore(normalizedDays, finalTitle, finalDates, true);
          }
        }

        setShortlist(data.shortlist || []);
        
        // Robust reservation handling: NEVER fallback to constants unless initializing a fresh trip.
        setFlightInfo(data.flightInfo || null);
        setRentalInfo(data.rentalInfo || null);
        setStays(data.stays || []);
        setRestaurants(data.restaurants || []);
        setExperiences(data.experiences || []);
        setMembers(data.members || []);
        setIsLoadingTrip(false);

        // Code that pushed Correct data back is removed. 
        // Only initializing fresh documents is permitted.
      } else if (currentTripId === 'main') {
        // Initialize if we have an admin
        if (currentAuthUser && isAdminCheck) {
          console.log("Initializing Main Trip with defaults...");
          setDoc(tripDoc, sanitizeForFirestore({ 
            days: ITINERARY_DATA,
            title: 'AI-tinerary',
            dates: 'May 14 - May 19',
            templateVersion: TEMPLATE_VERSION,
            initializedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            updatedBy: currentAuthUser.email,
            stays: STAY_DETAILS,
            flightInfo: FLIGHT_DETAILS,
            rentalInfo: RENTAL_DETAILS,
            restaurants: RESTAURANT_DETAILS
          })).catch(err => handleFirestoreError(err, OperationType.WRITE, path));
        } else {
          setIsLoadingTrip(false);
        }
      } else {
        // Trip doesn't exist and it's not 'main'
        setTripTitle('New Trip');
        setTripDates('Dates TBD');
        setItinerary([]);
        setIsLoadingTrip(false);
      }
    }, (error) => {
      if (isSubscribed) handleFirestoreError(error, OperationType.GET, path);
    });

    // Sync History
    let unsubscribeHistory = () => {};
    if (isAdmin) {
      const historyCollection = collection(db, 'trips', currentTripId, 'history');
      const historyQuery = query(historyCollection, orderBy('timestamp', 'desc'), limit(50));
      unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
        if (!isSubscribed) return;
        const history = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as any[];
        setDbHistory(history);
      }, (error) => {
        if (isSubscribed) handleFirestoreError(error, OperationType.GET, `${path}/history`);
      });
    } else {
      setDbHistory([]);
    }

    return () => {
      isSubscribed = false;
      unsubscribeSync();
      unsubscribeHistory();
    };
  }, [currentTripId, isAuthReady, isAdmin]);

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
        setDoc(travellersDoc, sanitizeForFirestore({ list: defaults })).catch(err => handleFirestoreError(err, OperationType.WRITE, 'settings/travellers'));
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
        const title = data.title || (doc.id === 'main' ? 'AI-tinerary' : 'New Trip');
        const dates = data.dates || (doc.id === 'main' ? 'May 14 - May 19' : 'Dates TBD');
        const yearMatch = title.match(/\d{4}/) || dates.match(/\d{4}/);
        const year = yearMatch ? yearMatch[0] : new Date().getFullYear().toString();
        
        return {
          id: doc.id,
          title,
          date: dates,
          year
        };
      }).filter(t => !deletingTripIds.has(t.id));
      setTripsList(trips);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });

    return () => unsubscribe();
  }, [user, deletingTripIds]);

  // Scroll to earliest event time in Grid (All Days) view
  useEffect(() => {
    if (calendarViewMode === 'grid' && gridScrollContainerRef.current) {
      let earliestMinutes = 24 * 60; // Start at end of day
      let foundEvent = false;

      itinerary.forEach(day => {
        if (day.events) {
          day.events.forEach(event => {
            if (event.startTime) {
              const mins = toMinutes(event.startTime);
              if (mins < earliestMinutes) {
                earliestMinutes = mins;
                foundEvent = true;
              }
            }
          });
        }
      });

      // Default to 8 AM if no events or earliest is 0 (keep 1 hour buffer for nice spacing)
      const targetMinutes = foundEvent ? Math.max(0, earliestMinutes - 60) : 8 * 60;
      const scrollPosition = (targetMinutes / 60) * hourHeight;

      const timer = setTimeout(() => {
        if (gridScrollContainerRef.current) {
          gridScrollContainerRef.current.scrollTop = scrollPosition;
        }
      }, 80);

      return () => clearTimeout(timer);
    }
  }, [calendarViewMode, hourHeight, itinerary]);

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

  const handleAddTrip = async () => {
    console.log('UI: handleAddTrip called');
    // Generate a human-readable but unique ID
    const baseId = 'new-trip';
    const timestamp = Date.now().toString(36);
    const id = `${baseId}-${timestamp}`;
    
    // Set local state first
    setCurrentTripId(id);
    setTripTitle('New Trip');
    setItinerary([]);
    setTripDates('Dates TBD');
    setView('itinerary');
    setIsEditing(true);
    setIsAiAssistantOpen(true); // Open AI assistant to help build the new trip

    // Save to Firestore immediately so it appears in the list
    try {
      await saveToFirestore([], 'New Trip', 'Dates TBD', false, [], id);
      console.log('UI: New trip document created successfully:', id);
    } catch (err) {
      console.error('UI: Failed to create initial trip document:', err);
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
    let newItinerary = [...itinerary];
    if (actIdx === null) {
      const newEvent = { ...updated, id: Math.random().toString(36).substr(2, 9) };
      newItinerary[dayIdx].events.push(newEvent);
    } else {
      newItinerary[dayIdx].events[actIdx] = updated;
    }
    
    newItinerary = syncNavigationEvents(newItinerary);
    
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

  const handleExportItinerary = () => {
    if (!isAdmin) return;
    const dataStr = JSON.stringify({ 
      title: tripTitle, 
      dates: tripDates, 
      itinerary, 
      shortlist,
      travellers: masterTravellers 
    }, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tripTitle ? tripTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'trip'}_export.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
    let newItinerary = [...itinerary];
    
    // We get the event ID before removing it so we can re-route (recalculate passes through without the event)
    const eventId = newItinerary[dayIdx].events[actIdx].id;
    newItinerary[dayIdx].events.splice(actIdx, 1);
    
    newItinerary = syncNavigationEvents(newItinerary);
    
    setItinerary(newItinerary);
    saveToFirestore(newItinerary);
    setEditingActivity(null);
  };

  const handleAddSuggestionTile = (dayIdx: number) => {
    if (!isAdmin) return;
    const title = prompt("What is this suggestion for? (e.g. Morning Free Time, Lunch Options)", "Free Time");
    if (!title) return;
    
    const isMeal = title.toLowerCase().includes('lunch') || title.toLowerCase().includes('dinner') || title.toLowerCase().includes('breakfast');
    
    const newEvent: TripEvent = {
        id: Math.random().toString(36).substring(2, 11),
        type: 'activity',
        category: isMeal ? 'food' : 'activity',
        title,
        startTime: '10:00 AM',
        endTime: '11:30 AM',
        status: isMeal ? 'pending-meal' : 'suggestion',
        memberIds: ['everyone'],
        suggestions: [
            { name: "Option 1", description: "Suggested activity or restaurant", lat: userLoc ? userLoc[0] : 34.0489, lng: userLoc ? userLoc[1] : -111.0937 },
            { name: "Option 2", description: "Alternative choice", lat: userLoc ? userLoc[0] : 34.0489, lng: userLoc ? userLoc[1] : -111.0937 },
            { name: "Option 3", description: "Another possibility", lat: userLoc ? userLoc[0] : 34.0489, lng: userLoc ? userLoc[1] : -111.0937 }
        ]
    };

    const newItinerary = [...itinerary];
    newItinerary[dayIdx].events.push(newEvent);
    // Sort events by time
    newItinerary[dayIdx].events.sort((a,b) => {
        const toMin = (t: string) => {
          const [time, mod] = t.split(' ');
          let [h, m] = time.split(':').map(Number);
          if (mod === 'PM' && h < 12) h += 12;
          if (mod === 'AM' && h === 12) h = 0;
          return h * 60 + m;
        };
        return toMin(a.startTime) - toMin(b.startTime);
    });
    const rebuiltItinerary = syncNavigationEvents(newItinerary);
    setItinerary(rebuiltItinerary);
    saveToFirestore(rebuiltItinerary);
  };


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
      // Fix: parse ISO dates as local time (not UTC) to avoid timezone-induced day shift
      const isoMatch = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (isoMatch) {
        const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }

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

  const formatTripDateRange = (dateStr: string): string => {
    if (!dateStr || dateStr === 'Dates TBD') return dateStr;
    // ISO range: "2026-07-28 - 2026-08-02"
    const isoRange = dateStr.match(/(\d{4})-(\d{2})-(\d{2})\s*[-–]+\s*(\d{4})-(\d{2})-(\d{2})/);
    if (isoRange) {
      const start = new Date(Number(isoRange[1]), Number(isoRange[2]) - 1, Number(isoRange[3]));
      const end   = new Date(Number(isoRange[4]), Number(isoRange[5]) - 1, Number(isoRange[6]));
      const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const year = isoRange[1];
      return `${fmt(start)} – ${fmt(end)}, ${year}`;
    }
    // Single ISO date
    const isoSingle = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoSingle) {
      const d = new Date(Number(isoSingle[1]), Number(isoSingle[2]) - 1, Number(isoSingle[3]));
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return dateStr;
  };

  const isCurrentEvent = (event: TripEvent, dayIdx: number) => {
    if (!event.startTime || dayIdx < 0 || dayIdx >= itinerary.length) return false;
    
    const day = itinerary[dayIdx];
    const activeDate = parseItineraryDate(day.date, tripDates);
    if (!activeDate) return false;
    
    // Check if it's the right day
    if (currentTime.getFullYear() !== activeDate.getFullYear() || 
        currentTime.getMonth() !== activeDate.getMonth() || 
        currentTime.getDate() !== activeDate.getDate()) {
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
    isGrouped = false,
    tabId,
    isGridMode = false
  }: { 
    event: TripEvent, 
    dayIdx: number, 
    eventIdx: number, 
    isGrouped?: boolean,
    tabId?: string,
    isGridMode?: boolean,
    key?: string | number
  }) => {
    const isCurrent = isCurrentEvent(event, dayIdx);
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
    const heightScale = isGrouped ? 0.7 : 1.2;
    const minHeight = isGrouped ? 70 : 100;
    const maxHeight = isGrouped ? 300 : 600;
    const calculatedHeight = Math.min(maxHeight, Math.max(minHeight, duration * heightScale));

    const isSuggestion = event.status === 'suggestion' || event.status === 'pending-meal';
    const isMealSuggestion = event.status === 'pending-meal';

    return (
      <div 
        id={event.id}
        onClick={() => {
          if (isGridMode) {
            setSelectedEventForModal({ event, dayIdx, eventIdx });
          } else if (expandable) {
            toggleEventExpansion(event.id);
          }
        }}
        className={cn(
          isGridMode 
            ? "rounded-xl transition-all relative w-full border p-1.5 pl-7 md:p-2 md:pl-8 overflow-hidden"
            : "rounded-2xl transition-all relative w-full border p-3 pl-10 md:p-4 md:pl-12 overflow-hidden",
          event.type === 'travel' 
            ? "bg-transparent border-dashed border-slate-200" 
            : isSuggestion
            ? "bg-amber-50/50 border-amber-200 border-dashed shadow-sm"
            : "bg-white border-slate-100 shadow-xl shadow-slate-200/50",
          isCurrent && "ring-2 ring-blue-500/30 border-blue-300",
          event.hidden && "opacity-50 grayscale",
          (isGridMode || expandable) && "cursor-pointer active:scale-[0.99]"
        )}
        style={{ 
          minHeight: isGrouped ? `${calculatedHeight}px` : 'auto',
          height: isGridMode ? '100%' : 'auto'
        }}
      >
        {/* Member Color Stripe */}
        {tabId && tabId !== 'everyone' && (
          <div 
            className="absolute left-0 top-0 bottom-0 w-1.5 opacity-50"
            style={{ 
              background: tabId.split('-').length === 1 
                ? (masterTravellers.find(m => m.id === tabId)?.color || 'transparent')
                : `linear-gradient(to bottom, ${tabId.split('-').map(id => masterTravellers.find(m => m.id === id)?.color || 'transparent').join(', ')})`
            }}
          />
        )}
        
        {/* Category Icon - On the edge */}
        <div className={cn(
          isGridMode
            ? "absolute left-1 top-1.5 w-5 h-5 rounded-md flex items-center justify-center border transition-all"
            : "absolute left-1.5 top-3 w-7 h-7 md:left-2 md:top-4 md:w-8 md:h-8 rounded-xl flex items-center justify-center border transition-all",
          isCurrent ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-100" : 
          event.type === 'travel' ? "bg-slate-50 border-slate-100 text-slate-400" :
          event.category === 'flight' ? "bg-purple-50 border-purple-100 text-purple-600" :
          event.category === 'drive' ? "bg-orange-50 border-orange-100 text-orange-600" :
          event.category === 'stay' ? "bg-indigo-50 border-indigo-100 text-indigo-600" :
          event.category === 'food' ? "bg-rose-50 border-rose-100 text-rose-600" :
          event.category === 'work' ? "bg-blue-50 border-blue-100 text-blue-600" :
          "bg-emerald-50 border-emerald-100 text-emerald-600"
        )}>
          <EventIcon category={event.category} className={isGridMode ? "w-3 h-3" : undefined} />
        </div>
        
        {/* Member Initials - Top Right Inside */}
        {(!isGrouped || tabId === 'everyone') && event.memberIds && event.memberIds.length > 0 && (
          <div className={cn("absolute flex -space-x-1 z-10", isGridMode ? "top-1 right-1" : "top-4 right-4 -space-x-1.5")}>
            {expandMembers(event.memberIds, masterTravellers).map(mid => {
              const member = masterTravellers.find(m => m.id === mid);
              if (!member) return null;
              return (
                <div 
                  key={mid}
                  className={cn(
                    "rounded-full flex items-center justify-center font-black text-white shadow-sm",
                    isGridMode ? "w-3.5 h-3.5 text-[6px] border" : "w-6 h-6 text-[9px] border-2 border-white"
                  )}
                  style={{ backgroundColor: member.color, borderColor: isGridMode ? 'white' : undefined }}
                  title={member.name}
                >
                  {member.initials}
                </div>
              );
            })}
          </div>
        )}

        {/* Edit Button - Hide in grid view (use details modal instead to prevent overlapping) */}
        {!isGridMode && isEditing && isAdmin && eventIdx !== undefined && (
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
        <div className={cn(
          "flex flex-col gap-0 min-w-0", 
          isGridMode 
            ? (event.memberIds && event.memberIds.length > 0 ? "pr-6" : "pr-1")
            : (event.memberIds && event.memberIds.length > 0 ? "pr-20" : "pr-4")
        )}>
          {/* Header: Title & Time */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
              <h4 className={cn(
                isGridMode ? "text-[10.5px] font-black tracking-tight text-slate-800 leading-tight truncate" : "text-sm font-bold text-slate-800 leading-tight break-words overflow-hidden",
                event.hidden && "line-through"
              )}>
                {event.title}
              </h4>
              {!isGridMode && event.suggestions && event.suggestions.length > 0 && (
                isSuggestion ? (
                  <span className="text-[8px] font-black text-amber-600 uppercase tracking-tighter bg-amber-50 px-1 rounded border border-amber-200 shrink-0">
                    {isMealSuggestion ? 'Select Meal' : 'Needs Selection'}
                  </span>
                ) : (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!expandedEvents.has(event.id)) {
                        toggleEventExpansion(event.id);
                      }
                    }}
                    className="text-[8px] font-black text-slate-500 uppercase tracking-tighter bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded border border-slate-200 shrink-0 transition-colors"
                  >
                    Change
                  </button>
                )
              )}
              {!isGridMode && event.hidden && (
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter bg-slate-100 px-1 rounded border border-slate-200 shrink-0">
                  Cancelled
                </span>
              )}
            </div>
            
            {/* Cancel/Hide Toggle - Hide in grid view to prevent clutter (use details modal instead) */}
            {!isGridMode && (
              <div className="flex items-center gap-2 shrink-0">
                {event.status === 'confirmed' && event.type === 'activity' && (!event.location || event.location.lat === undefined || event.location.lng === undefined) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isAdmin) setEditingActivity({ dayIdx, actIdx: eventIdx });
                    }}
                    className="text-[8px] font-black text-amber-700 uppercase tracking-tighter bg-amber-100 px-1 py-0.5 rounded border border-amber-300 transition-colors hover:bg-amber-200 flex items-center gap-1"
                  >
                    <MapPin className="w-2.5 h-2.5" /> Missing location — tap to add
                  </button>
                )}
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
            )}
          </div>
          
          {(event.startTime || event.endTime) && (
            <div className={cn(
              "flex items-center gap-1 font-bold text-slate-400 uppercase tracking-wider",
              isGridMode ? "text-[8.5px] mt-0.5" : "text-[10px]"
            )}>
              <Clock className={isGridMode ? "w-2 h-2 text-slate-400" : "w-2.5 h-2.5"} />
              <span>{event.startTime}{event.endTime ? ` - ${event.endTime}` : ''}</span>
            </div>
          )}
          
          {/* Description - Hide in grid view to prevent vertical text overflow */}
          {!isGridMode && event.description && (
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
          {isGridMode ? (
            event.type === 'travel' ? (
              <div className="mt-0.5 space-y-1">
                <div className="flex items-center gap-1 text-[8.5px] font-medium text-slate-500 uppercase tracking-tight truncate">
                  <span>{typeof event.origin === 'string' ? event.origin : event.origin?.name}</span>
                  <ArrowRight className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                  <span>{typeof event.destination === 'string' ? event.destination : event.destination?.name}</span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {[
                    { mode: 'walk', icon: <Footprints className="w-2.5 h-2.5" /> },
                    { mode: 'bike', icon: <Bike className="w-2.5 h-2.5" /> },
                    { mode: 'drive', icon: <Car className="w-2.5 h-2.5" /> },
                    { mode: 'rideshare', icon: <Car className="w-2.5 h-2.5" /> },
                    { mode: 'transit', icon: <Bus className="w-2.5 h-2.5" /> },
                    { mode: 'flight', icon: <Plane className="w-2.5 h-2.5" /> }
                  ].map(({ mode, icon }) => (
                    <button
                      key={mode}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateTravelMode(dayIdx, event.id, mode as any);
                      }}
                      className={cn(
                        "p-1 rounded-md transition-all",
                        event.category === mode 
                          ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-100" 
                          : "text-slate-400 hover:text-slate-600"
                      )}
                      title={`Switch to ${mode}`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              event.location && (
                <div className="mt-0.5 flex items-center gap-1 text-[8.5px] font-medium text-slate-400 truncate">
                  <MapPin className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                  <span>{typeof event.location === 'string' ? event.location : event.location.name}</span>
                </div>
              )
            )
          ) : (
            event.type === 'travel' ? (
              <div className="mt-1 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider min-w-0">
                    <span className="truncate">{typeof event.origin === 'string' ? event.origin : event.origin?.name}</span>
                    <ArrowRight className="w-3 h-3 shrink-0" />
                    <span className="truncate">{typeof event.destination === 'string' ? event.destination : event.destination?.name}</span>
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

                <div className="flex gap-1 bg-slate-100/50 p-1 rounded-xl w-fit flex-wrap">
                  {[
                    { mode: 'walk', icon: <Footprints className="w-3 h-3" /> },
                    { mode: 'bike', icon: <Bike className="w-3 h-3" /> },
                    { mode: 'drive', icon: <Car className="w-3 h-3" /> },
                    { mode: 'rideshare', icon: <Car className="w-3 h-3" /> },
                    { mode: 'transit', icon: <Bus className="w-3 h-3" /> },
                    { mode: 'flight', icon: <Plane className="w-3 h-3" /> }
                  ].map(({ mode, icon }) => (
                    <button
                      key={mode}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateTravelMode(dayIdx, event.id, mode as any);
                      }}
                      className={cn(
                        "p-1.5 rounded-lg transition-all",
                        event.category === mode 
                          ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-100" 
                          : "text-slate-400 hover:text-slate-600"
                      )}
                      title={`Switch to ${mode}`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              event.location && (
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 uppercase tracking-wider min-w-0">
                    <MapPin className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{typeof event.location === 'string' ? event.location : event.location.name}</span>
                  </div>
                  {typeof event.location === 'object' && (
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
                  )}
                </div>
              )
            )
          )}
        </div>

        {/* Expanded Content - Hide in grid mode (user can interact with suggestions inside details modal) */}
        {!isGridMode && (expandedEvents.has(event.id) || (isSuggestion && !isMealSuggestion)) && (
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
    <div className="w-full md:max-w-none max-w-md mx-auto h-[100dvh] bg-slate-50 flex flex-col font-sans md:shadow-none shadow-2xl overflow-hidden relative" id="app-root">
      {/* Header */}
      <header className="px-4 pt-4 pb-2 md:px-6 md:pt-6 md:pb-4 bg-white border-b border-slate-100 shrink-0 z-[70]">
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
                    onFocus={() => setIsEditingTitle(true)}
                    onBlur={() => setIsEditingTitle(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setIsEditingTitle(false);
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
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
            {view === 'list' && isAdmin && (
              <button 
                onClick={handleAddTrip}
                className="p-2 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-100"
                title="Create New Trip"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
            {view === 'list' && isAdmin && (
              <button 
                onClick={() => setIsAiAssistantOpen(!isAiAssistantOpen)}
                className={cn(
                  "p-2 rounded-full transition-all",
                  isAiAssistantOpen ? "bg-blue-600 text-white shadow-md" : "bg-slate-100 text-slate-600 hover:bg-white hover:shadow-sm"
                )}
                title="AI Assistant"
              >
                <Sparkles className="w-5 h-5" />
              </button>
            )}
            {view === 'itinerary' && isAdmin && (
              <button 
                onClick={() => {
                  if (confirmDeleteId === currentTripId) {
                    handleDeleteTrip(currentTripId);
                    setConfirmDeleteId(null);
                  } else {
                    setConfirmDeleteId(currentTripId);
                    // Auto-reset after 4 seconds
                    setTimeout(() => setConfirmDeleteId(current => current === currentTripId ? null : current), 4000);
                  }
                }}
                className={cn(
                  "p-2 rounded-full transition-all flex items-center gap-1",
                  confirmDeleteId === currentTripId 
                    ? "bg-red-600 text-white px-3" 
                    : "bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-600"
                )}
                title={confirmDeleteId === currentTripId ? "Confirm Delete" : "Delete Trip"}
              >
                <Trash2 className="w-5 h-5" />
                {confirmDeleteId === currentTripId && (
                  <span className="text-[10px] font-black uppercase tracking-tighter">Confirm Delete?</span>
                )}
              </button>
            )}
            {view === 'itinerary' && isAdmin && itineraryHistory.length > 0 && (
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
                        
                        {isAdmin && view === 'itinerary' && (
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
                            {isEditing ? "Disable Editing" : "Enable Editing"}
                          </button>
                        )}

                        {view === 'itinerary' && (
                          <button 
                            onClick={() => {
                              handleExportItinerary();
                              setShowUserMenu(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            Export Data
                          </button>
                        )}

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
                        
                        <div className="border-t border-slate-50 mt-1">
                          <button 
                            onClick={() => handleLogout()}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                          </button>
                        </div>
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
                onFocus={() => setIsEditingTitle(true)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setIsEditingTitle(false);
                    (e.target as HTMLInputElement).blur();
                  }
                }}
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

      <div className="flex-1 flex overflow-hidden relative">
        <div className={cn(
          "flex-1 flex flex-col h-full transition-all duration-300 relative",
          isAiAssistantOpen ? "w-full md:w-[70%]" : "w-full"
        )}>
          {view === 'travellers' ? (
            <TravellersView 
              travellers={masterTravellers} 
              onUpdate={(list) => {
                setMasterTravellers(list);
                setDoc(doc(db, 'settings', 'travellers'), sanitizeForFirestore({ list })).catch(err => handleFirestoreError(err, OperationType.WRITE, 'settings/travellers'));
              }} 
            />
          ) : view === 'list' ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isAdmin && (
            <button 
              onClick={handleAddTrip}
              className="w-full p-6 bg-white border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center gap-3 text-slate-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/30 transition-all group"
            >
              <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <Plus className="w-6 h-6" />
              </div>
              <span className="font-black uppercase tracking-widest text-[10px]">Create New Trip</span>
            </button>
          )}

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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {yearTrips.map(trip => {
                      // Strip year from title for display
                      const displayTitle = trip.title.replace(/\s*\d{4}\s*/g, ' ').trim();
                      const isConfirming = confirmDeleteId === trip.id;
                      return (
                        <div key={trip.id} className="relative group">
                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                              "relative w-full text-left p-5 rounded-3xl border transition-all cursor-pointer",
                              currentTripId === trip.id 
                                ? "bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-100" 
                                : "bg-white border-slate-100 hover:border-blue-200 text-slate-900 shadow-sm"
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
                                  {formatTripDateRange(trip.date)}
                                </p>
                                <h3 className="text-lg font-black tracking-tight leading-tight">{displayTitle}</h3>
                              </div>
                              <div className="flex items-center gap-2">
                                {isAdmin && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirmDeleteId === trip.id) {
                                        console.log('UI: Delete confirmed for trip via Quick Delete:', trip.id);
                                        handleDeleteTrip(trip.id);
                                        setConfirmDeleteId(null);
                                      } else {
                                        console.log('UI: Quick Delete clicked for:', trip.id);
                                        setConfirmDeleteId(trip.id);
                                        // Auto-reset after 4 seconds
                                        setTimeout(() => setConfirmDeleteId(current => current === trip.id ? null : current), 4000);
                                      }
                                    }}
                                    className={cn(
                                      "p-2 rounded-full transition-all flex items-center gap-1",
                                      confirmDeleteId === trip.id 
                                        ? "bg-red-500 text-white shadow-lg scale-105" 
                                        : "text-slate-300 hover:text-red-500 hover:bg-red-50 md:opacity-0 md:group-hover:opacity-100"
                                    )}
                                    title={confirmDeleteId === trip.id ? "Confirm Delete" : "Quick Delete"}
                                  >
                                    <Trash2 className={cn("transition-transform", confirmDeleteId === trip.id ? "w-3 h-3" : "w-4 h-4")} />
                                    {confirmDeleteId === trip.id && (
                                      <span className="text-[10px] font-black uppercase tracking-tighter pr-1">Confirm?</span>
                                    )}
                                  </button>
                                )}
                                <ChevronRight className={cn(
                                  "w-5 h-5 transition-transform group-hover:translate-x-1",
                                  currentTripId === trip.id ? "text-blue-200" : "text-slate-300"
                                )} />
                              </div>
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
            <div className="flex flex-col h-full relative">
            {/* Desktop Tabs Header (Mobile uses bottom nav) */}
            <div className="hidden md:flex p-3 bg-white border-b border-slate-100 items-center justify-between shrink-0">
               <div className="flex gap-2">
                 <button onClick={() => setActiveTab('calendar')} className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2", activeTab === 'calendar' ? "bg-indigo-50 text-indigo-600 border border-indigo-100" : "text-slate-500 hover:bg-slate-50")}>
                   <Calendar className="w-4 h-4" /> Calendar
                 </button>
                 <button onClick={() => setActiveTab('places')} className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2", activeTab === 'places' ? "bg-indigo-50 text-indigo-600 border border-indigo-100" : "text-slate-500 hover:bg-slate-50")}>
                   <MapPin className="w-4 h-4" /> Shortlist
                 </button>
                 <button onClick={() => setActiveTab('info')} className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2", activeTab === 'info' ? "bg-indigo-50 text-indigo-600 border border-indigo-100" : "text-slate-500 hover:bg-slate-50")}>
                   <Info className="w-4 h-4" /> Reservations
                 </button>
               </div>
               
               <button 
                 onClick={() => setIsAiAssistantOpen(!isAiAssistantOpen)} 
                 className={cn("px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2", isAiAssistantOpen ? "bg-slate-100 text-slate-600" : "bg-blue-600 text-white hover:bg-blue-700 shadow-md")}
                 title="Toggle Magic AI"
               >
                 <Sparkles className="w-4 h-4" /> AI Assistant
               </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto scrollbar-hide bg-slate-50">
              <AnimatePresence mode="wait">
                {activeTab === 'calendar' && (
                  <motion.div key="calendar" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="flex flex-col h-full min-h-0">
                    {/* Toggle Schedule/Grid & Zoom */}
                    <div className="flex flex-wrap items-center justify-center gap-3 mt-2 mb-2 px-4 shrink-0">
                      <div className="flex bg-slate-200/60 p-1 rounded-xl w-fit">
                        <button 
                          onClick={() => setCalendarViewMode('schedule')}
                          className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", calendarViewMode === 'schedule' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700")}
                        >
                          Schedule
                        </button>
                        <button 
                          onClick={() => setCalendarViewMode('grid')}
                          className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", calendarViewMode === 'grid' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700")}
                        >
                          All Days
                        </button>
                      </div>

                      {calendarViewMode === 'grid' && (
                        <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-xl">
                          <button 
                            onClick={() => setHourHeight(prev => Math.max(40, prev - 20))}
                            disabled={hourHeight <= 40}
                            className="p-1.5 rounded-lg hover:bg-white text-slate-600 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
                            title="Zoom Out"
                          >
                            <ZoomOut className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 px-1.5 select-none">
                            Zoom
                          </span>
                          <button 
                            onClick={() => setHourHeight(prev => Math.min(200, prev + 20))}
                            disabled={hourHeight >= 200}
                            className="p-1.5 rounded-lg hover:bg-white text-slate-600 disabled:opacity-40 disabled:hover:bg-transparent transition-all"
                            title="Zoom In"
                          >
                            <ZoomIn className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {calendarViewMode === 'schedule' ? (
                      <div className="p-4 md:p-6 space-y-8 pb-32">
                         {displayItinerary.map((day, dIdx) => (
                           <div key={dIdx} className="space-y-4 relative">
                             <div className="sticky top-0 z-30 bg-slate-50/90 backdrop-blur-md py-1.5 md:py-2 border-b border-slate-200 flex flex-col px-2 gap-1.5">
                               <div className="flex items-center justify-between">
                                 <div className="flex items-baseline gap-2 min-w-0">
                                   <h3 className="font-display font-bold text-slate-900 text-sm md:text-base whitespace-nowrap">Day {dIdx + 1}</h3>
                                   <span className="text-[10px] md:text-xs text-slate-400 font-medium uppercase tracking-wider whitespace-nowrap">{day.date}</span>
                                   {day.title && <span className="text-[10px] md:text-xs text-slate-400 font-normal truncate">— {day.title}</span>}
                                 </div>
                                 
                                 <div className="flex -space-x-1.5 ml-2">
                                   {Array.from(new Set(day.events?.flatMap(e => expandMembers(e.memberIds, masterTravellers)) || [])).map(mid => {
                                     const member = masterTravellers.find(m => m.id === mid);
                                     if (!member) return null;
                                     return (
                                       <div 
                                         key={mid}
                                         className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-black text-white shadow-sm"
                                         style={{ backgroundColor: member.color }}
                                         title={member.name}
                                       >
                                         {member.initials}
                                       </div>
                                     );
                                   })}
                                 </div>
                               </div>
                               
                               {day.events?.some(e => !e.startTime) && (
                                 <div className="flex flex-wrap gap-1 pb-0.5">
                                   {day.events.filter(e => !e.startTime).map((event, idx) => (
                                     <div key={event.id || idx} className="bg-white/80 border border-slate-200 rounded-md px-2 py-0.5 flex items-center gap-1.5 max-w-full">
                                       <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                                       <span className="text-[10px] font-bold text-slate-700 truncate">{event.title}</span>
                                     </div>
                                   ))}
                                 </div>
                               )}
                             </div>
                             {day.events?.filter(e => e.startTime).length === 0 && day.events?.filter(e => !e.startTime).length === 0 ? (
                               <div className="text-center py-8 bg-white rounded-2xl border border-dashed border-slate-200 shadow-sm">
                                 <p className="text-slate-400 text-sm">No events</p>
                               </div>
                             ) : (
                               <div className="space-y-3 relative pl-4 border-l-2 border-slate-100">
                                 {day.events?.filter(e => e.startTime).map((event, idx) => (
                                   <div key={event.id || idx} className="relative mt-3">
                                     <div className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow-sm" />
                                     <EventTile event={event} dayIdx={dIdx} eventIdx={day.events.indexOf(event)} />
                                   </div>
                                 ))}
                               </div>
                             )}
                           </div>
                         ))}
                         {isAdmin && (
                           <button 
                             onClick={() => {
                               const nextDayNum = itinerary.length + 1;
                               const newDay = { date: `Day ${nextDayNum}`, events: [] };
                               const newItinerary = [...itinerary, newDay];
                               setItinerary(newItinerary);
                               saveToFirestore(newItinerary, tripTitle, tripDates);
                             }}
                             className="w-full py-4 bg-white border-2 border-dashed border-slate-200 rounded-3xl flex items-center justify-center gap-2 text-slate-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/30 transition-all group mt-4"
                           >
                             <Plus className="w-5 h-5" />
                             <span className="font-black uppercase tracking-widest text-[10px]">Add Day</span>
                           </button>
                         )}
                      </div>
                    ) : (
                      <div ref={gridScrollContainerRef} className="flex-1 overflow-auto bg-slate-50 relative pb-20 scrollbar-hide">
                        <div className="flex min-w-max min-h-max relative">
                          {/* Time Axis */}
                          <div className="w-16 shrink-0 border-r border-slate-200 bg-white sticky left-0 z-40">
                            <div className="border-b border-slate-200 bg-white sticky top-0 z-50" style={{ height: calendarGridHeaderHeight }} />
                            <div className="relative" style={{ height: 24 * hourHeight }}>
                              {Array.from({ length: 24 }).map((_, h) => (
                                <div key={h} className="absolute w-full text-right pr-2 text-[10px] font-bold text-slate-400" style={{ top: h * hourHeight - 8 }}>
                                  {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          {/* Background Grid Lines */}
                          <div className="absolute inset-0 pointer-events-none z-0 ml-16" style={{ height: 24 * hourHeight + calendarGridHeaderHeight }}>
                            <div style={{ height: calendarGridHeaderHeight }} />
                            {Array.from({ length: 24 }).map((_, h) => (
                              <div key={h} className="border-b border-slate-200 w-full" style={{ height: hourHeight }} />
                            ))}
                          </div>

                          {/* Day Columns */}
                          <div className="flex">
                            {displayItinerary.map((day, i) => {
                              // Compute layout for overlapping events
                              const computeOverlappingLayout = (events = []) => {
                                const prepared = events.map((event, idx) => {
                                  const startMins = toMinutes(event.startTime || "00:00");
                                  let endMins = toMinutes(event.endTime || event.startTime || "01:00");
                                  if (endMins < startMins && event.endTime) {
                                    endMins += 24 * 60;
                                  } else if (endMins === startMins) {
                                    endMins += 60;
                                  }
                                  return {
                                    event,
                                    idx,
                                    startMins,
                                    endMins,
                                    colIdx: -1
                                  };
                                });

                                prepared.sort((a, b) => {
                                  if (a.startMins !== b.startMins) {
                                    return a.startMins - b.startMins;
                                  }
                                  return b.endMins - a.endMins;
                                });

                                const clusters = [];
                                let currentCluster = [];
                                let clusterMaxEnd = 0;

                                prepared.forEach(item => {
                                  if (currentCluster.length === 0) {
                                    currentCluster.push(item);
                                    clusterMaxEnd = item.endMins;
                                  } else if (item.startMins < clusterMaxEnd) {
                                    currentCluster.push(item);
                                    clusterMaxEnd = Math.max(clusterMaxEnd, item.endMins);
                                  } else {
                                    clusters.push(currentCluster);
                                    currentCluster = [item];
                                    clusterMaxEnd = item.endMins;
                                  }
                                });
                                if (currentCluster.length > 0) {
                                  clusters.push(currentCluster);
                                }

                                const results = [];

                                clusters.forEach(cluster => {
                                  const columns = [];

                                  cluster.forEach(item => {
                                    let placedIdx = -1;
                                    for (let c = 0; c < columns.length; c++) {
                                      const lastInCol = columns[c][columns[c].length - 1];
                                      if (item.startMins >= lastInCol.endMins) {
                                        placedIdx = c;
                                        break;
                                      }
                                    }

                                    if (placedIdx !== -1) {
                                      columns[placedIdx].push(item);
                                      item.colIdx = placedIdx;
                                    } else {
                                      columns.push([item]);
                                      item.colIdx = columns.length - 1;
                                    }
                                  });

                                  const colsCount = columns.length;
                                  cluster.forEach(item => {
                                    const colIdx = item.colIdx;
                                    const top = (item.startMins / 60) * hourHeight;
                                    const height = ((item.endMins - item.startMins) / 60) * hourHeight;
                                    const width = 100 / colsCount;
                                    const left = colIdx * width;

                                    results.push({
                                      event: item.event,
                                      idx: item.idx,
                                      top,
                                      height,
                                      left,
                                      width
                                    });
                                  });
                                });

                                return results;
                              };

                              return (
                                <div key={i} className="w-72 shrink-0 border-r border-slate-200 relative flex flex-col z-10">
                                  {/* Header */}
                                  <div className="p-3 border-b border-slate-200 bg-slate-50/90 backdrop-blur-md sticky top-0 z-30 overflow-hidden shrink-0 flex flex-col justify-center" style={{ height: calendarGridHeaderHeight }}>
                                    <div className="flex justify-between items-center mb-0.5">
                                      <h3 className="font-display font-bold text-slate-800 text-base">Day {i + 1}</h3>
                                      <div className="flex items-center gap-1.5">
                                        {/* Traveller Stack for the Day */}
                                        <div className="flex -space-x-1">
                                          {Array.from(new Set(day.events?.flatMap(e => expandMembers(e.memberIds, masterTravellers)) || [])).map(mid => {
                                            const member = masterTravellers.find(m => m.id === mid);
                                            if (!member) return null;
                                            return (
                                              <div 
                                                key={mid}
                                                className="w-3.5 h-3.5 rounded-full border border-white flex items-center justify-center text-[6px] font-black text-white shadow-sm"
                                                style={{ backgroundColor: member.color }}
                                                title={member.name}
                                              >
                                                {member.initials}
                                              </div>
                                            );
                                          })}
                                        </div>
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                          {day.date}
                                        </span>
                                      </div>
                                    </div>
                                    <p className="text-[10px] text-slate-500 truncate font-medium">{day.title}</p>
                                  </div>
                                  
                                  {/* Events Area */}
                                  <div className="relative w-full overflow-hidden" style={{ height: 24 * hourHeight }}>
                                    {computeOverlappingLayout(day.events).map(({ event, idx, top, height, left, width }) => {
                                      return (
                                        <div 
                                          key={event.id || idx} 
                                          className="absolute px-1 py-0.5 transition-all"
                                          style={{ 
                                            top: `${top}px`, 
                                            height: `${height}px`,
                                            left: `${left}%`,
                                            width: `${width}%`
                                          }}
                                        >
                                          <EventTile event={event} dayIdx={i} eventIdx={idx} isGridMode={true} />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'places' && (
                  <motion.div key="places" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="p-3 md:p-6 space-y-4 pb-20">
                    <PlacesView 
                      itinerary={itinerary}
                      shortlist={shortlist}
                      onAddShortlist={(p) => setShortlist(s => [...s, p])}
                      onRemoveShortlist={(id) => setShortlist(s => s.filter(x => x.id !== id))}
                      isAdmin={isAdmin}
                      onUpdateItinerary={setItinerary}
                      onSaveToFirestore={(newItinerary) => saveToFirestore(newItinerary, tripTitle, tripDates)}
                      onNavigateToEvent={(d, e) => {}}
                    />
                  </motion.div>
                )}

                {activeTab === 'info' && (
                  <motion.div key="info" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="p-4 md:p-6 space-y-6 pb-32">
                      <GmailImport onProposalReceived={(proposal) => {
                        setAiProposal(proposal);
                        setIsAiAssistantOpen(true);
                      }} currentItinerary={itinerary} tripTitle={tripTitle} tripDates={tripDates} />
                      {/* Flights */}
                      {flightInfo && (
                        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                          <h4 className="font-display font-bold text-sm text-slate-800 mb-3 flex items-center gap-1.5">✈️ Flight Information</h4>
                          <div className="space-y-3 text-sm text-slate-600">
                            {flightInfo.outbound && (
                              <div className="flex justify-between border-b pb-2">
                                <span className="font-semibold text-slate-400 uppercase text-[10px]">Outbound Flight</span>
                                <span className="font-bold text-slate-800">{flightInfo.outbound.number || 'N/A'}</span>
                              </div>
                            )}
                            {flightInfo.return && (
                              <div className="flex justify-between border-b pb-2 border-transparent">
                                <span className="font-semibold text-slate-400 uppercase text-[10px]">Return Flight</span>
                                <span className="font-bold text-slate-800">{flightInfo.return.number || 'N/A'}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Stays */}
                      {stays && stays.length > 0 && (
                        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                          <h4 className="font-display font-bold text-sm text-slate-800 mb-3 flex items-center gap-1.5">🏨 Stays & Lodging</h4>
                          <div className="space-y-3">
                            {stays.map((stay, idx) => (
                              <div key={idx} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0 text-sm">
                                <p className="font-bold text-slate-800">{stay.name}</p>
                                <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mt-1">Confirmation: {stay.confirmationNumber || 'N/A'}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Members */}
                      {members && members.length > 0 && (
                        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                          <h4 className="font-display font-bold text-sm text-slate-800 mb-4 flex items-center gap-1.5">👥 Trip Members</h4>
                          <div className="grid grid-cols-2 gap-3">
                            {members.map((member) => (
                              <div key={member.id} className="bg-slate-50 p-2.5 rounded-xl flex items-center gap-3 border border-slate-100">
                                <div 
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shadow-sm"
                                  style={{ backgroundColor: member.color }}
                                >
                                  {member.initials}
                                </div>
                                <span className="text-sm font-bold text-slate-700 truncate">{member.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* If nothing is available */}
                      {!flightInfo && !rentalInfo && (!stays || stays.length === 0) && (
                        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200 shadow-sm">
                          <Info className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                          <p className="text-slate-400 text-sm">No reservation details available for this trip.</p>
                        </div>
                      )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

        {/* Mobile Backdrop */}
          <AnimatePresence>
            {isAiAssistantOpen && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsAiAssistantOpen(false)}
                className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-40 md:hidden"
              />
            )}
          </AnimatePresence>

          {/* Collapsible AI Assistant Pane */}
          {/* Note: using position absolute on mobile to overlay, and relative/flex-basis on desktop to push content */}
          <div className={cn(
            "absolute inset-y-0 right-0 md:static z-50 bg-white border-l border-slate-200 flex flex-col transition-all duration-300 shadow-2xl md:shadow-none overflow-hidden",
            isAiAssistantOpen ? "translate-x-0 w-[85%] sm:w-[350px] md:w-[30%]" : "translate-x-full w-[85%] sm:w-[350px] md:w-0 md:translate-x-0 md:border-none"
          )}>
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
                <span className="font-display font-bold text-sm truncate whitespace-nowrap">Magic AI Assistant</span>
              </div>
              <button 
                onClick={() => setIsAiAssistantOpen(false)}
                className="md:hidden p-1.5 hover:bg-slate-800 rounded-lg text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chat Output Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-slate-50/50 min-w-[250px]">
              {aiProposal ? (
                <div className="space-y-3">
                  <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 text-xs">
                    <div className="flex justify-between items-start mb-1.5">
                      <h3 className="font-bold text-blue-900 flex items-center gap-1">
                        <Wand2 className="w-3.5 h-3.5" /> Proposed Changes
                      </h3>
                    </div>
                    <p className="text-blue-800 italic">"{aiProposal.explanation}"</p>
                    <div className="flex gap-2 mt-3">
                      <button 
                        onClick={applyAiProposal}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-xs font-bold transition-colors"
                      >
                        Apply
                      </button>
                      <button 
                        onClick={() => {
                          setAiProposal(null);
                          setRejectedSuggestionIds([]);
                        }}
                        className="flex-1 bg-white hover:bg-slate-50 text-slate-600 py-2 rounded-lg text-xs font-bold border transition-colors"
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                  <p className="text-sm font-medium leading-relaxed px-4">Tell me what to build or change. I can add activities, suggest items, or auto-fill your plans!</p>
                </div>
              )}
            </div>

            {/* Prompt Input Box */}
            <div className="p-3 border-t border-slate-100 bg-white min-w-[250px] shrink-0">
              <div className="relative">
                <textarea 
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g., 'Add a dinner spot on Day 1'"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pr-11 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none h-20"
                  disabled={isAiLoading}
                />
                {isAiLoading ? (
                  <div className="absolute right-3 bottom-3">
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="absolute right-2 bottom-2 flex gap-1">
                    <button
                      onClick={() => handleAiAction('shortlist')}
                      disabled={!aiPrompt.trim()}
                      title="Search for places and add to shortlist"
                      className="p-2 bg-indigo-100 hover:bg-indigo-200 disabled:bg-slate-100 disabled:text-slate-400 text-indigo-600 rounded-lg transition-colors"
                    >
                      <MapPin className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleAiAction('full')}
                      disabled={!aiPrompt.trim()}
                      title="Apply changes to itinerary"
                      className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg transition-colors shadow-sm"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Mobile Overlay for AI Assistant */}
          <AnimatePresence>
            {isAiAssistantOpen && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsAiAssistantOpen(false)}
                className="md:hidden fixed inset-0 bg-slate-900/20 z-40 backdrop-blur-sm"
              />
            )}
          </AnimatePresence>
      </div>

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

      {/* Event Details Modal */}
      {selectedEventForModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedEventForModal(null)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          
          {/* Modal Container */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden relative z-10 flex flex-col max-h-[85vh]"
          >
            {/* Header / Accent Bar */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between bg-slate-50">
              <div>
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-wider bg-blue-50 px-2 py-1 rounded-md border border-blue-100">
                  Day {selectedEventForModal.dayIdx + 1} &bull; {itinerary[selectedEventForModal.dayIdx]?.date}
                </span>
                <h3 className="font-display font-bold text-slate-900 text-xl mt-2 leading-tight">
                  {selectedEventForModal.event.title}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedEventForModal(null)}
                className="p-1.5 hover:bg-slate-200 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 scrollbar-hide text-sm">
              {/* Timing */}
              {(selectedEventForModal.event.startTime || selectedEventForModal.event.endTime) && (
                <div className="flex items-center gap-2.5 text-slate-500 font-medium">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>
                    {selectedEventForModal.event.startTime}
                    {selectedEventForModal.event.endTime ? ` - ${selectedEventForModal.event.endTime}` : ''}
                  </span>
                </div>
              )}

              {/* Description */}
              {selectedEventForModal.event.description && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Notes & Details</h4>
                  <div className="text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100 whitespace-pre-wrap">
                    {selectedEventForModal.event.description.split(/(https?:\/\/[^\s]+)/g).map((part, i) => 
                      part.match(/^https?:\/\//) ? (
                        <a key={i} href={part} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                          {part}
                        </a>
                      ) : part
                    )}
                  </div>
                </div>
              )}

              {/* Location with map directions */}
              {selectedEventForModal.event.location && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Location</h4>
                  <div className="flex items-center justify-between p-4 bg-blue-50/40 rounded-2xl border border-blue-50">
                    <div className="flex items-center gap-2 text-slate-700 min-w-0">
                      <MapPin className="w-5 h-5 text-blue-500 shrink-0" />
                      <span className="font-bold truncate">{selectedEventForModal.event.location.name}</span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <a 
                        href={getAppleMapsUrl(selectedEventForModal.event.location)}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 bg-white rounded-xl text-slate-400 hover:text-blue-600 border border-slate-200 shadow-sm transition-colors"
                        title="Apple Maps"
                      >
                        <Navigation className="w-4 h-4" />
                      </a>
                      <a 
                        href={getGoogleMapsUrl(selectedEventForModal.event.location)}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 bg-white rounded-xl text-slate-400 hover:text-blue-600 border border-slate-200 shadow-sm transition-colors"
                        title="Google Maps"
                      >
                        <MapIcon className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Travel/Directions detail */}
              {selectedEventForModal.event.type === 'travel' && selectedEventForModal.event.origin && selectedEventForModal.event.destination && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Route</h4>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <span className="truncate max-w-[40%] text-slate-700">{selectedEventForModal.event.origin.name}</span>
                      <ArrowRight className="w-4 h-4 shrink-0 text-slate-400" />
                      <span className="truncate max-w-[40%] text-slate-700">{selectedEventForModal.event.destination.name}</span>
                    </div>

                    <div className="flex gap-1.5 bg-white/80 p-1.5 rounded-2xl w-fit flex-wrap border border-slate-200">
                      {[
                        { mode: 'walk', icon: <Footprints className="w-3.5 h-3.5" /> },
                        { mode: 'bike', icon: <Bike className="w-3.5 h-3.5" /> },
                        { mode: 'drive', icon: <Car className="w-3.5 h-3.5" /> },
                        { mode: 'rideshare', icon: <Car className="w-3.5 h-3.5" /> },
                        { mode: 'transit', icon: <Bus className="w-3.5 h-3.5" /> },
                        { mode: 'flight', icon: <Plane className="w-3.5 h-3.5" /> }
                      ].map(({ mode, icon }) => (
                        <button
                          key={mode}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateTravelMode(selectedEventForModal.dayIdx, selectedEventForModal.event.id, mode as any);
                          }}
                          className={cn(
                            "p-2 rounded-xl transition-all",
                            selectedEventForModal.event.category === mode
                              ? "bg-blue-600 text-white shadow-sm"
                              : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                          )}
                          title={`Switch to ${mode}`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <a 
                        href={(() => {
                          const mode = selectedEventForModal.event.category === 'walk' ? 'w' : selectedEventForModal.event.category === 'transit' ? 'r' : 'd';
                          const saddr = encodeURIComponent(selectedEventForModal.event.origin?.name || '');
                          const daddr = encodeURIComponent(selectedEventForModal.event.destination?.name || '');
                          return `https://maps.apple.com/?saddr=${saddr}&daddr=${daddr}&ll=${selectedEventForModal.event.destination?.lat},${selectedEventForModal.event.destination?.lng}&dirflg=${mode}`;
                        })()}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-white rounded-xl text-slate-600 hover:text-blue-600 border border-slate-200 shadow-sm font-bold text-xs transition-colors"
                      >
                        <Navigation className="w-3.5 h-3.5" /> Apple Directions
                      </a>
                      <a 
                        href={(() => {
                          const mode = selectedEventForModal.event.category === 'walk' ? 'walking' : selectedEventForModal.event.category === 'transit' ? 'transit' : 'driving';
                          return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(selectedEventForModal.event.origin?.name || '')}&destination=${encodeURIComponent(selectedEventForModal.event.destination?.name || '')}&travelmode=${mode}`;
                        })()}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-white rounded-xl text-slate-600 hover:text-blue-600 border border-slate-200 shadow-sm font-bold text-xs transition-colors"
                      >
                        <MapIcon className="w-3.5 h-3.5" /> Google Directions
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {selectedEventForModal.event.suggestions && selectedEventForModal.event.suggestions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Alternative Suggestions</h4>
                  <div className="space-y-2">
                    {selectedEventForModal.event.suggestions.map((sug, sIdx) => {
                      return (
                        <div key={sIdx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 text-xs truncate">{sug.name}</p>
                            {sug.description && <p className="text-[10px] text-slate-400 truncate mt-0.5">{sug.description}</p>}
                          </div>
                          {isAdmin && (
                            <button 
                              onClick={() => {
                                handleSelectSuggestion(selectedEventForModal.dayIdx, selectedEventForModal.event.id, sug);
                                setSelectedEventForModal(null); // Close details modal upon selection
                              }}
                              className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-blue-700 shadow-sm transition-colors"
                            >
                              Select
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
              {isAdmin && (
                <button 
                  onClick={() => {
                    const dIdx = selectedEventForModal.dayIdx;
                    const actIdx = selectedEventForModal.eventIdx;
                    setSelectedEventForModal(null);
                    setEditingActivity({ dayIdx: dIdx, actIdx });
                  }}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-xl text-slate-700 font-bold text-xs transition-colors flex items-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit Details
                </button>
              )}
              <button 
                onClick={() => setSelectedEventForModal(null)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}

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
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto md:hidden bg-white/80 backdrop-blur-xl border-t border-slate-100 px-2 py-2 pb-6 flex justify-around items-center z-50">
          <button onClick={() => setActiveTab('calendar')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'calendar' && !isAiAssistantOpen ? "text-blue-600" : "text-slate-400")} title="View Calendar">
            <Calendar className="w-5 h-5" /><span className="text-[9px] font-bold uppercase tracking-wider">Calendar</span>
          </button>
          <button onClick={() => setActiveTab('places')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'places' && !isAiAssistantOpen ? "text-blue-600" : "text-slate-400")} title="View Shortlisted Places">
            <MapPin className="w-5 h-5" /><span className="text-[9px] font-bold uppercase tracking-wider">Places</span>
          </button>
          <button onClick={() => setIsAiAssistantOpen(!isAiAssistantOpen)} className={cn("flex flex-col items-center gap-1 transition-colors relative", isAiAssistantOpen ? "text-indigo-600" : "text-slate-400")} title="AI Assistant">
            <Sparkles className={cn("w-5 h-5", isAiAssistantOpen && "animate-pulse")} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Magic AI</span>
          </button>
          <button onClick={() => setActiveTab('info')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'info' && !isAiAssistantOpen ? "text-blue-600" : "text-slate-400")} title="Reservations & Bookings">
            <Info className="w-5 h-5" /><span className="text-[9px] font-bold uppercase tracking-wider">Bookings</span>
          </button>
        </nav>
      )}
    </div>
  );
}
