"use client";

import type { DeviceImage } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import Image from 'next/image';
import { format } from 'date-fns';
import { Camera, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ImageGridProps {
  images: DeviceImage[];
}

export function ImageGrid({ images }: ImageGridProps) {
  if (!images.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground border-2 border-dashed border-border rounded-lg p-8">
        <Camera className="h-12 w-12 mb-4" />
        <h3 className="text-xl font-semibold">No Images Yet</h3>
        <p>Images captured by your device will appear here.</p>
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
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-3">
                  <p className="text-xs text-primary-foreground font-medium">
                    {format(new Date(image.timestamp), "MMM d, yyyy HH:mm")}
                  </p>
                  {image.isManualCapture && (
                    <span className="text-xs text-accent-foreground bg-accent/80 px-1.5 py-0.5 rounded-sm absolute top-2 right-2 flex items-center">
                      <Camera className="h-3 w-3 mr-1" /> Manual
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Image Details</DialogTitle>
              <DialogDescription>
                Captured on {format(new Date(image.timestamp), "MMMM d, yyyy 'at' HH:mm:ss")}
                {image.isManualCapture ? " (Manual Capture)" : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 relative aspect-video w-full">
               <Image
                  src={image.imageUrl}
                  alt={`Enlarged greenhouse image ${image.id}`}
                  layout="fill"
                  objectFit="contain"
                  data-ai-hint={image.dataAiHint || "plant greenhouse"}
                />
            </div>
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}
