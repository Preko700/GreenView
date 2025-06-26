
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, AlertTriangle, Inbox, HardDrive, Wrench, BookText, ChevronDown, MoreHorizontal, MessageSquare, Phone, Edit, Plus } from 'lucide-react';
import type { User, SupportTicket, AdminDeviceView, AdminServiceRequestView, AdminServiceLogView, ServiceRequest, ServiceLogEntry } from '@/lib/types';
import { TicketStatus, ServiceRequestStatus } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from 'next/navigation';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const serviceLogSchema = z.object({
  technicianName: z.string().min(2, "Technician name is required"),
  userId: z.string().min(1, "User is required"),
  deviceId: z.string().min(1, "Device is required"),
  serviceRequestId: z.string().optional(),
  actionsTaken: z.string().min(10, "Actions taken must be at least 10 characters"),
  result: z.string().min(5, "Result must be at least 5 characters"),
});

export default function AdminPage() {
  const router = useRouter();
  const { user: adminUser } = useAuth();
  const { toast } = useToast();
  
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [devices, setDevices] = useState<AdminDeviceView[]>([]);
  const [serviceRequests, setServiceRequests] = useState<AdminServiceRequestView[]>([]);
  const [serviceLogs, setServiceLogs] = useState<AdminServiceLogView[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  const [isLoading, setIsLoading] = useState({ all: true });
  const [errors, setErrors] = useState({ all: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [detailItem, setDetailItem] = useState<SupportTicket | AdminServiceRequestView | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading({ all: true });
    setErrors({ all: null });
    try {
      const [ticketsRes, devicesRes, requestsRes, logsRes, usersRes] = await Promise.all([
        fetch('/api/support/tickets'),
        fetch('/api/admin/devices'),
        fetch('/api/admin/service-requests'),
        fetch('/api/admin/service-log'),
        fetch('/api/admin/users'),
      ]);
      
      const ticketsData = await ticketsRes.json();
      if (!ticketsRes.ok) throw new Error(ticketsData.message || 'Failed to fetch tickets');
      
      const devicesData = await devicesRes.json();
      if (!devicesRes.ok) throw new Error(devicesData.message || 'Failed to fetch devices');

      const requestsData = await requestsRes.json();
      if (!requestsRes.ok) throw new Error(requestsData.message || 'Failed to fetch service requests');
      
      const logsData = await logsRes.json();
      if (!logsRes.ok) throw new Error(logsData.message ||'Failed to fetch service logs');
      
      const usersData = await usersRes.json();
      if (!usersRes.ok) throw new Error(usersData.message || 'Failed to fetch users');

      setTickets(ticketsData);
      setDevices(devicesData);
      setServiceRequests(requestsData);
      setServiceLogs(logsData);
      setAllUsers(usersData);
    } catch (err: any) {
      setErrors({ all: err.message });
      toast({ title: "Error loading admin data", description: err.message, variant: 'destructive' });
    } finally {
      setIsLoading({ all: false });
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  const logForm = useForm<z.infer<typeof serviceLogSchema>>({
    resolver: zodResolver(serviceLogSchema),
    defaultValues: { technicianName: '', userId: '', deviceId: '', serviceRequestId: '', actionsTaken: '', result: '' },
  });

  useEffect(() => {
    if (adminUser?.name) logForm.setValue('technicianName', adminUser.name);
  }, [adminUser, logForm]);

  const serviceRequestIdValue = logForm.watch('serviceRequestId');
  useEffect(() => {
    const selectedRequest = serviceRequests.find(r => r.id.toString() === serviceRequestIdValue);
    if (selectedRequest) {
      logForm.setValue('userId', selectedRequest.userId.toString());
      logForm.setValue('deviceId', selectedRequest.deviceId);
    }
  }, [serviceRequestIdValue, serviceRequests, logForm]);

  const handleLogSubmit: SubmitHandler<z.infer<typeof serviceLogSchema>> = async (values) => {
    setIsSubmitting(true);
    try {
       const bodyToSend = {
        ...values,
        serviceDate: Date.now(),
        // Ensure empty string becomes null so API validation for numbers passes
        serviceRequestId: values.serviceRequestId || null,
      };

      const response = await fetch('/api/admin/service-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyToSend),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to submit log entry.");
      toast({ title: "Log Entry Saved" });
      logForm.reset({ technicianName: adminUser?.name || '', userId: '', deviceId: '', serviceRequestId: '', actionsTaken: '', result: '' });
      fetchData(); // Refresh all data
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (type: 'ticket' | 'request', id: number, status: TicketStatus | ServiceRequestStatus) => {
    const url = type === 'ticket' ? `/api/support/tickets/${id}` : `/api/admin/service-requests/${id}`;
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to update status');
      toast({ title: "Status Updated", description: `${type.charAt(0).toUpperCase() + type.slice(1)} #${id} status set to ${status}.` });
      fetchData(); // Refresh all data
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: 'destructive' });
    }
  };

  const getStatusVariant = (status: TicketStatus | ServiceRequestStatus) => ({
    [TicketStatus.PENDING]: 'secondary', [ServiceRequestStatus.PENDING]: 'secondary',
    [TicketStatus.IN_PROGRESS]: 'default', [ServiceRequestStatus.IN_PROGRESS]: 'default',
    [TicketStatus.RESOLVED]: 'outline', [ServiceRequestStatus.COMPLETED]: 'outline',
  })[status] || 'secondary';

  const getWarrantyStatus = (warrantyEndDate: number | null) => {
    if (warrantyEndDate === null) return { text: 'N/A', variant: 'secondary' as const };
    const now = Date.now();
    const threeMonths = 3 * 30 * 24 * 60 * 60 * 1000;
    if (now > warrantyEndDate) return { text: 'Expired', variant: 'destructive' as const };
    if (warrantyEndDate - now < threeMonths) return { text: 'Expires Soon', variant: 'secondary' as const };
    return { text: 'Active', variant: 'default' as const };
  };

  const openDetails = (item: SupportTicket | AdminServiceRequestView) => {
    setDetailItem(item);
    setIsDetailOpen(true);
  };

  const renderLoading = (count = 5) => <div className="space-y-2"> {[...Array(count)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)} </div>;
  const renderError = (error: string | null) => error && <div className="text-destructive flex items-center gap-2"> <AlertTriangle /> <p>Error: {error}</p> </div>;
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
        description="Manage tickets, devices, service requests, and log entries."
        action={<Button onClick={() => router.push('/support')} variant="outline"> <ArrowLeft className="mr-2 h-4 w-4" /> Back to Support </Button>}
      />
      
      {renderError(errors.all)}

      <Tabs defaultValue="tickets" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="tickets"><Inbox className="mr-2 h-4 w-4" />Support Tickets</TabsTrigger>
          <TabsTrigger value="requests"><Wrench className="mr-2 h-4 w-4" />Service Requests</TabsTrigger>
          <TabsTrigger value="devices"><HardDrive className="mr-2 h-4 w-4" />Device Registry</TabsTrigger>
          <TabsTrigger value="logbook"><BookText className="mr-2 h-4 w-4" />Service Logbook</TabsTrigger>
        </TabsList>
        
        <TabsContent value="tickets" className="mt-4">
            <Card>
                <CardHeader> <CardTitle>All Support Tickets</CardTitle> <CardDescription>{isLoading.all ? "Loading..." : `Found ${tickets.length} tickets.`}</CardDescription> </CardHeader>
                <CardContent>
                    {isLoading.all ? renderLoading() : tickets.length === 0 ? renderEmpty(Inbox, "No Tickets Found", "The support queue is empty.") : (
                        <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Subject</TableHead><TableHead>From</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                            <TableBody>{tickets.map((ticket) => (
                                <TableRow key={ticket.id}>
                                <TableCell>{format(new Date(ticket.timestamp), "PPP p")}</TableCell>
                                <TableCell className="font-medium">{ticket.subject}</TableCell>
                                <TableCell>{ticket.email}</TableCell>
                                <TableCell><Badge variant={getStatusVariant(ticket.status)}>{ticket.status.replace('_', ' ').toLowerCase()}</Badge></TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => openDetails(ticket)}><MessageSquare className="mr-2 h-4 w-4"/>View Details</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleStatusChange('ticket', ticket.id, TicketStatus.IN_PROGRESS)}>Set In Progress</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleStatusChange('ticket', ticket.id, TicketStatus.RESOLVED)}>Set Resolved</DropdownMenuItem>
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
        
        <TabsContent value="requests" className="mt-4">
            <Card>
                <CardHeader><CardTitle>Service Requests</CardTitle><CardDescription>{isLoading.all ? "Loading..." : `Found ${serviceRequests.length} requests.`}</CardDescription></CardHeader>
                <CardContent>
                    {isLoading.all ? renderLoading() : serviceRequests.length === 0 ? renderEmpty(Wrench, "No Service Requests", "The service request queue is empty.") : (
                        <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>User</TableHead><TableHead>Device</TableHead><TableHead>Reason</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                            <TableBody>{serviceRequests.map((req) => (<TableRow key={req.id}>
                                <TableCell>{format(new Date(req.timestamp), "PPP p")}</TableCell>
                                <TableCell>{req.userName || 'N/A'}</TableCell><TableCell>{req.deviceName || 'N/A'} ({req.deviceId})</TableCell>
                                <TableCell>{req.reason}</TableCell><TableCell>{req.phoneNumber}</TableCell>
                                <TableCell><Badge variant={getStatusVariant(req.status)}>{req.status.replace('_', ' ').toLowerCase()}</Badge></TableCell>
                                <TableCell className="text-right">
                                  <DropdownMenu>
                                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => openDetails(req)}><Phone className="mr-2 h-4 w-4"/>View & Manage</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleStatusChange('request', req.id, ServiceRequestStatus.IN_PROGRESS)}>Set In Progress</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleStatusChange('request', req.id, ServiceRequestStatus.COMPLETED)}>Set Completed</DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>))}</TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="devices" className="mt-4">
            <Card>
                <CardHeader><CardTitle>Registered Devices</CardTitle><CardDescription>{isLoading.all ? "Loading..." : `Found ${devices.length} devices.`}</CardDescription></CardHeader>
                <CardContent>
                    {isLoading.all ? renderLoading() : devices.length === 0 ? renderEmpty(HardDrive, "No Devices Found", "No devices registered in the system.") : (
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
        
        <TabsContent value="logbook" className="mt-4 space-y-6">
           <Card>
             <CardHeader><CardTitle>Create Service Log Entry</CardTitle></CardHeader>
             <Form {...logForm}>
                <form onSubmit={logForm.handleSubmit(handleLogSubmit)}>
                    <CardContent className="space-y-4">
                         <FormField control={logForm.control} name="technicianName" render={({ field }) => ( <FormItem><FormLabel>Technician Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                         <FormField control={logForm.control} name="serviceRequestId" render={({ field }) => ( 
                           <FormItem><FormLabel>Link to Service Request (Optional)</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} disabled={isLoading.all}>
                                <FormControl><SelectTrigger><SelectValue placeholder="Select a service request to auto-fill" /></SelectTrigger></FormControl>
                                <SelectContent>{!isLoading.all && serviceRequests.filter(r => r.status !== 'COMPLETED').map(r => (<SelectItem key={r.id} value={r.id.toString()}>{`#${r.id} - ${r.userName || 'N/A'} (${r.reason})`}</SelectItem>))}</SelectContent>
                              </Select><FormMessage /></FormItem> )}/>
                         <FormField control={logForm.control} name="deviceId" render={({ field }) => ( 
                          <FormItem><FormLabel>Device</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} disabled={isLoading.all || !!serviceRequestIdValue}>
                                <FormControl><SelectTrigger><SelectValue placeholder={isLoading.all ? "Loading..." : "Select a device"} /></SelectTrigger></FormControl>
                                <SelectContent>{!isLoading.all && devices.map(d => (<SelectItem key={d.serialNumber} value={d.serialNumber}>{`${d.deviceName} (${d.serialNumber})`}</SelectItem>))}</SelectContent>
                              </Select><FormMessage /></FormItem> )}/>
                         <FormField control={logForm.control} name="userId" render={({ field }) => ( 
                          <FormItem><FormLabel>User</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={isLoading.all || !!serviceRequestIdValue}>
                              <FormControl><SelectTrigger><SelectValue placeholder={isLoading.all ? "Loading..." : "Select a user"} /></SelectTrigger></FormControl>
                              <SelectContent>{!isLoading.all && allUsers.map(user => (<SelectItem key={user.id} value={user.id.toString()}>{`${user.name} (${user.email})`}</SelectItem>))}</SelectContent>
                            </Select><FormMessage /></FormItem> )}/>
                         <FormField control={logForm.control} name="actionsTaken" render={({ field }) => ( <FormItem><FormLabel>Actions Taken</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem> )}/>
                         <FormField control={logForm.control} name="result" render={({ field }) => ( <FormItem><FormLabel>Result</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                    </CardContent>
                    <CardFooter><Button type="submit" disabled={isSubmitting}>{isSubmitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />} Save Log Entry</Button></CardFooter>
                </form>
             </Form>
           </Card>
           <Card>
                <CardHeader><CardTitle>Service Log History</CardTitle><CardDescription>{isLoading.all ? "Loading..." : `Found ${serviceLogs.length} log entries.`}</CardDescription></CardHeader>
                <CardContent>
                    {isLoading.all ? renderLoading() : serviceLogs.length === 0 ? renderEmpty(BookText, "No Log Entries Found", "The service logbook is empty.") : (
                        <Table><TableHeader><TableRow><TableHead>Service Date</TableHead><TableHead>Request ID</TableHead><TableHead>Technician</TableHead><TableHead>User</TableHead><TableHead>Device</TableHead><TableHead>Result</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                            <TableBody>{serviceLogs.map((log) => (<TableRow key={log.id}>
                                <TableCell>{format(new Date(log.serviceDate), "PPP")}</TableCell>
                                <TableCell>{log.serviceRequestId ? `#${log.serviceRequestId}` : 'N/A'}</TableCell>
                                <TableCell>{log.technicianName}</TableCell><TableCell>{log.userName || 'N/A'}</TableCell>
                                <TableCell>{log.deviceName || 'N/A'}</TableCell><TableCell>{log.result}</TableCell>
                                <TableCell className="text-right"><Dialog><DialogTrigger asChild><Button variant="ghost" size="sm">View Actions</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Actions Taken</DialogTitle></DialogHeader><p className="py-4">{log.actionsTaken}</p></DialogContent></Dialog></TableCell>
                            </TableRow>))}</TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
      
      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          {detailItem && 'subject' in detailItem && ( // It's a SupportTicket
            <>
              <DialogHeader><DialogTitle>Ticket #{detailItem.id}: {detailItem.subject}</DialogTitle><DialogDescription>From: {detailItem.name} ({detailItem.email}) on {format(new Date(detailItem.timestamp), "PPP p")}</DialogDescription></DialogHeader>
              <div className="my-4 p-4 bg-muted rounded-md"><p className="text-sm">{detailItem.message}</p></div>
            </>
          )}
          {detailItem && 'reason' in detailItem && ( // It's a ServiceRequest
            <>
              <DialogHeader><DialogTitle>Service Request #{detailItem.id}</DialogTitle><DialogDescription>From: {detailItem.userName || 'N/A'} ({detailItem.userEmail || 'N/A'}) for device {detailItem.deviceName || 'N/A'}</DialogDescription></DialogHeader>
              <div className="space-y-4 my-4">
                <div><p className="font-semibold text-sm">Reason:</p><p>{detailItem.reason}</p></div>
                <div><p className="font-semibold text-sm">Contact Phone:</p><p>{detailItem.phoneNumber}</p></div>
                {detailItem.notes && <div><p className="font-semibold text-sm">Internal Notes:</p><p className="text-sm p-2 bg-muted rounded">{detailItem.notes}</p></div>}
                <div>
                    <h4 className="font-semibold text-sm mb-2">Related Log Entries</h4>
                    <div className="max-h-48 overflow-y-auto space-y-2 border p-2 rounded-md">
                        {serviceLogs.filter(l => l.serviceRequestId === detailItem.id).length > 0 ? (
                           serviceLogs.filter(l => l.serviceRequestId === detailItem.id).map(log => (
                               <div key={log.id} className="text-xs bg-background p-2 rounded border">
                                   <p><strong>{log.technicianName} on {format(new Date(log.serviceDate), "PPP")}:</strong> {log.result}</p>
                                   <p className="text-muted-foreground mt-1">{log.actionsTaken}</p>
                               </div>
                           ))
                        ) : (<p className="text-xs text-muted-foreground text-center p-4">No log entries linked to this request.</p>)}
                    </div>
                </div>
              </div>
            </>
          )}
          <DialogFooter><DialogClose asChild><Button type="button" variant="secondary">Close</Button></DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
