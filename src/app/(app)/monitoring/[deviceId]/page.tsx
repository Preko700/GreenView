
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataChart } from '@/components/monitoring/DataChart';
import { getMockHistoricalSensorData } from '@/data/mockData'; // Still using mock for historical data
import type { Device, SensorData } from '@/lib/types';
import { SensorType } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [selectedSensorType, setSelectedSensorType] = useState<SensorType>(SensorType.TEMPERATURE);
  const [isLoading, setIsLoading] = useState(true);

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
          // Load mock historical data based on the fetched deviceId
          const data: { [key in SensorType]?: SensorData[] } = {};
          Object.values(SensorType).forEach(type => {
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
  }, [deviceId, user, toast]);

  useEffect(() => {
    fetchDeviceData();
  }, [fetchDeviceData]);


  const currentSensorData = useMemo(() => {
    return historicalData[selectedSensorType] || [];
  }, [historicalData, selectedSensorType]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-80 w-full" />
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
  
  const sensorTypesForDisplay = [
    SensorType.TEMPERATURE,
    SensorType.AIR_HUMIDITY,
    SensorType.SOIL_HUMIDITY,
    SensorType.LIGHT,
    SensorType.PH,
    SensorType.WATER_LEVEL,
  ];


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

      <Tabs value={selectedSensorType} onValueChange={(value) => setSelectedSensorType(value as SensorType)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 mb-6">
          {sensorTypesForDisplay.map(type => (
            <TabsTrigger key={type} value={type}>
              {type.replace('_', ' ')}
            </TabsTrigger>
          ))}
        </TabsList>

        {sensorTypesForDisplay.map(type => (
          <TabsContent key={type} value={type}>
             <DataChart sensorData={historicalData[type] || []} sensorType={type} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
