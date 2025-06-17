
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataChart } from '@/components/monitoring/DataChart';
import type { Device, SensorData } from '@/lib/types';
import { SensorType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle as UiAlertTitle } from "@/components/ui/alert";

const SENSOR_TYPES_FOR_DISPLAY: SensorType[] = [
  SensorType.TEMPERATURE,
  SensorType.AIR_HUMIDITY,
  SensorType.SOIL_HUMIDITY,
  SensorType.LIGHT,
  SensorType.PH,
  SensorType.WATER_LEVEL,
];

const POLLING_INTERVAL_MS = 30000; // 30 seconds

export default function MonitoringPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.deviceId as string;
  const { user } = useAuth();
  const { toast } = useToast();

  const [device, setDevice] = useState<Device | null>(null);
  const [historicalData, setHistoricalData] = useState<{ [key in SensorType]?: SensorData[] }>({});
  const [isLoadingDevice, setIsLoadingDevice] = useState(true);
  const [isLoadingHistorical, setIsLoadingHistorical] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchHistoricalDataForSensor = useCallback(async (currentDeviceId: string, sensorType: SensorType): Promise<SensorData[] | null> => {
    if (!user) return null;
    try {
      const response = await fetch(\`/api/sensor-data/historical/\${currentDeviceId}?userId=\${user.id}&sensorType=\${sensorType}&limit=100\`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: \`Failed to fetch historical data for \${sensorType}\` }));
        console.warn(\`[MonitoringPage] Failed to fetch historical data for \${sensorType}: \${errorData.message}\`);
        return null;
      }
      return await response.json();
    } catch (error: any) {
      console.error(\`[MonitoringPage] Error fetching historical data for \${sensorType}:\`, error);
      return null;
    }
  }, [user]);

  const fetchAllHistoricalData = useCallback(async (currentDeviceId: string, isInitialLoad = false) => {
    if (!user || !currentDeviceId) return;
    
    if (isInitialLoad || !isLoadingHistorical) { // Prevent multiple simultaneous loads unless initial
      setIsLoadingHistorical(true);
    }

    const newHistoricalDataPromises = SENSOR_TYPES_FOR_DISPLAY.map(type =>
      fetchHistoricalDataForSensor(currentDeviceId, type).then(data => ({ type, data }))
    );

    const results = await Promise.all(newHistoricalDataPromises);
    
    const updatedData: { [key in SensorType]?: SensorData[] } = {};
    let hasAnyError = false;
    results.forEach(result => {
      if (result.data) {
        updatedData[result.type] = result.data;
      } else {
        updatedData[result.type] = historicalData[result.type] || []; // Keep old data on error
        hasAnyError = true;
      }
    });
    
    setHistoricalData(updatedData);
    setIsLoadingHistorical(false);

    if (hasAnyError && !isInitialLoad) { // Avoid toast on initial load if some sensors fail
      // toast({ title: "Data Update", description: "Some sensor history might not have updated.", variant: "default" });
    }
  }, [user, fetchHistoricalDataForSensor, historicalData, isLoadingHistorical]);


  const fetchInitialDeviceAndData = useCallback(async () => {
    if (!deviceId || !user) {
      setIsLoadingDevice(true);
      return;
    }
    
    setIsLoadingDevice(true);
    setFetchError(null);
    setHistoricalData({}); 

    try {
      const deviceRes = await fetch(\`/api/devices/\${deviceId}?userId=\${user.id}\`);
      if (!deviceRes.ok) {
        let errorMessage = \`Failed to fetch device. Status: \${deviceRes.status}\`;
        if (deviceRes.status === 404) errorMessage = "Device not found or you're not authorized.";
        else try { const errorData = await deviceRes.json(); errorMessage = errorData.message || errorMessage; } 
        catch (e) { const errorText = await deviceRes.text(); errorMessage = \`\${errorMessage}. Server: \${errorText.substring(0, 100)}\`; }
        throw new Error(errorMessage);
      }
      const fetchedDevice: Device = await deviceRes.json();
      setDevice(fetchedDevice);
      await fetchAllHistoricalData(fetchedDevice.serialNumber, true);

    } catch (error: any) {
      console.error("[MonitoringPage] Error in fetchInitialDeviceAndData:", error);
      const specificMessage = error.message || "Unknown error fetching initial device data.";
      toast({ title: "Error Loading Device", description: specificMessage, variant: "destructive" });
      setDevice(null);
      setFetchError(specificMessage);
    } finally {
      setIsLoadingDevice(false);
    }
  }, [deviceId, user, toast, fetchAllHistoricalData]);

  useEffect(() => {
    fetchInitialDeviceAndData();
  }, [fetchInitialDeviceAndData]);

  useEffect(() => {
    if (device && device.serialNumber && !isLoadingDevice && !fetchError) {
      pollingIntervalRef.current = setInterval(() => {
        if (!document.hidden) { // Only poll if tab is visible
            console.log(\`[MonitoringPage] Polling for historical data for device \${device.serialNumber}\`);
            fetchAllHistoricalData(device.serialNumber);
        }
      }, POLLING_INTERVAL_MS);

      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
      };
    } else {
        if (pollingIntervalRef.current) {
             clearInterval(pollingIntervalRef.current);
        }
    }
  }, [device, fetchAllHistoricalData, isLoadingDevice, fetchError]);
  
  const handleManualRefresh = () => {
      if (device && device.serialNumber && !isLoadingHistorical) {
          toast({ title: "Refreshing Data...", description: \`Fetching latest history for \${device.name}.\` });
          fetchAllHistoricalData(device.serialNumber);
      }
  };

  if (isLoadingDevice) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-8 w-1/3 mt-1 mb-4" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {SENSOR_TYPES_FOR_DISPLAY.map((type) => (
            <Skeleton key={type} className="h-[400px] w-full" /> 
          ))}
        </div>
      </div>
    );
  }

  if (fetchError && !device) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 text-center">
         <Card className="max-w-md mx-auto mt-8">
            <CardHeader> <AlertTriangle className="h-12 w-12 text-destructive mx-auto" /> <CardTitle className="text-2xl text-destructive">Could Not Load Device</CardTitle> </CardHeader>
            <CardContent>
                <Alert variant="destructive" className="text-left"> <UiAlertTitle>Error Details</UiAlertTitle> <AlertDescription> <p>{fetchError}</p> <p className="mt-2">Please try refreshing or check your connection.</p> </AlertDescription> </Alert>
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
            <CardHeader> <AlertTriangle className="h-12 w-12 text-destructive mx-auto" /> <CardTitle className="text-2xl text-destructive">Device Not Available</CardTitle> </CardHeader>
            <CardContent> <p className="text-muted-foreground mt-2">The device could not be loaded. Please select a device from the dashboard.</p> <Button onClick={() => router.push('/dashboard')} className="mt-6"> <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard </Button> </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <PageHeader
        title={\`Monitoring: \${device.name}\`}
        description={\`Historical sensor data for \${device.serialNumber}.\`}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={handleManualRefresh} variant="outline" disabled={isLoadingHistorical}> <RefreshCw className={\`mr-2 h-4 w-4 \${isLoadingHistorical ? 'animate-spin' : ''}\`} /> Refresh Charts </Button>
            <Button onClick={() => router.push('/dashboard')} variant="outline"> <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard </Button>
          </div>
        }
      />

      {isLoadingHistorical && Object.keys(historicalData).length === 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {SENSOR_TYPES_FOR_DISPLAY.map(type => ( <Skeleton key={type} className="h-[400px] w-full" /> ))}
          </div>
      )}

      {!isLoadingHistorical && !isLoadingDevice && Object.values(historicalData).every(arr => !arr || arr.length === 0) && !fetchError && (
         <Card className="lg:col-span-2 mt-6">
            <CardHeader><CardTitle>No Historical Data</CardTitle><CardDescription>No historical data found for this device yet, or an error occurred fetching it.</CardDescription></CardHeader>
            <CardContent> <p className="text-muted-foreground text-center py-8"> Data will appear here once available. </p> </CardContent>
        </Card>
      )}
      
      {(Object.keys(historicalData).length > 0 || isLoadingHistorical) && ( // Render charts if there's data OR if we are loading (to show individual skeletons)
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {SENSOR_TYPES_FOR_DISPLAY.map(type => (
            (isLoadingHistorical && (!historicalData[type] || historicalData[type]?.length === 0)) ? 
            <Skeleton key={\`\${type}-loading\`} className="h-[400px] w-full" /> :
            <DataChart key={type} sensorData={historicalData[type] || []} sensorType={type} />
          ))}
        </div>
      )}
    </div>
  );
}
