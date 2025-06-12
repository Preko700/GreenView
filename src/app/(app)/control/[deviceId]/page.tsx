
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { ControlCard } from '@/components/control/ControlCard';
import type { Device, DeviceSettings, SensorType as AppSensorType } from '@/lib/types';
import { SensorType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lightbulb, Wind, Droplets, Zap, AlertTriangle, Thermometer, Sun, CloudDrizzle, Leaf, BarChartBig, Loader2 } from 'lucide-react'; 
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

interface ManualReadingLoadingStates {
  [key: string]: boolean; // SensorType as key
}

const SENSOR_TYPES_FOR_MANUAL_READING: { type: AppSensorType, name: string, icon: React.ElementType }[] = [
    { type: SensorType.TEMPERATURE, name: "Temperature", icon: Thermometer },
    { type: SensorType.AIR_HUMIDITY, name: "Air Humidity", icon: CloudDrizzle },
    { type: SensorType.SOIL_HUMIDITY, name: "Soil Humidity", icon: Leaf },
    { type: SensorType.LIGHT, name: "Light Level", icon: Sun },
];


export default function ControlPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const deviceId = params.deviceId as string;

  const [device, setDevice] = useState<Device | null>(null);
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  
  const [actuatorLoadingStates, setActuatorLoadingStates] = useState<ControlLoadingStates>({
    light: false,
    fan: false,
    irrigation: false,
    uvLight: false,
  });
  const [manualReadingLoadingStates, setManualReadingLoadingStates] = useState<ManualReadingLoadingStates>({});
  const [isPageLoading, setIsPageLoading] = useState(true);

  const fetchDeviceAndSettings = useCallback(async () => {
    if (deviceId && user) {
      setIsPageLoading(true);
      try {
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

  const handleToggleActuator = async (actuator: keyof ControlLoadingStates, currentDesiredState: boolean) => {
    if (!device || !user) {
      toast({ title: "Error", description: "Device or user not available.", variant: "destructive" });
      return;
    }
     if (!device.isActive) {
      toast({ title: "Device Offline", description: "Cannot toggle controls for an inactive device.", variant: "destructive" });
      return;
    }

    setActuatorLoadingStates(prev => ({ ...prev, [actuator]: true }));
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

      setSettings(prev => prev ? ({ ...prev, [`desired${actuator.charAt(0).toUpperCase() + actuator.slice(1)}State`]: newState }) : null);
      toast({ title: `${actuator.charAt(0).toUpperCase() + actuator.slice(1)} Toggled`, description: `Successfully set ${actuator} to ${newState ? 'ON' : 'OFF'}. Arduino will apply on next poll.` });

    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setActuatorLoadingStates(prev => ({ ...prev, [actuator]: false }));
    }
  };

  const handleRequestManualReading = async (sensorType: AppSensorType) => {
    if (!device || !user) {
      toast({ title: "Error", description: "Device or user not available.", variant: "destructive" });
      return;
    }
    if (!device.isActive) {
      toast({ title: "Device Offline", description: "Cannot request reading for an inactive device.", variant: "destructive" });
      return;
    }

    setManualReadingLoadingStates(prev => ({ ...prev, [sensorType]: true }));
    try {
      const response = await fetch('/api/request-manual-reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: device.serialNumber,
          userId: user.id,
          sensorType,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || `Failed to request manual reading for ${sensorType}`);
      }
      toast({
        title: "Reading Requested",
        description: `Request for ${sensorType.toLowerCase()} reading sent. Arduino will process on next poll. Check Dashboard for new data.`,
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setManualReadingLoadingStates(prev => ({ ...prev, [sensorType]: false }));
    }
  };


  if (isPageLoading) {
     return (
      <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
        <Skeleton className="h-20 w-full" /> 
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
        description={`Manually operate accessories and request sensor readings for ${device.serialNumber}.`}
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
            This device is currently inactive. Controls and manual readings may not respond until the device comes online.
          </AlertDescription>
        </Alert>
      )}

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-foreground/90">Actuator Controls</h2>
        {settings ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <ControlCard title="Main Light" icon={Lightbulb} isActive={settings.desiredLightState} isLoading={actuatorLoadingStates.light} onToggle={() => handleToggleActuator('light', settings.desiredLightState)} description="Toggle the main grow lights."/>
            <ControlCard title="Ventilation Fan" icon={Wind} isActive={settings.desiredFanState} isLoading={actuatorLoadingStates.fan} onToggle={() => handleToggleActuator('fan', settings.desiredFanState)} description="Activate or deactivate the circulation fan." />
            <ControlCard title="Irrigation System" icon={Droplets} isActive={settings.desiredIrrigationState} isLoading={actuatorLoadingStates.irrigation} onToggle={() => handleToggleActuator('irrigation', settings.desiredIrrigationState)} description={`Manual override for the watering system. Auto-irrigation is ${settings?.autoIrrigation ? 'ON' : 'OFF'}.`} />
            <ControlCard title="UV Light" icon={Zap} isActive={settings.desiredUvLightState} isLoading={actuatorLoadingStates.uvLight} onToggle={() => handleToggleActuator('uvLight', settings.desiredUvLightState)} description="Control the supplementary UV lighting."/>
          </div>
        ) : (
          <p className="text-muted-foreground">Loading actuator control states...</p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-foreground/90">Manual Sensor Readings</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {SENSOR_TYPES_FOR_MANUAL_READING.map(sensor => (
                 <Card key={sensor.type} className="shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center">
                            <sensor.icon className="mr-2 h-5 w-5 text-primary" />
                            {sensor.name}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Button 
                            onClick={() => handleRequestManualReading(sensor.type)} 
                            disabled={manualReadingLoadingStates[sensor.type] || !device.isActive}
                            className="w-full"
                            variant="outline"
                        >
                            {manualReadingLoadingStates[sensor.type] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChartBig className="mr-2 h-4 w-4" />}
                            Request Reading
                        </Button>
                    </CardContent>
                 </Card>
            ))}
        </div>
        <p className="text-sm text-muted-foreground mt-3">Note: Requested readings will appear on the Dashboard after the device processes the request.</p>
      </section>
      

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
