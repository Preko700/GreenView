
"use client";

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { AiAssistantForm } from '@/components/ai/AiAssistantForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { provideGreenhouseAdvice, type ProvideGreenhouseAdviceInput, type ProvideGreenhouseAdviceOutput } from '@/ai/flows/greenhouse-ai-assistant';
import { Bot, Zap, Settings, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Device, SensorData } from '@/lib/types';
import { SensorType } from '@/lib/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Button } from "@/components/ui/button";


export default function AiAssistantPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [advice, setAdvice] = useState<ProvideGreenhouseAdviceOutput | null>(null);
  const [isLoadingAdvice, setIsLoadingAdvice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [initialFormValues, setInitialFormValues] = useState<Partial<ProvideGreenhouseAdviceInput> | undefined>(undefined);
  const [dbSchemaError, setDbSchemaError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    if (!user) return;
    setIsLoadingDevices(true);
    setDbSchemaError(null);
    try {
      const response = await fetch(`/api/devices?userId=${user.id}`);
      const data = await response.json();
      if (!response.ok) {
        const errorMessage = data.message || 'Failed to fetch devices';
        setDbSchemaError(errorMessage);
        throw new Error(errorMessage);
      }
      setDevices(data);
      if (data.length > 0 && !selectedDeviceId) {
         if (selectedDeviceId && data.some(d => d.serialNumber === selectedDeviceId)) {
         } else {
           setSelectedDeviceId(data[0].serialNumber);
         }
      } else if (data.length === 0) {
        setSelectedDeviceId(undefined);
      }
    } catch (err: any) {
      console.error("Error fetching devices:", err.message);
    } finally {
      setIsLoadingDevices(false);
    }
  }, [user, toast, selectedDeviceId]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);


 useEffect(() => {
    const fetchInitialSensorData = async () => {
      if (selectedDeviceId && user && devices.length > 0) {
        try {
          const sensorResponse = await fetch(`/api/sensor-data/${selectedDeviceId}?userId=${user.id}`);
          let sensorReadings: Partial<Record<SensorType, number>> = {};

          if (sensorResponse.ok) {
            const fetchedReadings: SensorData[] = await sensorResponse.json();
            fetchedReadings.forEach(reading => {
              sensorReadings[reading.type as SensorType] = reading.value;
            });
          } else {
            console.warn(`Failed to fetch sensor data for ${selectedDeviceId} for AI Assistant, proceeding without it.`);
          }
          
          const device = devices.find(d => d.serialNumber === selectedDeviceId);

          setInitialFormValues({
            temperature: sensorReadings[SensorType.TEMPERATURE],
            airHumidity: sensorReadings[SensorType.AIR_HUMIDITY],
            soilHumidity: sensorReadings[SensorType.SOIL_HUMIDITY],
            lightLevel: sensorReadings[SensorType.LIGHT],
            plantType: device?.plantType || '',
            location: device?.location || '',
          });

        } catch (error) {
          console.error("Error fetching initial sensor data for AI Assistant:", error);
           const device = devices.find(d => d.serialNumber === selectedDeviceId);
           setInitialFormValues({
            plantType: device?.plantType || '',
            location: device?.location || '',
          });
        }
      } else if (devices.length > 0 && selectedDeviceId) {
        const device = devices.find(d => d.serialNumber === selectedDeviceId);
        setInitialFormValues({
            plantType: device?.plantType || '',
            location: device?.location || '',
        });
      } else {
        setInitialFormValues(undefined);
      }
    };

    if (devices.length > 0 || !isLoadingDevices) {
        fetchInitialSensorData();
    }
  }, [selectedDeviceId, devices, user, isLoadingDevices]);


  const handleFormSubmit = async (data: ProvideGreenhouseAdviceInput) => {
    setIsLoadingAdvice(true);
    setError(null);
    setAdvice(null);
    try {
      const result = await provideGreenhouseAdvice(data);
      setAdvice(result);
    } catch (e) {
      console.error("Error getting AI advice:", e);
      setError(e instanceof Error ? e.message : "An unknown error occurred.");
    } finally {
      setIsLoadingAdvice(false);
    }
  };

  if (dbSchemaError) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6">
        <PageHeader
          title="AI Greenhouse Assistant"
          description="Get personalized advice for optimizing your greenhouse conditions."
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
        title="AI Greenhouse Assistant"
        description="Get personalized advice for optimizing your greenhouse conditions."
      />

    {isLoadingDevices && !selectedDeviceId && (
        <Card className="lg:col-span-2 shadow-lg mt-8">
            <CardHeader><CardTitle><Skeleton className="h-6 w-3/4" /></CardTitle><CardDescription><Skeleton className="h-4 w-full" /></CardDescription></CardHeader>
            <CardContent><Skeleton className="h-60 w-full" /></CardContent>
        </Card>
    )}

    {!isLoadingDevices && devices.length === 0 && (
         <Card className="mt-8">
            <CardHeader> <CardTitle className="text-lg text-center">No Devices Available</CardTitle> </CardHeader>
            <CardContent className="text-center text-muted-foreground">
              <p>You need to register a device first to get AI advice.</p>
              <Button asChild className="mt-4">
                <Link href="/settings"><Settings className="mr-2 h-4 w-4" /> Go to Settings to Add Device</Link>
              </Button>
            </CardContent>
          </Card>
    )}

    {((!isLoadingDevices && devices.length > 0) || (isLoadingDevices && selectedDeviceId)) && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        <Card className="lg:col-span-2 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Zap className="mr-2 h-6 w-6 text-primary" />
              Input Greenhouse Conditions
            </CardTitle>
            <CardDescription>
              Fill in the current details of your greenhouse environment. 
              You can select a device to pre-fill some data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <Label htmlFor="device-select">Select Device</Label>
              {isLoadingDevices && devices.length === 0 ? (
                <Skeleton className="h-10 w-full md:w-[280px]" />
              ) : (
                <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId} disabled={isLoadingDevices && devices.length === 0}>
                  <SelectTrigger id="device-select" className="w-full md:w-[280px]">
                    <SelectValue placeholder="Select a device to pre-fill data" />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.map(device => (
                      <SelectItem key={device.serialNumber} value={device.serialNumber}>
                        {device.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {(selectedDeviceId && initialFormValues !== undefined) ? (
                <AiAssistantForm onSubmit={handleFormSubmit} isLoading={isLoadingAdvice} initialValues={initialFormValues} />
            ) : (selectedDeviceId && initialFormValues === undefined && isLoadingDevices) ? (
                <Skeleton className="h-72 w-full" />
            ) : (
                <p className="text-muted-foreground">Please select a device to input conditions.</p>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-1 space-y-6">
          {error && (
            <Alert variant="destructive"> <AlertTitle>Error</AlertTitle> <AlertDescription>{error}</AlertDescription> </Alert>
          )}

          {advice && (
            <Card className="shadow-lg bg-primary/5 border-primary/20">
              <CardHeader> <CardTitle className="flex items-center"> <Bot className="mr-2 h-6 w-6 text-primary" /> AI Recommendation </CardTitle> </CardHeader>
              <CardContent> <p className="text-foreground/90 whitespace-pre-wrap">{advice.advice}</p> </CardContent>
            </Card>
          )}
           {isLoadingAdvice && (
             <Card className="shadow-md bg-muted/50">
                <CardHeader> <CardTitle className="flex items-center text-muted-foreground"> <Bot className="mr-2 h-6 w-6 animate-pulse" /> Generating Advice... </CardTitle> </CardHeader>
                <CardContent><Skeleton className="h-20 w-full" /></CardContent>
            </Card>
          )}

          {!advice && !isLoadingAdvice && !error && (
             <Card className="shadow-md bg-muted/50">
              <CardHeader> <CardTitle className="flex items-center text-muted-foreground"> <Bot className="mr-2 h-6 w-6" /> Awaiting Input </CardTitle> </CardHeader>
              <CardContent> <p className="text-muted-foreground"> Enter your greenhouse conditions in the form to receive personalized advice. </p> </CardContent>
            </Card>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
