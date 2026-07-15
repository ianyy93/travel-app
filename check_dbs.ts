import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

async function check() {
  const app = initializeApp(firebaseConfig);
  
  const dbs = [firebaseConfig.firestoreDatabaseId, '(default)', ''];
  
  for (const dbId of dbs) {
    console.log(\`\n--- Checking DB: "${dbId}" ---\`);
    try {
      const db = getFirestore(app, dbId);
      const col = collection(db, 'trips');
      const snap = await getDocs(col);
      console.log(\`Found \${snap.docs.length} trips:\`);
      snap.docs.forEach(d => {
        console.log(\`- ID: \${d.id} | Title: \`, d.data().title);
      });
    } catch (err: any) {
      console.log(\`Error in \${dbId}: \${err.message}\`);
    }
  }
}

check();
