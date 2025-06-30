
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DeviceSelector } from '@/components/dashboard/DeviceSelector';
import type { Device, SensorData, DeviceSettings } from '@/lib/types';
import { SensorType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { RefreshCw, Settings, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SensorDisplayCard } from '@/components/dashboard/SensorDisplayCard';
import { useUsbConnection } from '@/contexts/UsbConnectionContext';

const SELECTED_DEVICE_ID_LS_KEY = 'selectedDashboardDeviceId';
const SENSOR_POLLING_INTERVAL_MS = 15000; // Auto-refresh every 15 seconds

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { connectedDeviceHardwareId: usbHardwareId, logMessages: usbLogMessages } = useUsbConnection();

  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [currentDevice, setCurrentDevice] = useState<Device | null>(null);
  const [sensorReadings, setSensorReadings] = useState<SensorData[]>([]);
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettings | null>(null);
  const [notifiedAlerts, setNotifiedAlerts] = useState<Record<string, boolean>>({});
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingSensors, setIsRefreshingSensors] = useState(false);
  const [dbSchemaError, setDbSchemaError] = useState<string | null>(null);

  const lastProcessedLogCountRef = useRef(0);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSensorDataForDevice = useCallback(async (deviceId: string, isPoll = false) => {
    if (!user) return;
    if (!isPoll) {
      setIsRefreshingSensors(true);
    }

    try {
        const [sensorResult, deviceResult, settingsResult] = await Promise.allSettled([
            fetch(`/api/sensor-data/${deviceId}?userId=${user.id}`),
            fetch(`/api/devices/${deviceId}?userId=${user.id}`),
            fetch(`/api/device-settings/${deviceId}?userId=${user.id}`)
        ]);

        if (sensorResult.status === 'fulfilled' && sensorResult.value.ok) {
            setSensorReadings(await sensorResult.value.json());
        } else if (!isPoll) {
            setSensorReadings([]);
            toast({ title: "Error", description: "Could not fetch sensor data.", variant: "destructive" });
        }

        if (deviceResult.status === 'fulfilled' && deviceResult.value.ok) {
            const updatedDeviceData: Device = await deviceResult.value.json();
            setCurrentDevice(updatedDeviceData);
            setDevices(prev => prev.map(d => d.serialNumber === updatedDeviceData.serialNumber ? updatedDeviceData : d));
        }

        if (settingsResult.status === 'fulfilled' && settingsResult.value.ok) {
            const settingsData: DeviceSettings = await settingsResult.value.json();
            setDeviceSettings(settingsData);
        } else if (!isPoll) {
            setDeviceSettings(null);
        }

    } catch(e) {
        console.error("Error fetching sensor data for device:", e);
        if (!isPoll) {
          toast({ title: "Error", description: "An unexpected error occurred while fetching data.", variant: "destructive" });
        }
    } finally {
        if (!isPoll) {
          setIsRefreshingSensors(false);
        }
    }
  }, [user, toast]);


  useEffect(() => {
    if (!user) return;

    const fetchInitialData = async () => {
      setIsLoading(true);
      setDbSchemaError(null);
      try {
        const deviceResponse = await fetch(`/api/devices?userId=${user.id}`);
        const fetchedDevices = await deviceResponse.json();
        if (!deviceResponse.ok) {
          const errorMessage = fetchedDevices.message || 'Failed to fetch devices';
          setDbSchemaError(errorMessage);
          throw new Error(errorMessage);
        }
        setDevices(fetchedDevices);

        if (fetchedDevices.length > 0) {
          const storedDeviceId = localStorage.getItem(SELECTED_DEVICE_ID_LS_KEY);
          const deviceToSelect = 
            fetchedDevices.find(d => d.serialNumber === storedDeviceId) || 
            fetchedDevices[0];
          
          setSelectedDeviceId(deviceToSelect.serialNumber);
          setCurrentDevice(deviceToSelect);
          setNotifiedAlerts({});

          const [sensorResponse, settingsResponse] = await Promise.all([
            fetch(`/api/sensor-data/${deviceToSelect.serialNumber}?userId=${user.id}`),
            fetch(`/api/device-settings/${deviceToSelect.serialNumber}?userId=${user.id}`)
          ]);
          
          if (sensorResponse.ok) {
            setSensorReadings(await sensorResponse.json());
          } else { setSensorReadings([]); }
          if (settingsResponse.ok) {
            setDeviceSettings(await settingsResponse.json());
          } else { setDeviceSettings(null); }

        } else {
          setSelectedDeviceId(null);
          setCurrentDevice(null);
          setSensorReadings([]);
          setDeviceSettings(null);
        }
      } catch (error: any) {
        console.error("Error fetching initial dashboard data:", error.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialData();
  }, [user]);

  useEffect(() => {
    if (selectedDeviceId) {
      localStorage.setItem(SELECTED_DEVICE_ID_LS_KEY, selectedDeviceId);
      window.dispatchEvent(new CustomEvent('selectedDeviceChanged', { detail: { deviceId: selectedDeviceId } }));
    } else if (!isLoading) {
       localStorage.removeItem(SELECTED_DEVICE_ID_LS_KEY);
       window.dispatchEvent(new CustomEvent('selectedDeviceChanged', { detail: { deviceId: null } }));
    }
  }, [selectedDeviceId, isLoading]);


  useEffect(() => {
    if (selectedDeviceId && !isLoading) {
      const device = devices.find(d => d.serialNumber === selectedDeviceId);
      if (device) {
        setNotifiedAlerts({});
        setCurrentDevice(device);
        fetchSensorDataForDevice(selectedDeviceId, false);
      }
    }
  }, [selectedDeviceId, isLoading, devices, fetchSensorDataForDevice]);


  useEffect(() => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    if (selectedDeviceId && currentDevice?.isActive) {
      pollingIntervalRef.current = setInterval(() => {
        if (!document.hidden) {
          fetchSensorDataForDevice(selectedDeviceId, true);
        }
      }, SENSOR_POLLING_INTERVAL_MS);
    }
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [selectedDeviceId, currentDevice?.isActive, fetchSensorDataForDevice]);
  
  useEffect(() => {
    if (!currentDevice || !usbHardwareId || currentDevice.hardwareIdentifier !== usbHardwareId || isRefreshingSensors) {
      lastProcessedLogCountRef.current = usbLogMessages.length;
      return;
    }
    const newLogs = usbLogMessages.slice(0, usbLogMessages.length - lastProcessedLogCountRef.current);
    const hasNewRelevantLog = newLogs.some(log =>
        (log.includes(`MSG: Datos de sensores recibidos de ${usbHardwareId}`) ||
         log.includes(`API: Datos de ${usbHardwareId} enviados al servidor`))
    );
    if (hasNewRelevantLog) {
      fetchSensorDataForDevice(currentDevice.serialNumber, false);
      toast({ title: "Dashboard Updated", description: `Data for ${currentDevice.name} refreshed via USB connection.`, duration: 3000 });
    }
    lastProcessedLogCountRef.current = usbLogMessages.length;
  }, [usbLogMessages, currentDevice, usbHardwareId, fetchSensorDataForDevice, isRefreshingSensors, toast]);

  useEffect(() => {
    if (!deviceSettings || sensorReadings.length === 0) return;

    const checkAndNotify = (reading: SensorData | undefined, type: SensorType, check: 'high' | 'low', threshold: number, message: string) => {
      if (!reading) return;
      const key = `${type}_${check}`;
      if (notifiedAlerts[key]) return;

      let conditionMet = (check === 'high' && reading.value > threshold) || (check === 'low' && reading.value < threshold);

      if (conditionMet) {
        toast({
          title: `Sensor Alert: ${currentDevice?.name || 'Device'}`,
          description: `${message} Current: ${reading.value.toFixed(1)}${reading.unit || ''}.`,
          variant: 'destructive',
          duration: 10000,
        });
        setNotifiedAlerts(prev => ({ ...prev, [key]: true }));
      }
    };

    if (deviceSettings.autoVentilation) {
      const tempReading = sensorReadings.find(s => s.type === SensorType.TEMPERATURE);
      checkAndNotify(tempReading, SensorType.TEMPERATURE, 'high', deviceSettings.temperatureThreshold, 'Temperature is too high!');
      checkAndNotify(tempReading, SensorType.TEMPERATURE, 'low', 10, 'Temperature is getting very low.');
    }

    if (deviceSettings.autoIrrigation) {
      const soilReading = sensorReadings.find(s => s.type === SensorType.SOIL_HUMIDITY);
      checkAndNotify(soilReading, SensorType.SOIL_HUMIDITY, 'low', deviceSettings.irrigationThreshold, 'Soil is dry, may need watering.');
      checkAndNotify(soilReading, SensorType.SOIL_HUMIDITY, 'high', 95, 'Soil is very saturated.');
    }
  }, [sensorReadings, deviceSettings, toast, notifiedAlerts, currentDevice?.name]);

  const getSensorValue = (type: SensorType) => sensorReadings.find(s => s.type === type);

  if (dbSchemaError) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6">
        <PageHeader title="Greenhouse Dashboard" description="Monitor your greenhouse devices and sensor data." />
        <Alert variant="destructive" className="mt-8">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Database Schema Error</AlertTitle>
          <AlertDescription>
            <p>{dbSchemaError}</p>
            <p className="mt-2"><strong>To resolve this in a development environment:</strong></p>
            <ol className="list-decimal list-inside mt-1 space-y-1">
              <li>Stop your Next.js development server.</li>
              <li>Delete the <code className="bg-muted px-1 py-0.5 rounded text-sm">greenview.db</code> file from the root of your project.</li>
              <li>Restart your Next.js development server (this will recreate the database with the correct schema).</li>
              <li>You will need to register your user and devices again.</li>
            </ol>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <PageHeader
        title="Greenhouse Dashboard"
        description="Monitor your greenhouse devices and sensor data."
        action={
          <Button onClick={() => selectedDeviceId && fetchSensorDataForDevice(selectedDeviceId, false)} disabled={isRefreshingSensors || !selectedDeviceId} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshingSensors ? 'animate-spin' : ''}`} />
            Refresh Sensor Data
          </Button>
        }
      />

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-foreground/90">Select Device</h2>
        <DeviceSelector 
            devices={devices} 
            selectedDeviceId={selectedDeviceId} 
            onSelectDevice={setSelectedDeviceId}
            isLoading={isLoading} 
        />
      </section>

      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      )}

      {!isLoading && currentDevice && (
        <section>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground/90">
                Current Readings for: <span className="text-primary">{currentDevice.name}</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                HWID: {currentDevice.hardwareIdentifier || 'N/A'}
              </p>
            </div>
            {currentDevice.isActive !== undefined ? (
                currentDevice.isActive ? (
                    <span className="text-xs bg-green-100 text-green-700 font-medium px-2.5 py-0.5 rounded-full dark:bg-green-900 dark:text-green-300">Active</span>
                ) : (
                    <span className="text-xs bg-red-100 text-red-700 font-medium px-2.5 py-0.5 rounded-full dark:bg-red-900 dark:text-red-300">Inactive</span>
                )
            ) : (
                 <span className="text-xs bg-yellow-100 text-yellow-700 font-medium px-2.5 py-0.5 rounded-full dark:bg-yellow-900 dark:text-yellow-300">Status Unknown</span>
            )}
          </div>
          {isRefreshingSensors && sensorReadings.length === 0 ? (
             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {[...Array(6)].map((_, i) => (
                    <Skeleton key={`${i}-loading`} className="h-36 w-full" />
                ))}
            </div>
          ) : (
            sensorReadings.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <SensorDisplayCard sensorData={getSensorValue(SensorType.TEMPERATURE)} sensorType={SensorType.TEMPERATURE} />
                <SensorDisplayCard sensorData={getSensorValue(SensorType.AIR_HUMIDITY)} sensorType={SensorType.AIR_HUMIDITY} />
                <SensorDisplayCard sensorData={getSensorValue(SensorType.SOIL_HUMIDITY)} sensorType={SensorType.SOIL_HUMIDITY} />
                <SensorDisplayCard sensorData={getSensorValue(SensorType.LIGHT)} sensorType={SensorType.LIGHT} />
                <SensorDisplayCard sensorData={getSensorValue(SensorType.PH)} sensorType={SensorType.PH} />
                <SensorDisplayCard sensorData={getSensorValue(SensorType.WATER_LEVEL)} sensorType={SensorType.WATER_LEVEL} />
                <SensorDisplayCard sensorData={getSensorValue(SensorType.DRAINAGE)} sensorType={SensorType.DRAINAGE} />
              </div>
            ) : (
              <Card className="mt-4">
                <CardHeader> <CardTitle className="text-lg text-center">No Sensor Data</CardTitle> </CardHeader>
                <CardContent className="text-center text-muted-foreground">
                  <p>No sensor readings available for this device yet.</p>
                  <p className="mt-1">If the device is active, data should appear after the next poll or you can try to <Button variant="link" className="p-0 h-auto" onClick={() => selectedDeviceId && fetchSensorDataForDevice(selectedDeviceId, false)} disabled={isRefreshingSensors}>refresh</Button>.</p>
                </CardContent>
              </Card>
            )
          )}
        </section>
      )}
      
       {!isLoading && devices.length === 0 && !dbSchemaError && (
         <Card className="mt-8">
            <CardHeader> <CardTitle className="text-lg text-center">No Devices Available</CardTitle> </CardHeader>
            <CardContent className="text-center text-muted-foreground">
              <p>You haven&apos;t registered any greenhouse devices yet.</p>
              <Button asChild className="mt-4">
                <Link href="/settings"><Settings className="mr-2 h-4 w-4" /> Go to Settings to Add Device</Link>
              </Button>
            </CardContent>
          </Card>
      )}
    </div>
  );
}
