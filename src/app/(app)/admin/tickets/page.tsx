
"use client";

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, AlertTriangle, Inbox } from 'lucide-react';
import type { SupportTicket } from '@/lib/types';
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
import { useRouter } from 'next/navigation';

export default function TicketManagementPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchTickets = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/support/tickets');
      if (!response.ok) {
        throw new Error('Failed to fetch tickets');
      }
      const data = await response.json();
      setTickets(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const getStatusVariant = (status: TicketStatus) => {
    switch (status) {
      case TicketStatus.PENDING:
        return 'secondary';
      case TicketStatus.IN_PROGRESS:
        return 'default';
      case TicketStatus.RESOLVED:
        return 'outline';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <PageHeader
        title="Ticket Management"
        description="View and manage customer support tickets."
        action={
          <div className="flex items-center gap-2">
            <Button onClick={fetchTickets} variant="outline" disabled={isLoading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={() => router.push('/support')} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Support
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>All Tickets</CardTitle>
          <CardDescription>
            {isLoading ? "Loading tickets..." : `Found ${tickets.length} tickets.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-destructive flex items-center gap-2">
              <AlertTriangle />
              <p>Error loading tickets: {error}</p>
            </div>
          )}

          {isLoading && (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          )}

          {!isLoading && !error && tickets.length === 0 && (
             <div className="flex flex-col items-center justify-center min-h-[200px] text-center text-muted-foreground border-2 border-dashed border-border rounded-lg p-8">
                <Inbox className="h-12 w-12 mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold">No Tickets Found</h3>
                <p className="max-w-xs text-sm">The support queue is empty.</p>
            </div>
          )}
          
          {!isLoading && !error && tickets.length > 0 && (
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
                      <TableCell className="hidden md:table-cell">
                        {format(new Date(ticket.timestamp), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="font-medium">{ticket.subject}</TableCell>
                      <TableCell>{ticket.email}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(ticket.status)} className="capitalize">
                          {ticket.status.replace('_', ' ').toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm">View</Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md">
                              <DialogHeader>
                                <DialogTitle>{ticket.subject}</DialogTitle>
                                <DialogDescription>
                                  From: {ticket.name} ({ticket.email}) on {format(new Date(ticket.timestamp), "PPP p")}
                                </DialogDescription>
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
    </div>
  );
}
