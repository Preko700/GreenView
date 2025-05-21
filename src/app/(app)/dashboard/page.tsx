"use client";

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DeviceSelector } from '@/components/dashboard/DeviceSelector';
import { SensorDisplayCard } from '@/components/dashboard/SensorDisplayCard';
import { mockDevices, getMockSensorData, getMockDevice } from '@/data/mockData';
import type { Device, SensorData } from '@/lib/types';
import { SensorType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [currentDevice, setCurrentDevice] = useState<Device | null>(null);
  const [sensorReadings, setSensorReadings] = useState<SensorData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate fetching devices
    setDevices(mockDevices);
    if (mockDevices.length > 0) {
      setSelectedDeviceId(mockDevices[0].serialNumber);
    } else {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDeviceId) {
      setIsLoading(true);
      // Simulate fetching data for selected device
      const device = getMockDevice(selectedDeviceId);
      const data = getMockSensorData(selectedDeviceId);
      setCurrentDevice(device || null);
      setSensorReadings(data);
      // Simulate API delay
      setTimeout(() => setIsLoading(false), 500);
    }
  }, [selectedDeviceId]);

  const handleRefresh = () => {
    if (selectedDeviceId) {
      setIsLoading(true);
      // Simulate fetching data for selected device
      const device = getMockDevice(selectedDeviceId);
      const data = getMockSensorData(selectedDeviceId); // Potentially update mock data or re-fetch
      setCurrentDevice(device || null);
      setSensorReadings(data);
      // Simulate API delay
      setTimeout(() => setIsLoading(false), 700);
    }
  };

  const getSensorValue = (type: SensorType) => sensorReadings.find(s => s.type === type);

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <PageHeader
        title="Greenhouse Dashboard"
        description="Monitor your greenhouse devices and sensor data."
        action={
          <Button onClick={handleRefresh} disabled={isLoading || !selectedDeviceId} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        }
      />

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-foreground/90">Select Device</h2>
        {devices.length > 0 ? (
          <DeviceSelector devices={devices} selectedDeviceId={selectedDeviceId} onSelectDevice={setSelectedDeviceId} />
        ) : (
           <Skeleton className="h-32 w-full" />
        )}
      </section>

      {isLoading && selectedDeviceId && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Object.values(SensorType).map((type) => (
            <Skeleton key={type} className="h-36 w-full" />
          ))}
        </div>
      )}

      {!isLoading && currentDevice && (
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
              {/* Add other sensors if needed, e.g., DRAINAGE */}
            </div>
          ) : (
             <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-lg text-center">Device Inactive</CardTitle>
                </CardHeader>
                <CardContent className="text-center text-muted-foreground">
                  <p>This device is currently inactive. No sensor data available.</p>
                  <p className="mt-2">You can manage device settings <Link href={`/settings`} className="text-primary underline">here</Link>.</p>
                </CardContent>
              </Card>
          )}
        </section>
      )}
      
      {!isLoading && !currentDevice && devices.length > 0 && (
         <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-lg text-center">No Device Selected</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-muted-foreground">
              <p>Please select a device from the list above to view its sensor readings.</p>
            </CardContent>
          </Card>
      )}
      
       {!isLoading && devices.length === 0 && (
         <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-lg text-center">No Devices Available</CardTitle>
            </CardHeader>
            <CardContent className="text-center text-muted-foreground">
              <p>It seems you haven&apos;t added any greenhouse devices yet.</p>
              <Button asChild className="mt-4">
                <Link href="/settings">Add New Device</Link>
              </Button>
            </CardContent>
          </Card>
      )}
    </div>
  );
}
