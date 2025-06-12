
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { ControlCard } from '@/components/control/ControlCard';
import type { Device, DeviceSettings } from '@/lib/types'; // DeviceSettings will now include desired states
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lightbulb, Wind, Droplets, Zap, AlertTriangle } from 'lucide-react'; 
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Alert } from '@/components/ui/alert';

interface ControlLoadingStates {
  light: boolean;
  fan: boolean;
  irrigation: boolean;
  uvLight: boolean;
}

export default function ControlPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const deviceId = params.deviceId as string;

  const [device, setDevice] = useState<Device | null>(null);
  const [settings, setSettings] = useState<DeviceSettings | null>(null); // Will hold desired states too
  
  const [loadingStates, setLoadingStates] = useState<ControlLoadingStates>({
    light: false,
    fan: false,
    irrigation: false,
    uvLight: false,
  });
  const [isPageLoading, setIsPageLoading] = useState(true);

  const fetchDeviceAndSettings = useCallback(async () => {
    if (deviceId && user) {
      setIsPageLoading(true);
      try {
        // Fetch device details
        const deviceRes = await fetch(`/api/devices/${deviceId}?userId=${user.id}`);
        if (!deviceRes.ok) {
          if (deviceRes.status === 404) {
            toast({ title: "Error", description: "Device not found or you're not authorized to view it.", variant: "destructive"});
            setDevice(null); setSettings(null);
          } else {
            throw new Error("Failed to fetch device data");
          }
          setIsPageLoading(false);
          return;
        }
        const fetchedDevice: Device = await deviceRes.json();
        setDevice(fetchedDevice);

        // Fetch device settings (which includes desired states)
        const settingsRes = await fetch(`/api/device-settings/${deviceId}?userId=${user.id}`);
        if (!settingsRes.ok) {
            const errorData = await settingsRes.json();
            throw new Error(errorData.message || "Failed to fetch device settings");
        }
        const fetchedSettings: DeviceSettings = await settingsRes.json();
        setSettings(fetchedSettings);

      } catch (error) {
        console.error("Error fetching device data or settings:", error);
        toast({ title: "Error", description: "Could not load device details or settings.", variant: "destructive"});
        setDevice(null); setSettings(null);
      } finally {
        setIsPageLoading(false);
      }
    } else if (!user && deviceId) {
      setIsPageLoading(true);
    }
  }, [deviceId, user, toast]);

  useEffect(() => {
    fetchDeviceAndSettings();
  }, [fetchDeviceAndSettings]);

  const handleToggle = async (actuator: keyof ControlLoadingStates, currentDesiredState: boolean) => {
    if (!device || !user) {
      toast({ title: "Error", description: "Device or user not available.", variant: "destructive" });
      return;
    }
     if (!device.isActive) {
      toast({ title: "Device Offline", description: "Cannot toggle controls for an inactive device.", variant: "destructive" });
      return;
    }

    setLoadingStates(prev => ({ ...prev, [actuator]: true }));
    const newState = !currentDesiredState;

    try {
      const response = await fetch('/api/device-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          deviceId: device.serialNumber, 
          userId: user.id,
          actuator, 
          state: newState ? 'on' : 'off' 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to toggle ${actuator}`);
      }

      // Optimistically update UI, or refetch settings for source of truth
      setSettings(prev => prev ? ({ ...prev, [`desired${actuator.charAt(0).toUpperCase() + actuator.slice(1)}State`]: newState }) : null);
      toast({ title: `${actuator.charAt(0).toUpperCase() + actuator.slice(1)} Toggled`, description: `Successfully set ${actuator} to ${newState ? 'ON' : 'OFF'}. Arduino will apply on next poll.` });

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      // Optionally revert optimistic update or refetch
      // fetchDeviceAndSettings(); // To get the true state from DB if API call failed after optimistic update
    } finally {
      setLoadingStates(prev => ({ ...prev, [actuator]: false }));
    }
  };

  if (isPageLoading) {
     return (
      <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 text-center">
        <Card className="max-w-md mx-auto">
            <CardHeader>
                <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
                <CardTitle className="text-2xl text-destructive">Device Not Found</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground mt-2">The device with ID '{deviceId}' could not be loaded or you are not authorized to access it.</p>
                <Button onClick={() => router.push('/dashboard')} className="mt-6">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                </Button>
            </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <PageHeader
        title={`Device Control: ${device.name}`}
        description={`Manually operate accessories for ${device.serialNumber}.`}
        action={
          <Button onClick={() => router.push('/dashboard')} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Button>
        }
      />
      
      {!device.isActive && (
         <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Device Offline</AlertTitle>
          <AlertDescription>
            This device is currently inactive. Controls may not respond until the device comes online.
          </AlertDescription>
        </Alert>
      )}

      {settings ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <ControlCard title="Main Light" icon={Lightbulb} isActive={settings.desiredLightState} isLoading={loadingStates.light} onToggle={() => handleToggle('light', settings.desiredLightState)} description="Toggle the main grow lights."/>
          <ControlCard title="Ventilation Fan" icon={Wind} isActive={settings.desiredFanState} isLoading={loadingStates.fan} onToggle={() => handleToggle('fan', settings.desiredFanState)} description="Activate or deactivate the circulation fan." />
          <ControlCard title="Irrigation System" icon={Droplets} isActive={settings.desiredIrrigationState} isLoading={loadingStates.irrigation} onToggle={() => handleToggle('irrigation', settings.desiredIrrigationState)} description={`Manual override for the watering system. Auto-irrigation is ${settings?.autoIrrigation ? 'ON' : 'OFF'}.`} />
          <ControlCard title="UV Light" icon={Zap} isActive={settings.desiredUvLightState} isLoading={loadingStates.uvLight} onToggle={() => handleToggle('uvLight', settings.desiredUvLightState)} description="Control the supplementary UV lighting."/>
        </div>
      ) : (
        <p className="text-muted-foreground">Loading control states...</p>
      )}
      

      {settings && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Automation Status</CardTitle>
            <CardDescription>Current automated control settings. Change these in <Link href={`/settings`} className="text-primary underline hover:text-primary/80">Device Settings</Link>.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>Auto Irrigation: <span className="font-semibold">{settings.autoIrrigation ? "Enabled" : "Disabled"}</span> (Threshold: {settings.irrigationThreshold}%)</p>
            <p>Auto Ventilation: <span className="font-semibold">{settings.autoVentilation ? "Enabled" : "Disabled"}</span> (Temp: {settings.temperatureThreshold}°{settings.temperatureUnit === 'CELSIUS' ? 'C' : 'F'})</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
