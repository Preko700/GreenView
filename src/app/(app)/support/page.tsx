
"use client";

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, HelpCircle, ArrowLeftRight, AlertTriangle, MoreHorizontal, MessageSquare, Inbox, BookUser, HardDrive } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import type { SupportTicket, Device, TicketLog } from '@/lib/types';
import { TicketStatus } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { format, formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


// --- Admin Panel Component ---
function AdminPanel() {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState({ tickets: true, devices: true });
  const [error, setError] = useState<string | null>(null);

  const [detailItem, setDetailItem] = useState<SupportTicket | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [ticketLogs, setTicketLogs] = useState<TicketLog[]>([]);
  const [isLogLoading, setIsLogLoading] = useState(false);
  const [newLogEntry, setNewLogEntry] = useState("");
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);

  const fetchData = useCallback(async (type: 'tickets' | 'devices' | 'all' = 'all') => {
    if (type === 'all' || type === 'tickets') setIsLoading(prev => ({ ...prev, tickets: true }));
    if (type === 'all' || type === 'devices') setIsLoading(prev => ({ ...prev, devices: true }));
    setError(null);

    try {
      if (type === 'all' || type === 'tickets') {
        const ticketsRes = await fetch('/api/support/tickets');
        if (!ticketsRes.ok) throw new Error((await ticketsRes.json()).message || 'Failed to fetch tickets');
        setTickets(await ticketsRes.json());
      }
      if (type === 'all' || type === 'devices') {
        const devicesRes = await fetch('/api/admin/devices');
        if (!devicesRes.ok) throw new Error((await devicesRes.json()).message || 'Failed to fetch devices');
        setDevices(await devicesRes.json());
      }
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Error loading admin data", description: err.message, variant: 'destructive' });
    } finally {
      if (type === 'all' || type === 'tickets') setIsLoading(prev => ({ ...prev, tickets: false }));
      if (type === 'all' || type === 'devices') setIsLoading(prev => ({ ...prev, devices: false }));
    }
  }, [toast]);

  useEffect(() => {
    fetchData('all');
  }, [fetchData]);
  
  const fetchTicketLogs = useCallback(async (ticketId: number) => {
    setIsLogLoading(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/logs`);
      if (!res.ok) throw new Error('Failed to fetch ticket logs');
      setTicketLogs(await res.json());
    } catch(err:any) {
      toast({title: "Error", description: err.message, variant: 'destructive'});
    } finally {
      setIsLogLoading(false);
    }
  }, [toast]);

  const handleStatusChange = async (id: number, status: TicketStatus) => {
    try {
      const response = await fetch(`/api/support/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Failed to update ticket status`);
      toast({ title: "Status Updated", description: `Ticket #${id} status updated.` });
      fetchData('tickets');
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: 'destructive' });
    }
  };
  
  const handleAddLogEntry = async (ticketId: number) => {
    if (!newLogEntry.trim() || !user) return;
    setIsSubmittingLog(true);
    try {
       const response = await fetch(`/api/support/tickets/${ticketId}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ technicianName: user.name, logEntry: newLogEntry }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Failed to add log entry`);
      toast({ title: "Log Entry Added" });
      setTicketLogs(prev => [data.log, ...prev]);
      setNewLogEntry("");
    } catch(err: any) {
       toast({ title: "Failed to Add Log", description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmittingLog(false);
    }
  };

  const openTicketDetails = (ticket: SupportTicket) => {
    setDetailItem(ticket);
    setIsDetailOpen(true);
    fetchTicketLogs(ticket.id);
  };

  const getStatusVariant = (status: TicketStatus) => ({
    [TicketStatus.PENDING]: 'secondary',
    [TicketStatus.IN_PROGRESS]: 'default',
    [TicketStatus.RESOLVED]: 'outline',
  })[status] || 'secondary';
  
  const isWarrantyActive = (activationDate?: number, warrantyEndDate?: number) => {
    if (!warrantyEndDate) return 'N/A';
    return Date.now() < warrantyEndDate ? 'Active' : 'Expired';
  };

  const renderError = () => error && (
    <div className="text-destructive flex items-center gap-2 my-4"> <AlertTriangle /> <p>Error: {error}</p> </div>
  );

  return (
    <>
      {error && renderError()}
      <Tabs defaultValue="tickets" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tickets"><BookUser className="mr-2 h-4 w-4"/>Support Tickets</TabsTrigger>
          <TabsTrigger value="devices"><HardDrive className="mr-2 h-4 w-4"/>Registered Devices (Equipment Cards)</TabsTrigger>
        </TabsList>
        <TabsContent value="tickets">
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>All Support Tickets</CardTitle>
              <CardDescription>{isLoading.tickets ? "Loading..." : `Found ${tickets.length} tickets.`}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading.tickets ? <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> 
              : tickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[200px] text-center text-muted-foreground border-2 border-dashed border-border rounded-lg p-8">
                  <Inbox className="h-12 w-12 mb-4 text-gray-400" />
                  <h3 className="text-lg font-semibold">No Tickets Found</h3>
                  <p className="max-w-xs text-sm">The support queue is empty. Great job!</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tickets.map((ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell>{format(new Date(ticket.timestamp), "PPP p")}</TableCell>
                        <TableCell>
                          {ticket.deviceId ? (
                            <Badge variant="outline" className="font-mono">{ticket.deviceId}</Badge>
                          ) : (
                             <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{ticket.subject}</TableCell>
                        <TableCell>{ticket.email}</TableCell>
                        <TableCell><Badge variant={getStatusVariant(ticket.status)}>{ticket.status.replace('_', ' ')}</Badge></TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openTicketDetails(ticket)}><MessageSquare className="mr-2 h-4 w-4" />View Details & Log</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(ticket.id, TicketStatus.IN_PROGRESS)}>Set In Progress</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(ticket.id, TicketStatus.RESOLVED)}>Set Resolved</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="devices">
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>All Registered Devices (Equipment Cards)</CardTitle>
              <CardDescription>{isLoading.devices ? "Loading..." : `Found ${devices.length} devices.`}</CardDescription>
            </CardHeader>
            <CardContent>
               {isLoading.devices ? <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div> 
               : devices.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[200px] text-center text-muted-foreground border-2 border-dashed border-border rounded-lg p-8">
                  <HardDrive className="h-12 w-12 mb-4 text-gray-400" />
                  <h3 className="text-lg font-semibold">No Devices Registered</h3>
                  <p className="max-w-xs text-sm">No devices have been registered in the system yet.</p>
                </div>
               ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serial Number</TableHead>
                      <TableHead>Device Name</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Activation Date</TableHead>
                      <TableHead>Warranty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devices.map((device) => (
                      <TableRow key={device.serialNumber}>
                        <TableCell className="font-mono">{device.serialNumber}</TableCell>
                        <TableCell className="font-medium">{device.name}</TableCell>
                        <TableCell>{device.userName || 'N/A'}</TableCell>
                        <TableCell>{device.activationDate ? format(new Date(device.activationDate), "PPP") : 'N/A'}</TableCell>
                        <TableCell>{isWarrantyActive(device.activationDate, device.warrantyEndDate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
               )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-2xl">
          {detailItem && (
            <>
              <DialogHeader>
                <DialogTitle>Ticket #{detailItem.id}: {detailItem.subject}</DialogTitle>
                <DialogDescription>From: {detailItem.name} ({detailItem.email}) on {format(new Date(detailItem.timestamp), "PPP p")}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4">
                <div>
                    <h4 className="font-semibold mb-2">Original Message</h4>
                    <div className="p-4 bg-muted rounded-md text-sm max-h-48 overflow-y-auto">{detailItem.message}</div>
                    {detailItem.deviceId && (
                        <div className="mt-4">
                          <h4 className="font-semibold">Associated Device</h4>
                          <p className="text-sm font-mono text-muted-foreground p-2 bg-muted rounded-md mt-1">{detailItem.deviceId}</p>
                        </div>
                    )}
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Service Log (Bitácora)</h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                       <Label htmlFor="new-log-entry">Add New Log Entry (Actions/Result)</Label>
                       <Textarea id="new-log-entry" value={newLogEntry} onChange={(e) => setNewLogEntry(e.target.value)} placeholder={`Log entry by ${user?.name}...`} rows={3} disabled={isSubmittingLog}/>
                       <Button onClick={() => handleAddLogEntry(detailItem.id)} disabled={isSubmittingLog || !newLogEntry.trim()}>
                        {isSubmittingLog && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Add to Log
                       </Button>
                    </div>
                    <ScrollArea className="h-48 w-full rounded-md border p-2">
                        {isLogLoading ? <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin"/></div>
                        : ticketLogs.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No log entries yet.</p>
                        : (
                            <div className="space-y-3">
                                {ticketLogs.map(log => (
                                    <div key={log.id} className="text-xs border-b pb-2">
                                        <p className="font-semibold">{log.technicianName} <span className="font-normal text-muted-foreground">- {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}</span></p>
                                        <p className="mt-1 whitespace-pre-wrap">{log.logEntry}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">Close</Button>
                </DialogClose>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// --- User Support View Component ---
function UserSupportView() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('general');
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');

      const fetchDevices = async () => {
        setIsLoadingDevices(true);
        try {
          const response = await fetch(`/api/devices?userId=${user.id}`);
          if (response.ok) {
            setDevices(await response.json());
          } else {
            console.error("Failed to fetch user devices for support form");
          }
        } catch (error) {
          console.error("Error fetching devices:", error);
        } finally {
          setIsLoadingDevices(false);
        }
      };
      fetchDevices();
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
        body: JSON.stringify({ 
          name, 
          email, 
          subject, 
          message,
          deviceId: selectedDeviceId === 'general' ? null : selectedDeviceId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to submit ticket.");
      toast({ title: "Ticket Submitted!", description: "Our support team will get back to you shortly." });
      setSubject('');
      setMessage('');
      setSelectedDeviceId('general');
    } catch (error: any) {
      toast({ title: "Submission Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">
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
                <Label htmlFor="device">Related Device (Optional)</Label>
                <Select
                  value={selectedDeviceId}
                  onValueChange={setSelectedDeviceId}
                  disabled={isSubmittingTicket || isLoadingDevices}
                >
                  <SelectTrigger id="device">
                    <SelectValue placeholder="Select a device..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General Inquiry</SelectItem>
                    {devices.map(device => (
                      <SelectItem key={device.serialNumber} value={device.serialNumber}>
                        {device.name} ({device.serialNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  You can add a new device from the <Link href="/settings" className="text-primary underline">Settings</Link> page. Look for the "Register New Device" section.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>My sensor readings seem incorrect.</AccordionTrigger>
                <AccordionContent>
                  Please ensure your device is properly connected and powered on. Try refreshing the data on the dashboard. If the issue persists, please send us a message.
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
  );
}

// --- Main Page Component ---
export default function SupportPage() {
  const [view, setView] = useState<'user' | 'admin'>('user');

  const pageHeaderAction = (
    <Button
      onClick={() => setView(v => (v === 'user' ? 'admin' : 'user'))}
      variant="outline"
    >
      <ArrowLeftRight className="mr-2 h-4 w-4" />
      {view === 'user' ? 'Switch to Admin Panel' : 'Switch to User View'}
    </Button>
  );

  return (
    <div className="container mx-auto py-8 px-4 md:px-6 space-y-8">
      <PageHeader
        title="Support Center"
        description={
          view === 'user'
            ? "Need help? Find answers or contact our support team."
            : "Manage support tickets and registered devices."
        }
        action={pageHeaderAction}
      />

      {view === 'user' && <UserSupportView />}
      {view === 'admin' && <AdminPanel />}
    </div>
  );
}
