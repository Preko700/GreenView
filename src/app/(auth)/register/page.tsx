
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
import { Loader2, LogIn, UserPlus } from 'lucide-react';
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

const registerSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }).max(50, { message: "Name too long." }),
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
});

export default function RegisterPage() {
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const { signInWithGoogle, signInWithMicrosoft, signInWithFacebook, signInWithTwitter, signUpWithEmail, isLoading: authIsLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  const handleOAuthSignUp = async (signUpMethod: () => Promise<void>, providerName: string) => {
    setIsOAuthLoading(true);
    try {
      await signUpMethod();
      toast({ title: "Registration Successful", description: `Welcome to GreenView via ${providerName}!` });
      router.push('/dashboard');
    } catch (error: any) {
      handleAuthError(error, `${providerName} Registration Failed`);
    } finally {
      setIsOAuthLoading(false);
    }
  };

  const handleEmailSignUp = async (values: z.infer<typeof registerSchema>) => {
    setIsEmailLoading(true);
    const { name, email, password } = values;
    try {
      await signUpWithEmail({ email, password }, name);
      toast({ title: "Registration Successful", description: "Welcome to GreenView! Your account has been created." });
      router.push('/dashboard');
    } catch (error: any) {
      handleAuthError(error, "Email Registration Failed");
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleAuthError = (error: any, title: string) => {
    let errorMessage = "Registration failed. Please try again.";
     if (error.code) {
      switch (error.code) {
        case 'auth/popup-closed-by-user':
          errorMessage = `Sign-up cancelled.`;
          break;
        case 'auth/account-exists-with-different-credential':
          errorMessage = `An account already exists with the same email address but different sign-in credentials. Try logging in with that provider.`;
          break;
        case 'auth/email-already-in-use':
          errorMessage = "This email address is already in use. Please try logging in or use a different email.";
          break;
        case 'auth/weak-password':
          errorMessage = "The password is too weak. Please choose a stronger password.";
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
        <CardTitle className="mt-2 text-2xl">Create your GreenView Account</CardTitle>
        <CardDescription>Sign up to get started.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleEmailSignUp)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your full name" {...field} disabled={currentLoading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                    <Input type="password" placeholder="•••••••• (min. 6 characters)" {...field} disabled={currentLoading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={currentLoading}>
              {isEmailLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Sign up with Email
            </Button>
          </form>
        </Form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <Separator />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or sign up with
            </span>
          </div>
        </div>

        <Button 
          onClick={() => handleOAuthSignUp(signInWithGoogle, 'Google')} 
          className="w-full" 
          disabled={currentLoading}
          variant="outline"
        >
          {isOAuthLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
          Sign up with Google
        </Button>
        <Button 
          onClick={() => handleOAuthSignUp(signInWithMicrosoft, 'Microsoft')} 
          className="w-full" 
          disabled={currentLoading}
          variant="outline"
        >
          {isOAuthLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
          Sign up with Microsoft
        </Button>
        <Button 
          onClick={() => handleOAuthSignUp(signInWithFacebook, 'Facebook')} 
          className="w-full" 
          disabled={currentLoading}
          variant="outline"
        >
          {isOAuthLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
          Sign up with Facebook
        </Button>
        <Button 
          onClick={() => handleOAuthSignUp(signInWithTwitter, 'Twitter')} 
          className="w-full" 
          disabled={currentLoading}
          variant="outline"
        >
          {isOAuthLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
          Sign up with Twitter
        </Button>
      </CardContent>
      <CardFooter className="flex-col items-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Button variant="link" asChild className="p-0 h-auto">
            <Link href="/login">Log in</Link>
          </Button>
        </p>
      </CardFooter>
    </Card>
  );
}
