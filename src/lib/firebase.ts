
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

if (!apiKey || apiKey === 'YOUR_API_KEY') {
  console.error(
    `**********************************************************************************
WARNING: Firebase API Key is not configured or is using a placeholder value.
Please ensure that NEXT_PUBLIC_FIREBASE_API_KEY in your .env file
is set to a valid API key from your Firebase project console.
Current value: "${apiKey}"
You also need to set other NEXT_PUBLIC_FIREBASE_... variables.
**********************************************************************************`
  );
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
