"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import type { ProvideGreenhouseAdviceInput } from "@/ai/flows/greenhouse-ai-assistant";

const formSchema = z.object({
  temperature: z.coerce.number().min(-50, "Too cold").max(100, "Too hot"),
  airHumidity: z.coerce.number().min(0, "Cannot be less than 0").max(100, "Cannot be more than 100"),
  soilHumidity: z.coerce.number().min(0, "Cannot be less than 0").max(100, "Cannot be more than 100"),
  lightLevel: z.coerce.number().min(0, "Cannot be less than 0"),
  plantType: z.string().min(2, "Plant type must be at least 2 characters.").max(50, "Plant type too long."),
  location: z.string().min(2, "Location must be at least 2 characters.").max(100, "Location too long."),
});

interface AiAssistantFormProps {
  onSubmit: (data: ProvideGreenhouseAdviceInput) => Promise<void>;
  isLoading: boolean;
  initialValues?: Partial<ProvideGreenhouseAdviceInput>;
}

export function AiAssistantForm({ onSubmit, isLoading, initialValues }: AiAssistantFormProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      temperature: initialValues?.temperature ?? 25,
      airHumidity: initialValues?.airHumidity ?? 60,
      soilHumidity: initialValues?.soilHumidity ?? 50,
      lightLevel: initialValues?.lightLevel ?? 10000,
      plantType: initialValues?.plantType ?? "",
      location: initialValues?.location ?? "",
    },
  });

  async function handleSubmit(values: z.infer<typeof formSchema>) {
    await onSubmit(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="temperature"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Temperature (°C)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g., 25" {...field} disabled={isLoading} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="airHumidity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Air Humidity (%)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g., 60" {...field} disabled={isLoading} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="soilHumidity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Soil Humidity (%)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g., 50" {...field} disabled={isLoading} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lightLevel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Light Level (lux)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="e.g., 10000" {...field} disabled={isLoading} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="plantType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Plant Type</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Tomatoes, Basil" {...field} disabled={isLoading} />
              </FormControl>
              <FormDescription>
                Specify the type of plant(s) you are growing.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Greenhouse Location</FormLabel>
              <FormControl>
                <Input placeholder="e.g., California, USA or Backyard Garden" {...field} disabled={isLoading} />
              </FormControl>
              <FormDescription>
                The geographical location or specific area of your greenhouse.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full md:w-auto" disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Get Advice
        </Button>
      </form>
    </Form>
  );
}
