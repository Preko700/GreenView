import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// Attempt to read the API key from environment variables
// Next.js makes variables from .env.local available through process.env on the server-side
const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

if (!apiKey && process.env.NODE_ENV !== 'production') {
  // This warning is helpful for development but might be too noisy for production
  // if other key-providing mechanisms are in place there.
  console.warn(
    "AI Setup: GOOGLE_API_KEY or GEMINI_API_KEY is not found in environment variables. " +
    "Ensure it's set in your .env.local file and the server was restarted. " +
    "The Google AI plugin may fail to initialize."
  );
}

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: apiKey, // Explicitly pass the API key
    }),
  ],
  // model: 'googleai/gemini-2.0-flash', // This is a default model for ai.generate()
});
