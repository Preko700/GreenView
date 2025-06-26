
"use client";

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, Inbox, HardDrive, MoreHorizontal, MessageSquare, Phone, Book, PlusCircle } from 'lucide-react';
import type { SupportTicket, AdminDeviceView, AdminServiceRequestView, AdminServiceLogView, User, Device } from '@/lib/types';
import { TicketStatus, ServiceRequestStatus } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type SubmitHandler } from "react-hook-form";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const serviceLogSchema = z.object({
  technicianName: z.string().min(2, "Technician name is required."),
  userId: z.string().min(1, "User must be selected."),
  deviceId: z.string().min(1, "Device must be selected."),
  serviceDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date" }),
  actionsTaken: z.string().min(10, "Please describe the actions taken in detail."),
  result: z.string().min(5, "Please describe the result."),
  serviceRequestId: z.string().optional(),
});

type ServiceLogFormValues = z.infer<typeof serviceLogSchema>;

export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [devices, setDevices] = useState<AdminDeviceView[]>([]);
  const [serviceRequests, setServiceRequests] = useState<AdminServiceRequestView[]>([]);
  const [serviceLogs, setServiceLogs] = useState<AdminServiceLogView[]>([]);
  const [users, setUsers] = useState<Pick<User, 'id' | 'name'>[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [detailItem, setDetailItem] = useState<SupportTicket | AdminServiceRequestView | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isLogFormOpen, setIsLogFormOpen] = useState(false);
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);
  const [detailLogs, setDetailLogs] = useState<AdminServiceLogView[]>([]);
  const [isLoadingDetailLogs, setIsLoadingDetailLogs] = useState(false);

  const logForm = useForm<ServiceLogFormValues>({
    resolver: zodResolver(serviceLogSchema),
    defaultValues: {
      technicianName: '',
      userId: '',
      deviceId: '',
      serviceDate: new Date().toISOString().split('T')[0],
      actionsTaken: '',
      result: '',
      serviceRequestId: '',
    },
  });
  
  const watchedUserId = logForm.watch('userId');
  const userOwnedDevices = devices.filter(d => d.userId === parseInt(watchedUserId));

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [ticketsRes, devicesRes, serviceReqRes, serviceLogRes, usersRes] = await Promise.all([
        fetch('/api/support/tickets'),
        fetch('/api/admin/devices'),
        fetch('/api/admin/service-requests'),
        fetch('/api/admin/service-log'),
        fetch('/api/admin/users'),
      ]);
      
      if (!ticketsRes.ok) throw new Error((await ticketsRes.json()).message || 'Failed to fetch tickets');
      if (!devicesRes.ok) throw new Error((await devicesRes.json()).message || 'Failed to fetch devices');
      if (!serviceReqRes.ok) throw new Error((await serviceReqRes.json()).message || 'Failed to fetch service requests');
      if (!serviceLogRes.ok) throw new Error((await serviceLogRes.json()).message || 'Failed to fetch service logs');
      if (!usersRes.ok) throw new Error((await usersRes.json()).message || 'Failed to fetch users');
      
      setTickets(await ticketsRes.json());
      setDevices(await devicesRes.json());
      setServiceRequests(await serviceReqRes.json());
      setServiceLogs(await serviceLogRes.json());
      setUsers(await usersRes.json());

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
  
  useEffect(() => {
     if (watchedUserId) {
        logForm.setValue('deviceId', '');
     }
  }, [watchedUserId, logForm]);

  const handleStatusChange = async (id: number, type: 'ticket' | 'request', status: TicketStatus | ServiceRequestStatus) => {
    const url = type === 'ticket' ? `/api/support/tickets/${id}` : `/api/admin/service-requests/${id}`;
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || `Failed to update ${type} status`);
      toast({ title: "Status Updated", description: `${type.charAt(0).toUpperCase() + type.slice(1)} #${id} status updated.` });
      fetchData(); // Refresh all data
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: 'destructive' });
    }
  };
  
  const handleLogSubmit: SubmitHandler<ServiceLogFormValues> = async (values) => {
    setIsSubmittingLog(true);
    const serviceDateTimestamp = new Date(values.serviceDate).getTime();
    
    const payload: any = {
        ...values,
        userId: parseInt(values.userId, 10),
        serviceDate: serviceDateTimestamp
    };
    
    // Only include serviceRequestId if it's a valid number
    if (values.serviceRequestId) {
        const reqId = parseInt(values.serviceRequestId, 10);
        if (!isNaN(reqId) && reqId > 0) {
            payload.serviceRequestId = reqId;
        } else {
            delete payload.serviceRequestId;
        }
    } else {
        delete payload.serviceRequestId;
    }

    try {
        const res = await fetch('/api/admin/service-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to create log entry.");
        toast({ title: "Log Entry Created", description: "The service log has been successfully updated." });
        setIsLogFormOpen(false);
        logForm.reset({ serviceDate: new Date().toISOString().split('T')[0] });
        fetchData();
    } catch (err: any) {
        toast({ title: "Submission Failed", description: err.message, variant: 'destructive' });
    } finally {
        setIsSubmittingLog(false);
    }
  };

  const getStatusVariant = (status: TicketStatus | ServiceRequestStatus) => ({
    [TicketStatus.PENDING]: 'secondary',
    [TicketStatus.IN_PROGRESS]: 'default',
    [TicketStatus.RESOLVED]: 'outline',
    [ServiceRequestStatus.PENDING]: 'secondary',
    [ServiceRequestStatus.SCHEDULED]: 'default',
    [ServiceRequestStatus.COMPLETED]: 'outline',
    [ServiceRequestStatus.CANCELLED]: 'destructive',
  })[status] || 'secondary';

  const openTicketDetails = (ticket: SupportTicket) => { setDetailItem(ticket); setIsDetailOpen(true); };
  const openRequestDetails = async (request: AdminServiceRequestView) => {
    setDetailItem(request);
    setIsDetailOpen(true);
    setIsLoadingDetailLogs(true);
    try {
      const res = await fetch(`/api/admin/service-log?serviceRequestId=${request.id}`);
      if (!res.ok) throw new Error('Failed to fetch related service logs');
      const logs = await res.json();
      setDetailLogs(logs);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: 'destructive' });
      setDetailLogs([]);
    } finally {
      setIsLoadingDetailLogs(false);
    }
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
        description="Manage tickets, service requests, devices, and service logs."
        action={<Button onClick={fetchData} variant="outline" disabled={isLoading}> <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh Data </Button>}
      />
      
      {renderError(error)}

      <Tabs defaultValue="tickets" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="tickets"><Inbox className="mr-2 h-4 w-4" />Support Tickets</TabsTrigger>
          <TabsTrigger value="requests"><Phone className="mr-2 h-4 w-4" />Service Requests</TabsTrigger>
          <TabsTrigger value="log"><Book className="mr-2 h-4 w-4" />Service Log</TabsTrigger>
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
                            <DropdownMenuItem onClick={() => openTicketDetails(ticket)}><MessageSquare className="mr-2 h-4 w-4"/>View Details</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(ticket.id, 'ticket', TicketStatus.IN_PROGRESS)}>Set In Progress</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(ticket.id, 'ticket', TicketStatus.RESOLVED)}>Set Resolved</DropdownMenuItem>
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
            <CardHeader><CardTitle>Service Requests</CardTitle><CardDescription>{isLoading ? "Loading..." : `Found ${serviceRequests.length} requests.`}</CardDescription></CardHeader>
            <CardContent>
              {isLoading ? renderLoading() : serviceRequests.length === 0 ? renderEmpty(Phone, "No Service Requests", "No users have requested a service call.") : (
                <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>User</TableHead><TableHead>Device</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>{serviceRequests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>{format(new Date(req.timestamp), "PPP p")}</TableCell>
                      <TableCell>{req.userName || 'N/A'}</TableCell>
                      <TableCell>{req.deviceName || 'N/A'}</TableCell>
                      <TableCell className="font-medium">{req.reason}</TableCell>
                      <TableCell><Badge variant={getStatusVariant(req.status)}>{req.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openRequestDetails(req)}><MessageSquare className="mr-2 h-4 w-4"/>View Details</DropdownMenuItem>
                            <DropdownMenuLabel>Change Status</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleStatusChange(req.id, 'request', ServiceRequestStatus.SCHEDULED)}>Set Scheduled</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(req.id, 'request', ServiceRequestStatus.COMPLETED)}>Set Completed</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(req.id, 'request', ServiceRequestStatus.CANCELLED)}>Set Cancelled</DropdownMenuItem>
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                             <DropdownMenuItem onClick={() => { logForm.reset({ serviceDate: new Date().toISOString().split('T')[0], userId: String(req.userId), deviceId: req.deviceId, serviceRequestId: String(req.id) }); setIsLogFormOpen(true); }}><PlusCircle className="mr-2 h-4 w-4"/>Create Log Entry</DropdownMenuItem>
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

        <TabsContent value="log" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div><CardTitle>Service Log</CardTitle><CardDescription>{isLoading ? "Loading..." : `Found ${serviceLogs.length} log entries.`}</CardDescription></div>
                <Button onClick={() => { logForm.reset({ serviceDate: new Date().toISOString().split('T')[0] }); setIsLogFormOpen(true); }}><PlusCircle className="mr-2 h-4 w-4"/>Add Log Entry</Button>
            </CardHeader>
            <CardContent>
              {isLoading ? renderLoading() : serviceLogs.length === 0 ? renderEmpty(Book, "No Log Entries", "No service calls have been logged yet.") : (
                <Table><TableHeader><TableRow><TableHead>Service Date</TableHead><TableHead>Technician</TableHead><TableHead>User</TableHead><TableHead>Device</TableHead><TableHead>Result</TableHead></TableRow></TableHeader>
                  <TableBody>{serviceLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{format(new Date(log.serviceDate), "PPP")}</TableCell>
                      <TableCell>{log.technicianName}</TableCell>
                      <TableCell>{log.userName || 'N/A'}</TableCell>
                      <TableCell>{log.deviceName || 'N/A'}</TableCell>
                      <TableCell>{log.result}</TableCell>
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
                        <Table><TableHeader><TableRow><TableHead>Serial</TableHead><TableHead>Device Name</TableHead><TableHead>Owner</TableHead></TableRow></TableHeader>
                            <TableBody>{devices.map((device) => (
                                <TableRow key={device.serialNumber}><TableCell>{device.serialNumber}</TableCell><TableCell>{device.deviceName}</TableCell><TableCell>{device.userName || 'N/A'}</TableCell></TableRow>
                            ))}</TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
      
      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          {detailItem && 'subject' in detailItem && (
            <>
              <DialogHeader><DialogTitle>Ticket #{detailItem.id}: {detailItem.subject}</DialogTitle><DialogDescription>From: {detailItem.name} ({detailItem.email}) on {format(new Date(detailItem.timestamp), "PPP p")}</DialogDescription></DialogHeader>
              <div className="my-4 p-4 bg-muted rounded-md"><p className="text-sm">{detailItem.message}</p></div>
            </>
          )}
          {detailItem && 'reason' in detailItem && (
            <>
              <DialogHeader><DialogTitle>Service Request #{detailItem.id}</DialogTitle><DialogDescription>From: {detailItem.userName} ({detailItem.userEmail}) on {format(new Date(detailItem.timestamp), "PPP p")}</DialogDescription></DialogHeader>
              <div className="my-4 space-y-4">
                <div><h4 className="font-semibold">Device</h4><p>{detailItem.deviceName} (SN: {detailItem.deviceId})</p></div>
                <div><h4 className="font-semibold">Reason</h4><p>{detailItem.reason}</p></div>
                <div><h4 className="font-semibold">Phone</h4><p>{detailItem.phoneNumber}</p></div>
                <div><h4 className="font-semibold">Status</h4><p><Badge variant={getStatusVariant(detailItem.status)}>{detailItem.status}</Badge></p></div>
                <div><h4 className="font-semibold">Admin Notes</h4><p className="p-2 bg-muted rounded-md text-sm">{detailItem.notes || 'No notes yet.'}</p></div>
                <div>
                  <h4 className="font-semibold mb-2">Related Service Log</h4>
                  {isLoadingDetailLogs ? <Skeleton className="h-16 w-full"/> : detailLogs.length > 0 ? (
                    <div className="space-y-3 max-h-48 overflow-y-auto p-2 border rounded-md">
                      {detailLogs.map(log => (
                        <div key={log.id} className="text-xs">
                          <p><strong>{format(new Date(log.serviceDate), "PPP")} ({log.technicianName}):</strong> {log.actionsTaken} - <strong>Result:</strong> {log.result}</p>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">No service log entries for this request.</p>}
                </div>
              </div>
            </>
          )}
          <DialogFooter><DialogClose asChild><Button type="button" variant="secondary">Close</Button></DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Log Form Dialog */}
      <Dialog open={isLogFormOpen} onOpenChange={setIsLogFormOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Add Service Log Entry</DialogTitle><DialogDescription>Record the details of a service action.</DialogDescription></DialogHeader>
          <Form {...logForm}>
            <form onSubmit={logForm.handleSubmit(handleLogSubmit)} className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={logForm.control} name="technicianName" render={({ field }) => ( <FormItem><FormLabel>Technician Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={logForm.control} name="serviceDate" render={({ field }) => ( <FormItem><FormLabel>Service Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem> )}/>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={logForm.control} name="userId" render={({ field }) => (<FormItem><FormLabel>User</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a user" /></SelectTrigger></FormControl><SelectContent>{users.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>
                <FormField control={logForm.control} name="deviceId" render={({ field }) => (<FormItem><FormLabel>Device</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={!watchedUserId}><FormControl><SelectTrigger><SelectValue placeholder={watchedUserId ? "Select a device" : "Select a user first"} /></SelectTrigger></FormControl><SelectContent>{userOwnedDevices.map(d => <SelectItem key={d.serialNumber} value={d.serialNumber}>{d.deviceName}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>
              </div>
              <FormField control={logForm.control} name="serviceRequestId" render={({ field }) => (<FormItem><FormLabel>Link to Service Request (Optional)</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select a request" /></SelectTrigger></FormControl><SelectContent>{serviceRequests.map(r => <SelectItem key={r.id} value={String(r.id)}>#{r.id} - {r.reason.substring(0,30)}...</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)}/>
              <FormField control={logForm.control} name="actionsTaken" render={({ field }) => ( <FormItem><FormLabel>Actions Taken</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={logForm.control} name="result" render={({ field }) => ( <FormItem><FormLabel>Result</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="secondary" disabled={isSubmittingLog}>Cancel</Button></DialogClose>
                <Button type="submit" disabled={isSubmittingLog}>{isSubmittingLog && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Save Entry</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
