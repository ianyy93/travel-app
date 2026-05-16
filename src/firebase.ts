import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Explicitly set browser-local persistence so logins survive reloads as much as possible,
// even inside a non-incognito iframe.
setPersistence(auth, browserLocalPersistence).catch(err => console.error("Auth persistence error:", err));

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
