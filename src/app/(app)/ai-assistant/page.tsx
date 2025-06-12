
"use client";

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { AiAssistantForm } from '@/components/ai/AiAssistantForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { provideGreenhouseAdvice, type ProvideGreenhouseAdviceInput, type ProvideGreenhouseAdviceOutput } from '@/ai/flows/greenhouse-ai-assistant';
import { Bot, Zap, Settings } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getMockSensorData } from '@/data/mockData'; // For pre-filling sensor data only
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

  const fetchDevices = useCallback(async () => {
    if (!user) return;
    setIsLoadingDevices(true);
    try {
      const response = await fetch(`/api/devices?userId=${user.id}`);
      if (!response.ok) throw new Error('Failed to fetch devices');
      const data: Device[] = await response.json();
      setDevices(data);
      if (data.length > 0 && !selectedDeviceId) {
         setSelectedDeviceId(data[0].serialNumber);
      } else if (data.length === 0) {
        setSelectedDeviceId(undefined);
      }
    } catch (err) {
      toast({ title: "Error", description: "Could not load your devices.", variant: "destructive" });
      console.error("Error fetching devices:", err);
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
      const sensorData = getMockSensorData(selectedDeviceId); // Still using mock sensor data
      
      const getSensorValue = (type: SensorType): number | undefined => sensorData.find(s => s.type === type)?.value;

      setInitialFormValues({
        temperature: getSensorValue(SensorType.TEMPERATURE),
        airHumidity: getSensorValue(SensorType.AIR_HUMIDITY),
        soilHumidity: getSensorValue(SensorType.SOIL_HUMIDITY),
        lightLevel: getSensorValue(SensorType.LIGHT),
        plantType: device?.plantType || '',
        location: device?.location || '',
      });
    } else {
      setInitialFormValues(undefined);
    }
  }, [selectedDeviceId, devices]);


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

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <PageHeader
        title="AI Greenhouse Assistant"
        description="Get personalized advice for optimizing your greenhouse conditions."
      />

    {isLoadingDevices && (
        <Card className="lg:col-span-2 shadow-lg">
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

    {!isLoadingDevices && devices.length > 0 && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
              <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId} disabled={isLoadingDevices}>
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
            </div>
            {selectedDeviceId ? (
                <AiAssistantForm onSubmit={handleFormSubmit} isLoading={isLoadingAdvice} initialValues={initialFormValues} />
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
