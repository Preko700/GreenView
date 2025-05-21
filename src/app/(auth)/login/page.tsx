
"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { Loader2, LogIn, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
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
  password: z.string().min(1, { message: "Password is required." }),
});

export default function LoginPage() {
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const { signInWithGoogle, signInWithMicrosoft, signInWithFacebook, signInWithTwitter, signInWithEmail, isLoading: authIsLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const handleOAuthSignIn = async (signInMethod: () => Promise<void>, providerName: string) => {
    setIsOAuthLoading(true);
    try {
      await signInMethod();
      toast({ title: "Login Successful", description: `Welcome back via ${providerName}!` });
      router.push('/dashboard');
    } catch (error: any) {
      handleAuthError(error, `${providerName} Login Failed`);
    } finally {
      setIsOAuthLoading(false);
    }
  };

  const handleEmailSignIn = async (values: z.infer<typeof loginSchema>) => {
    setIsEmailLoading(true);
    try {
      await signInWithEmail(values);
      toast({ title: "Login Successful", description: "Welcome back!" });
      router.push('/dashboard');
    } catch (error: any) {
      handleAuthError(error, "Email Login Failed");
    } finally {
      setIsEmailLoading(false);
    }
  };
  
  const handleAuthError = (error: any, title: string) => {
    let errorMessage = "Login failed. Please try again.";
    if (error.code) {
      switch (error.code) {
        case 'auth/popup-closed-by-user':
          errorMessage = `Sign-in cancelled.`;
          break;
        case 'auth/account-exists-with-different-credential':
          errorMessage = `An account already exists with the same email address but different sign-in credentials. Sign in using a provider associated with this email address.`;
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          errorMessage = "Invalid email or password.";
          break;
        case 'auth/invalid-credential':
           errorMessage = "Invalid email or password.";
           break;
        default:
          errorMessage = error.message || errorMessage;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    toast({ title, description: errorMessage, variant: "destructive" });
  };

  const currentLoading = isOAuthLoading || isEmailLoading || authIsLoading;

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="items-center text-center">
        <Logo className="h-12 w-12" />
        <CardTitle className="mt-2 text-2xl">Welcome Back to GreenView</CardTitle>
        <CardDescription>Sign in to continue to your dashboard.</CardDescription>
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
              {isEmailLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Sign in with Email
            </Button>
          </form>
        </Form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <Separator />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or continue with
            </span>
          </div>
        </div>

        <Button 
          onClick={() => handleOAuthSignIn(signInWithGoogle, 'Google')} 
          className="w-full" 
          disabled={currentLoading}
          variant="outline"
        >
          {isOAuthLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
          Sign in with Google
        </Button>
        <Button 
          onClick={() => handleOAuthSignIn(signInWithMicrosoft, 'Microsoft')} 
          className="w-full" 
          disabled={currentLoading}
          variant="outline"
        >
          {isOAuthLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
          Sign in with Microsoft
        </Button>
        <Button 
          onClick={() => handleOAuthSignIn(signInWithFacebook, 'Facebook')} 
          className="w-full" 
          disabled={currentLoading}
          variant="outline"
        >
          {isOAuthLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
          Sign in with Facebook
        </Button>
        <Button 
          onClick={() => handleOAuthSignIn(signInWithTwitter, 'Twitter')} 
          className="w-full" 
          disabled={currentLoading}
          variant="outline"
        >
          {isOAuthLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
          Sign in with Twitter
        </Button>
      </CardContent>
      <CardFooter className="flex-col items-center">
        <p className="text-sm text-muted-foreground">
          New to GreenView?{' '}
          <Button variant="link" asChild className="p-0 h-auto">
            <Link href="/register">Create an account</Link>
          </Button>
        </p>
      </CardFooter>
    </Card>
  );
}
