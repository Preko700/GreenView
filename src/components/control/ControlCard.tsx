"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import type { ElementType } from 'react';

interface ControlCardProps {
  title: string;
  icon: ElementType;
  isActive: boolean;
  isLoading: boolean;
  onToggle: (active: boolean) => void;
  description?: string;
}

export function ControlCard({ title, icon: Icon, isActive, isLoading, onToggle, description }: ControlCardProps) {
  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <Icon className={`h-6 w-6 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
        </div>
      </CardHeader>
      <CardContent>
        {description && <p className="text-sm text-muted-foreground mb-3">{description}</p>}
        <div className="flex items-center justify-between">
          <Label htmlFor={`control-${title.toLowerCase().replace(/\s+/g, '-')}`} className="text-base">
            Status: <span className={isActive ? "font-semibold text-primary" : "font-semibold text-muted-foreground"}>{isActive ? "ON" : "OFF"}</span>
          </Label>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              id={`control-${title.toLowerCase().replace(/\s+/g, '-')}`}
              checked={isActive}
              onCheckedChange={onToggle}
              aria-label={`Toggle ${title}`}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
