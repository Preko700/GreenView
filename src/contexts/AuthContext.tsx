"use client";

import type { User } from '@/lib/types';
import { mockUser } from '@/data/mockData';
import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (name: string, email: string, pass: string, country: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate checking auth state on load
    const storedAuth = localStorage.getItem('isAuthenticatedGreenView');
    if (storedAuth === 'true') {
      setUser(mockUser);
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, pass: string) => {
    setIsLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    // In a real app, you'd validate credentials here
    if (email && pass) { // Basic check
      setUser(mockUser);
      setIsAuthenticated(true);
      localStorage.setItem('isAuthenticatedGreenView', 'true');
    } else {
      throw new Error("Invalid credentials");
    }
    setIsLoading(false);
  };

  const register = async (name: string, email: string, pass: string, country: string) => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
     const newUser: User = { ...mockUser, name, email, country, id: `new-${Date.now()}`};
    setUser(newUser);
    setIsAuthenticated(true);
    localStorage.setItem('isAuthenticatedGreenView', 'true');
    setIsLoading(false);
  };

  const logout = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('isAuthenticatedGreenView');
    setIsLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, register, logout }}>
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
