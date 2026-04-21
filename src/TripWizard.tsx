import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ChevronRight, Loader2, Navigation2, Wand2, ArrowLeft } from 'lucide-react';
import { geminiService } from './services/geminiService';
import { TripMember } from './constants';

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

export const TripWizard = ({ 
  masterTravellers, 
  onComplete, 
  onCancel 
}: { 
  masterTravellers: TripMember[];
  onComplete: (tripData: any) => void;
  onCancel: () => void;
}) => {
  const [step, setStep] = useState<WizardStep>(1);
  const [isLoading, setIsLoading] = useState(false);

  // State
  const [logisticsInput, setLogisticsInput] = useState('');
  const [datesInput, setDatesInput] = useState('');
  const [activitiesInput, setActivitiesInput] = useState('');
  const [wishlistInput, setWishlistInput] = useState('');

  const [extractedLogistics, setExtractedLogistics] = useState<any>(null);
  const [framework, setFramework] = useState<any>(null);

  const handleNext = async () => {
    setIsLoading(true);
    try {
      if (step === 1) {
        const logistics = await geminiService.extractWizardLogistics(logisticsInput);
        setExtractedLogistics(logistics);
        if (!logistics.dates && logistics.isRoadTrip) {
          setStep(2);
        } else {
          setDatesInput(logistics.dates || 'Dates TBD');
          setStep(3);
        }
      } else if (step === 2) {
        setStep(3);
      } else if (step === 3) {
        setStep(4);
      } else if (step === 4) {
        setStep(5);
      } else if (step === 5) {
        setStep(6);
        await assembleTrip();
      }
    } catch (e) {
      console.error(e);
      alert('Error parsing input. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const assembleTrip = async () => {
    try {
      const activities = activitiesInput.trim() ? await geminiService.extractWizardActivities(activitiesInput) : [];
      const shortlist = wishlistInput.trim() ? await geminiService.extractWizardShortlist(wishlistInput) : [];
      
      const tripData = {
        title: 'New Trip',
        dates: datesInput || extractedLogistics?.dates || 'Dates TBD',
        logistics: extractedLogistics,
        activities,
        shortlist
      };
      
      // Pass data to parent App.tsx to construct deterministic itinerary
      onComplete(tripData);
    } catch (e) {
      console.error(e);
      setStep(5);
      alert('Error assembling trip.');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-50 z-[100] overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 min-h-screen flex flex-col">
        <header className="flex items-center gap-4 mb-8 pt-4">
          <button onClick={onCancel} className="p-2 bg-white rounded-full text-slate-500 hover:text-slate-900 shadow-sm border border-slate-100">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-black text-slate-900">Create New Trip</h1>
            <p className="text-sm font-medium text-slate-500">Step {step} of 6</p>
          </div>
        </header>

        <div className="flex-1">
          {step === 1 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <h2 className="text-xl font-bold">Logistics & Travellers</h2>
              <p className="text-slate-500 text-sm">Paste any booking confirmations for flights, trains, ferries, rental cars, and stays. Mention who is travelling. Or mention if it's a road trip from home.</p>
              <textarea 
                value={logisticsInput}
                onChange={e => setLogisticsInput(e.target.value)}
                className="w-full h-64 p-4 rounded-2xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none resize-none font-medium text-slate-700 bg-white"
                placeholder="E.g., 4 of us flying to London on BA123 arriving May 14th at 2pm..."
              />
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <h2 className="text-xl font-bold">Trip Dates</h2>
              <p className="text-slate-500 text-sm">When are you travelling?</p>
              <textarea 
                value={datesInput}
                onChange={e => setDatesInput(e.target.value)}
                className="w-full h-32 p-4 rounded-2xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none resize-none font-medium text-slate-700 bg-white"
                placeholder="Dates (e.g., May 14 - May 19, 2026)"
              />
            </motion.div>
          )}

          {step === 3 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <h2 className="text-xl font-bold">Planned Framework</h2>
              <p className="text-slate-500 text-sm">Here's what we've understood so far. Please confirm.</p>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Travellers</h3>
                  <p className="font-medium text-slate-700">{extractedLogistics?.travellers?.join(', ') || 'Not specified'}</p>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Dates</h3>
                  <p className="font-medium text-slate-700">{datesInput || 'TBD'}</p>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Stays / Locations</h3>
                  <ul className="list-disc list-inside font-medium text-slate-700">
                    {extractedLogistics?.stays?.map((s: any, i: number) => <li key={i}>{s.name}</li>)}
                  </ul>
                </div>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <h2 className="text-xl font-bold">Planned Activities</h2>
              <p className="text-slate-500 text-sm">Any tours, dinners, or events already booked? Paste confirmations or describe them.</p>
              <textarea 
                value={activitiesInput}
                onChange={e => setActivitiesInput(e.target.value)}
                className="w-full h-48 p-4 rounded-2xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none resize-none font-medium text-slate-700 bg-white"
                placeholder="E.g., Dinner reservation at The Ritz at 7pm on May 15th..."
              />
            </motion.div>
          )}

          {step === 5 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <h2 className="text-xl font-bold">Wishlist & Places to Visit</h2>
              <p className="text-slate-500 text-sm">Any places you just want to check out? Drop names, Google Maps links, or websites here.</p>
              <textarea 
                value={wishlistInput}
                onChange={e => setWishlistInput(e.target.value)}
                className="w-full h-48 p-4 rounded-2xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none resize-none font-medium text-slate-700 bg-white"
                placeholder="E.g., British Museum, some nice parks, maybe a specific coffee shop..."
              />
            </motion.div>
          )}

          {step === 6 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 text-center py-12">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Wand2 className="w-10 h-10 text-blue-600 animate-pulse" />
              </div>
              <h2 className="text-2xl font-black text-slate-900">Assembling Travel Graph...</h2>
              <p className="text-slate-500 text-sm max-w-md mx-auto">Connecting activities, inserting meal gaps, and finalising the itinerary.</p>
            </motion.div>
          )}
        </div>

        <footer className="mt-8 pt-4 border-t border-slate-200 flex justify-between">
          <div>
            {step > 1 && step < 6 && (
              <button 
                onClick={() => setStep(s => (s === 3 && extractedLogistics?.isRoadTrip && !extractedLogistics?.dates ? 2 : s === 3 ? 1 : s - 1) as WizardStep)}
                className="px-6 py-3 rounded-xl font-bold text-slate-600 bg-white border-2 border-slate-200 hover:bg-slate-50 transition-colors"
                disabled={isLoading}
              >
                Back
              </button>
            )}
          </div>
          <button 
            onClick={handleNext}
            disabled={isLoading || (step === 1 && !logisticsInput.trim())}
            className="px-8 py-3 rounded-xl font-black text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <>
                {step === 5 ? 'Assemble Trip' : 'Next'}
                {step !== 5 && <ChevronRight className="w-5 h-5" />}
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
};
