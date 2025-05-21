
"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { Loader2, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function RegisterPage() {
  const [isLoading, setIsLoading] = useState(false);
  const { signInWithGoogle, signInWithMicrosoft, signInWithFacebook, signInWithTwitter, isLoading: authIsLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleOAuthSignUp = async (signUpMethod: () => Promise<void>, providerName: string) => {
    setIsLoading(true);
    try {
      await signUpMethod();
      toast({ title: "Registration Successful", description: `Welcome to GreenView via ${providerName}!` });
      router.push('/dashboard');
    } catch (error: any) {
      let errorMessage = "Registration failed. Please try again.";
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = `${providerName} sign-up cancelled.`;
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        errorMessage = `An account already exists with the same email address but different sign-in credentials. Try logging in with that provider.`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      toast({ title: `${providerName} Registration Failed`, description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const currentLoading = isLoading || authIsLoading;

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="items-center text-center">
        <Logo className="h-12 w-12" />
        <CardTitle className="mt-2 text-2xl">Create your GreenView Account</CardTitle>
        <CardDescription>Sign up using one of the providers below to get started.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={() => handleOAuthSignUp(signInWithGoogle, 'Google')} 
          className="w-full" 
          disabled={currentLoading}
          variant="outline"
        >
          {currentLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
          Sign up with Google
        </Button>
        <Button 
          onClick={() => handleOAuthSignUp(signInWithMicrosoft, 'Microsoft')} 
          className="w-full" 
          disabled={currentLoading}
          variant="outline"
        >
          {currentLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
          Sign up with Microsoft
        </Button>
        <Button 
          onClick={() => handleOAuthSignUp(signInWithFacebook, 'Facebook')} 
          className="w-full" 
          disabled={currentLoading}
          variant="outline"
        >
          {currentLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
          Sign up with Facebook
        </Button>
        <Button 
          onClick={() => handleOAuthSignUp(signInWithTwitter, 'Twitter')} 
          className="w-full" 
          disabled={currentLoading}
          variant="outline"
        >
          {currentLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
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
