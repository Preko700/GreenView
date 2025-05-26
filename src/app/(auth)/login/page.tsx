
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { Loader2, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { EmailPasswordCredentials } from '@/lib/types';

const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(1, { message: "Password is required (any password will work for this demo)." }),
});

export default function LoginPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, isLoading: authIsLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const handleEmailSignIn = async (values: z.infer<typeof loginSchema>) => {
    setIsSubmitting(true);
    try {
      await login(values);
      // Navigation is handled by the login function in AuthContext
    } catch (error: any) {
      // This basic login shouldn't throw errors unless there's an unexpected issue
      console.error("Login error:", error);
      toast({ title: "Login Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const currentLoading = isSubmitting || authIsLoading;

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="items-center text-center">
        <Logo className="h-12 w-12" />
        <CardTitle className="mt-2 text-2xl">Welcome Back to GreenView</CardTitle>
        <CardDescription>Sign in to continue to your dashboard. (Any email/password will work)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleEmailSignIn)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="your@email.com" {...field} disabled={currentLoading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} disabled={currentLoading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={currentLoading}>
              {currentLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Sign in with Email
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex-col items-center">
        <p className="text-sm text-muted-foreground">
          This is a simplified login. No account creation needed.
        </p>
      </CardFooter>
    </Card>
  );
}
