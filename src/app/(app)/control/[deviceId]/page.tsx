"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { ControlCard } from '@/components/control/ControlCard';
import { getMockDevice, getMockDeviceSettings } from '@/data/mockData';
import type { Device, DeviceSettings } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lightbulb, Wind, Droplets, Zap } from 'lucide-react'; // Zap for UV Light placeholder
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

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

  useEffect(() => {
    if (deviceId) {
      setIsPageLoading(true);
      // Simulate fetching device data and initial control states
      const foundDevice = getMockDevice(deviceId);
      const foundSettings = getMockDeviceSettings(deviceId);
      setDevice(foundDevice || null);
      setSettings(foundSettings || null);
      
      // Mock initial states (in a real app, these would come from the device/backend)
      setControlStates({
        light: Math.random() > 0.5,
        fan: Math.random() > 0.5,
        irrigation: foundSettings?.autoIrrigation ? Math.random() > 0.7 : false, // Less likely if auto
        uvLight: Math.random() > 0.8,
      });
      setTimeout(() => setIsPageLoading(false), 500);
    }
  }, [deviceId]);

  const handleToggle = async (controlName: keyof ControlStates) => {
    setLoadingStates(prev => ({ ...prev, [controlName]: true }));
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 700));
    setControlStates(prev => ({ ...prev, [controlName]: !prev[controlName] }));
    setLoadingStates(prev => ({ ...prev, [controlName]: false }));
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
        <h1 className="text-2xl font-semibold text-destructive">Device not found</h1>
        <p className="text-muted-foreground mt-2">The device with ID '{deviceId}' could not be loaded.</p>
        <Button onClick={() => router.push('/dashboard')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>
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
        <ControlCard
          title="Main Light"
          icon={Lightbulb}
          isActive={controlStates.light}
          isLoading={loadingStates.light}
          onToggle={() => handleToggle('light')}
          description="Toggle the main grow lights."
        />
        <ControlCard
          title="Ventilation Fan"
          icon={Wind}
          isActive={controlStates.fan}
          isLoading={loadingStates.fan}
          onToggle={() => handleToggle('fan')}
          description="Activate or deactivate the circulation fan."
        />
        <ControlCard
          title="Irrigation System"
          icon={Droplets}
          isActive={controlStates.irrigation}
          isLoading={loadingStates.irrigation}
          onToggle={() => handleToggle('irrigation')}
          description={`Manual override for the watering system. Auto-irrigation is ${settings?.autoIrrigation ? 'ON' : 'OFF'}.`}
        />
        <ControlCard
          title="UV Light"
          icon={Zap}
          isActive={controlStates.uvLight}
          isLoading={loadingStates.uvLight}
          onToggle={() => handleToggle('uvLight')}
          description="Control the supplementary UV lighting."
        />
      </div>

      {settings && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Automation Status</CardTitle>
            <CardDescription>Current automated control settings. Change these in <Link href={`/settings`} className="text-primary underline">Device Settings</Link>.</CardDescription>
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
