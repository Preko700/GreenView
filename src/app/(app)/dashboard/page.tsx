
"use client";

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DeviceSelector } from '@/components/dashboard/DeviceSelector';
import { SensorDisplayCard } from '@/components/dashboard/SensorDisplayCard';
import { getMockSensorData } from '@/data/mockData'; // Keep for sensor data for now
import type { Device, SensorData } from '@/lib/types';
import { SensorType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { RefreshCw, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [currentDevice, setCurrentDevice] = useState<Device | null>(null);
  const [sensorReadings, setSensorReadings] = useState<SensorData[]>([]);
  
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);
  const [isLoadingSensorData, setIsLoadingSensorData] = useState(false); // For sensor refresh

  const fetchDevices = useCallback(async () => {
    if (!user) return;
    setIsLoadingDevices(true);
    try {
      const response = await fetch(`/api/devices?userId=${user.id}`);
      if (!response.ok) throw new Error('Failed to fetch devices');
      const data: Device[] = await response.json();
      setDevices(data);
      if (data.length > 0) {
        // If no device is selected, or selected device is not in the new list, select the first one
        if (!selectedDeviceId || !data.find(d => d.serialNumber === selectedDeviceId)) {
          setSelectedDeviceId(data[0].serialNumber);
        }
      } else {
        setSelectedDeviceId(null);
        setCurrentDevice(null);
      }
    } catch (error) {
      toast({ title: "Error", description: "Could not load your devices.", variant: "destructive" });
      console.error("Error fetching devices:", error);
    } finally {
      setIsLoadingDevices(false);
    }
  }, [user, toast, selectedDeviceId]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    if (selectedDeviceId) {
      const device = devices.find(d => d.serialNumber === selectedDeviceId);
      setCurrentDevice(device || null);
      // Simulate fetching sensor data for selected device
      setIsLoadingSensorData(true);
      const data = getMockSensorData(selectedDeviceId); // Still using mock sensor data
      setSensorReadings(data);
      setTimeout(() => setIsLoadingSensorData(false), 500);
    } else {
        setCurrentDevice(null);
        setSensorReadings([]);
    }
  }, [selectedDeviceId, devices]);

  const handleRefreshSensorData = () => {
    if (selectedDeviceId) {
      setIsLoadingSensorData(true);
      const data = getMockSensorData(selectedDeviceId); // Re-fetch mock sensor data
      setSensorReadings(data);
      setTimeout(() => setIsLoadingSensorData(false), 700);
      toast({title: "Sensor Data Refreshed", description: `Displaying latest mock readings for ${currentDevice?.name || 'device'}.`});
    }
  };

  const getSensorValue = (type: SensorType) => sensorReadings.find(s => s.type === type);

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
            isLoading={isLoadingDevices} 
        />
      </section>

      {(isLoadingDevices || (selectedDeviceId && isLoadingSensorData)) && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Object.values(SensorType).map((type) => (
            <Skeleton key={type} className="h-36 w-full" />
          ))}
        </div>
      )}

      {!isLoadingDevices && !isLoadingSensorData && currentDevice && (
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-foreground/90">
              Current Readings for: <span className="text-primary">{currentDevice.name}</span>
            </h2>
            {currentDevice.isActive ? (
                <span className="text-xs bg-green-100 text-green-700 font-medium px-2.5 py-0.5 rounded-full dark:bg-green-900 dark:text-green-300">Active</span>
            ): (
                <span className="text-xs bg-red-100 text-red-700 font-medium px-2.5 py-0.5 rounded-full dark:bg-red-900 dark:text-red-300">Inactive</span>
            )}
          </div>
          {currentDevice.isActive ? (
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
                <CardHeader> <CardTitle className="text-lg text-center">Device Inactive</CardTitle> </CardHeader>
                <CardContent className="text-center text-muted-foreground">
                  <p>This device is currently inactive. No sensor data available.</p>
                  <p className="mt-2">You can manage device settings <Link href={`/settings`} className="text-primary underline">here</Link>.</p>
                </CardContent>
              </Card>
          )}
        </section>
      )}
      
      {!isLoadingDevices && !currentDevice && devices.length > 0 && (
         <Card className="mt-8">
            <CardHeader> <CardTitle className="text-lg text-center">No Device Selected</CardTitle> </CardHeader>
            <CardContent className="text-center text-muted-foreground">
              <p>Please select a device from the list above to view its sensor readings.</p>
            </CardContent>
          </Card>
      )}
      
       {!isLoadingDevices && devices.length === 0 && (
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
