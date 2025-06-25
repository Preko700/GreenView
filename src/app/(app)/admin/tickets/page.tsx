
"use client";

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, AlertTriangle, Inbox, HardDrive } from 'lucide-react';
import type { SupportTicket, AdminDeviceView } from '@/lib/types';
import { TicketStatus } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(true);
  const [errorTickets, setErrorTickets] = useState<string | null>(null);

  const [devices, setDevices] = useState<AdminDeviceView[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);
  const [errorDevices, setErrorDevices] = useState<string | null>(null);

  const router = useRouter();

  const fetchTickets = async () => {
    setIsLoadingTickets(true);
    setErrorTickets(null);
    try {
      const response = await fetch('/api/support/tickets');
      if (!response.ok) {
        throw new Error('Failed to fetch tickets');
      }
      const data = await response.json();
      setTickets(data);
    } catch (err: any) {
      setErrorTickets(err.message);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  const fetchDevices = async () => {
    setIsLoadingDevices(true);
    setErrorDevices(null);
    try {
        const response = await fetch('/api/admin/devices');
        if (!response.ok) {
            throw new Error('Failed to fetch devices');
        }
        const data = await response.json();
        setDevices(data);
    } catch (err: any) {
        setErrorDevices(err.message);
    } finally {
        setIsLoadingDevices(false);
    }
  };


  useEffect(() => {
    fetchTickets();
    fetchDevices();
  }, []);

  const getTicketStatusVariant = (status: TicketStatus) => {
    switch (status) {
      case TicketStatus.PENDING: return 'secondary';
      case TicketStatus.IN_PROGRESS: return 'default';
      case TicketStatus.RESOLVED: return 'outline';
      default: return 'secondary';
    }
  };

  const getWarrantyStatus = (warrantyEndDate: number) => {
    const now = Date.now();
    const threeMonths = 3 * 30 * 24 * 60 * 60 * 1000;
    
    if (now > warrantyEndDate) {
        return { text: 'Expired', variant: 'destructive' as const };
    }
    if (warrantyEndDate - now < threeMonths) {
        return { text: 'Expires Soon', variant: 'secondary' as const };
    }
    return { text: 'Active', variant: 'default' as const };
  };

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <PageHeader
        title="Admin Panel"
        description="Manage support tickets and view registered devices."
        action={
          <Button onClick={() => router.push('/support')} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Support
          </Button>
        }
      />
      
      <Tabs defaultValue="tickets" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
          <TabsTrigger value="tickets">
            <Inbox className="mr-2 h-4 w-4" />
            Support Tickets
          </TabsTrigger>
          <TabsTrigger value="devices">
            <HardDrive className="mr-2 h-4 w-4" />
            Device Registry
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="tickets" className="mt-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>All Support Tickets</CardTitle>
                        <CardDescription>
                            {isLoadingTickets ? "Loading tickets..." : `Found ${tickets.length} tickets.`}
                        </CardDescription>
                    </div>
                     <Button onClick={fetchTickets} variant="outline" size="sm" disabled={isLoadingTickets}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingTickets ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent>
                    {errorTickets && ( <div className="text-destructive flex items-center gap-2"> <AlertTriangle /> <p>Error loading tickets: {errorTickets}</p> </div> )}
                    {isLoadingTickets && ( <div className="space-y-2"> {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)} </div> )}
                    {!isLoadingTickets && !errorTickets && tickets.length === 0 && (
                        <div className="flex flex-col items-center justify-center min-h-[200px] text-center text-muted-foreground border-2 border-dashed border-border rounded-lg p-8">
                            <Inbox className="h-12 w-12 mb-4 text-gray-400" />
                            <h3 className="text-lg font-semibold">No Tickets Found</h3>
                            <p className="max-w-xs text-sm">The support queue is empty.</p>
                        </div>
                    )}
                    {!isLoadingTickets && !errorTickets && tickets.length > 0 && (
                        <div className="border rounded-md">
                        <Table>
                            <TableHeader>
                            <TableRow>
                                <TableHead className="hidden md:table-cell">Date</TableHead>
                                <TableHead>Subject</TableHead>
                                <TableHead>From</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                            {tickets.map((ticket) => (
                                <TableRow key={ticket.id}>
                                <TableCell className="hidden md:table-cell">{format(new Date(ticket.timestamp), "MMM d, yyyy HH:mm")}</TableCell>
                                <TableCell className="font-medium">{ticket.subject}</TableCell>
                                <TableCell>{ticket.email}</TableCell>
                                <TableCell><Badge variant={getTicketStatusVariant(ticket.status)} className="capitalize">{ticket.status.replace('_', ' ').toLowerCase()}</Badge></TableCell>
                                <TableCell className="text-right">
                                    <Dialog><DialogTrigger asChild><Button variant="ghost" size="sm">View</Button></DialogTrigger>
                                        <DialogContent className="sm:max-w-md">
                                            <DialogHeader>
                                                <DialogTitle>{ticket.subject}</DialogTitle>
                                                <DialogDescription>From: {ticket.name} ({ticket.email}) on {format(new Date(ticket.timestamp), "PPP p")}</DialogDescription>
                                            </DialogHeader>
                                            <div className="my-4 p-4 bg-muted rounded-md max-h-60 overflow-y-auto">
                                                <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.message}</p>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </TableCell>
                                </TableRow>
                            ))}
                            </TableBody>
                        </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </TabsContent>
        
        <TabsContent value="devices" className="mt-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Registered Devices</CardTitle>
                        <CardDescription>
                            {isLoadingDevices ? "Loading devices..." : `Found ${devices.length} registered devices.`}
                        </CardDescription>
                    </div>
                     <Button onClick={fetchDevices} variant="outline" size="sm" disabled={isLoadingDevices}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingDevices ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent>
                    {errorDevices && ( <div className="text-destructive flex items-center gap-2"> <AlertTriangle /> <p>Error loading devices: {errorDevices}</p> </div> )}
                    {isLoadingDevices && ( <div className="space-y-2"> {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)} </div> )}
                    {!isLoadingDevices && !errorDevices && devices.length === 0 && (
                         <div className="flex flex-col items-center justify-center min-h-[200px] text-center text-muted-foreground border-2 border-dashed border-border rounded-lg p-8">
                            <HardDrive className="h-12 w-12 mb-4 text-gray-400" />
                            <h3 className="text-lg font-semibold">No Devices Found</h3>
                            <p className="max-w-xs text-sm">There are no registered greenhouse devices in the system yet.</p>
                        </div>
                    )}
                    {!isLoadingDevices && !errorDevices && devices.length > 0 && (
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Serial Number</TableHead>
                                        <TableHead>Device Name</TableHead>
                                        <TableHead>Owner</TableHead>
                                        <TableHead className="hidden md:table-cell">Activation Date</TableHead>
                                        <TableHead>Warranty Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {devices.map((device) => {
                                        const warranty = getWarrantyStatus(device.warrantyEndDate);
                                        return (
                                            <TableRow key={device.serialNumber}>
                                                <TableCell className="font-mono text-xs">{device.serialNumber}</TableCell>
                                                <TableCell className="font-medium">{device.deviceName}</TableCell>
                                                <TableCell>{device.userName}</TableCell>
                                                <TableCell className="hidden md:table-cell">{format(new Date(device.activationDate), 'PPP')}</TableCell>
                                                <TableCell>
                                                    <Badge variant={warranty.variant} className="capitalize">{warranty.text}</Badge>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
