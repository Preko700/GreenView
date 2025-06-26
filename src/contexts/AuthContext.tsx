
"use client";

import type { User, EmailPasswordCredentials, RegistrationCredentials } from '@/lib/types';
import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: EmailPasswordCredentials) => Promise<void>;
  register: (credentials: RegistrationCredentials) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_USER_KEY = 'greenview_user_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Failed to parse user from localStorage", error);
      localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
    }
    setIsLoading(false);
  }, []);

  const login = async (credentials: EmailPasswordCredentials) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      const contentType = response.headers.get('content-type');

      if (!response.ok) {
        let errorMessage = `Login failed with status: ${response.status}`;
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            errorMessage = errorData?.message || errorMessage;
          } catch (jsonError) {
            const responseText = await response.text();
            console.error("Login API error response (unparseable JSON). Status:", response.status, "Response text:", responseText);
            errorMessage = `Server returned an unreadable error (Status: ${response.status}). Check console.`;
          }
        } else {
          const responseText = await response.text();
          console.error("Login API returned non-JSON error. Status:", response.status, "Response text:", responseText);
          errorMessage = `Server returned an unexpected error format (Status: ${response.status}). Check console.`;
        }
        toast({ title: "Login Failed", description: errorMessage, variant: "destructive" });
        throw new Error(errorMessage);
      }

      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        setUser(data.user);
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(data.user));
        toast({ title: "Login Successful", description: "Welcome back!" });
        router.push('/dashboard');
      } else {
        const responseText = await response.text();
        console.error("Login API returned OK status but non-JSON response. Response text:", responseText);
        toast({ title: "Login Error", description: "Received an unexpected response format from server.", variant: "destructive" });
        throw new Error("Login failed: Unexpected response format from server.");
      }

    } catch (error: any) {
      console.error("Login error in AuthContext catch block:", error);
      setUser(null);
      localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (credentials: RegistrationCredentials) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      
      const data = await response.json();

      if (!response.ok) {
        toast({ title: "Registration Failed", description: data.message || "Could not create account.", variant: "destructive" });
        throw new Error(data.message || 'Registration failed');
      }
      
      toast({ 
        title: "Registration Successful!", 
        description: `Welcome, ${data.user.name}! Please log in to continue.` 
      });
      router.push('/login'); 

    } catch (error: any) {
      console.error("Registration error in AuthContext:", error);
       if (!toast.toasts.some(t => t.title === "Registration Failed")) {
        toast({ title: "Registration Failed", description: error.message || "Could not create account.", variant: "destructive" });
      }
      setUser(null);
      localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    setUser(null);
    localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
    toast({ title: "Logged Out", description: "You have been successfully logged out." });
    router.push('/login');
    setIsLoading(false); 
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
        logout,
        setUser
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
