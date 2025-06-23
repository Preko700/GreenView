
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { ImageGrid } from '@/components/media/ImageGrid';
import type { Device, DeviceImage } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Camera, Upload, Loader2, AlertTriangle, Film, PlayCircle, Download } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle as UiAlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import GIF from 'gif.js';


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

  const [isGeneratingTimelapse, setIsGeneratingTimelapse] = useState(false);
  const [timelapseUrl, setTimelapseUrl] = useState<string | null>(null);
  const [timelapseError, setTimelapseError] = useState<string | null>(null);
  const [showTimelapseDialog, setShowTimelapseDialog] = useState(false);

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
    setIsCapturing(true);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate delay
    const newImage: DeviceImage = {
      id: `simcap-${Date.now()}`,
      deviceId: deviceId,
      imageUrl: `https://placehold.co/600x400.png?text=SimCap-${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      dataAiHint: "simulated capture",
      timestamp: Date.now(),
      isManualCapture: true, 
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
    if (fileInputRef.current) fileInputRef.current.value = "";

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newImage: DeviceImage = {
          id: `upload-${Date.now()}-${file.name}`,
          deviceId: deviceId,
          imageUrl: reader.result as string, 
          dataAiHint: "uploaded image", 
          timestamp: Date.now(),
          isManualCapture: false, 
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

  const handleGenerateTimelapse = async () => {
    if (images.length < 2) {
      toast({ title: "Not Enough Images", description: "You need at least two images to generate a timelapse.", variant: "destructive" });
      return;
    }

    setIsGeneratingTimelapse(true);
    setTimelapseUrl(null);
    setTimelapseError(null);
    setShowTimelapseDialog(true);

    try {
      const sortedImages = [...images].sort((a, b) => a.timestamp - b.timestamp);
      
      const firstImageElement = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        if (!sortedImages[0].imageUrl.startsWith('data:')) {
            img.crossOrigin = "anonymous";
        }
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(new Error('Failed to load the first image for timelapse.'));
        img.src = sortedImages[0].imageUrl;
      });

      const MAX_DIMENSION = 480;
      let frameWidth = firstImageElement.naturalWidth;
      let frameHeight = firstImageElement.naturalHeight;

      if (frameWidth > MAX_DIMENSION || frameHeight > MAX_DIMENSION) {
        if (frameWidth > frameHeight) {
          frameHeight = Math.round(frameHeight * (MAX_DIMENSION / frameWidth));
          frameWidth = MAX_DIMENSION;
        } else {
          frameWidth = Math.round(frameWidth * (MAX_DIMENSION / frameHeight));
          frameHeight = MAX_DIMENSION;
        }
      }
      
      const gif = new GIF({
        workers: 2,
        quality: 15,
        width: frameWidth,
        height: frameHeight
      });

      gif.on('finished', (blob) => {
        const url = URL.createObjectURL(blob);
        setTimelapseUrl(url);
        setIsGeneratingTimelapse(false);
      });
      
      gif.on('abort', () => {
         setTimelapseError("Timelapse generation was aborted.");
         setIsGeneratingTimelapse(false);
      });

      for (const deviceImage of sortedImages) {
        await new Promise<void>((resolveFrame) => {
          const img = new window.Image();
          if (!deviceImage.imageUrl.startsWith('data:')) {
            img.crossOrigin = "anonymous";
          }
          img.onload = () => {
            gif.addFrame(img, { delay: 300, copy: true });
            resolveFrame();
          };
          img.onerror = (err) => {
            console.error("Error loading image for timelapse frame, skipping:", deviceImage.imageUrl, err);
            resolveFrame(); // Skip broken frames
          };
          img.src = deviceImage.imageUrl;
        });
      }

      gif.render();

    } catch (error: any) {
      console.error("Error setting up timelapse generation:", error);
      const errorMessage = error.message || "An unknown error occurred while generating the timelapse.";
      setTimelapseError(errorMessage);
      toast({ title: "Timelapse Error", description: errorMessage, variant: "destructive" });
      setIsGeneratingTimelapse(false);
    }
  };


  if (isPageLoading) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
        <div className="flex justify-between items-center">
            <Skeleton className="h-10 w-3/5" />
            <div className="flex space-x-2"> <Skeleton className="h-10 w-32" /> <Skeleton className="h-10 w-32" /> <Skeleton className="h-10 w-40" /></div>
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
        description={`View images for ${device.serialNumber}. Upload or simulate captures. Generate a timelapse.`}
        action={
          <div className="flex items-center space-x-2">
            <Button onClick={handleSimulatedCaptureImage} disabled={isCapturing || isUploading || isGeneratingTimelapse} variant="outline">
              {isCapturing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              Simulate Capture
            </Button>
            <Button onClick={handleTriggerUpload} disabled={isUploading || isCapturing || isGeneratingTimelapse} variant="outline">
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload Image
            </Button>
            <Button onClick={handleGenerateTimelapse} disabled={isGeneratingTimelapse || images.length < 2} variant="default">
              {isGeneratingTimelapse ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              Generate Timelapse
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
              disabled={isUploading || isCapturing || isGeneratingTimelapse}
            />
          </div>
        }
      />
      
      {!device.isActive && (
        <Alert variant="default" className="mb-6 bg-yellow-50 border-yellow-400 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-300">
          <AlertTriangle className="h-4 w-4 !text-yellow-600 dark:!text-yellow-400" />
          <UiAlertTitle>Device Currently Inactive</UiAlertTitle>
          <AlertDescription>
            This device is currently marked as inactive. Simulated captures and uploads are still possible.
          </AlertDescription>
        </Alert>
       )}

      <ImageGrid images={images} />

      <Dialog open={showTimelapseDialog} onOpenChange={setShowTimelapseDialog}>
        <DialogContent className="sm:max-w-md md:max-w-lg lg:max-w-xl">
          <DialogHeader>
            <DialogTitle>Timelapse Preview</DialogTitle>
            <DialogDescription>
              {isGeneratingTimelapse && "Generating your timelapse, please wait..."}
              {timelapseUrl && "Your timelapse is ready!"}
              {timelapseError && "Failed to generate timelapse."}
            </DialogDescription>
          </DialogHeader>
          <div className="my-4 flex items-center justify-center">
            {isGeneratingTimelapse && <Loader2 className="h-16 w-16 animate-spin text-primary" />}
            {timelapseUrl && !isGeneratingTimelapse && (
              <Image 
                src={timelapseUrl} 
                alt="Generated Timelapse" 
                width={480} 
                height={360} 
                className="rounded-md border" 
                unoptimized 
              />
            )}
            {timelapseError && !isGeneratingTimelapse && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <UiAlertTitle>Error</UiAlertTitle>
                <AlertDescription>{timelapseError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter className="sm:justify-between">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Close
              </Button>
            </DialogClose>
            {timelapseUrl && !isGeneratingTimelapse && (
              <Button asChild>
                <a href={timelapseUrl} download={`timelapse-${deviceId}-${Date.now()}.gif`}>
                  <Download className="mr-2 h-4 w-4" /> Download GIF
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
