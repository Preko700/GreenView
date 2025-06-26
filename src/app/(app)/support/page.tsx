
"use client";

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, HelpCircle, ShieldCheck, Wrench, Phone } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Device } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

export default function SupportPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  // State for contact form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);

  // State for service request form
  const [isSubmittingService, setIsSubmittingService] = useState(false);
  const [userDevices, setUserDevices] = useState<Device[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [reason, setReason] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
    }
  }, [user]);

  const fetchUserDevices = useCallback(async () => {
    if (!user) return;
    setIsLoadingDevices(true);
    try {
      const response = await fetch(`/api/devices?userId=${user.id}`);
      if (!response.ok) throw new Error('Failed to fetch your devices.');
      const data: Device[] = await response.json();
      setUserDevices(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoadingDevices(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchUserDevices();
  }, [fetchUserDevices]);

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

  const handleServiceRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedDeviceId || !reason || !phoneNumber) {
      toast({ title: "Incomplete Form", description: "Please fill out all fields to request a service call.", variant: "destructive" });
      return;
    }
    setIsSubmittingService(true);
    try {
      const response = await fetch('/api/support/service-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, deviceId: selectedDeviceId, reason, phoneNumber }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to submit service request.');
      toast({ title: "Service Request Sent", description: "A technician will contact you shortly." });
      setSelectedDeviceId('');
      setReason('');
      setPhoneNumber('');
    } catch (err: any) {
      toast({ title: "Request Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmittingService(false);
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
              <CardDescription>For general questions or issues, fill out the form below.</CardDescription>
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
                  <Input id="subject" placeholder="e.g., Question about plant types" value={subject} onChange={(e) => setSubject(e.target.value)} required disabled={isSubmittingTicket} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Your Message</Label>
                  <Textarea id="message" placeholder="Describe your question in detail..." value={message} onChange={(e) => setMessage(e.target.value)} required rows={5} disabled={isSubmittingTicket} />
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

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Request Service Call</CardTitle>
              <CardDescription>If you're having a problem with a specific device, request a call from a technician.</CardDescription>
            </CardHeader>
            <form onSubmit={handleServiceRequestSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="service-device">Select Device</Label>
                  {isLoadingDevices ? <Skeleton className="h-10 w-full" /> : 
                    <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId} required>
                      <SelectTrigger id="service-device" disabled={isSubmittingService || userDevices.length === 0}>
                        <SelectValue placeholder={userDevices.length > 0 ? "Select the device with the issue" : "No devices found"} />
                      </SelectTrigger>
                      <SelectContent>
                        {userDevices.map(device => (
                          <SelectItem key={device.serialNumber} value={device.serialNumber}>{device.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                </div>
                <div className="space-y-2">
                  <Label htmlFor="service-reason">Reason for Contact</Label>
                  <Input id="service-reason" placeholder="e.g., Sensor is not reporting data" value={reason} onChange={(e) => setReason(e.target.value)} required disabled={isSubmittingService} />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="service-phone">Your Phone Number</Label>
                  <Input id="service-phone" type="tel" placeholder="e.g., 555-123-4567" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required disabled={isSubmittingService} />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isSubmittingService}>
                  {isSubmittingService ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}
                  Request Call
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Wrench className="mr-2 h-5 w-5 text-primary" />
                Technical Support
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">For urgent issues or direct hardware support, please use the "Request Service Call" form. Our team aims to respond within 24 business hours.</p>
            </CardContent>
          </Card>
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
                    You can add a new device from the <Link href="/settings" className="text-primary underline">Settings</Link> page. Look for the "Register New Device" section.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="item-2">
                  <AccordionTrigger>My sensor readings seem incorrect.</AccordionTrigger>
                  <AccordionContent>
                    Please ensure your device is properly connected and powered on. Try refreshing the data on the dashboard. If the issue persists, request a service call using the form on this page.
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
