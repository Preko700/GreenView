
"use client";

import type { DeviceImage } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { format } from 'date-fns';
import { Camera, Upload, Info, Film } from 'lucide-react'; // Added Upload icon
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';

interface ImageGridProps {
  images: DeviceImage[];
}

export function ImageGrid({ images }: ImageGridProps) {
  if (!images.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center text-muted-foreground border-2 border-dashed border-border rounded-lg p-8">
        <Film className="h-16 w-16 mb-4 text-gray-400" />
        <h3 className="text-xl font-semibold mb-2">No Images Yet</h3>
        <p className="max-w-xs">Use &quot;Simulate Capture&quot; to add placeholder images or &quot;Upload Image&quot; to add your own (stored locally in browser).</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {images.map((image) => (
        <Dialog key={image.id}>
          <DialogTrigger asChild>
            <Card className="overflow-hidden cursor-pointer group hover:shadow-xl transition-shadow">
              <CardContent className="p-0 aspect-video relative">
                <Image
                  src={image.imageUrl}
                  alt={`Greenhouse image ${image.id}`}
                  layout="fill"
                  objectFit="cover"
                  className="group-hover:scale-105 transition-transform duration-300"
                  data-ai-hint={image.dataAiHint || "plant greenhouse"}
                  unoptimized={image.imageUrl.startsWith('data:image')} // Unoptimize for data URLs
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-3">
                  <p className="text-xs text-primary-foreground font-medium">
                    {format(new Date(image.timestamp), "MMM d, yyyy HH:mm")}
                  </p>
                  {image.source === 'capture' && (
                    <span className="text-xs text-accent-foreground bg-accent/80 px-1.5 py-0.5 rounded-sm absolute top-2 right-2 flex items-center">
                      <Camera className="h-3 w-3 mr-1" /> Simulated
                    </span>
                  )}
                  {image.source === 'upload' && (
                     <span className="text-xs text-primary-foreground bg-primary/80 px-1.5 py-0.5 rounded-sm absolute top-2 right-2 flex items-center">
                      <Upload className="h-3 w-3 mr-1" /> Uploaded
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[700px] md:max-w-[800px] lg:max-w-[900px]">
            <DialogHeader>
              <DialogTitle>Image Preview</DialogTitle>
              <DialogDescription>
                {image.source === 'upload' ? 'Uploaded from your computer on ' : 'Simulated capture on '} 
                {format(new Date(image.timestamp), "MMMM d, yyyy 'at' HH:mm:ss")}.
                {(image.source === 'upload') && <span className="block text-xs text-muted-foreground mt-1">This image is stored locally in your browser.</span>}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 relative aspect-video w-full max-h-[70vh]">
               <Image
                  src={image.imageUrl}
                  alt={`Enlarged greenhouse image ${image.id}`}
                  layout="fill"
                  objectFit="contain"
                  data-ai-hint={image.dataAiHint || "plant greenhouse"}
                  unoptimized={image.imageUrl.startsWith('data:image')}
                />
            </div>
            <DialogFooter className="mt-2">
                <Button variant="outline" onClick={(e) => {
                    const dialogTrigger = (e.target as HTMLElement).closest('[role="dialog"]')?.querySelector('[aria-expanded="true"]');
                    if (dialogTrigger) (dialogTrigger as HTMLElement).click();
                }}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}
