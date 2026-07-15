import React, { useState, useEffect } from 'react';
import { Mail, CheckCircle2, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { initAuth, googleSignIn, getAccessToken, logout } from '../services/authService';
import { fetchRecentConfirmations } from '../services/gmailService';
import { geminiService } from '../services/geminiService';
import { User } from 'firebase/auth';
import { cn } from '../lib/utils';

interface GmailImportProps {
  onProposalReceived: (proposal: any) => void;
  currentItinerary: any[];
  tripTitle?: string;
  tripDates?: string;
}

export function GmailImport({ onProposalReceived, currentItinerary, tripTitle, tripDates }: GmailImportProps) {
  const [needsAuth, setNeedsAuth] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>('');

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, t) => {
        setUser(user);
        setToken(t);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        setNeedsAuth(false);
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    setError(null);
    setStatusText(tripTitle ? `Searching inbox for ${tripTitle} reservations...` : 'Searching inbox for recent reservations...');
    
    try {
      // 1. Parse dates for better filtering if available
      let startDateStr = undefined;
      let endDateStr = undefined;
      
      if (tripDates && tripDates.includes(' - ')) {
        const parts = tripDates.split(' - ');
        const year = new Date().getFullYear(); // Assume current year for search
        startDateStr = `${parts[0]}, ${year}`;
        endDateStr = `${parts[1]}, ${year}`;
      }

      // 2. Fetch from Gmail with trip context
      const emails = await fetchRecentConfirmations(tripTitle, startDateStr, endDateStr);
      if (emails.length === 0) {
        setStatusText('');
        setError(tripTitle ? `No reservations matching "${tripTitle}" found in your recent emails.` : 'No recent reservation emails found in your inbox.');
        setIsScanning(false);
        return;
      }
      
      setStatusText(`Found ${emails.length} potential emails. Extracting details with AI...`);
      
      // 3. Feed to Gemini using the existing parse route
      const prompt = `I found these recent emails in my inbox${tripTitle ? ` for my trip to ${tripTitle}` : ''}. Please extract any flights, stays, car rentals, or reservations from them and update my itinerary. 
      
      IMPORTANT: 
      1. Only include items that are relevant to this trip and destination.
      2. If an email indicates a CANCELLATION or CHANGE to a previously confirmed reservation, please reflect that in your extraction (e.g. update dates/times or set status appropriately).
      3. IGNORE non-travel reservations like dental appointments, hair appointments, or local meetings unless they clearly belong in this travel itinerary.
      
      Emails:
      ` + 
        emails.map(e => `Subject: ${e.subject}\nDate: ${e.date}\nFrom: ${e.from}\nBody: ${e.body}`).join('\n\n--- NEXT EMAIL ---\n\n');
        
      const proposal = await geminiService.proposeChanges(
        'gemini-3.5-flash',
        currentItinerary,
        prompt,
        'details' // use details mode to parse reservations
      );
      
      setStatusText('');
      onProposalReceived(proposal);
      
    } catch (err: any) {
      console.error('Scan failed:', err);
      setError(err.message || 'Failed to scan and parse emails.');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
          <Mail className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-display font-bold text-slate-800">Auto-Import from Gmail</h4>
          <p className="text-xs text-slate-500">Find flights, hotels, and rentals in your inbox</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {needsAuth ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-slate-600 mb-1">
            Connect your Gmail account securely to let the AI scan for your recent travel confirmations.
          </p>
          <button 
            onClick={handleLogin} 
            disabled={isLoggingIn}
            className="gsi-material-button flex items-center gap-2 border border-slate-200 rounded px-4 py-2 hover:bg-slate-50 transition-colors text-sm font-medium"
          >
            {isLoggingIn ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            ) : (
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="18px" height="18px">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                <path fill="none" d="M0 0h48v48H0z"></path>
              </svg>
            )}
            Sign in with Google
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Connected as <strong className="font-semibold">{user?.email}</strong></span>
            </div>
            <button onClick={logout} className="text-slate-400 hover:text-slate-600 underline decoration-slate-300 underline-offset-2">
              Sign out
            </button>
          </div>
          
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-all shadow-sm flex justify-center items-center gap-2"
          >
            {isScanning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                {statusText || 'Scanning inbox...'}
              </>
            ) : (
              <>
                <Mail className="w-4 h-4" />
                Scan Inbox for {tripTitle || 'Reservations'}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
