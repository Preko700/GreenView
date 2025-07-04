
"use client";

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import type { User, Device, DeviceSettings } from '@/lib/types';
import { TemperatureUnit } from '@/lib/types';
import { Loader2, Save, PlusCircle, AlertTriangle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type SubmitHandler } from "react-hook-form";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UsbDeviceConnector } from '@/components/settings/UsbDeviceConnector';

const userSettingsSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Invalid email address.").toLowerCase(),
  notificationsEnabled: z.boolean().default(true),
});

const deviceRegistrationSchema = z.object({
  serialNumber: z.string().min(3, "Serial number must be at least 3 characters."),
  hardwareIdentifier: z.string().optional(),
  name: z.string().min(3, "Device name must be at least 3 characters."),
  plantType: z.string().optional(),
  location: z.string().optional(),
  isPoweredByBattery: z.boolean().default(false),
});

const deviceSettingsSchema = z.object({
  measurementInterval: z.coerce.number().min(1, "Min 1").max(60, "Max 60"),
  autoIrrigation: z.boolean(),
  irrigationThreshold: z.coerce.number().min(10, "Min 10").max(90, "Max 90"),
  autoVentilation: z.boolean(),
  temperatureThreshold: z.coerce.number().min(0, "Min 0").max(50, "Max 50"),
  temperatureFanOffThreshold: z.coerce.number().min(0, "Min 0").max(49, "Max 49"),
  photoCaptureInterval: z.coerce.number().min(1, "Min 1").max(24, "Max 24"),
  temperatureUnit: z.nativeEnum(TemperatureUnit),
}).refine(data => data.temperatureFanOffThreshold < data.temperatureThreshold, {
    message: "Ventilation Temp Off must be less than Temp On threshold.",
    path: ["temperatureFanOffThreshold"],
});


export default function SettingsPage() {
  const { toast } = useToast();
  const { user: authUser, setUser } = useAuth(); 
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [currentDeviceSettings, setCurrentDeviceSettings] = useState<DeviceSettings | null>(null);
  
  const [isUserSaving, setIsUserSaving] = useState(false);
  const [isDeviceRegistering, setIsDeviceRegistering] = useState(false);
  const [isDeviceSettingsLoading, setIsDeviceSettingsLoading] = useState(false);
  const [isDeviceSaving, setIsDeviceSaving] = useState(false);
  const [isDevicesLoading, setIsDevicesLoading] = useState(true);
  const [dbSchemaError, setDbSchemaError] = useState<string | null>(null);
  const [settingsLastUpdatedTimestamp, setSettingsLastUpdatedTimestamp] = useState<number | null>(null);


  const userForm = useForm<z.infer<typeof userSettingsSchema>>({
    resolver: zodResolver(userSettingsSchema),
    defaultValues: { name: '', email: '', notificationsEnabled: true },
  });

  const deviceRegistrationForm = useForm<z.infer<typeof deviceRegistrationSchema>>({
    resolver: zodResolver(deviceRegistrationSchema),
    defaultValues: { serialNumber: '', hardwareIdentifier: '', name: '', plantType: '', location: '', isPoweredByBattery: false },
  });

  const deviceForm = useForm<z.infer<typeof deviceSettingsSchema>>({
    resolver: zodResolver(deviceSettingsSchema),
    defaultValues: { 
        measurementInterval: 5,
        autoIrrigation: true,
        irrigationThreshold: 30,
        autoVentilation: true,
        temperatureThreshold: 30,
        temperatureFanOffThreshold: 28,
        photoCaptureInterval: 6,
        temperatureUnit: TemperatureUnit.CELSIUS,
    }
  });

  useEffect(() => {
    if (authUser) { 
      userForm.reset({
        name: authUser?.name || '',
        email: authUser?.email || '',
        notificationsEnabled: true, 
      });
    }
  }, [userForm, authUser]);

  const fetchDevices = useCallback(async () => {
    if (!authUser) return;
    setIsDevicesLoading(true);
    setDbSchemaError(null); 
    try {
      const response = await fetch(`/api/devices?userId=${authUser.id}`);
      const data = await response.json();
      if (!response.ok) {
        const errorMessage = data.message || 'Failed to fetch devices';
        setDbSchemaError(errorMessage);
        throw new Error(errorMessage);
      }
      setDevices(data);
      if (data.length > 0 && (!selectedDeviceId || !data.find(d => d.serialNumber === selectedDeviceId))) {
        setSelectedDeviceId(data[0].serialNumber);
      } else if (data.length === 0) {
        setSelectedDeviceId(undefined);
        setCurrentDeviceSettings(null); 
        deviceForm.reset();
      }
    } catch (error: any) {
      console.error("Error fetching devices:", error.message);
    } finally {
      setIsDevicesLoading(false);
    }
  }, [authUser, deviceForm, selectedDeviceId]);
  
  useEffect(() => {
    if (authUser) {
      fetchDevices();
    }
  }, [authUser, fetchDevices]);


  useEffect(() => {
    const fetchDeviceSettings = async () => {
      if (selectedDeviceId && authUser) {
        setIsDeviceSettingsLoading(true);
        setCurrentDeviceSettings(null); 
        try {
          const response = await fetch(`/api/device-settings/${selectedDeviceId}?userId=${authUser.id}`);
          if (!response.ok) {
             let errorMsg = `Failed to fetch settings for ${selectedDeviceId}.`;
             try {
                const errorData = await response.json();
                errorMsg = errorData.message || errorMsg;
             } catch(e) {
                errorMsg = `Failed to fetch settings, server returned non-JSON response.`;
             }
             throw new Error(errorMsg);
          }
          const data: DeviceSettings = await response.json();
          setCurrentDeviceSettings(data);
          deviceForm.reset(data);

        } catch (error: any) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
          deviceForm.reset();
        } finally {
          setIsDeviceSettingsLoading(false);
        }
      }
    };
    
    if (selectedDeviceId) {
        fetchDeviceSettings();
    } else {
        setCurrentDeviceSettings(null);
        deviceForm.reset();
    }
  }, [selectedDeviceId, authUser, toast, deviceForm]);

  const handleUserSave = async (values: z.infer<typeof userSettingsSchema>) => {
    setIsUserSaving(true);
    // This is a mock save. In a real app, this would be an API call.
    const updatedUser = { ...authUser, ...values } as User;
    setUser(updatedUser); // Update user in AuthContext
    localStorage.setItem('greenview_user_session', JSON.stringify(updatedUser)); // Update localStorage
    setIsUserSaving(false);
    toast({ title: "User Settings Saved", description: "Your profile information has been updated." });
  };

  const handleDeviceRegister: SubmitHandler<z.infer<typeof deviceRegistrationSchema>> = async (values) => {
    if (!authUser) {
        toast({ title: "Error", description: "You must be logged in to register a device.", variant: "destructive" });
        return;
    }
    setIsDeviceRegistering(true);
    try {
      const response = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, userId: authUser.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to register device');
      
      toast({ title: "Device Registered", description: `${data.device.name} has been added.` });
      deviceRegistrationForm.reset();
      await fetchDevices(); 
      setSelectedDeviceId(data.device.serialNumber); 
    } catch (error: any) {
      toast({ title: "Registration Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsDeviceRegistering(false);
    }
  };

  const handleDeviceSave = async (values: z.infer<typeof deviceSettingsSchema>) => {
    if (!selectedDeviceId || !authUser) return;
    setIsDeviceSaving(true);
    try {
        const response = await fetch(`/api/device-settings/${selectedDeviceId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...values, userId: authUser.id }), 
        });
        const data = await response.json();
         if (!response.ok) {
             throw new Error(data.message || 'Failed to save device settings');
         }
        
        toast({ title: "Device Settings Saved", description: `Configuration for ${selectedDeviceId} updated.` });
        setCurrentDeviceSettings(data.settings); 
        deviceForm.reset(data.settings); 
        
        const newTimestamp = Date.now();
        setSettingsLastUpdatedTimestamp(newTimestamp);

    } catch (error: any) {
        toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    } finally {
        setIsDeviceSaving(false);
    }
  };
  
  if (dbSchemaError) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 space-y-8">
        <PageHeader
          title="Settings"
          description="Manage your profile, devices, and their configurations."
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
    <div className="container mx-auto py-8 px-4 md:px-6 space-y-8">
      <PageHeader
        title="Settings"
        description="Manage your profile, devices, and their configurations."
      />

      <UsbDeviceConnector settingsLastUpdatedTimestamp={settingsLastUpdatedTimestamp} />

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>User Profile</CardTitle>
          <CardDescription>Update your personal information.</CardDescription>
        </CardHeader>
        {userForm.formState.defaultValues?.email ? ( 
          <Form {...userForm}>
            <form onSubmit={userForm.handleSubmit(handleUserSave)}>
              <CardContent className="space-y-4">
                <FormField control={userForm.control} name="name" render={({ field }) => ( <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input placeholder="Your full name" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={userForm.control} name="email" render={({ field }) => ( <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input type="email" placeholder="your@email.com" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={userForm.control} name="notificationsEnabled" render={({ field }) => ( <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"> <div className="space-y-0.5"> <FormLabel>Enable Notifications</FormLabel> <FormDescription>Receive alerts and updates from your devices.</FormDescription> </div> <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl> </FormItem>)} />
              </CardContent>
              <CardFooter> <Button type="submit" disabled={isUserSaving}> {isUserSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Profile </Button> </CardFooter>
            </form>
          </Form>
        ) : <CardContent><Skeleton className="h-60 w-full" /></CardContent> }
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Register New Device</CardTitle>
          <CardDescription>Add a new greenhouse device to your account.</CardDescription>
        </CardHeader>
        <Form {...deviceRegistrationForm}>
          <form onSubmit={deviceRegistrationForm.handleSubmit(handleDeviceRegister)}>
            <CardContent className="space-y-4">
              <FormField control={deviceRegistrationForm.control} name="serialNumber" render={({ field }) => ( <FormItem><FormLabel>Serial Number</FormLabel><FormControl><Input placeholder="Device Serial Number (e.g., GH-00X)" {...field} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={deviceRegistrationForm.control} name="hardwareIdentifier" render={({ field }) => ( <FormItem><FormLabel>Hardware Identifier (Optional)</FormLabel><FormControl><Input placeholder="Auto-generated if left blank" {...field} /></FormControl><FormDescription>Unique ID for the physical device. Leave blank to auto-generate.</FormDescription><FormMessage /></FormItem> )}/>
              <FormField control={deviceRegistrationForm.control} name="name" render={({ field }) => ( <FormItem><FormLabel>Device Name</FormLabel><FormControl><Input placeholder="e.g., My Balcony Garden" {...field} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={deviceRegistrationForm.control} name="plantType" render={({ field }) => ( <FormItem><FormLabel>Plant Type (Optional)</FormLabel><FormControl><Input placeholder="e.g., Tomatoes, Herbs" {...field} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={deviceRegistrationForm.control} name="location" render={({ field }) => ( <FormItem><FormLabel>Location (Optional)</FormLabel><FormControl><Input placeholder="e.g., Backyard, Kitchen Window" {...field} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={deviceRegistrationForm.control} name="isPoweredByBattery" render={({ field }) => ( <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"> <div className="space-y-0.5"> <FormLabel>Powered by Battery</FormLabel> </div> <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl> </FormItem> )}/>
            </CardContent>
            <CardFooter> <Button type="submit" disabled={isDeviceRegistering}> {isDeviceRegistering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />} Register Device </Button> </CardFooter>
          </form>
        </Form>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Device Configuration</CardTitle>
          <CardDescription>Adjust settings for your selected greenhouse device.</CardDescription>
        </CardHeader>
        <Form {...deviceForm}>
          <form onSubmit={deviceForm.handleSubmit(handleDeviceSave)}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="device-select">Select Device</Label>
                {isDevicesLoading ? <Skeleton className="h-10 w-full md:w-[280px]" /> :
                  devices.length > 0 ? (
                    <Select value={selectedDeviceId || ""} onValueChange={setSelectedDeviceId} disabled={isDevicesLoading || isDeviceSettingsLoading}>
                      <SelectTrigger id="device-select" className="w-full md:w-[280px]">
                        <SelectValue placeholder="Select a device" />
                      </SelectTrigger>
                      <SelectContent>
                        {devices.map(device => (
                          <SelectItem key={device.serialNumber} value={device.serialNumber}>
                            {device.name} ({device.serialNumber})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">No devices registered. Add a device above to configure it.</p>
                  )
                }
              </div>

              {selectedDeviceId && isDeviceSettingsLoading && <CardContent><Skeleton className="h-96 w-full mt-4" /></CardContent>}
              
              {selectedDeviceId && !isDeviceSettingsLoading && currentDeviceSettings && (
                <div className="space-y-4 pt-4 border-t mt-4">
                  <FormField control={deviceForm.control} name="measurementInterval" render={({ field }) => ( <FormItem> <FormLabel>Measurement Interval (minutes)</FormLabel> <FormControl><Input type="number" {...field} /></FormControl> <FormDescription>How often sensors report data (1-60 min).</FormDescription> <FormMessage /> </FormItem> )}/>
                  <FormField control={deviceForm.control} name="photoCaptureInterval" render={({ field }) => ( <FormItem> <FormLabel>Photo Capture Interval (hours)</FormLabel> <FormControl><Input type="number" {...field} /></FormControl> <FormDescription>How often photos are taken (1-24 hours).</FormDescription> <FormMessage /> </FormItem> )}/>
                  <FormField control={deviceForm.control} name="temperatureUnit" render={({ field }) => ( <FormItem> <FormLabel>Temperature Unit</FormLabel> <Select onValueChange={field.onChange} value={field.value || TemperatureUnit.CELSIUS}> <FormControl><SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger></FormControl> <SelectContent> <SelectItem value={TemperatureUnit.CELSIUS}>Celsius (°C)</SelectItem> <SelectItem value={TemperatureUnit.FAHRENHEIT}>Fahrenheit (°F)</SelectItem> </SelectContent> </Select> <FormMessage /> </FormItem> )}/>
                  
                  <FormField control={deviceForm.control} name="autoIrrigation" render={({ field }) => ( <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"> <FormLabel>Auto Irrigation</FormLabel> <FormControl><Switch checked={field.value} onCheckedChange={(checked) => { field.onChange(checked); deviceForm.trigger("irrigationThreshold"); }} /></FormControl> </FormItem> )}/>
                  {deviceForm.watch("autoIrrigation") && <FormField control={deviceForm.control} name="irrigationThreshold" render={({ field }) => ( <FormItem><FormLabel>Irrigation Threshold (%)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormDescription>Water when soil humidity drops below this (10-90%).</FormDescription><FormMessage /></FormItem> )}/>}
                  
                  <FormField control={deviceForm.control} name="autoVentilation" render={({ field }) => ( <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"> <FormLabel>Auto Ventilation</FormLabel> <FormControl><Switch checked={field.value} onCheckedChange={(checked) => { field.onChange(checked); deviceForm.trigger(["temperatureThreshold", "temperatureFanOffThreshold"]); }} /></FormControl> </FormItem> )}/>
                  {deviceForm.watch("autoVentilation") && <>
                    <FormField control={deviceForm.control} name="temperatureThreshold" render={({ field }) => ( <FormItem><FormLabel>Ventilation Temp On (°{deviceForm.getValues("temperatureUnit") === TemperatureUnit.CELSIUS ? 'C' : 'F'})</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormDescription>Turn fan ON above this temp (0-50).</FormDescription><FormMessage /></FormItem> )}/>
                    <FormField control={deviceForm.control} name="temperatureFanOffThreshold" render={({ field }) => ( <FormItem><FormLabel>Ventilation Temp Off (°{deviceForm.getValues("temperatureUnit") === TemperatureUnit.CELSIUS ? 'C' : 'F'})</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormDescription>Turn fan OFF below this temp (0-49).</FormDescription><FormMessage /></FormItem> )}/>
                  </>}
                </div>
              )}
              
              {!selectedDeviceId && devices.length > 0 && !isDevicesLoading && (
                <CardContent><p className="text-muted-foreground text-center py-4">Select a device to configure its settings.</p></CardContent>
              )}
               {!selectedDeviceId && devices.length === 0 && !isDevicesLoading && (
                <CardContent><p className="text-muted-foreground text-center py-4">No devices registered. Add one above.</p></CardContent>
              )}

            </CardContent>
            {selectedDeviceId && !isDeviceSettingsLoading && currentDeviceSettings && (
              <CardFooter>
                <Button type="submit" disabled={isDeviceSaving || !deviceForm.formState.isDirty}>
                  {isDeviceSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="mr-2 h-4 w-4" /> Save Device Settings
                </Button>
              </CardFooter>
            )}
          </form>
        </Form>
      </Card>
    </div>
  );
}
