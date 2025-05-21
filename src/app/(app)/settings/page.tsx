"use client";

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { mockUser, mockDevices, getMockDeviceSettings, mockDeviceSettings } from '@/data/mockData';
import type { User, Device, DeviceSettings } from '@/lib/types';
import { TemperatureUnit } from '@/lib/types';
import { Loader2, Save } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from '@/components/ui/textarea';

const userSettingsSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Invalid email address."),
  country: z.string().min(2, "Country must be at least 2 characters."),
  notificationsEnabled: z.boolean().default(true),
});

const deviceSettingsSchema = z.object({
  measurementInterval: z.coerce.number().min(1).max(60),
  autoIrrigation: z.boolean(),
  irrigationThreshold: z.coerce.number().min(10).max(90),
  autoVentilation: z.boolean(),
  temperatureThreshold: z.coerce.number().min(0).max(50),
  temperatureFanOffThreshold: z.coerce.number().min(0).max(49),
  photoCaptureInterval: z.coerce.number().min(1).max(24),
  temperatureUnit: z.nativeEnum(TemperatureUnit),
});


export default function SettingsPage() {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [currentDeviceSettings, setCurrentDeviceSettings] = useState<DeviceSettings | null>(null);
  
  const [isUserSaving, setIsUserSaving] = useState(false);
  const [isDeviceSaving, setIsDeviceSaving] = useState(false);

  const userForm = useForm<z.infer<typeof userSettingsSchema>>({
    resolver: zodResolver(userSettingsSchema),
    defaultValues: {
      name: '',
      email: '',
      country: '',
      notificationsEnabled: true,
    },
  });

  const deviceForm = useForm<z.infer<typeof deviceSettingsSchema>>({
    resolver: zodResolver(deviceSettingsSchema),
    // Default values will be set when a device is selected
  });

  useEffect(() => {
    // Simulate fetching user and device data
    setUser(mockUser);
    setDevices(mockDevices);
    if (mockDevices.length > 0) {
      setSelectedDeviceId(mockDevices[0].serialNumber);
    }
  }, []);

  useEffect(() => {
    if (user) {
      userForm.reset({
        name: user.name,
        email: user.email,
        country: user.country,
        notificationsEnabled: true, // Mocked
      });
    }
  }, [user, userForm]);

  useEffect(() => {
    if (selectedDeviceId) {
      const settings = getMockDeviceSettings(selectedDeviceId);
      setCurrentDeviceSettings(settings || null);
      if (settings) {
        deviceForm.reset(settings);
      }
    } else {
      setCurrentDeviceSettings(null);
      deviceForm.reset({}); // Reset form if no device selected
    }
  }, [selectedDeviceId, deviceForm]);

  const handleUserSave = async (values: z.infer<typeof userSettingsSchema>) => {
    setIsUserSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("User settings saved:", values);
    setUser(prev => prev ? {...prev, ...values} : null); // Update local state
    setIsUserSaving(false);
    toast({ title: "User Settings Saved", description: "Your profile information has been updated." });
  };

  const handleDeviceSave = async (values: z.infer<typeof deviceSettingsSchema>) => {
    if (!selectedDeviceId) return;
    setIsDeviceSaving(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("Device settings saved for", selectedDeviceId, ":", values);
    // Update mock data (in real app, this would be a backend update and re-fetch)
    mockDeviceSettings[selectedDeviceId] = { ...mockDeviceSettings[selectedDeviceId], ...values, deviceId: selectedDeviceId };
    setCurrentDeviceSettings(prev => prev ? {...prev, ...values} : null);
    setIsDeviceSaving(false);
    toast({ title: "Device Settings Saved", description: `Configuration for device ${selectedDeviceId} updated.` });
  };

  return (
    <div className="container mx-auto py-8 px-4 md:px-6 space-y-8">
      <PageHeader
        title="Settings"
        description="Manage your profile, application preferences, and device configurations."
      />

      {/* User Profile Settings */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>User Profile</CardTitle>
          <CardDescription>Update your personal information.</CardDescription>
        </CardHeader>
        <Form {...userForm}>
          <form onSubmit={userForm.handleSubmit(handleUserSave)}>
            <CardContent className="space-y-4">
              <FormField
                control={userForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input placeholder="Your full name" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={userForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl><Input type="email" placeholder="your@email.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={userForm.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl><Input placeholder="Your country" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={userForm.control}
                name="notificationsEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Enable Notifications</FormLabel>
                      <FormDescription>Receive alerts and updates from your devices.</FormDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isUserSaving}>
                {isUserSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Profile
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

      {/* Device Configuration Settings */}
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
                <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
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
              </div>

              {selectedDeviceId && currentDeviceSettings ? (
                <div className="space-y-4 pt-4 border-t mt-4">
                  <FormField control={deviceForm.control} name="measurementInterval" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Measurement Interval (minutes)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={deviceForm.control} name="photoCaptureInterval" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Photo Capture Interval (hours)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                   <FormField control={deviceForm.control} name="temperatureUnit" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Temperature Unit</FormLabel>
                       <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value={TemperatureUnit.CELSIUS}>Celsius (°C)</SelectItem>
                          <SelectItem value={TemperatureUnit.FAHRENHEIT}>Fahrenheit (°F)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={deviceForm.control} name="autoIrrigation" render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <FormLabel>Auto Irrigation</FormLabel>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )} />
                  {deviceForm.getValues("autoIrrigation") && <FormField control={deviceForm.control} name="irrigationThreshold" render={({ field }) => (
                    <FormItem><FormLabel>Irrigation Threshold (%)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />}
                  <FormField control={deviceForm.control} name="autoVentilation" render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <FormLabel>Auto Ventilation</FormLabel>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )} />
                  {deviceForm.getValues("autoVentilation") && <>
                    <FormField control={deviceForm.control} name="temperatureThreshold" render={({ field }) => (
                      <FormItem><FormLabel>Ventilation Temp On (°{deviceForm.getValues("temperatureUnit") === TemperatureUnit.CELSIUS ? 'C' : 'F'})</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={deviceForm.control} name="temperatureFanOffThreshold" render={({ field }) => (
                      <FormItem><FormLabel>Ventilation Temp Off (°{deviceForm.getValues("temperatureUnit") === TemperatureUnit.CELSIUS ? 'C' : 'F'})</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </>}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">
                  {devices.length > 0 ? "Select a device to configure its settings." : "No devices available to configure."}
                </p>
              )}
            </CardContent>
            {selectedDeviceId && currentDeviceSettings && (
              <CardFooter>
                <Button type="submit" disabled={isDeviceSaving || !deviceForm.formState.isDirty}>
                  {isDeviceSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Device Settings
                </Button>
              </CardFooter>
            )}
          </form>
        </Form>
      </Card>
    </div>
  );
}
