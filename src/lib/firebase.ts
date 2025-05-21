
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

const MISSING_KEY_ERROR_MESSAGE = `
**********************************************************************************
CRITICAL ERROR: Firebase Configuration Missing or Invalid!
----------------------------------------------------------------------------------
One or more Firebase environment variables (NEXT_PUBLIC_FIREBASE_...) 
are either not set or are using placeholder values (e.g., 'YOUR_API_KEY').

Please ensure that all NEXT_PUBLIC_FIREBASE_... variables in your .env file
are correctly set with values from your Firebase project console.

To find these values:
1. Go to your Firebase project: https://console.firebase.google.com/
2. Select your project.
3. Go to Project Settings (click the gear icon ⚙️ near "Project Overview").
4. Under the "General" tab, scroll down to "Your apps".
5. If you haven't registered a web app, do so now.
6. Find your web app and look for the "SDK setup and configuration" section.
7. Select "Config" (radio button). You'll see an object like:
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "your-project-id.firebaseapp.com",
     projectId: "your-project-id",
     // ... and so on
   };
8. Copy these values into your .env file, prefixing each key with NEXT_PUBLIC_.
   Example: NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSy..."

Current problematic key(s) (or first one found):
NEXT_PUBLIC_FIREBASE_API_KEY: "${apiKey}"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "${authDomain}"
NEXT_PUBLIC_FIREBASE_PROJECT_ID: "${projectId}"
... etc.

The application cannot start without valid Firebase credentials.
**********************************************************************************
`;

if (
  !apiKey || apiKey === 'YOUR_API_KEY' ||
  !authDomain || authDomain === 'YOUR_AUTH_DOMAIN' ||
  !projectId || projectId === 'YOUR_PROJECT_ID' ||
  !storageBucket || storageBucket === 'YOUR_STORAGE_BUCKET' ||
  !messagingSenderId || messagingSenderId === 'YOUR_MESSAGING_SENDER_ID' ||
  !appId || appId === 'YOUR_APP_ID'
) {
  console.error(MISSING_KEY_ERROR_MESSAGE);
  // For client-side, throwing an error here will stop execution.
  // For server-side (during build or SSR if applicable), it also stops.
  if (typeof window !== 'undefined') {
    // On client-side, you might want to display this message in the UI
    // For now, alert is very direct.
    alert("CRITICAL Firebase Configuration Error. Check console for details.");
  }
  throw new Error("Firebase configuration is missing or invalid. Check your .env file and the console logs for details.");
}


const firebaseConfig = {
  apiKey: apiKey,
  authDomain: authDomain,
  projectId: projectId,
  storageBucket: storageBucket,
  messagingSenderId: messagingSenderId,
  appId: appId,
};

let app: FirebaseApp;
let auth: Auth;

// Initialize Firebase
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}
auth = getAuth(app);

export { app, auth };

