
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { ImageGrid } from '@/components/media/ImageGrid';
import { getMockDeviceImages } from '@/data/mockData'; // Still using mock for images
import type { Device, DeviceImage } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Camera, Film, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function MediaPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.deviceId as string;
  const { user } = useAuth();
  const { toast } = useToast();

  const [device, setDevice] = useState<Device | null>(null);
  const [images, setImages] = useState<DeviceImage[]>([]);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);

  const fetchDeviceData = useCallback(async () => {
    if (deviceId && user) {
      setIsPageLoading(true);
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
          const foundImages = getMockDeviceImages(deviceId); // Still using mock for images
          setImages(foundImages || []);
        }
      } catch (error) {
        console.error("Error fetching device:", error);
        toast({ title: "Error", description: "Could not load device details.", variant: "destructive"});
        setDevice(null);
      } finally {
        setIsPageLoading(false);
      }
    } else if (!user && deviceId) {
      setIsPageLoading(true);
    }
  }, [deviceId, user, toast]);


  useEffect(() => {
    fetchDeviceData();
  }, [fetchDeviceData]);

  const handleCaptureImage = async () => {
    if (!device || !device.isActive) {
      toast({ title: "Device Offline", description: "Cannot capture image for an inactive device.", variant: "destructive" });
      return;
    }
    setIsCapturing(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    const newImage: DeviceImage = {
      id: `img-${Date.now()}`,
      deviceId: deviceId,
      imageUrl: `https://placehold.co/600x400.png?text=NewCapture-${new Date().toLocaleTimeString()}`,
      dataAiHint: "new capture",
      timestamp: Date.now(),
      isManualCapture: true,
    };
    setImages(prev => [newImage, ...prev]);
    setIsCapturing(false);
    toast({ title: "Image Captured!", description: "The new image has been added to the gallery." });
  };

  if (isPageLoading) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <div className="flex space-x-2"> <Skeleton className="h-10 w-32" /> </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="aspect-video w-full" />)}
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
        title={`Media Gallery: ${device.name}`}
        description={`View images captured by ${device.serialNumber}.`}
        action={
          <div className="flex space-x-2">
            <Button onClick={handleCaptureImage} disabled={isCapturing || !device.isActive} variant="outline">
              {isCapturing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              Capture Image
            </Button>
          </div>
        }
      />
      
      {!device.isActive && (
        <Alert variant="default" className="mb-6 bg-yellow-50 border-yellow-400 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-300">
          <AlertTriangle className="h-4 w-4 !text-yellow-600 dark:!text-yellow-400" />
          <AlertTitle>Device Inactive</AlertTitle>
          <AlertDescription>
            This device is currently inactive. Capturing new images might not be available.
          </AlertDescription>
        </Alert>
       )}

      <ImageGrid images={images} />
    </div>
  );
}
