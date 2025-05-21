
"use client";

import type { User as FirebaseUserType } from 'firebase/auth';
import { 
  onAuthStateChanged, 
  signOut, 
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider, // For Microsoft
  FacebookAuthProvider,
  TwitterAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import type { User, EmailPasswordCredentials } from '@/lib/types';
import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUserType | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  signInWithFacebook: () => Promise<void>;
  signInWithTwitter: () => Promise<void>;
  signUpWithEmail: (credentials: EmailPasswordCredentials, displayName?: string) => Promise<void>;
  signInWithEmail: (credentials: EmailPasswordCredentials) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUserType | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      setIsLoading(true);
      if (fbUser) {
        setFirebaseUser(fbUser);
        const appUser: User = {
          uid: fbUser.uid,
          email: fbUser.email,
          name: fbUser.displayName,
          profileImageUrl: fbUser.photoURL,
        };
        setUser(appUser);
        setIsAuthenticated(true);
      } else {
        setFirebaseUser(null);
        setUser(null);
        setIsAuthenticated(false);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignInWithProvider = async (provider: GoogleAuthProvider | OAuthProvider | FacebookAuthProvider | TwitterAuthProvider) => {
    setIsLoading(true);
    try {
      await signInWithPopup(auth, provider);
      // onAuthStateChanged will handle setting user state
    } catch (error) {
      console.error("OAuth sign-in error:", error);
      setIsLoading(false); 
      throw error;
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await handleSignInWithProvider(provider);
  };

  const signInWithMicrosoft = async () => {
    const provider = new OAuthProvider('microsoft.com');
    await handleSignInWithProvider(provider);
  };

  const signInWithFacebook = async () => {
    const provider = new FacebookAuthProvider();
    await handleSignInWithProvider(provider);
  };

  const signInWithTwitter = async () => {
    const provider = new TwitterAuthProvider();
    await handleSignInWithProvider(provider);
  };

  const signUpWithEmail = async ({ email, password }: EmailPasswordCredentials, displayName?: string) => {
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      if (userCredential.user && displayName) {
        await updateProfile(userCredential.user, { displayName });
        // Refresh user to get displayName
        const fbUser = auth.currentUser;
         if (fbUser) {
            setFirebaseUser(fbUser);
            const appUser: User = {
              uid: fbUser.uid,
              email: fbUser.email,
              name: fbUser.displayName,
              profileImageUrl: fbUser.photoURL,
            };
            setUser(appUser);
         }
      }
      // onAuthStateChanged will also update state
    } catch (error) {
      console.error("Email/password sign-up error:", error);
      setIsLoading(false);
      throw error;
    }
    // setIsLoading(false) handled by onAuthStateChanged
  };

  const signInWithEmail = async ({ email, password }: EmailPasswordCredentials) => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle setting user state
    } catch (error) {
      console.error("Email/password sign-in error:", error);
      setIsLoading(false);
      throw error;
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
      setIsLoading(false); 
    }
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        firebaseUser, 
        isAuthenticated, 
        isLoading, 
        signInWithGoogle, 
        signInWithMicrosoft, 
        signInWithFacebook, 
        signInWithTwitter,
        signUpWithEmail,
        signInWithEmail, 
        logout 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
