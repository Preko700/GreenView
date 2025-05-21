"use client";

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataChart } from '@/components/monitoring/DataChart';
import { getMockDevice, getMockHistoricalSensorData } from '@/data/mockData';
import type { Device, SensorData } from '@/lib/types';
import { SensorType } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

enum TimeRange {
  LAST_24_HOURS = "Last 24 Hours",
  LAST_WEEK = "Last 7 Days",
  LAST_MONTH = "Last 30 Days",
}

export default function MonitoringPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.deviceId as string;

  const [device, setDevice] = useState<Device | null>(null);
  const [historicalData, setHistoricalData] = useState<{ [key in SensorType]?: SensorData[] }>({});
  const [selectedSensorType, setSelectedSensorType] = useState<SensorType>(SensorType.TEMPERATURE);
  // const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>(TimeRange.LAST_24_HOURS); // Future use
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (deviceId) {
      setIsLoading(true);
      const foundDevice = getMockDevice(deviceId);
      setDevice(foundDevice || null);

      const data: { [key in SensorType]?: SensorData[] } = {};
      Object.values(SensorType).forEach(type => {
        data[type] = getMockHistoricalSensorData(deviceId, type);
      });
      setHistoricalData(data);
      // Simulate API delay
      setTimeout(() => setIsLoading(false), 500);
    }
  }, [deviceId]);

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
        <h1 className="text-2xl font-semibold text-destructive">Device not found</h1>
        <p className="text-muted-foreground mt-2">The device with ID '{deviceId}' could not be loaded.</p>
        <Button onClick={() => router.push('/dashboard')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>
      </div>
    );
  }
  
  const sensorTypesForDisplay = [
    SensorType.TEMPERATURE,
    SensorType.AIR_HUMIDITY,
    SensorType.SOIL_HUMIDITY,
    SensorType.LIGHT,
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
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 mb-6">
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

      {/* Placeholder for time range selector - future enhancement
      <div className="mt-6">
        <Select value={selectedTimeRange} onValueChange={(value) => setSelectedTimeRange(value as TimeRange)}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            {Object.values(TimeRange).map(range => (
              <SelectItem key={range} value={range}>{range}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      */}
    </div>
  );
}
