"use client";

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, HelpCircle, ShieldCheck } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export default function SupportPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  // State for contact form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  
  useEffect(() => {
      if (user) {
          setName(user.name || '');
          setEmail(user.email || '');
      }
  }, [user]);

  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !subject || !message) {
        toast({ title: "Incomplete Form", description: "Please fill out all fields for the ticket.", variant: "destructive" });
        return;
    }
    setIsSubmittingTicket(true);
    try {
        const response = await fetch('/api/support/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, subject, message }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Failed to submit ticket.");
        toast({ title: "Ticket Submitted!", description: "Our support team will get back to you shortly." });
        setSubject('');
        setMessage('');
    } catch (error: any) {
        toast({ title: "Submission Failed", description: error.message, variant: "destructive" });
    } finally {
        setIsSubmittingTicket(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 md:px-6 space-y-8">
      <PageHeader
        title="Support Center"
        description="Need help? Find answers or contact our support team."
        action={
            <Button asChild>
              <Link href="/admin/tickets">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Admin Panel
              </Link>
            </Button>
        }
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Send us a Message</CardTitle>
              <CardDescription>For any issues, fill out the form below.</CardDescription>
            </CardHeader>
            <form onSubmit={handleTicketSubmit}>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} required disabled={isSubmittingTicket} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isSubmittingTicket} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" placeholder="e.g., Issue with sensor readings" value={subject} onChange={(e) => setSubject(e.target.value)} required disabled={isSubmittingTicket} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Your Message</Label>
                  <Textarea id="message" placeholder="Describe your issue or question in detail..." value={message} onChange={(e) => setMessage(e.target.value)} required rows={5} disabled={isSubmittingTicket} />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isSubmittingTicket}>
                  {isSubmittingTicket ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Send Message
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
           <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center">
                 <HelpCircle className="mr-2 h-5 w-5 text-primary" />
                Frequently Asked Questions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>How do I add a new device?</AccordionTrigger>
                  <AccordionContent>
                    You can add a new device from the Settings page. Look for the &quot;Add New Device&quot; section.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>My sensor readings seem incorrect.</AccordionTrigger>
                  <AccordionContent>
                    Please ensure your device is properly connected and powered on. Try refreshing the data on the dashboard. If the issue persists, contact support with your device ID.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-3">
                  <AccordionTrigger>How does the AI Assistant work?</AccordionTrigger>
                  <AccordionContent>
                    The AI Assistant uses the environmental data you provide to generate tailored advice for optimizing your greenhouse conditions for your specific plants.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
