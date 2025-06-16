
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle as UiAlertTitle } from "@/components/ui/alert";


// Mover sensorTypesForDisplay fuera del componente para que sea una constante
const SENSOR_TYPES_FOR_DISPLAY: SensorType[] = [
  SensorType.TEMPERATURE,
  SensorType.AIR_HUMIDITY,
  SensorType.SOIL_HUMIDITY,
  SensorType.LIGHT,
  SensorType.PH,
  SensorType.WATER_LEVEL,
];

export default function MonitoringPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.deviceId as string;
  const { user } = useAuth();
  const { toast } = useToast();

  const [device, setDevice] = useState<Device | null>(null);
  const [historicalData, setHistoricalData] = useState<{ [key in SensorType]?: SensorData[] }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);


  const fetchDeviceData = useCallback(async () => {
    if (deviceId && user) {
      console.log(`[MonitoringPage] Attempting to fetch data for deviceId: ${deviceId}, userId: ${user.id}`);
      setIsLoading(true);
      setFetchError(null);
      try {
        const apiUrl = `/api/devices/${deviceId}?userId=${user.id}`;
        console.log(`[MonitoringPage] Fetching URL: ${apiUrl}`);
        const res = await fetch(apiUrl);
        
        console.log(`[MonitoringPage] Response status: ${res.status}, statusText: ${res.statusText}`);

        if (!res.ok) {
          let errorMessage = `Failed to fetch device data. Status: ${res.status}`;
          if (res.status === 404) {
            errorMessage = "Device not found or you're not authorized to view it.";
            setDevice(null); // Asegurarse de que el dispositivo se establece en null en caso de 404
          } else {
            try {
              // Intenta leer el cuerpo del error como JSON
              const errorData = await res.json();
              console.error("[MonitoringPage] API Error JSON Data:", errorData);
              errorMessage = errorData.message || errorMessage;
            } catch (e) {
              // Si el cuerpo del error no es JSON, lee como texto
              const errorText = await res.text();
              console.error("[MonitoringPage] API Error Text Data:", errorText);
              errorMessage = `${errorMessage}. Server response: ${errorText.substring(0, 100) || 'Not available'}`;
            }
          }
          console.error(`[MonitoringPage] Throwing error: ${errorMessage}`);
          throw new Error(errorMessage);
        }
        
        const fetchedDevice: Device = await res.json();
        console.log("[MonitoringPage] Device data fetched successfully:", fetchedDevice);
        setDevice(fetchedDevice);
        
        const data: { [key in SensorType]?: SensorData[] } = {};
        SENSOR_TYPES_FOR_DISPLAY.forEach(type => { // Usar la constante
          data[type] = getMockHistoricalSensorData(fetchedDevice.serialNumber, type);
        });
        setHistoricalData(data);
        setFetchError(null); // Clear previous errors on success

      } catch (error: any) { 
        console.error("[MonitoringPage] Error in fetchDeviceData catch block:", error.name, error.message, error.stack);
        const specificMessage = error.message || "An unknown error occurred while fetching device details.";
        toast({ title: "Error Loading Device", description: specificMessage, variant: "destructive"});
        setDevice(null);
        setFetchError(specificMessage); // Set the error message to display
      } finally {
        setIsLoading(false);
        console.log("[MonitoringPage] fetchDeviceData finished. isLoading set to false.");
      }
    } else if (!user && deviceId) {
      setIsLoading(true); 
      setFetchError("User not available for fetching device data.");
      console.log("[MonitoringPage] User not available, setting isLoading to true and fetchError.");
    } else if (!deviceId) {
        setIsLoading(false);
        setFetchError("No device ID provided.");
        console.log("[MonitoringPage] No device ID, setting isLoading to false and fetchError.");
    }
  // SENSOR_TYPES_FOR_DISPLAY ya no es una dependencia porque es una constante a nivel de módulo
  }, [deviceId, user, toast]); 

  useEffect(() => {
    if (deviceId && user) { // Solo ejecutar si deviceId y user están presentes
        console.log("[MonitoringPage] useEffect for fetchDeviceData triggered.");
        fetchDeviceData();
    } else {
        console.log("[MonitoringPage] useEffect for fetchDeviceData SKIPPED (no deviceId or user).");
        if (!deviceId) {
            setIsLoading(false);
            setFetchError("Device ID is missing in the URL.");
        }
         if (!user && deviceId) { // Aún esperando al usuario
            setIsLoading(true); // Mantener el estado de carga si el usuario aún no está disponible
            setFetchError("Waiting for user authentication...");
        }
    }
  }, [fetchDeviceData, deviceId, user]); // fetchDeviceData, deviceId, user son las dependencias correctas ahora

  if (isLoading) {
    console.log("[MonitoringPage] Rendering Skeleton loading state.");
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {[...Array(SENSOR_TYPES_FOR_DISPLAY.length > 0 ? Math.min(SENSOR_TYPES_FOR_DISPLAY.length, 4) : 2)].map((_, i) => (
            <Skeleton key={i} className="h-[400px] w-full" /> 
          ))}
        </div>
      </div>
    );
  }

  if (fetchError && !device) { // Mostrar error si fetchError está seteado Y el dispositivo no se cargó
    console.log(`[MonitoringPage] Rendering fetch error state: ${fetchError}`);
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 text-center">
         <Card className="max-w-md mx-auto mt-8">
            <CardHeader>
                <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
                <CardTitle className="text-2xl text-destructive">Could Not Load Device Data</CardTitle>
            </CardHeader>
            <CardContent>
                <Alert variant="destructive" className="text-left">
                    <UiAlertTitle>Error Details</UiAlertTitle>
                    <AlertDescription>
                        <p>{fetchError}</p>
                        <p className="mt-2">Please try refreshing the page or check your connection. If the problem persists, ensure the device ID is correct and the server is running.</p>
                    </AlertDescription>
                </Alert>
                <Button onClick={() => router.push('/dashboard')} className="mt-6">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                </Button>
            </CardContent>
        </Card>
      </div>
    );
  }

  if (!device) { // Este caso ahora debería ser más raro si fetchError se maneja arriba
    console.log("[MonitoringPage] Rendering 'Device Not Loaded' state (no specific fetchError, or fetchError didn't prevent device from being null).");
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 text-center">
         <Card className="max-w-md mx-auto mt-8">
            <CardHeader>
                <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
                <CardTitle className="text-2xl text-destructive">Device Not Loaded</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground mt-2">
                  The device with ID '{deviceId}' could not be loaded. This might be because it was not found, you're not authorized, or an error occurred.
                </p>
                <Button onClick={() => router.push('/dashboard')} className="mt-6">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                </Button>
            </CardContent>
        </Card>
      </div>
    );
  }
  
  console.log("[MonitoringPage] Rendering device monitoring charts for:", device.name);
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
        {SENSOR_TYPES_FOR_DISPLAY.map(type => ( // Usar la constante
          <DataChart 
            key={type} 
            sensorData={historicalData[type] || []} 
            sensorType={type} 
          />
        ))}
        {Object.keys(historicalData).length === 0 && (
            <Card className="lg:col-span-2">
                <CardHeader><CardTitle>No Historical Data</CardTitle><CardDescription>No historical sensor data found for this device yet.</CardDescription></CardHeader>
                <CardContent>
                    <p className="text-muted-foreground text-center py-8">
                        Please check back later or ensure the device is sending data.
                    </p>
                </CardContent>
            </Card>
        )}
      </div>
    </div>
  );
}

    