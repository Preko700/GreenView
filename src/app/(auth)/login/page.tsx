
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
import { Separator } from '@/components/ui/separator';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const { signInWithGoogle, signInWithMicrosoft, signInWithFacebook, signInWithTwitter, isLoading: authIsLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const handleOAuthSignIn = async (signInMethod: () => Promise<void>, providerName: string) => {
    setIsLoading(true);
    try {
      await signInMethod();
      toast({ title: "Login Successful", description: `Welcome back via ${providerName}!` });
      router.push('/dashboard');
    } catch (error: any) {
      // Firebase often throws errors with a 'code' property, e.g., 'auth/popup-closed-by-user'
      let errorMessage = "Login failed. Please try again.";
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = `${providerName} sign-in cancelled.`;
      } else if (error.code === 'auth/account-exists-with-different-credential') {
        errorMessage = `An account already exists with the same email address but different sign-in credentials. Sign in using a provider associated with this email address.`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      toast({ title: `${providerName} Login Failed`, description: errorMessage, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };
  
  const currentLoading = isLoading || authIsLoading;

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="items-center text-center">
        <Logo className="h-12 w-12" />
        <CardTitle className="mt-2 text-2xl">Welcome Back to GreenView</CardTitle>
        <CardDescription>Sign in using one of the providers below.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={() => handleOAuthSignIn(signInWithGoogle, 'Google')} 
          className="w-full" 
          disabled={currentLoading}
          variant="outline"
        >
          {currentLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
          Sign in with Google
        </Button>
        <Button 
          onClick={() => handleOAuthSignIn(signInWithMicrosoft, 'Microsoft')} 
          className="w-full" 
          disabled={currentLoading}
          variant="outline"
        >
          {currentLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
          Sign in with Microsoft
        </Button>
        <Button 
          onClick={() => handleOAuthSignIn(signInWithFacebook, 'Facebook')} 
          className="w-full" 
          disabled={currentLoading}
          variant="outline"
        >
          {currentLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
          Sign in with Facebook
        </Button>
        <Button 
          onClick={() => handleOAuthSignIn(signInWithTwitter, 'Twitter')} 
          className="w-full" 
          disabled={currentLoading}
          variant="outline"
        >
          {currentLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
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
