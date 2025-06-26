
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { SensorDisplayCard } from '@/components/dashboard/SensorDisplayCard';
import { useUsbConnection } from '@/contexts/UsbConnectionContext';

const SELECTED_DEVICE_ID_LS_KEY = 'selectedDashboardDeviceId';

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { connectedDeviceHardwareId: usbHardwareId, logMessages: usbLogMessages } = useUsbConnection();

  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [currentDevice, setCurrentDevice] = useState<Device | null>(null);
  const [sensorReadings, setSensorReadings] = useState<SensorData[]>([]);
  
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);
  const [isLoadingSensorData, setIsLoadingSensorData] = useState(false);
  const [dbSchemaError, setDbSchemaError] = useState<string | null>(null);
  const [isLocalStorageChecked, setIsLocalStorageChecked] = useState(false);

  const lastProcessedLogCountRef = useRef(0);

  const fetchDevices = useCallback(async () => {
    if (!user) return;
    setIsLoadingDevices(true);
    setDbSchemaError(null);
    try {
      const response = await fetch(`/api/devices?userId=${user.id}`);
      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.message || 'Failed to fetch devices';
        // Treat ANY persistent fetch error as a potential schema mismatch, as it's the most likely culprit.
        setDbSchemaError(errorMessage);
        throw new Error(errorMessage);
      }
      
      setDevices(data);

      if (data.length > 0) {
        const storedDeviceId = typeof window !== 'undefined' ? localStorage.getItem(SELECTED_DEVICE_ID_LS_KEY) : null;
        if (storedDeviceId && data.some(d => d.serialNumber === storedDeviceId)) {
          setSelectedDeviceId(storedDeviceId);
        } else if (!selectedDeviceId && data.length > 0) { 
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
      // The dbSchemaError state is now set for ANY device fetch error.
      // So, we just log to console here and let the UI handle showing the alert.
      console.error("Error fetching devices on dashboard:", error.message);
    } finally {
      setIsLoadingDevices(false);
      setIsLocalStorageChecked(true);
    }
  }, [user, toast, selectedDeviceId]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);
  
  useEffect(() => {
    if (selectedDeviceId && isLocalStorageChecked) {
      localStorage.setItem(SELECTED_DEVICE_ID_LS_KEY, selectedDeviceId);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('selectedDeviceChanged', { detail: { deviceId: selectedDeviceId } }));
      }
    } else if (!selectedDeviceId && isLocalStorageChecked && typeof window !== 'undefined'){
        window.dispatchEvent(new CustomEvent('selectedDeviceChanged', { detail: { deviceId: null } }));
    }
  }, [selectedDeviceId, isLocalStorageChecked]);


  const fetchSensorDataAndDeviceStatus = useCallback(async (deviceId: string, triggeredByUsb: boolean = false) => {
    if (!user || !deviceId) return;
    setIsLoadingSensorData(true);

    let sensorDataFetched = false;
    let deviceStatusRefreshed = false;
    let deviceNameForToast = currentDevice?.name || deviceId;

    try {
      const sensorResponse = await fetch(`/api/sensor-data/${deviceId}?userId=${user.id}`);
      if (!sensorResponse.ok) {
        const errorData = await sensorResponse.json().catch(() => ({ message: 'Failed to fetch sensor data' }));
        throw new Error(errorData.message || 'Failed to fetch sensor data');
      }
      const data: SensorData[] = await sensorResponse.json();
      setSensorReadings(data);
      sensorDataFetched = true;
    } catch (error: any) {
      if (!triggeredByUsb) {
        toast({ title: "Error Sensor Data", description: `Could not load sensor data for ${deviceNameForToast}: ${error.message}`, variant: "destructive" });
      } else {
        console.warn(`[Dashboard] Silent fail fetching sensor data for ${deviceId} (USB trigger): ${error.message}`)
      }
      setSensorReadings([]);
    }

    try {
        const deviceDetailsRes = await fetch(`/api/devices/${deviceId}?userId=${user.id}`);
        if (deviceDetailsRes.ok) {
            const updatedDeviceData: Device = await deviceDetailsRes.json();
            setCurrentDevice(updatedDeviceData);
            setDevices(prevDevices => prevDevices.map(d => d.serialNumber === updatedDeviceData.serialNumber ? updatedDeviceData : d));
            deviceNameForToast = updatedDeviceData.name;
            deviceStatusRefreshed = true;
        } else {
            console.warn(`[Dashboard] Failed to refresh device details for ${deviceId}. Status: ${deviceDetailsRes.status}`);
        }
    } catch (error) {
        console.error(`[Dashboard] Error refreshing device details for ${deviceId}:`, error);
    }

    setIsLoadingSensorData(false);

    if (triggeredByUsb && (sensorDataFetched || deviceStatusRefreshed)) {
        toast({ title: "Dashboard Updated", description: `Data for ${deviceNameForToast} refreshed via USB connection.`, duration: 3000 });
    }

  }, [user, toast, currentDevice?.name]);


  useEffect(() => {
    if (selectedDeviceId) {
      const device = devices.find(d => d.serialNumber === selectedDeviceId);
      setCurrentDevice(device || null);
      if (device) {
        fetchSensorDataAndDeviceStatus(device.serialNumber, false);
      }
    } else {
        setCurrentDevice(null);
        setSensorReadings([]);
    }
  }, [selectedDeviceId, devices, fetchSensorDataAndDeviceStatus]);


  useEffect(() => {
    if (!currentDevice || !usbHardwareId || currentDevice.hardwareIdentifier !== usbHardwareId || isLoadingSensorData) {
      lastProcessedLogCountRef.current = usbLogMessages.length;
      return;
    }

    const newLogs = usbLogMessages.slice(0, usbLogMessages.length - lastProcessedLogCountRef.current);

    const hasNewRelevantLog = newLogs.some(log =>
        (log.includes(`MSG: Datos de sensores recibidos de ${usbHardwareId}`) ||
         log.includes(`API: Datos de ${usbHardwareId} enviados al servidor`))
    );

    if (hasNewRelevantLog) {
      console.log(`[Dashboard] USB Update: New relevant log found for ${currentDevice.name}. Refreshing data.`);
      fetchSensorDataAndDeviceStatus(currentDevice.serialNumber, true);
    }
    lastProcessedLogCountRef.current = usbLogMessages.length;

  }, [usbLogMessages, currentDevice, usbHardwareId, fetchSensorDataAndDeviceStatus, isLoadingSensorData]);


  const handleRefreshSensorData = () => {
    if (selectedDeviceId) {
      fetchSensorDataAndDeviceStatus(selectedDeviceId, false);
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

      {(isLoadingDevices || (selectedDeviceId && isLoadingSensorData && !currentDevice) || !isLocalStorageChecked) && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[SensorType.TEMPERATURE, SensorType.AIR_HUMIDITY, SensorType.SOIL_HUMIDITY, SensorType.LIGHT, SensorType.PH, SensorType.WATER_LEVEL].map((type) => (
            <Skeleton key={type} className="h-36 w-full" />
          ))}
        </div>
      )}

      {!isLoadingDevices && currentDevice && isLocalStorageChecked && (
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
          {isLoadingSensorData && sensorReadings.length === 0 ? (
             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {[SensorType.TEMPERATURE, SensorType.AIR_HUMIDITY, SensorType.SOIL_HUMIDITY, SensorType.LIGHT, SensorType.PH, SensorType.WATER_LEVEL].map((type) => (
                    <Skeleton key={`${type}-loading`} className="h-36 w-full" />
                ))}
            </div>
          ) : (currentDevice.isActive === undefined || currentDevice.isActive) ? ( 
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
    
