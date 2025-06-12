
"use client";

import type { User, EmailPasswordCredentials } from '@/lib/types';
import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut,
  updateProfile,
  type User as FirebaseUser
} from 'firebase/auth';
import { auth as firebaseAuthService } from '@/lib/firebase'; // Use the initialized auth service

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: EmailPasswordCredentials) => Promise<void>;
  register: (credentials: EmailPasswordCredentials & { name: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuthService, (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (credentials: EmailPasswordCredentials) => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(firebaseAuthService, credentials.email, credentials.password);
      // onAuthStateChanged will handle setting user state and navigation
      toast({ title: "Login Successful", description: "Welcome back!" });
      router.push('/dashboard'); 
    } catch (error: any) {
      console.error("Login error:", error);
      toast({ title: "Login Failed", description: error.message || "Invalid email or password.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (credentials: EmailPasswordCredentials & { name: string }) => {
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(firebaseAuthService, credentials.email, credentials.password);
      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName: credentials.name });
        // Update local user state immediately for better UX
        setUser({
            uid: userCredential.user.uid,
            email: userCredential.user.email,
            displayName: credentials.name, // Use the name provided during registration
        });
      }
      toast({ title: "Registration Successful", description: `Welcome, ${credentials.name}!` });
      router.push('/dashboard');
    } catch (error: any) {
      console.error("Registration error:", error);
      toast({ title: "Registration Failed", description: error.message || "Could not create account.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await firebaseSignOut(firebaseAuthService);
      // onAuthStateChanged will handle setting user to null
      toast({ title: "Logged Out", description: "You have been successfully logged out." });
      router.push('/login');
    } catch (error: any) {
      console.error("Logout error:", error);
      toast({ title: "Logout Failed", description: error.message || "An error occurred during logout.", variant: "destructive" });
    } finally {
      // Ensure isLoading is false even if router.push might not complete immediately in some tests/setups
      // Small delay to allow onAuthStateChanged to potentially fire first if needed, though usually push is sufficient.
      setTimeout(() => setIsLoading(false), 0);
    }
  };
  
  const isAuthenticated = !!user && !isLoading;


  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        isAuthenticated, 
        isLoading, 
        login,
        register,
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
