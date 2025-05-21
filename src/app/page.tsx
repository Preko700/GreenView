"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { motion } from 'framer-motion'; // Using framer-motion for simpler animations

export default function SplashScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || authLoading) return;

    const timer = setTimeout(() => {
      if (isAuthenticated) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    }, 1500); // Splash screen duration + auth check

    return () => clearTimeout(timer);
  }, [isAuthenticated, authLoading, router, isMounted]);

  if (!isMounted || authLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background text-primary">
        <Loader2 className="h-12 w-12 animate-spin" />
        <p className="mt-4 text-lg">Loading GreenView...</p>
      </div>
    );
  }
  
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <Logo className="h-24 w-24 text-primary" showText={false} />
      </motion.div>
      <motion.h1
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
        className="mt-6 text-4xl font-semibold text-primary"
      >
        GreenView
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.6 }}
        className="mt-2 text-lg text-foreground/80"
      >
        Cultivating Future
      </motion.p>
    </div>
  );
}
