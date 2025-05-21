"use client";

import { useMemo } from 'react';
import type { SensorData, SensorType } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CartesianGrid, Line, LineChart as RechartsLineChart, XAxis, YAxis } from "recharts";
import { format } from 'date-fns';

interface DataChartProps {
  sensorData: SensorData[];
  sensorType: SensorType;
  title?: string;
}

const sensorTypeToFriendlyName: Record<SensorType, string> = {
  [SensorType.TEMPERATURE]: "Temperature",
  [SensorType.AIR_HUMIDITY]: "Air Humidity",
  [SensorType.SOIL_HUMIDITY]: "Soil Humidity",
  [SensorType.PH]: "pH Level",
  [SensorType.LIGHT]: "Light Intensity",
  [SensorType.WATER_LEVEL]: "Water Level",
  [SensorType.DRAINAGE]: "Drainage Events",
};

export function DataChart({ sensorData, sensorType, title }: DataChartProps) {
  const chartData = useMemo(() => {
    return sensorData
      .sort((a, b) => a.timestamp - b.timestamp) // Ensure data is sorted by time
      .map(data => ({
        time: format(new Date(data.timestamp), "HH:mm"), // Format timestamp for X-axis
        value: data.value,
        fullDate: format(new Date(data.timestamp), "MMM d, HH:mm")
      }));
  }, [sensorData]);

  const chartConfig = {
    value: {
      label: sensorTypeToFriendlyName[sensorType] || "Value",
      color: "hsl(var(--chart-1))",
    },
  } satisfies ChartConfig;
  
  const yAxisDomain = useMemo(() => {
    if (!sensorData || sensorData.length === 0) return [0, 100]; // Default domain
    const values = sensorData.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.1 || 5; // Add 10% padding or 5 if range is 0
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [sensorData]);


  if (!sensorData || sensorData.length === 0) {
    return (
      <Card className="h-[400px] flex items-center justify-center">
        <CardContent>
          <p className="text-muted-foreground">No data available for {sensorTypeToFriendlyName[sensorType]}.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || `${sensorTypeToFriendlyName[sensorType]} Over Time`}</CardTitle>
        <CardDescription>
          Showing data for the last 24 hours (example).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-video h-[300px] w-full">
          <RechartsLineChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
              top: 5,
              bottom: 5,
            }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              // tickFormatter={(value) => value} // Already formatted
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              domain={yAxisDomain}
              tickFormatter={(value) => `${value}${sensorData[0]?.unit || ''}`}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, name, item) => (
                    <>
                      <div className="font-medium">{item.payload.fullDate}</div>
                      <div className="text-muted-foreground">
                        {sensorTypeToFriendlyName[sensorType]}: {value}{sensorData[0]?.unit || ''}
                      </div>
                    </>
                  )}
                />
              }
            />
            <Line
              dataKey="value"
              type="monotone"
              stroke="var(--color-value)"
              strokeWidth={2}
              dot={false}
            />
          </RechartsLineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
