
"use client";

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DeviceSelector } from '@/components/dashboard/DeviceSelector';
import type { Device, SensorData } from '@/lib/types';
import { SensorType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { RefreshCw, Settings, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SensorDisplayCard } from '@/components/dashboard/SensorDisplayCard'; // Asegúrate de importar SensorDisplayCard

const SELECTED_DEVICE_ID_LS_KEY = 'selectedDashboardDeviceId';

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [currentDevice, setCurrentDevice] = useState<Device | null>(null);
  const [sensorReadings, setSensorReadings] = useState<SensorData[]>([]);
  
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);
  const [isLoadingSensorData, setIsLoadingSensorData] = useState(false);
  const [dbSchemaError, setDbSchemaError] = useState<string | null>(null);
  const [isLocalStorageChecked, setIsLocalStorageChecked] = useState(false);

  const fetchDevices = useCallback(async () => {
    if (!user) return;
    setIsLoadingDevices(true);
    setDbSchemaError(null);
    try {
      const response = await fetch(`/api/devices?userId=${user.id}`);
      if (!response.ok) {
        let errorMessage = 'Failed to fetch devices';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
          if (errorMessage.includes("Database schema error")) {
            setDbSchemaError(errorMessage);
          }
        } catch (e) {
           const textError = await response.text().catch(() => "Server returned an unreadable error.");
           console.error("Non-JSON error response from /api/devices on dashboard:", textError);
           errorMessage = `Failed to fetch devices. Server returned: ${response.status} ${response.statusText}. Check console for details.`;
        }
        throw new Error(errorMessage);
      }
      const data: Device[] = await response.json();
      setDevices(data);

      // Logic to set selectedDeviceId after devices are fetched
      if (data.length > 0) {
        const storedDeviceId = typeof window !== 'undefined' ? localStorage.getItem(SELECTED_DEVICE_ID_LS_KEY) : null;
        if (storedDeviceId && data.some(d => d.serialNumber === storedDeviceId)) {
          setSelectedDeviceId(storedDeviceId);
        } else if (!selectedDeviceId) { // If no device is selected yet (or stored one is invalid)
          setSelectedDeviceId(data[0].serialNumber);
        }
      } else {
        setSelectedDeviceId(null);
        setCurrentDevice(null);
        setSensorReadings([]);
        if (typeof window !== 'undefined') {
            localStorage.removeItem(SELECTED_DEVICE_ID_LS_KEY);
        }
      }
    } catch (error: any) {
      if (!dbSchemaError) {
        toast({ title: "Error Loading Devices", description: error.message, variant: "destructive" });
      }
      console.error("Error fetching devices on dashboard:", error.message);
    } finally {
      setIsLoadingDevices(false);
      setIsLocalStorageChecked(true); // Mark localStorage as checked after devices are fetched
    }
  }, [user, toast, dbSchemaError, selectedDeviceId]); // Added selectedDeviceId to ensure it attempts to keep it if valid

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);
  
  // Persist selectedDeviceId to localStorage
  useEffect(() => {
    if (selectedDeviceId && isLocalStorageChecked) { // Only save if localStorage has been checked and a device is selected
      localStorage.setItem(SELECTED_DEVICE_ID_LS_KEY, selectedDeviceId);
    }
  }, [selectedDeviceId, isLocalStorageChecked]);


  const fetchSensorDataForDevice = useCallback(async (deviceId: string) => {
    if (!user) return;
    setIsLoadingSensorData(true);
    try {
      const response = await fetch(`/api/sensor-data/${deviceId}?userId=${user.id}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch sensor data' }));
        throw new Error(errorData.message || 'Failed to fetch sensor data');
      }
      const data: SensorData[] = await response.json();
      setSensorReadings(data);
    } catch (error: any) {
      toast({ title: "Error", description: `Could not load sensor data for ${currentDevice?.name || 'device'}: ${error.message}`, variant: "destructive" });
      setSensorReadings([]); 
    } finally {
      setIsLoadingSensorData(false);
    }
  }, [user, toast, currentDevice?.name]);


  useEffect(() => {
    if (selectedDeviceId) {
      const device = devices.find(d => d.serialNumber === selectedDeviceId);
      setCurrentDevice(device || null);
      if (device) {
        fetchSensorDataForDevice(device.serialNumber);
      }
    } else {
        setCurrentDevice(null);
        setSensorReadings([]);
    }
  }, [selectedDeviceId, devices, fetchSensorDataForDevice]);

  const handleRefreshSensorData = () => {
    if (selectedDeviceId) {
      fetchSensorDataForDevice(selectedDeviceId);
      toast({title: "Sensor Data Refreshing...", description: `Requesting latest readings for ${currentDevice?.name || 'device'}.`});
    }
  };

  const getSensorValue = (type: SensorType) => sensorReadings.find(s => s.type === type);

  if (dbSchemaError) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6">
        <PageHeader
          title="Greenhouse Dashboard"
          description="Monitor your greenhouse devices and sensor data."
        />
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
          <Button onClick={handleRefreshSensorData} disabled={isLoadingSensorData || !selectedDeviceId} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingSensorData ? 'animate-spin' : ''}`} />
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
            isLoading={isLoadingDevices || !isLocalStorageChecked} 
        />
      </section>

      {(isLoadingDevices || (selectedDeviceId && isLoadingSensorData) || !isLocalStorageChecked) && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[SensorType.TEMPERATURE, SensorType.AIR_HUMIDITY, SensorType.SOIL_HUMIDITY, SensorType.LIGHT, SensorType.PH, SensorType.WATER_LEVEL].map((type) => (
            <Skeleton key={type} className="h-36 w-full" />
          ))}
        </div>
      )}

      {!isLoadingDevices && !isLoadingSensorData && currentDevice && isLocalStorageChecked && (
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-foreground/90">
              Current Readings for: <span className="text-primary">{currentDevice.name}</span>
            </h2>
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
          {(currentDevice.isActive === undefined || currentDevice.isActive) ? ( 
            sensorReadings.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <SensorDisplayCard sensorData={getSensorValue(SensorType.TEMPERATURE)} sensorType={SensorType.TEMPERATURE} />
                <SensorDisplayCard sensorData={getSensorValue(SensorType.AIR_HUMIDITY)} sensorType={SensorType.AIR_HUMIDITY} />
                <SensorDisplayCard sensorData={getSensorValue(SensorType.SOIL_HUMIDITY)} sensorType={SensorType.SOIL_HUMIDITY} />
                <SensorDisplayCard sensorData={getSensorValue(SensorType.LIGHT)} sensorType={SensorType.LIGHT} />
                <SensorDisplayCard sensorData={getSensorValue(SensorType.PH)} sensorType={SensorType.PH} />
                <SensorDisplayCard sensorData={getSensorValue(SensorType.WATER_LEVEL)} sensorType={SensorType.WATER_LEVEL} />
              </div>
            ) : (
              <Card className="mt-4">
                <CardHeader> <CardTitle className="text-lg text-center">No Sensor Data</CardTitle> </CardHeader>
                <CardContent className="text-center text-muted-foreground">
                  <p>No sensor readings available for this device yet.</p>
                  <p className="mt-1">If this device is new, it may take a few moments for data to appear.</p>
                   <p className="mt-1">You can try to <Button variant="link" className="p-0 h-auto" onClick={handleRefreshSensorData} disabled={isLoadingSensorData}>refresh the data</Button>.</p>
                </CardContent>
              </Card>
            )
          ) : (
             <Card className="mt-4">
                <CardHeader> <CardTitle className="text-lg text-center">Device Inactive</CardTitle> </CardHeader>
                <CardContent className="text-center text-muted-foreground">
                  <p>This device is currently inactive. No sensor data available.</p>
                  <p className="mt-2">You can manage device settings <Link href={`/settings`} className="text-primary underline">here</Link>.</p>
                </CardContent>
              </Card>
          )}
        </section>
      )}
      
      {!isLoadingDevices && !currentDevice && devices.length > 0 && isLocalStorageChecked && (
         <Card className="mt-8">
            <CardHeader> <CardTitle className="text-lg text-center">No Device Selected</CardTitle> </CardHeader>
            <CardContent className="text-center text-muted-foreground">
              <p>Please select a device from the list above to view its sensor readings.</p>
            </CardContent>
          </Card>
      )}
      
       {!isLoadingDevices && devices.length === 0 && !dbSchemaError && isLocalStorageChecked && (
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

