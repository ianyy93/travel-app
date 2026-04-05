/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  Map as MapIcon, 
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
  LogIn
} from 'lucide-react';
import { ITINERARY_DATA, FLIGHT_DETAILS, RENTAL_DETAILS, DayPlan, Activity } from './constants';
import { cn } from './lib/utils';
import { db, auth } from './firebase';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Fuel, Navigation } from 'lucide-react';

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

const MapView = ({ itinerary, activeDayIdx }: { itinerary: DayPlan[], activeDayIdx: number }) => {
  const locations = useMemo(() => {
    const locs: any[] = [];
    itinerary[activeDayIdx].activities.forEach(act => {
      if (act.location) locs.push({ ...act.location, type: act.type });
    });
    return locs;
  }, [itinerary, activeDayIdx]);

  const appleMapsUrl = useMemo(() => {
    if (locations.length === 0) return null;
    
    // Base URL for Apple Maps
    let url = "http://maps.apple.com/?dirflg=d";
    
    if (locations.length === 1) {
      url += `&daddr=${locations[0].lat},${locations[0].lng}`;
    } else {
      // Start at first location, waypoints in between, end at last location
      const start = locations[0];
      const end = locations[locations.length - 1];
      const waypoints = locations.slice(1, -1);
      
      url += `&saddr=${start.lat},${start.lng}`;
      url += `&daddr=${end.lat},${end.lng}`;
      
      if (waypoints.length > 0) {
        const waypointStr = waypoints.map(w => `${w.lat},${w.lng}`).join("+to:");
        url += `+to:${waypointStr}`;
      }
    }
    
    return url;
  }, [locations]);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="p-4 bg-white border-b border-slate-200">
        <h2 className="text-xl font-bold text-slate-900">Day Directions</h2>
        <p className="text-sm text-slate-500">{itinerary[activeDayIdx].date} route</p>
      </div>
      
      <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mb-6 shadow-sm">
          <Navigation className="w-10 h-10 text-blue-600" />
        </div>
        
        <h3 className="text-xl font-bold text-slate-900 mb-2">Open in Apple Maps</h3>
        <p className="text-slate-500 mb-8 max-w-xs">
          Get turn-by-turn directions for all {locations.length} stops scheduled for {itinerary[activeDayIdx].date}.
        </p>

        {appleMapsUrl ? (
          <a 
            href={appleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full max-w-xs bg-blue-600 text-white py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-200 active:scale-95 transition-transform"
          >
            <ExternalLink className="w-5 h-5" />
            Start Navigation
          </a>
        ) : (
          <div className="bg-slate-100 text-slate-400 py-4 px-6 rounded-2xl font-bold w-full max-w-xs">
            No locations set for today
          </div>
        )}

        <div className="mt-12 w-full max-w-xs text-left">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Waypoints</p>
          <div className="space-y-3">
            {locations.map((loc, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                  {i + 1}
                </div>
                <p className="text-sm font-medium text-slate-700">{loc.name}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const GasPricesView = () => {
  // Mock data for gas prices in Arizona
  const gasData = [
    { city: "Phoenix", regular: "$3.85", premium: "$4.25", station: "Costco" },
    { city: "Grand Canyon", regular: "$4.45", premium: "$4.85", station: "Chevron" },
    { city: "Sedona", regular: "$4.15", premium: "$4.55", station: "Shell" },
    { city: "Scottsdale", regular: "$3.95", premium: "$4.35", station: "QuikTrip" },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="p-4 bg-white border-b border-slate-200">
        <h2 className="text-xl font-bold text-slate-900">Gas Prices</h2>
        <p className="text-sm text-slate-500">Arizona average estimates</p>
      </div>
      
      <div className="flex-1 p-4 space-y-4 overflow-y-auto pb-24">
        <div className="bg-blue-600 rounded-3xl p-6 text-white shadow-lg shadow-blue-100">
          <div className="flex items-center gap-3 mb-4">
            <Fuel className="w-6 h-6" />
            <h3 className="font-bold">Trip Fuel Tip</h3>
          </div>
          <p className="text-blue-50 text-sm leading-relaxed">
            Gas is significantly more expensive near the Grand Canyon. Fill up in Williams or Flagstaff before heading to the South Rim to save.
          </p>
        </div>

        <div className="grid gap-3">
          {gasData.map((item, i) => (
            <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{item.city}</p>
                <p className="font-bold text-slate-800">{item.station}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-black text-slate-900">{item.regular}</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase">Regular</p>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 text-center">
          <p className="text-xs text-slate-400">Data sourced from regional averages.</p>
          <a 
            href="https://www.gasbuddy.com/home?search=Arizona" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-blue-600 font-bold mt-1 inline-block"
          >
            View live on GasBuddy →
          </a>
        </div>
      </div>
    </div>
  );
};

const ActivityIcon = ({ type }: { type: Activity['type'] }) => {
  switch (type) {
    case 'flight': return <Plane className="w-4 h-4" />;
    case 'drive': return <Car className="w-4 h-4" />;
    case 'stay': return <Moon className="w-4 h-4" />;
    case 'activity': return <Sun className="w-4 h-4" />;
    default: return <MapPin className="w-4 h-4" />;
  }
};

const EditActivityModal = ({ 
  activity, 
  onSave, 
  onClose,
  onDelete
}: { 
  activity: Activity; 
  onSave: (updated: Activity) => void; 
  onClose: () => void;
  onDelete?: () => void;
}) => {
  const [edited, setEdited] = useState<Activity>({ ...activity });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-4">
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-900">{onDelete ? 'Edit Activity' : 'Add Activity'}</h3>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase">Title</label>
            <input 
              type="text" 
              value={edited.title}
              onChange={e => setEdited({ ...edited, title: e.target.value })}
              className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Time</label>
              <input 
                type="text" 
                value={edited.time || ''}
                onChange={e => setEdited({ ...edited, time: e.target.value })}
                placeholder="e.g. 09:30 AM"
                className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Type</label>
              <select 
                value={edited.type}
                onChange={e => setEdited({ ...edited, type: e.target.value as any })}
                className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="activity">Activity</option>
                <option value="drive">Drive</option>
                <option value="flight">Flight</option>
                <option value="stay">Stay</option>
                <option value="food">Food</option>
              </select>
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
            onClick={() => onSave(edited)}
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
  const [activeTab, setActiveTab] = useState<'itinerary' | 'map' | 'gas' | 'info'>('itinerary');
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const [itinerary, setItinerary] = useState<DayPlan[]>(ITINERARY_DATA);
  const [user, setUser] = useState<User | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingActivity, setEditingActivity] = useState<{ dayIdx: number, actIdx: number | null } | null>(null);

  // Auth & Sync
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => setUser(u));
    
    const path = 'trips/main';
    const tripDoc = doc(db, 'trips', 'main');
    
    const unsubscribeSync = onSnapshot(tripDoc, (snapshot) => {
      if (snapshot.exists()) {
        setItinerary(snapshot.data().days);
      } else {
        // Only initialize if we have a user, otherwise we'll get permission denied on write
        if (auth.currentUser) {
          setDoc(tripDoc, { 
            days: ITINERARY_DATA,
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
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        console.log("User closed the login popup.");
        return;
      }
      console.error("Login failed", err);
    }
  };

  const saveToFirebase = async (newItinerary: DayPlan[]) => {
    if (!user) return;
    const path = 'trips/main';
    try {
      await setDoc(doc(db, 'trips', 'main'), { 
        days: newItinerary,
        lastUpdated: new Date().toISOString(),
        updatedBy: user.email
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleUpdateActivity = (updated: Activity) => {
    if (!editingActivity) return;
    const { dayIdx, actIdx } = editingActivity;
    const newItinerary = [...itinerary];
    if (actIdx === null) {
      newItinerary[dayIdx].activities.push(updated);
    } else {
      newItinerary[dayIdx].activities[actIdx] = updated;
    }
    setItinerary(newItinerary);
    saveToFirebase(newItinerary);
    setEditingActivity(null);
  };

  const handleDeleteActivity = () => {
    if (!editingActivity || editingActivity.actIdx === null) return;
    const { dayIdx, actIdx } = editingActivity;
    const newItinerary = [...itinerary];
    newItinerary[dayIdx].activities.splice(actIdx, 1);
    setItinerary(newItinerary);
    saveToFirebase(newItinerary);
    setEditingActivity(null);
  };

  const activeDay = itinerary[activeDayIdx];

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-50 flex flex-col font-sans shadow-2xl overflow-hidden relative">
      {/* iOS Status Bar Simulation */}
      <div className="h-12 bg-white flex items-center justify-between px-8 pt-4 shrink-0">
        <span className="text-sm font-bold">9:41</span>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full border-2 border-slate-900" />
          <div className="w-5 h-2.5 rounded-sm border border-slate-900 relative">
            <div className="absolute inset-0.5 bg-slate-900 rounded-px" />
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="px-6 pt-4 pb-4 bg-white border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Arizona 2026</h1>
          <div className="flex items-center gap-2">
            {user ? (
              <button 
                onClick={() => setIsEditing(!isEditing)}
                className={cn(
                  "p-2 rounded-full transition-colors",
                  isEditing ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                )}
              >
                <Edit2 className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleLogin} className="p-2 bg-blue-50 text-blue-600 rounded-full">
                <LogIn className="w-4 h-4" />
              </button>
            )}
            <div className="p-2 bg-blue-50 rounded-full">
              <Dog className="w-4 h-4 text-blue-600" />
            </div>
          </div>
        </div>
        
        {/* Day Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide py-2">
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
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto scrollbar-hide">
        <AnimatePresence mode="wait">
          {activeTab === 'itinerary' && (
            <motion.div 
              key={`day-${activeDayIdx}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-6 pb-24"
            >
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900">{activeDay.title}</h2>
                <p className="text-sm text-slate-500">Day {activeDayIdx + 1} of your trip</p>
              </div>

              <div className="space-y-3">
                {activeDay.activities.map((activity, idx) => (
                  <div key={idx} className="relative group">
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "mt-1 p-2 rounded-xl",
                          activity.type === 'flight' ? "bg-purple-50 text-purple-600" :
                          activity.type === 'drive' ? "bg-orange-50 text-orange-600" :
                          activity.type === 'stay' ? "bg-indigo-50 text-indigo-600" :
                          "bg-emerald-50 text-emerald-600"
                        )}>
                          <ActivityIcon type={activity.type} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                              {activity.title}
                              {activity.description?.toLowerCase().includes('dog') && (
                                <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 text-[8px] font-black uppercase rounded-md flex items-center gap-0.5">
                                  <Dog className="w-2 h-2" /> Dog Friendly
                                </span>
                              )}
                            </h4>
                            {activity.time && (
                              <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {activity.time}
                              </span>
                            )}
                          </div>
                          {activity.description && (
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                              {activity.description}
                            </p>
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
                ))}
                
                {isEditing && (
                  <button 
                    onClick={() => setEditingActivity({ dayIdx: activeDayIdx, actIdx: null })}
                    className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 flex items-center justify-center gap-2 font-bold hover:border-blue-400 hover:text-blue-500 transition-colors"
                  >
                    <Plus className="w-5 h-5" /> Add Activity
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'map' && (
            <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full pb-20">
              <MapView itinerary={itinerary} activeDayIdx={activeDayIdx} />
            </motion.div>
          )}

          {activeTab === 'gas' && (
            <motion.div key="gas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full pb-20">
              <GasPricesView />
            </motion.div>
          )}

          {activeTab === 'info' && (
            <motion.div key="info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full">
              <div className="p-6 space-y-8 bg-slate-50 min-h-full pb-24">
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

      {/* Modals */}
      {editingActivity && (
        <EditActivityModal 
          activity={editingActivity.actIdx !== null 
            ? itinerary[editingActivity.dayIdx].activities[editingActivity.actIdx] 
            : { title: '', type: 'activity', description: '', time: '' }
          }
          onSave={handleUpdateActivity}
          onClose={() => setEditingActivity(null)}
          onDelete={editingActivity.actIdx !== null ? handleDeleteActivity : undefined}
        />
      )}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/80 backdrop-blur-xl border-t border-slate-100 px-6 py-4 pb-10 flex justify-between items-center z-50">
        <button onClick={() => setActiveTab('itinerary')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'itinerary' ? "text-blue-600" : "text-slate-400")}>
          <Calendar className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Itinerary</span>
        </button>
        <button onClick={() => setActiveTab('map')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'map' ? "text-blue-600" : "text-slate-400")}>
          <Navigation className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Directions</span>
        </button>
        <button onClick={() => setActiveTab('gas')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'gas' ? "text-blue-600" : "text-slate-400")}>
          <Fuel className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Gas</span>
        </button>
        <button onClick={() => setActiveTab('info')} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === 'info' ? "text-blue-600" : "text-slate-400")}>
          <Info className="w-6 h-6" /><span className="text-[10px] font-bold uppercase tracking-wider">Details</span>
        </button>
      </nav>

      {/* iOS Home Indicator Simulation */}
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 w-32 h-1.5 bg-slate-200 rounded-full z-[60] pointer-events-none" />
    </div>
  );
}
