
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const MISSING_KEY_ERROR_MESSAGE = `
ERROR: Firebase configuration is missing or invalid. 
Please ensure all NEXT_PUBLIC_FIREBASE_... environment variables are set correctly in your .env file.

Required variables:
- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
- NEXT_PUBLIC_FIREBASE_APP_ID

Example .env content:
NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSyXXXXXXXXXXXXXXXXXXXXXXX"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="123456789012"
NEXT_PUBLIC_FIREBASE_APP_ID="1:123456789012:web:XXXXXXXXXXXXXXXXXXXXXX"

You can find these values in your Firebase project settings:
1. Go to Firebase Console (https://console.firebase.google.com/)
2. Select your project.
3. Go to Project settings (gear icon) > General tab.
4. Scroll down to "Your apps".
5. If you don't have a web app, add one (</> icon).
6. Find your web app and copy the 'firebaseConfig' object values.
`;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Check for missing or placeholder Firebase config keys
if (
  !firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY' ||
  !firebaseConfig.authDomain || firebaseConfig.authDomain === 'YOUR_AUTH_DOMAIN' ||
  !firebaseConfig.projectId || firebaseConfig.projectId === 'YOUR_PROJECT_ID' ||
  !firebaseConfig.storageBucket || firebaseConfig.storageBucket === 'YOUR_STORAGE_BUCKET' ||
  !firebaseConfig.messagingSenderId || firebaseConfig.messagingSenderId === 'YOUR_MESSAGING_SENDER_ID' ||
  !firebaseConfig.appId || firebaseConfig.appId === 'YOUR_APP_ID'
) {
  console.error(MISSING_KEY_ERROR_MESSAGE);
  throw new Error("Firebase configuration is missing or invalid. Check your .env file and the console logs for details.");
}

let app: FirebaseApp;
let auth: Auth;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

auth = getAuth(app);

export { app, auth };
