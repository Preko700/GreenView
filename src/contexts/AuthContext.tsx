
"use client";

import type { User, EmailPasswordCredentials } from '@/lib/types';
import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: EmailPasswordCredentials) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'simpleGreenViewAuth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    try {
      const storedAuth = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (storedAuth) {
        const authData = JSON.parse(storedAuth);
        if (authData.isAuthenticated && authData.user) {
          setUser(authData.user);
          setIsAuthenticated(true);
        }
      }
    } catch (error) {
      console.error("Failed to load auth state from localStorage", error);
      // Clear potentially corrupted storage
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
    setIsLoading(false);
  }, []);

  const login = async (credentials: EmailPasswordCredentials) => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay

    // No actual validation, just "log in"
    const displayName = credentials.email.split('@')[0] || "User";
    const loggedInUser: User = {
      email: credentials.email,
      name: displayName,
    };
    
    setUser(loggedInUser);
    setIsAuthenticated(true);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ isAuthenticated: true, user: loggedInUser }));
    } catch (error) {
      console.error("Failed to save auth state to localStorage", error);
    }
    
    toast({ title: "Login Successful", description: `Welcome back, ${displayName}!` });
    router.push('/dashboard');
    setIsLoading(false);
  };

  const logout = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    setUser(null);
    setIsAuthenticated(false);
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (error) {
      console.error("Failed to remove auth state from localStorage", error);
    }
    toast({ title: "Logged Out", description: "You have been successfully logged out." });
    router.push('/login');
    setIsLoading(false); // Ensure loading is set to false after push
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        isAuthenticated, 
        isLoading, 
        login,
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
