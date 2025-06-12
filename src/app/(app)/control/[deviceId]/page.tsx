
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { ControlCard } from '@/components/control/ControlCard';
import { getMockDeviceSettings } from '@/data/mockData'; // Settings might still be partially mock
import type { Device, DeviceSettings } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lightbulb, Wind, Droplets, Zap, AlertTriangle } from 'lucide-react'; 
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface ControlStates {
  light: boolean;
  fan: boolean;
  irrigation: boolean;
  uvLight: boolean;
}

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
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [controlStates, setControlStates] = useState<ControlStates>({
    light: false,
    fan: false,
    irrigation: false,
    uvLight: false,
  });
  const [loadingStates, setLoadingStates] = useState<ControlLoadingStates>({
    light: false,
    fan: false,
    irrigation: false,
    uvLight: false,
  });
  const [isPageLoading, setIsPageLoading] = useState(true);

  const fetchDeviceData = useCallback(async () => {
    if (deviceId && user) {
      setIsPageLoading(true);
      try {
        const res = await fetch(`/api/devices/${deviceId}?userId=${user.id}`);
        if (!res.ok) {
          if (res.status === 404) {
            toast({ title: "Error", description: "Device not found or you're not authorized to view it.", variant: "destructive"});
            setDevice(null);
          } else {
            throw new Error("Failed to fetch device data");
          }
        } else {
          const fetchedDevice: Device = await res.json();
          setDevice(fetchedDevice);
          // Simulate fetching initial control states and device-specific settings
          const foundSettings = getMockDeviceSettings(deviceId); // Still using mock for actual hardware states
          setSettings(foundSettings || null);
          setControlStates({
            light: Math.random() > 0.5,
            fan: Math.random() > 0.5,
            irrigation: foundSettings?.autoIrrigation ? Math.random() > 0.7 : false,
            uvLight: Math.random() > 0.8,
          });
        }
      } catch (error) {
        console.error("Error fetching device:", error);
        toast({ title: "Error", description: "Could not load device details.", variant: "destructive"});
        setDevice(null);
      } finally {
        setIsPageLoading(false);
      }
    } else if (!user && deviceId) {
      // User might not be loaded yet, or not logged in
      setIsPageLoading(true); // Keep loading until user context is resolved
    }
  }, [deviceId, user, toast]);

  useEffect(() => {
    fetchDeviceData();
  }, [fetchDeviceData]);

  const handleToggle = async (controlName: keyof ControlStates) => {
    if (!device || !device.isActive) {
      toast({ title: "Device Offline", description: "Cannot toggle controls for an inactive device.", variant: "destructive" });
      return;
    }
    setLoadingStates(prev => ({ ...prev, [controlName]: true }));
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 700));
    setControlStates(prev => ({ ...prev, [controlName]: !prev[controlName] }));
    setLoadingStates(prev => ({ ...prev, [controlName]: false }));
    toast({ title: `${controlName.charAt(0).toUpperCase() + controlName.slice(1)} Toggled`, description: `Successfully toggled ${controlName}.` });
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
        <Card className="mb-6 border-destructive bg-destructive/10">
          <CardHeader>
            <CardTitle className="text-destructive">Device Offline</CardTitle>
            <CardDescription className="text-destructive/80">
              This device is currently inactive. Controls may not respond.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <ControlCard title="Main Light" icon={Lightbulb} isActive={controlStates.light} isLoading={loadingStates.light} onToggle={() => handleToggle('light')} description="Toggle the main grow lights."/>
        <ControlCard title="Ventilation Fan" icon={Wind} isActive={controlStates.fan} isLoading={loadingStates.fan} onToggle={() => handleToggle('fan')} description="Activate or deactivate the circulation fan." />
        <ControlCard title="Irrigation System" icon={Droplets} isActive={controlStates.irrigation} isLoading={loadingStates.irrigation} onToggle={() => handleToggle('irrigation')} description={`Manual override for the watering system. Auto-irrigation is ${settings?.autoIrrigation ? 'ON' : 'OFF'}.`} />
        <ControlCard title="UV Light" icon={Zap} isActive={controlStates.uvLight} isLoading={loadingStates.uvLight} onToggle={() => handleToggle('uvLight')} description="Control the supplementary UV lighting."/>
      </div>

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
