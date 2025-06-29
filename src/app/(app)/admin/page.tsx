
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, MoreHorizontal, MessageSquare, Inbox, BookUser, HardDrive } from 'lucide-react';
import type { SupportTicket, Device, TicketLog } from '@/lib/types';
import { TicketStatus } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { format, formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose, DialogFooter } from "@/components/ui/dialog";
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from '@/contexts/AuthContext';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function AdminDashboardPage() {
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
    <div className="container mx-auto py-8 px-4 md:px-6">
      <PageHeader
        title="Admin Dashboard"
        description="Manage support tickets and registered devices."
        action={ <Button onClick={() => fetchData('all')} variant="outline" disabled={isLoading.tickets || isLoading.devices}> <RefreshCw className={`mr-2 h-4 w-4 ${(isLoading.tickets || isLoading.devices) ? 'animate-spin' : ''}`} /> Refresh All Data </Button> }
      />
      {renderError()}
      <Tabs defaultValue="tickets" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tickets"><BookUser className="mr-2 h-4 w-4"/>Support Tickets</TabsTrigger>
          <TabsTrigger value="devices"><HardDrive className="mr-2 h-4 w-4"/>Registered Devices</TabsTrigger>
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
                        <TableCell className="font-medium">{ticket.subject}</TableCell>
                        <TableCell>{ticket.email}</TableCell>
                        <TableCell><Badge variant={getStatusVariant(ticket.status)}>{ticket.status.replace('_', ' ')}</Badge></TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openTicketDetails(ticket)}><MessageSquare className="mr-2 h-4 w-4" />View Details</DropdownMenuItem>
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
              <CardTitle>All Registered Devices</CardTitle>
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
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Service Log</h4>
                  <div className="space-y-4">
                    <div className="space-y-2">
                       <Label htmlFor="new-log-entry">Add New Log Entry</Label>
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
              <DialogFooter> <DialogClose asChild> <Button type="button" variant="secondary">Close</Button> </DialogClose> </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
