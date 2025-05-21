"use client";

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { AiAssistantForm } from '@/components/ai/AiAssistantForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { provideGreenhouseAdvice, type ProvideGreenhouseAdviceInput, type ProvideGreenhouseAdviceOutput } from '@/ai/flows/greenhouse-ai-assistant';
import { Bot, Zap } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { mockDevices, getMockDevice, getMockSensorData } from '@/data/mockData'; // For pre-filling
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


export default function AiAssistantPage() {
  const [advice, setAdvice] = useState<ProvideGreenhouseAdviceOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [initialFormValues, setInitialFormValues] = useState<Partial<ProvideGreenhouseAdviceInput> | undefined>(undefined);

  useEffect(() => {
    setDevices(mockDevices);
    if (mockDevices.length > 0) {
      setSelectedDeviceId(mockDevices[0].serialNumber);
    }
  }, []);

  useEffect(() => {
    if (selectedDeviceId) {
      const device = getMockDevice(selectedDeviceId);
      const sensorData = getMockSensorData(selectedDeviceId);
      
      const getSensorValue = (type: SensorType): number | undefined => sensorData.find(s => s.type === type)?.value;

      setInitialFormValues({
        temperature: getSensorValue(SensorType.TEMPERATURE),
        airHumidity: getSensorValue(SensorType.AIR_HUMIDITY),
        soilHumidity: getSensorValue(SensorType.SOIL_HUMIDITY),
        lightLevel: getSensorValue(SensorType.LIGHT),
        plantType: device?.plantType,
        location: device?.location,
      });
    } else {
      setInitialFormValues(undefined);
    }
  }, [selectedDeviceId]);


  const handleFormSubmit = async (data: ProvideGreenhouseAdviceInput) => {
    setIsLoading(true);
    setError(null);
    setAdvice(null);
    try {
      const result = await provideGreenhouseAdvice(data);
      setAdvice(result);
    } catch (e) {
      console.error("Error getting AI advice:", e);
      setError(e instanceof Error ? e.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <PageHeader
        title="AI Greenhouse Assistant"
        description="Get personalized advice for optimizing your greenhouse conditions."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Zap className="mr-2 h-6 w-6 text-primary" />
              Input Greenhouse Conditions
            </CardTitle>
            <CardDescription>
              Fill in the current details of your greenhouse environment. 
              {devices.length > 0 && " You can select a device to pre-fill some data."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {devices.length > 0 && (
              <div className="mb-6">
                <Label htmlFor="device-select">Select Device (Optional)</Label>
                <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
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
            )}
            <AiAssistantForm onSubmit={handleFormSubmit} isLoading={isLoading} initialValues={initialFormValues} />
          </CardContent>
        </Card>

        <div className="lg:col-span-1 space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {advice && (
            <Card className="shadow-lg bg-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bot className="mr-2 h-6 w-6 text-primary" />
                  AI Recommendation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground/90 whitespace-pre-wrap">{advice.advice}</p>
              </CardContent>
            </Card>
          )}

          {!advice && !isLoading && !error && (
             <Card className="shadow-md bg-muted/50">
              <CardHeader>
                 <CardTitle className="flex items-center text-muted-foreground">
                    <Bot className="mr-2 h-6 w-6" />
                    Awaiting Input
                 </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Enter your greenhouse conditions in the form to receive personalized advice.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
