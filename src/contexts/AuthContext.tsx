
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
            console.error("Failed to parse JSON error response from API:", jsonError);
            const responseText = await response.text(); // Get text if JSON parsing fails
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

      // If response.ok is true, we expect JSON
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
      // Avoid re-toasting if a specific toast was already shown from the !response.ok block
      // This check assumes error messages thrown from the !response.ok block start with "Login failed" or "Server returned"
      if (!error.message.startsWith("Login failed") && !error.message.startsWith("Server returned")) {
         toast({ title: "Login Attempt Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
      }
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
      
      const contentType = response.headers.get('content-type');
      let data;

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const responseText = await response.text();
        console.error("Register API did not return JSON. Response text:", responseText);
        toast({ title: "Registration Failed", description: "Server returned an unexpected response. Please check console.", variant: "destructive" });
        throw new Error(`Registration failed: Server returned non-JSON response. Status: ${response.status}`);
      }

      if (!response.ok) {
        toast({ title: "Registration Failed", description: data.message || "Could not create account.", variant: "destructive" });
        throw new Error(data.message || 'Registration failed');
      }
      
      setUser(data.user);
      localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(data.user));
      toast({ title: "Registration Successful", description: `Welcome, ${data.user.name}!` });
      router.push('/dashboard'); 

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
    // Ensure router push is awaited or handled if it can cause issues before setIsLoading(false)
    await router.push('/login');
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
