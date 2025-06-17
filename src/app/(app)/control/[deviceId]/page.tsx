
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { ControlCard } from '@/components/control/ControlCard';
import type { Device, DeviceSettings, SensorType as AppSensorType } from '@/lib/types';
import { SensorType } from '@/lib/types'; 
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lightbulb, Wind, Droplets, Zap, AlertTriangle, Thermometer, Sun, CloudDrizzle, Leaf, BarChartBig, Loader2, Settings as SettingsIcon } from 'lucide-react'; 
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle as UiAlertTitle } from '@/components/ui/alert';
import { useUsbConnection } from '@/contexts/UsbConnectionContext';

interface ControlLoadingStates {
  light: boolean;
  fan: boolean;
  irrigation: boolean;
  uvLight: boolean;
}

interface ManualReadingLoadingStates {
  [key: string]: boolean; // SensorType as key
}

const SENSOR_TYPES_FOR_MANUAL_READING: { type: AppSensorType, name: string, icon: React.ElementType, commandType: string }[] = [
    { type: SensorType.TEMPERATURE, name: "Temperature", icon: Thermometer, commandType: "TEMPERATURE" },
    { type: SensorType.AIR_HUMIDITY, name: "Air Humidity", icon: CloudDrizzle, commandType: "AIR_HUMIDITY" },
    { type: SensorType.SOIL_HUMIDITY, name: "Soil Humidity", icon: Leaf, commandType: "SOIL_HUMIDITY" },
    { type: SensorType.LIGHT, name: "Light Level", icon: Sun, commandType: "LIGHT" },
];


export default function ControlPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const { sendSerialCommand, isConnected: isUsbConnected, connectedDeviceHardwareId: usbHardwareId, addLog: addUsbLog } = useUsbConnection();
  const deviceId = params.deviceId as string;

  const [device, setDevice] = useState<Device | null>(null);
  const [currentDeviceHardwareId, setCurrentDeviceHardwareId] = useState<string | null>(null);
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  
  const [actuatorLoadingStates, setActuatorLoadingStates] = useState<ControlLoadingStates>({
    light: false,
    fan: false,
    irrigation: false,
    uvLight: false,
  });
  const [manualReadingLoadingStates, setManualReadingLoadingStates] = useState<ManualReadingLoadingStates>({});
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchDeviceAndSettings = useCallback(async () => {
    if (deviceId && user) {
      setIsPageLoading(true);
      setFetchError(null);
      try {
        const deviceRes = await fetch(`/api/devices/${deviceId}?userId=${user.id}`);
        if (!deviceRes.ok) {
            let errorMsg = `Failed to fetch device. Status: ${deviceRes.status}`;
            if (deviceRes.status === 404) errorMsg = "Device not found or not authorized for this user.";
            else {
                try { const data = await deviceRes.json(); errorMsg = data.message || errorMsg;}
                catch { errorMsg = `Failed to fetch device details and parse error. Status: ${deviceRes.status}`;}
            }
            throw new Error(errorMsg);
        }
        const fetchedDevice: Device = await deviceRes.json();
        setDevice(fetchedDevice);
        setCurrentDeviceHardwareId(fetchedDevice.hardwareIdentifier); // Store hardware ID

        const settingsRes = await fetch(`/api/device-settings/${deviceId}?userId=${user.id}`);
        if (!settingsRes.ok) {
            let errorMsg = `Failed to fetch settings. Status: ${settingsRes.status}`;
            try { const data = await settingsRes.json(); errorMsg = data.message || errorMsg; } 
            catch { errorMsg = `Failed to fetch device settings and parse error. Status: ${settingsRes.status}`; }
            throw new Error(errorMsg);
        }
        const fetchedSettings: DeviceSettings = await settingsRes.json();
        setSettings(fetchedSettings);

      } catch (error: any) {
        console.error("Error fetching device data or settings:", error);
        const specificMessage = error.message || "Could not load device details or settings.";
        toast({ title: "Error Loading Data", description: specificMessage, variant: "destructive"});
        setFetchError(specificMessage);
        setDevice(null); setSettings(null); setCurrentDeviceHardwareId(null);
      } finally {
        setIsPageLoading(false);
      }
    } else if (!user && deviceId) { 
      setIsPageLoading(true); 
    } else if (!deviceId) { 
        setIsPageLoading(false);
        setFetchError("No device ID specified in the URL.");
    }
  }, [deviceId, user, toast]);

  useEffect(() => {
    fetchDeviceAndSettings();
  }, [fetchDeviceAndSettings]);

  const handleToggleActuator = async (actuator: keyof ControlLoadingStates, currentDesiredState: boolean) => {
    if (!device || !user) {
      toast({ title: "Error", description: "Device or user context not available.", variant: "destructive" });
      return;
    }
    
    const isCurrentDeviceUsbConnected = isUsbConnected && usbHardwareId === currentDeviceHardwareId;
    
    if (!device.isActive && !isCurrentDeviceUsbConnected) { // Only show "Device Offline" if not USB connected for direct command
      toast({ title: "Device Offline (Backend)", description: "Device will apply change when back online via server polling.", variant: "default" });
    }

    setActuatorLoadingStates(prev => ({ ...prev, [actuator]: true }));
    const newState = !currentDesiredState;

    // 1. Send command to API (persists the desired state)
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

      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.message || `Failed to toggle ${actuator} via API`);
      }
      
      setSettings(prev => prev ? ({ ...prev, [`desired${actuator.charAt(0).toUpperCase() + actuator.slice(1)}State`]: newState }) : null);
      toast({ title: `${actuator.charAt(0).toUpperCase() + actuator.slice(1)} State Updated (API)`, description: responseData.message });

      // 2. If USB connected to THIS device, send direct command
      if (isCurrentDeviceUsbConnected) {
        let commandName = '';
        switch(actuator) {
          case 'light': commandName = 'set_light_state'; break;
          case 'fan': commandName = 'set_fan_state'; break;
          case 'irrigation': commandName = 'set_irrigation_state'; break;
          case 'uvLight': commandName = 'set_uvlight_state'; break;
        }
        if (commandName) {
          await sendSerialCommand({ command: commandName, state: newState ? "ON" : "OFF" });
          addUsbLog(`CONTROL: Comando directo USB '${commandName}' enviado (${newState ? "ON" : "OFF"}) a ${currentDeviceHardwareId}.`);
          toast({ title: "USB Command Sent", description: `Direct command to ${actuator} (${newState ? "ON" : "OFF"}) sent via USB.`});
        }
      } else if (isUsbConnected && usbHardwareId !== currentDeviceHardwareId) {
         addUsbLog(`CONTROL WARN: USB conectado a ${usbHardwareId}, pero controlando ${currentDeviceHardwareId}. Comando directo no enviado.`);
         toast({title:"Info", description:`USB conectado a otro dispositivo (${usbHardwareId}). Comando para ${device.name} fue enviado al servidor.`});
      } else if (!isUsbConnected) {
          addUsbLog(`CONTROL INFO: USB no conectado. Comando para ${currentDeviceHardwareId} enviado al servidor.`);
      }

    } catch (error: any) {
      toast({ title: "Error Toggling Actuator", description: error.message, variant: "destructive" });
    } finally {
      setActuatorLoadingStates(prev => ({ ...prev, [actuator]: false }));
    }
  };

  const handleRequestManualReading = async (sensor: { type: AppSensorType, commandType: string }) => {
    if (!device || !user || !currentDeviceHardwareId) {
      toast({ title: "Error", description: "Device, user, or hardware ID context not available.", variant: "destructive" });
      return;
    }
    const isCurrentDeviceUsbConnected = isUsbConnected && usbHardwareId === currentDeviceHardwareId;

    if (!device.isActive && !isCurrentDeviceUsbConnected) {
      toast({ title: "Device Offline (Backend)", description: "Request will be queued for when device is online via server.", variant: "default" });
    }

    setManualReadingLoadingStates(prev => ({ ...prev, [sensor.type]: true }));
    try {
      // 1. Send request to API (sets the flag for polling devices)
      const response = await fetch('/api/request-manual-reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: device.serialNumber,
          userId: user.id,
          sensorType: sensor.type,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || `Failed to request manual reading for ${sensor.type} via API`);
      }
      toast({
        title: "Reading Request Queued (API)",
        description: data.message, 
      });

      // 2. If USB connected to THIS device, send direct command
      if (isCurrentDeviceUsbConnected) {
        await sendSerialCommand({ command: "request_sensor_reading", type: sensor.commandType });
        addUsbLog(`CONTROL: Comando directo USB 'request_sensor_reading' (${sensor.commandType}) enviado a ${currentDeviceHardwareId}.`);
        toast({ title: "USB Command Sent", description: `Direct request for ${sensor.name} reading sent via USB.`});
      } else if (isUsbConnected && usbHardwareId !== currentDeviceHardwareId) {
         addUsbLog(`CONTROL WARN: USB conectado a ${usbHardwareId}, pero solicitando lectura para ${currentDeviceHardwareId}. Comando directo no enviado.`);
         toast({title:"Info", description:`USB conectado a otro dispositivo (${usbHardwareId}). Solicitud para ${sensor.name} de ${device.name} fue enviada al servidor.`});
      } else if (!isUsbConnected) {
          addUsbLog(`CONTROL INFO: USB no conectado. Solicitud para ${currentDeviceHardwareId} enviada al servidor.`);
      }

    } catch (error: any) {
      toast({ title: "Error Requesting Reading", description: error.message, variant: "destructive" });
    } finally {
      setManualReadingLoadingStates(prev => ({ ...prev, [sensor.type]: false }));
    }
  };


  if (isPageLoading) {
     return (
      <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
        <div className="flex justify-between items-center">
            <Skeleton className="h-10 w-3/5" />
            <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-6 w-2/5" />
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={`actuator-skl-${i}`} className="h-48 w-full" />)}
        </div>
        <Skeleton className="h-8 w-1/3 mt-4 mb-2" />
         <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(SENSOR_TYPES_FOR_MANUAL_READING.length)].map((_, i) => <Skeleton key={`sensor-req-skl-${i}`} className="h-32 w-full" />)}
        </div>
        <Skeleton className="h-40 w-full mt-6" /> 
      </div>
    );
  }

  if (fetchError && !device) { 
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 text-center">
        <Card className="max-w-md mx-auto mt-8">
            <CardHeader> <AlertTriangle className="h-12 w-12 text-destructive mx-auto" /> <CardTitle className="text-2xl text-destructive">Could Not Load Device Control</CardTitle> </CardHeader>
            <CardContent>
                <Alert variant="destructive" className="text-left"> <UiAlertTitle>Error Details</UiAlertTitle> <AlertDescription> <p>{fetchError}</p> <p className="mt-2">Please try refreshing or select a different device from the dashboard.</p> </AlertDescription> </Alert>
                <Button onClick={() => router.push('/dashboard')} className="mt-6"> <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard </Button>
            </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!device) { 
      return (
      <div className="container mx-auto py-8 px-4 md:px-6 text-center">
        <Card className="max-w-md mx-auto mt-8">
            <CardHeader> <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto" /> <CardTitle className="text-2xl">Device Not Available</CardTitle> </CardHeader>
            <CardContent> <p className="text-muted-foreground mt-2">The device control page could not be loaded. Please select a device from the dashboard.</p> <Button onClick={() => router.push('/dashboard')} className="mt-6"> <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard </Button> </CardContent>
        </Card>
      </div>
    );
  }
  
  const isCurrentDeviceUsbConnected = isUsbConnected && usbHardwareId === currentDeviceHardwareId;

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <PageHeader
        title={`Device Control: ${device.name}`}
        description={`Manually operate accessories and request sensor readings for ${device.serialNumber} (HWID: ${currentDeviceHardwareId || 'N/A'}). USB: ${isCurrentDeviceUsbConnected ? 'Connected to this device' : isUsbConnected ? `Connected to other (${usbHardwareId})` : 'Not connected'}`}
        action={
          <Button onClick={() => router.push('/dashboard')} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Button>
        }
      />
      
      {!device.isActive && !isCurrentDeviceUsbConnected && ( // Show "Device Inactive" only if not directly controllable via USB
         <Alert variant="default" className="mb-6 bg-yellow-50 border-yellow-400 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-300">
          <AlertTriangle className="h-4 w-4 !text-yellow-600 dark:!text-yellow-400" />
          <UiAlertTitle>Device Currently Inactive (Backend)</UiAlertTitle>
          <AlertDescription>
            This device is currently marked as inactive on the server. Commands will be queued and applied when the device next connects and polls the server.
          </AlertDescription>
        </Alert>
      )}
       {isCurrentDeviceUsbConnected && !device.isActive && (
         <Alert variant="default" className="mb-6 bg-blue-50 border-blue-400 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300">
            <Zap className="h-4 w-4 !text-blue-600 dark:!text-blue-400" />
            <UiAlertTitle>Device Connected via USB</UiAlertTitle>
            <AlertDescription>
                Direct commands can be sent via USB even if the backend marks the device as inactive. Backend status will update when the device syncs.
            </AlertDescription>
         </Alert>
      )}


      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-foreground/90">Actuator Controls</h2>
        {settings ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <ControlCard title="Main Light" icon={Lightbulb} isActive={settings.desiredLightState} isLoading={actuatorLoadingStates.light} onToggle={() => handleToggleActuator('light', settings.desiredLightState)} description="Toggle the main grow lights."/>
            <ControlCard title="Ventilation Fan" icon={Wind} isActive={settings.desiredFanState} isLoading={actuatorLoadingStates.fan} onToggle={() => handleToggleActuator('fan', settings.desiredFanState)} description="Activate or deactivate the circulation fan." />
            <ControlCard title="Irrigation System" icon={Droplets} isActive={settings.desiredIrrigationState} isLoading={actuatorLoadingStates.irrigation} onToggle={() => handleToggleActuator('irrigation', settings.desiredIrrigationState)} description={`Manual override for the watering system. Auto-irrigation is currently ${settings?.autoIrrigation ? 'ON' : 'OFF'}.`} />
            <ControlCard title="UV Light" icon={Zap} isActive={settings.desiredUvLightState} isLoading={actuatorLoadingStates.uvLight} onToggle={() => handleToggleActuator('uvLight', settings.desiredUvLightState)} description="Control the supplementary UV lighting."/>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => <Skeleton key={`act-load-skl-${i}`} className="h-48 w-full" />)}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-foreground/90">Request Manual Sensor Readings</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {SENSOR_TYPES_FOR_MANUAL_READING.map(sensor => (
                 <Card key={sensor.type} className="shadow-lg hover:shadow-xl transition-shadow">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center">
                            <sensor.icon className="mr-2 h-5 w-5 text-primary" />
                            {sensor.name}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Button 
                            onClick={() => handleRequestManualReading(sensor)} 
                            disabled={manualReadingLoadingStates[sensor.type] || (!isCurrentDeviceUsbConnected && !device.isActive) }
                            className="w-full"
                            variant="outline"
                            title={(!isCurrentDeviceUsbConnected && !device.isActive) ? "Device offline and not connected via USB" : `Request ${sensor.name} reading`}
                        >
                            {manualReadingLoadingStates[sensor.type] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChartBig className="mr-2 h-4 w-4" />}
                            Request Reading
                        </Button>
                    </CardContent>
                 </Card>
            ))}
        </div>
        <p className="text-sm text-muted-foreground mt-3">Note: Requested readings will appear on the Dashboard after the device processes the request and sends the data (either via USB or next server poll).</p>
      </section>
      
      {settings && (
        <Card className="mt-8 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center"><SettingsIcon className="mr-2 h-5 w-5 text-primary" />Automation Status</CardTitle>
            <CardDescription>Current automated control settings. Change these in <Link href={`/settings`} className="text-primary underline hover:text-primary/80">Device Settings</Link>.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>Auto Irrigation: <span className={`font-semibold ${settings.autoIrrigation ? 'text-green-600' : 'text-red-600'}`}>{settings.autoIrrigation ? "Enabled" : "Disabled"}</span> {settings.autoIrrigation && `(Threshold: ${settings.irrigationThreshold}%)`}</div>
            <div>Auto Ventilation: <span className={`font-semibold ${settings.autoVentilation ? 'text-green-600' : 'text-red-600'}`}>{settings.autoVentilation ? "Enabled" : "Disabled"}</span> {settings.autoVentilation && `(Temp On: ${settings.temperatureThreshold}°${settings.temperatureUnit === 'CELSIUS' ? 'C' : 'F'}, Temp Off: ${settings.temperatureFanOffThreshold}°${settings.temperatureUnit === 'CELSIUS' ? 'C' : 'F'})`}</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

