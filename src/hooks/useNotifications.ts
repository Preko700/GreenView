import { useRef, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

const NOTIFICATION_COOLDOWN = 5 * 60 * 1000; // 5 minutes
const ALERTS_STORAGE_KEY = 'notified_alerts';

interface NotificationOptions {
  title: string;
  description: string;
  variant?: 'default' | 'destructive';
  duration?: number;
}

interface AlertCheck {
  key: string;
  shouldAlert: boolean;
  notification: NotificationOptions;
}

export function useNotifications() {
  const { toast } = useToast();
  const lastNotificationTime = useRef<Record<string, number>>({});

  // Load persisted alerts from localStorage
  const loadPersistedAlerts = useCallback(() => {
    try {
      const stored = localStorage.getItem(ALERTS_STORAGE_KEY);
      if (stored) {
        const alerts = JSON.parse(stored) as Record<string, number>;
        const now = Date.now();
        
        // Clean up expired alerts (older than cooldown period)
        const validAlerts = Object.entries(alerts).reduce((acc, [key, timestamp]) => {
          if (now - timestamp < NOTIFICATION_COOLDOWN) {
            acc[key] = timestamp;
          }
          return acc;
        }, {} as Record<string, number>);
        
        lastNotificationTime.current = validAlerts;
        
        // Update localStorage with cleaned alerts
        if (Object.keys(validAlerts).length !== Object.keys(alerts).length) {
          localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(validAlerts));
        }
      }
    } catch (error) {
      console.error('Error loading persisted alerts:', error);
    }
  }, []);

  // Save alerts to localStorage
  const saveAlertsToStorage = useCallback((alerts: Record<string, number>) => {
    try {
      localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
    } catch (error) {
      console.error('Error saving alerts to storage:', error);
    }
  }, []);

  // Check if a notification can be shown (respects cooldown)
  const canShowNotification = useCallback((key: string) => {
    const now = Date.now();
    const lastTime = lastNotificationTime.current[key] || 0;
    return now - lastTime > NOTIFICATION_COOLDOWN;
  }, []);

  // Show notification if cooldown allows it
  const showNotification = useCallback((key: string, options: NotificationOptions) => {
    if (canShowNotification(key)) {
      toast(options);
      const now = Date.now();
      lastNotificationTime.current[key] = now;
      saveAlertsToStorage(lastNotificationTime.current);
      return true;
    }
    return false;
  }, [canShowNotification, toast, saveAlertsToStorage]);

  // Process multiple alert checks
  const processAlertChecks = useCallback((alertChecks: AlertCheck[]) => {
    alertChecks.forEach(check => {
      if (check.shouldAlert) {
        showNotification(check.key, check.notification);
      }
    });
  }, [showNotification]);

  // Clear notification state for a specific key
  const clearNotification = useCallback((key: string) => {
    if (lastNotificationTime.current[key]) {
      delete lastNotificationTime.current[key];
      saveAlertsToStorage(lastNotificationTime.current);
    }
  }, [saveAlertsToStorage]);

  // Clear all notifications
  const clearAllNotifications = useCallback(() => {
    lastNotificationTime.current = {};
    localStorage.removeItem(ALERTS_STORAGE_KEY);
  }, []);

  // Load persisted alerts on mount
  useEffect(() => {
    loadPersistedAlerts();
  }, [loadPersistedAlerts]);

  return {
    showNotification,
    processAlertChecks,
    canShowNotification,
    clearNotification,
    clearAllNotifications,
    lastNotificationTime: lastNotificationTime.current
  };
}
