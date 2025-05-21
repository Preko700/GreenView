"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { ImageGrid } from '@/components/media/ImageGrid';
import { getMockDevice, getMockDeviceImages } from '@/data/mockData';
import type { Device, DeviceImage } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Camera, Film, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

export default function MediaPage() {
  const params = useParams();
  const router = useRouter();
  const deviceId = params.deviceId as string;
  const { toast } = useToast();

  const [device, setDevice] = useState<Device | null>(null);
  const [images, setImages] = useState<DeviceImage[]>([]);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isCapturing, setIsCapturing] = useState(false);
  // const [isGeneratingTimelapse, setIsGeneratingTimelapse] = useState(false); // For future use

  useEffect(() => {
    if (deviceId) {
      setIsPageLoading(true);
      const foundDevice = getMockDevice(deviceId);
      const foundImages = getMockDeviceImages(deviceId);
      setDevice(foundDevice || null);
      setImages(foundImages || []);
      setTimeout(() => setIsPageLoading(false), 500);
    }
  }, [deviceId]);

  const handleCaptureImage = async () => {
    setIsCapturing(true);
    // Simulate API call for capturing image
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

  // Placeholder for timelapse generation
  // const handleGenerateTimelapse = async () => {
  //   setIsGeneratingTimelapse(true);
  //   await new Promise(resolve => setTimeout(resolve, 3000));
  //   setIsGeneratingTimelapse(false);
  //   toast({ title: "Timelapse Generated (Mock)", description: "Your timelapse video is ready." });
  // };

  if (isPageLoading) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <div className="flex space-x-2">
            <Skeleton className="h-10 w-32" />
            {/* <Skeleton className="h-10 w-40" /> */}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="aspect-video w-full" />)}
        </div>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="container mx-auto py-8 px-4 md:px-6 text-center">
        <h1 className="text-2xl font-semibold text-destructive">Device not found</h1>
        <p className="text-muted-foreground mt-2">The device with ID '{deviceId}' could not be loaded.</p>
        <Button onClick={() => router.push('/dashboard')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>
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
            {/* Placeholder for Timelapse Button
            <Button onClick={handleGenerateTimelapse} disabled={isGeneratingTimelapse || images.length < 2} variant="outline">
              {isGeneratingTimelapse ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
              Generate Timelapse
            </Button>
            */}
          </div>
        }
      />
      
      {!device.isActive && (
        <div className="mb-6 p-4 border border-yellow-400 bg-yellow-50 text-yellow-700 rounded-md">
          <p>This device is currently inactive. Capturing new images might not be available.</p>
        </div>
       )}

      <ImageGrid images={images} />
    </div>
  );
}
