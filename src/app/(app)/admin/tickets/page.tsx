
"use client";

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, AlertTriangle, Inbox, HardDrive, Wrench, BookText } from 'lucide-react';
import type { User, SupportTicket, AdminDeviceView, AdminServiceRequestView, AdminServiceLogView } from '@/lib/types';
import { TicketStatus, ServiceRequestStatus } from '@/lib/types';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

const serviceLogSchema = z.object({
  technicianName: z.string().min(2, "Technician name is required"),
  userId: z.string().min(1, "User is required"),
  deviceId: z.string().min(1, "Device is required"),
  actionsTaken: z.string().min(10, "Actions taken must be at least 10 characters"),
  result: z.string().min(5, "Result must be at least 5 characters"),
});

export default function AdminPage() {
  const router = useRouter();
  const { user: adminUser } = useAuth();
  const { toast } = useToast();
  
  // States for each data type
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [devices, setDevices] = useState<AdminDeviceView[]>([]);
  const [serviceRequests, setServiceRequests] = useState<AdminServiceRequestView[]>([]);
  const [serviceLogs, setServiceLogs] = useState<AdminServiceLogView[]>([]);

  // Loading and error states
  const [isLoading, setIsLoading] = useState({ tickets: true, devices: true, requests: true, logs: true, formData: true });
  const [errors, setErrors] = useState({ tickets: null, devices: null, requests: null, logs: null, formData: null });
  
  // States for Service Log Form
  const [allUsers, setAllUsers] = useState<User[]>([]);

  const fetchData = useCallback(async (type: 'tickets' | 'devices' | 'requests' | 'logs' | 'formData') => {
    const stateKey = type === 'formData' ? 'formData' : type;
    setIsLoading(prev => ({ ...prev, [stateKey]: true }));
    setErrors(prev => ({ ...prev, [stateKey]: null }));

    try {
      let url = '';
      if (type === 'tickets') url = '/api/support/tickets';
      if (type === 'devices') url = '/api/admin/devices';
      if (type === 'requests') url = '/api/admin/service-requests';
      if (type === 'logs') url = '/api/admin/service-log';
      
      if (type === 'formData') {
          const usersRes = await fetch('/api/admin/users');
          if (!usersRes.ok) throw new Error("Failed to load user data for form.");
          const usersData = await usersRes.json();
          setAllUsers(usersData);
          setIsLoading(prev => ({ ...prev, formData: false }));
          return;
      }

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch ${type}`);
      const data = await response.json();
      
      if (type === 'tickets') setTickets(data);
      if (type === 'devices') setDevices(data);
      if (type === 'requests') setServiceRequests(data);
      if (type === 'logs') setServiceLogs(data);

    } catch (err: any) {
      setErrors(prev => ({ ...prev, [stateKey]: err.message }));
    } finally {
      if (type !== 'formData') {
        setIsLoading(prev => ({ ...prev, [stateKey]: false }));
      }
    }
  }, []);

  useEffect(() => {
    fetchData('tickets');
    fetchData('devices');
    fetchData('requests');
    fetchData('logs');
    fetchData('formData');
  }, [fetchData]);
  
  const logForm = useForm<z.infer<typeof serviceLogSchema>>({
    resolver: zodResolver(serviceLogSchema),
    defaultValues: {
      technicianName: adminUser?.name || '',
      userId: '',
      deviceId: '',
      actionsTaken: '',
      result: '',
    },
  });

  const deviceIdValue = logForm.watch('deviceId');

  useEffect(() => {
    if (adminUser?.name) {
      logForm.setValue('technicianName', adminUser.name);
    }
  }, [adminUser, logForm]);

  useEffect(() => {
    if (deviceIdValue) {
      const selectedDevice = devices.find(d => d.serialNumber === deviceIdValue);
      if (selectedDevice && selectedDevice.userId) {
        logForm.setValue('userId', selectedDevice.userId.toString(), { shouldValidate: true });
      }
    }
  }, [deviceIdValue, devices, logForm]);

  const handleLogSubmit: SubmitHandler<z.infer<typeof serviceLogSchema>> = async (values) => {
    try {
      const response = await fetch('/api/admin/service-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, serviceDate: Date.now() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to submit log entry.");
      toast({ title: "Log Entry Saved" });
      logForm.reset({
        technicianName: adminUser?.name || '',
        userId: '',
        deviceId: '',
        actionsTaken: '',
        result: '',
      });
      fetchData('logs'); // Refresh logs
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: 'destructive' });
    }
  };


  const getStatusVariant = (status: TicketStatus | ServiceRequestStatus) => {
    switch (status) {
      case TicketStatus.PENDING:
      case ServiceRequestStatus.PENDING:
        return 'secondary';
      case TicketStatus.IN_PROGRESS:
      case ServiceRequestStatus.IN_PROGRESS:
        return 'default';
      case TicketStatus.RESOLVED:
      case ServiceRequestStatus.COMPLETED:
        return 'outline';
      default: return 'secondary';
    }
  };
  
  const getWarrantyStatus = (warrantyEndDate: number) => {
    const now = Date.now();
    const threeMonths = 3 * 30 * 24 * 60 * 60 * 1000;
    if (now > warrantyEndDate) return { text: 'Expired', variant: 'destructive' as const };
    if (warrantyEndDate - now < threeMonths) return { text: 'Expires Soon', variant: 'secondary' as const };
    return { text: 'Active', variant: 'default' as const };
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
        action={ <Button onClick={() => router.push('/support')} variant="outline"> <ArrowLeft className="mr-2 h-4 w-4" /> Back to Support </Button> }
      />
      
      <Tabs defaultValue="tickets" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="tickets"><Inbox className="mr-2 h-4 w-4" />Support Tickets</TabsTrigger>
          <TabsTrigger value="devices"><HardDrive className="mr-2 h-4 w-4" />Device Registry</TabsTrigger>
          <TabsTrigger value="requests"><Wrench className="mr-2 h-4 w-4" />Service Requests</TabsTrigger>
          <TabsTrigger value="logbook"><BookText className="mr-2 h-4 w-4" />Service Logbook</TabsTrigger>
        </TabsList>
        
        <TabsContent value="tickets" className="mt-4">
            <Card>
                <CardHeader> <CardTitle>All Support Tickets</CardTitle> <CardDescription>{isLoading.tickets ? "Loading..." : `Found ${tickets.length} tickets.`}</CardDescription> </CardHeader>
                <CardContent>
                    {renderError(errors.tickets)}
                    {isLoading.tickets ? renderLoading() : tickets.length === 0 ? renderEmpty(Inbox, "No Tickets Found", "The support queue is empty.") : (
                        <Table>
                            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Subject</TableHead><TableHead>From</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                            <TableBody>
                            {tickets.map((ticket) => (
                                <TableRow key={ticket.id}>
                                <TableCell>{format(new Date(ticket.timestamp), "MMM d, yyyy HH:mm")}</TableCell>
                                <TableCell className="font-medium">{ticket.subject}</TableCell>
                                <TableCell>{ticket.email}</TableCell>
                                <TableCell><Badge variant={getStatusVariant(ticket.status)}>{ticket.status.replace('_', ' ').toLowerCase()}</Badge></TableCell>
                                <TableCell className="text-right"><Dialog><DialogTrigger asChild><Button variant="ghost" size="sm">View</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{ticket.subject}</DialogTitle><DialogDescription>From: {ticket.name} ({ticket.email})</DialogDescription></DialogHeader><div className="my-4 p-4 bg-muted rounded-md">{ticket.message}</div></DialogContent></Dialog></TableCell>
                                </TableRow>
                            ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </TabsContent>
        
        <TabsContent value="devices" className="mt-4">
            <Card>
                <CardHeader><CardTitle>Registered Devices</CardTitle><CardDescription>{isLoading.devices ? "Loading..." : `Found ${devices.length} devices.`}</CardDescription></CardHeader>
                <CardContent>
                    {renderError(errors.devices)}
                    {isLoading.devices ? renderLoading() : devices.length === 0 ? renderEmpty(HardDrive, "No Devices Found", "No devices registered in the system.") : (
                        <Table>
                            <TableHeader><TableRow><TableHead>Serial</TableHead><TableHead>Device Name</TableHead><TableHead>Owner</TableHead><TableHead>Warranty</TableHead></TableRow></TableHeader>
                            <TableBody>
                            {devices.map((device) => {
                                const warranty = getWarrantyStatus(device.warrantyEndDate);
                                return (<TableRow key={device.serialNumber}><TableCell>{device.serialNumber}</TableCell><TableCell>{device.deviceName}</TableCell><TableCell>{device.userName}</TableCell><TableCell><Badge variant={warranty.variant}>{warranty.text}</Badge></TableCell></TableRow>);
                            })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </TabsContent>
        
         <TabsContent value="requests" className="mt-4">
            <Card>
                <CardHeader><CardTitle>Service Requests</CardTitle><CardDescription>{isLoading.requests ? "Loading..." : `Found ${serviceRequests.length} requests.`}</CardDescription></CardHeader>
                <CardContent>
                    {renderError(errors.requests)}
                    {isLoading.requests ? renderLoading() : serviceRequests.length === 0 ? renderEmpty(Wrench, "No Service Requests", "The service request queue is empty.") : (
                        <Table>
                            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>User</TableHead><TableHead>Device</TableHead><TableHead>Reason</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                            <TableBody>
                            {serviceRequests.map((req) => (<TableRow key={req.id}>
                                <TableCell>{format(new Date(req.timestamp), "MMM d, yyyy HH:mm")}</TableCell>
                                <TableCell>{req.userName}</TableCell><TableCell>{req.deviceName} ({req.deviceId})</TableCell>
                                <TableCell>{req.reason}</TableCell><TableCell>{req.phoneNumber}</TableCell>
                                <TableCell><Badge variant={getStatusVariant(req.status)}>{req.status.replace('_', ' ').toLowerCase()}</Badge></TableCell>
                            </TableRow>))}
                            </TableBody>
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
                         <FormField control={logForm.control} name="deviceId" render={({ field }) => ( 
                          <FormItem>
                            <FormLabel>Device</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value} disabled={isLoading.devices}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder={isLoading.devices ? "Loading devices..." : "Select a device"} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {!isLoading.devices && devices.map(device => (
                                    <SelectItem key={device.serialNumber} value={device.serialNumber}>
                                      {device.deviceName} ({device.serialNumber})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            <FormMessage />
                          </FormItem> 
                        )}/>
                         <FormField control={logForm.control} name="userId" render={({ field }) => ( 
                          <FormItem>
                            <FormLabel>User</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={isLoading.formData || !deviceIdValue}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={isLoading.formData ? "Loading users..." : "Select a user"} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {!isLoading.formData && allUsers.map(user => (
                                  <SelectItem key={user.id} value={user.id.toString()}>
                                    {user.name} ({user.email})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem> 
                        )}/>
                         <FormField control={logForm.control} name="actionsTaken" render={({ field }) => ( <FormItem><FormLabel>Actions Taken</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem> )}/>
                         <FormField control={logForm.control} name="result" render={({ field }) => ( <FormItem><FormLabel>Result</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" disabled={logForm.formState.isSubmitting}>
                          {logForm.formState.isSubmitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />} Save Log Entry
                        </Button>
                    </CardFooter>
                </form>
             </Form>
           </Card>
           <Card>
                <CardHeader><CardTitle>Service Log History</CardTitle><CardDescription>{isLoading.logs ? "Loading..." : `Found ${serviceLogs.length} log entries.`}</CardDescription></CardHeader>
                <CardContent>
                    {renderError(errors.logs)}
                    {isLoading.logs ? renderLoading() : serviceLogs.length === 0 ? renderEmpty(BookText, "No Log Entries Found", "The service logbook is empty.") : (
                        <Table>
                            <TableHeader><TableRow><TableHead>Service Date</TableHead><TableHead>Technician</TableHead><TableHead>User</TableHead><TableHead>Device</TableHead><TableHead>Result</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                            <TableBody>
                            {serviceLogs.map((log) => (<TableRow key={log.id}>
                                <TableCell>{format(new Date(log.serviceDate), "PPP")}</TableCell>
                                <TableCell>{log.technicianName}</TableCell><TableCell>{log.userName}</TableCell>
                                <TableCell>{log.deviceName}</TableCell><TableCell>{log.result}</TableCell>
                                <TableCell className="text-right"><Dialog><DialogTrigger asChild><Button variant="ghost" size="sm">View Actions</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Actions Taken</DialogTitle></DialogHeader><p className="py-4">{log.actionsTaken}</p></DialogContent></Dialog></TableCell>
                            </TableRow>))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
