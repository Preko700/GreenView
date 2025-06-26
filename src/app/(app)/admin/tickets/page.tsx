"use client";

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, Inbox, HardDrive, MoreHorizontal, MessageSquare } from 'lucide-react';
import type { SupportTicket, AdminDeviceView } from '@/lib/types';
import { TicketStatus } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [devices, setDevices] = useState<AdminDeviceView[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [detailItem, setDetailItem] = useState<SupportTicket | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [ticketsRes, devicesRes] = await Promise.all([
        fetch('/api/support/tickets'),
        fetch('/api/admin/devices'),
      ]);
      
      const ticketsData = await ticketsRes.json();
      if (!ticketsRes.ok) throw new Error(ticketsData.message || 'Failed to fetch tickets');
      
      const devicesData = await devicesRes.json();
      if (!devicesRes.ok) throw new Error(devicesData.message || 'Failed to fetch devices');

      setTickets(ticketsData);
      setDevices(devicesData);
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Error loading admin data", description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStatusChange = async (ticketId: number, status: TicketStatus) => {
    try {
      const response = await fetch(`/api/support/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to update status');
      toast({ title: "Status Updated", description: `Ticket #${ticketId} status set to ${status}.` });
      fetchData(); // Refresh data
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: 'destructive' });
    }
  };

  const getStatusVariant = (status: TicketStatus) => ({
    [TicketStatus.PENDING]: 'secondary',
    [TicketStatus.IN_PROGRESS]: 'default',
    [TicketStatus.RESOLVED]: 'outline',
  })[status] || 'secondary';

  const getWarrantyStatus = (warrantyEndDate: number | null) => {
    if (warrantyEndDate === null) return { text: 'N/A', variant: 'secondary' as const };
    const now = Date.now();
    const threeMonths = 3 * 30 * 24 * 60 * 60 * 1000;
    if (now > warrantyEndDate) return { text: 'Expired', variant: 'destructive' as const };
    if (warrantyEndDate - now < threeMonths) return { text: 'Expires Soon', variant: 'secondary' as const };
    return { text: 'Active', variant: 'default' as const };
  };
  
  const openDetails = (ticket: SupportTicket) => {
    setDetailItem(ticket);
    setIsDetailOpen(true);
  };

  const renderLoading = (count = 5) => <div className="space-y-2"> {[...Array(count)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)} </div>;
  const renderError = (errorMsg: string | null) => errorMsg && <div className="text-destructive flex items-center gap-2"> <AlertTriangle /> <p>Error: {errorMsg}</p> </div>;
  const renderEmpty = (Icon: React.ElementType, title: string, description: string) => (
     <div className="flex flex-col items-center justify-center min-h-[200px] text-center text-muted-foreground border-2 border-dashed border-border rounded-lg p-8">
        <Icon className="h-12 w-12 mb-4 text-gray-400" />
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="max-w-xs text-sm">{description}</p>
    </div>
  );

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <PageHeader
        title="Admin & Support Center"
        description="Manage support tickets and view registered devices."
        action={<Button onClick={fetchData} variant="outline" disabled={isLoading}> <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh Data </Button>}
      />
      
      {renderError(error)}

      <Tabs defaultValue="tickets" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tickets"><Inbox className="mr-2 h-4 w-4" />Support Tickets</TabsTrigger>
          <TabsTrigger value="devices"><HardDrive className="mr-2 h-4 w-4" />Device Registry</TabsTrigger>
        </TabsList>
        
        <TabsContent value="tickets" className="mt-4">
            <Card>
                <CardHeader> <CardTitle>All Support Tickets</CardTitle> <CardDescription>{isLoading ? "Loading..." : `Found ${tickets.length} tickets.`}</CardDescription> </CardHeader>
                <CardContent>
                    {isLoading ? renderLoading() : tickets.length === 0 ? renderEmpty(Inbox, "No Tickets Found", "The support queue is empty.") : (
                        <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Subject</TableHead><TableHead>From</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                            <TableBody>{tickets.map((ticket) => (
                                <TableRow key={ticket.id}>
                                <TableCell>{format(new Date(ticket.timestamp), "PPP p")}</TableCell>
                                <TableCell className="font-medium">{ticket.subject}</TableCell>
                                <TableCell>{ticket.email}</TableCell>
                                <TableCell><Badge variant={getStatusVariant(ticket.status)}>{ticket.status.replace('_', ' ')}</Badge></TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => openDetails(ticket)}><MessageSquare className="mr-2 h-4 w-4"/>View Details</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleStatusChange(ticket.id, TicketStatus.IN_PROGRESS)}>Set In Progress</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleStatusChange(ticket.id, TicketStatus.RESOLVED)}>Set Resolved</DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                                </TableRow>
                            ))}</TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </TabsContent>
        
        <TabsContent value="devices" className="mt-4">
            <Card>
                <CardHeader><CardTitle>Registered Devices</CardTitle><CardDescription>{isLoading ? "Loading..." : `Found ${devices.length} devices.`}</CardDescription></CardHeader>
                <CardContent>
                    {isLoading ? renderLoading() : devices.length === 0 ? renderEmpty(HardDrive, "No Devices Found", "No devices registered in the system.") : (
                        <Table><TableHeader><TableRow><TableHead>Serial</TableHead><TableHead>Device Name</TableHead><TableHead>Owner</TableHead><TableHead>Warranty</TableHead></TableRow></TableHeader>
                            <TableBody>{devices.map((device) => {
                                const warranty = getWarrantyStatus(device.warrantyEndDate);
                                return (<TableRow key={device.serialNumber}><TableCell>{device.serialNumber}</TableCell><TableCell>{device.deviceName}</TableCell><TableCell>{device.userName || 'N/A'}</TableCell><TableCell><Badge variant={warranty.variant}>{warranty.text}</Badge></TableCell></TableRow>);
                            })}</TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
      
      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          {detailItem && (
            <>
              <DialogHeader><DialogTitle>Ticket #{detailItem.id}: {detailItem.subject}</DialogTitle><DialogDescription>From: {detailItem.name} ({detailItem.email}) on {format(new Date(detailItem.timestamp), "PPP p")}</DialogDescription></DialogHeader>
              <div className="my-4 p-4 bg-muted rounded-md"><p className="text-sm">{detailItem.message}</p></div>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="secondary">Close</Button></DialogClose>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
