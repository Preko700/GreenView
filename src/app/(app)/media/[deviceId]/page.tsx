
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { ImageGrid } from '@/components/media/ImageGrid';
// getMockDeviceImages is removed as we are managing images in state
import type { Device, DeviceImage } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Camera, Upload, Loader2, AlertTriangle, Film } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle as UiAlertTitle } from '@/components/ui/alert'; // For device inactive warning

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
  const [isUploading, setIsUploading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDeviceData = useCallback(async () => {
    if (deviceId && user) {
      setIsPageLoading(true);
      setFetchError(null);
      try {
        const res = await fetch(`/api/devices/${deviceId}?userId=${user.id}`);
        if (!res.ok) {
            let errorMsg = `Failed to fetch device. Status: ${res.status}`;
            if (res.status === 404) errorMsg = "Device not found or you're not authorized for this user.";
            else {
                try { const data = await res.json(); errorMsg = data.message || errorMsg;}
                catch { errorMsg = `Failed to fetch device details and parse error. Status: ${res.status}`;}
            }
            throw new Error(errorMsg);
        }
        const fetchedDevice: Device = await res.json();
        setDevice(fetchedDevice);
        // Initialize with some mock images or an empty array if no backend for images yet
        // For now, let's start with a few placeholders if desired, or empty.
        // If you had mockDeviceImages['GH-001'], you could use that:
        // const foundImages = mockDeviceImages[deviceId] || [];
        // setImages(foundImages);
        // For now, start empty and let user upload or "capture"
        setImages([]); 
        
      } catch (error: any) {
        console.error("Error fetching device:", error);
        const specificMessage = error.message || "Could not load device details.";
        toast({ title: "Error Loading Data", description: specificMessage, variant: "destructive"});
        setFetchError(specificMessage);
        setDevice(null);
      } finally {
        setIsPageLoading(false);
      }
    } else if (!user && deviceId) {
      setIsPageLoading(true);
    } else if (!deviceId) {
        setIsPageLoading(false);
        setFetchError("No device ID specified in the URL.");
    }
  }, [deviceId, user, toast]);


  useEffect(() => {
    fetchDeviceData();
  }, [fetchDeviceData]);

  const handleSimulatedCaptureImage = async () => {
    if (!device) return;
    // if (!device.isActive) { // We can allow "capturing" placeholders even if offline
    //   toast({ title: "Device Offline", description: "Simulating capture for an inactive device.", variant: "default" });
    // }
    setIsCapturing(true);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate delay
    const newImage: DeviceImage = {
      id: `simcap-${Date.now()}`,
      deviceId: deviceId,
      imageUrl: `https://placehold.co/600x400.png?text=SimCapture-${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      dataAiHint: "simulated capture",
      timestamp: Date.now(),
      isManualCapture: true, // or a new flag like 'isSimulatedCapture'
      source: 'capture',
    };
    setImages(prev => [newImage, ...prev].sort((a,b) => b.timestamp - a.timestamp));
    setIsCapturing(false);
    toast({ title: "Image Captured (Simulated)!", description: "The new image has been added to the gallery." });
  };

  const handleTriggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        toast({ title: "Invalid File", description: "Please select an image file.", variant: "destructive" });
        return;
    }
    // Reset file input to allow uploading the same file again if needed
    if (fileInputRef.current) fileInputRef.current.value = "";


    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newImage: DeviceImage = {
          id: `upload-${Date.now()}-${file.name}`,
          deviceId: deviceId,
          imageUrl: reader.result as string, // Data URL
          dataAiHint: "uploaded image", // You might want to derive hints from filename or use AI later
          timestamp: Date.now(),
          isManualCapture: false, // Or true, depending on definition. Let's say false for uploads.
          source: 'upload',
        };
        setImages(prev => [newImage, ...prev].sort((a,b) => b.timestamp - a.timestamp));
        toast({ title: "Image Uploaded", description: `${file.name} has been added to the gallery (client-side).` });
      };
      reader.onerror = () => {
        console.error("Error reading file for upload:", reader.error);
        toast({ title: "Upload Failed", description: "Could not read the selected file.", variant: "destructive" });
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      console.error("Error processing upload:", error);
      toast({ title: "Upload Error", description: error.message || "An unexpected error occurred during upload.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };


  if (isPageLoading) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
        <div className="flex justify-between items-center">
            <Skeleton className="h-10 w-3/5" />
            <div className="flex space-x-2"> <Skeleton className="h-10 w-32" /> <Skeleton className="h-10 w-32" /></div>
        </div>
         <Skeleton className="h-6 w-2/5" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="aspect-video w-full" />)}
        </div>
      </div>
    );
  }

  if (fetchError && !device) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 text-center">
        <Card className="max-w-md mx-auto mt-8">
            <CardHeader> <AlertTriangle className="h-12 w-12 text-destructive mx-auto" /> <CardTitle className="text-2xl text-destructive">Could Not Load Media Page</CardTitle> </CardHeader>
            <CardContent>
                <Alert variant="destructive" className="text-left"> <UiAlertTitle>Error Details</UiAlertTitle> <AlertDescription> <p>{fetchError}</p> <p className="mt-2">Please try refreshing or select a different device from the dashboard.</p> </AlertDescription> </Alert>
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
            <CardHeader> <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto" /> <CardTitle className="text-2xl">Device Not Available</CardTitle> </CardHeader>
            <CardContent> <p className="text-muted-foreground mt-2">The media page could not be loaded. Please select a device from the dashboard.</p> <Button onClick={() => router.push('/dashboard')} className="mt-6"> <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard </Button> </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <PageHeader
        title={`Media Gallery: ${device.name}`}
        description={`View and manage images for ${device.serialNumber}. Uploaded images are stored client-side.`}
        action={
          <div className="flex items-center space-x-2">
            <Button onClick={handleSimulatedCaptureImage} disabled={isCapturing || isUploading} variant="outline">
              {isCapturing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              Simulate Capture
            </Button>
            <Button onClick={handleTriggerUpload} disabled={isUploading || isCapturing} variant="outline">
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload Image
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
              disabled={isUploading || isCapturing}
            />
          </div>
        }
      />
      
      {!device.isActive && ( // You might want to keep this or adjust logic if uploads should be disabled for inactive devices.
        <Alert variant="default" className="mb-6 bg-yellow-50 border-yellow-400 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-300">
          <AlertTriangle className="h-4 w-4 !text-yellow-600 dark:!text-yellow-400" />
          <UiAlertTitle>Device Currently Inactive</UiAlertTitle>
          <AlertDescription>
            This device is currently marked as inactive. Simulated captures are still possible. Uploaded images are managed locally in your browser.
          </AlertDescription>
        </Alert>
       )}

      <ImageGrid images={images} />
    </div>
  );
}
