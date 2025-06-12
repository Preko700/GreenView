
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataChart } from '@/components/monitoring/DataChart';
import { getMockHistoricalSensorData } from '@/data/mockData'; 
import type { Device, SensorData } from '@/lib/types';
import { SensorType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function MonitoringPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.deviceId as string;
  const { user } = useAuth();
  const { toast } = useToast();

  const [device, setDevice] = useState<Device | null>(null);
  const [historicalData, setHistoricalData] = useState<{ [key in SensorType]?: SensorData[] }>({});
  const [isLoading, setIsLoading] = useState(true);

  const sensorTypesForDisplay: SensorType[] = [
    SensorType.TEMPERATURE,
    SensorType.AIR_HUMIDITY,
    SensorType.SOIL_HUMIDITY,
    SensorType.LIGHT,
    SensorType.PH,
    SensorType.WATER_LEVEL,
  ];

  const fetchDeviceData = useCallback(async () => {
    if (deviceId && user) {
      setIsLoading(true);
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
          
          const data: { [key in SensorType]?: SensorData[] } = {};
          sensorTypesForDisplay.forEach(type => { // Populate based on sensorTypesForDisplay
            data[type] = getMockHistoricalSensorData(fetchedDevice.serialNumber, type);
          });
          setHistoricalData(data);
        }
      } catch (error) {
        console.error("Error fetching device:", error);
        toast({ title: "Error", description: "Could not load device details.", variant: "destructive"});
        setDevice(null);
      } finally {
        setIsLoading(false);
      }
    } else if (!user && deviceId) {
      setIsLoading(true); 
    }
  }, [deviceId, user, toast, sensorTypesForDisplay]); // Added sensorTypesForDisplay to dependencies

  useEffect(() => {
    fetchDeviceData();
  }, [fetchDeviceData]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
        <Skeleton className="h-10 w-1/2" /> {/* PageHeader title skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Render skeletons for charts */}
          {[...Array(sensorTypesForDisplay.length > 0 ? Math.min(sensorTypesForDisplay.length, 4) : 2)].map((_, i) => ( // Show up to 4 skeletons, or 2 if no types defined yet
            <Skeleton key={i} className="h-[400px] w-full" /> 
          ))}
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
        title={`Monitoring: ${device.name}`}
        description={`Detailed sensor data and historical trends for ${device.serialNumber}.`}
        action={
          <Button onClick={() => router.push('/dashboard')} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {sensorTypesForDisplay.map(type => (
          <DataChart 
            key={type} 
            sensorData={historicalData[type] || []} 
            sensorType={type} 
          />
        ))}
      </div>
    </div>
  );
}
