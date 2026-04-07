'use client';

import { useState, useMemo, useEffect } from 'react';
import { Calendar, Plus, Edit, Trash2, MapPin, Clock, Users, DollarSign, TrendingUp, Star, Mail, Phone, Building2, UserPlus, Loader2, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { useChapterBudget } from '@/lib/hooks/useChapterBudget';
import { useScopedChapterId } from '@/lib/hooks/useScopedChapterId';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEvents } from '@/lib/hooks/useEvents';
import { useVendors } from '@/lib/hooks/useVendors';
import { EventForm } from '@/components/ui/EventForm';
import { VendorForm } from '@/components/ui/VendorForm';
import { Event, CreateEventRequest, UpdateEventRequest, RSVPStatus } from '@/types/events';
import { VendorContact, CreateVendorRequest, UpdateVendorRequest } from '@/types/vendors';
import { InviteManagement } from '@/components/features/invitations/InviteManagement';
import { createPortal } from 'react-dom';
import { toast } from 'react-toastify';
import { cn } from '@/lib/utils';
import { useFeatureFlag } from '@/lib/hooks/useFeatureFlag';
import { useSearchParams } from 'next/navigation';
import { EventActionsMenu } from '@/components/features/events/EventActionsMenu';
import { EventDetailModal } from '@/components/features/events/EventDetailModal';
import {
  compareEventsByStartDesc,
  EVENT_TIME_TBD,
  isValidIsoDateTime,
} from '@/lib/utils/eventScheduleDisplay';

export function MobileEventsVendorsPage() {
  const { profile } = useProfile();
  const chapterId = useScopedChapterId();
  const { enabled: eventsManagementEnabled } = useFeatureFlag('events_management_enabled');
  const searchParams = useSearchParams();
  
  // Read tab from URL parameter, default based on flag
  const urlTab = searchParams.get('tab');
  const defaultTab = eventsManagementEnabled ? 'events' : 'invitations';
  const initialTab = (urlTab === 'events' || urlTab === 'vendors' || urlTab === 'invitations') 
    ? urlTab 
    : defaultTab;
  
  // Set initial tab based on flag and URL - if events disabled, default to 'invitations'
  const [activeTab, setActiveTab] = useState<'events' | 'vendors' | 'invitations'>(initialTab);
  const [eventsPage, setEventsPage] = useState(1);
  const [vendorsPage, setVendorsPage] = useState(1);
  const eventsPerPage = 6;
  const vendorsPerPage = 6;
  
  // Events state
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);
  const [selectedEventForModal, setSelectedEventForModal] = useState<Event | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [rsvpStatuses, setRsvpStatuses] = useState<Record<string, 'attending' | 'maybe' | 'not_attending'>>({});
  const { 
    events, 
    loading: eventsLoading, 
    error: eventsError, 
    createEvent, 
    updateEvent, 
    deleteEvent 
  } = useEvents({ 
    chapterId: chapterId || '', 
    scope: 'all' 
  });

  // Budget hook
  const { startingBudget } = useChapterBudget();

  // Vendors state
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState<VendorContact | null>(null);
  const [isSubmittingVendor, setIsSubmittingVendor] = useState(false);
  const { 
    vendors, 
    loading: vendorsLoading, 
    error: vendorsError, 
    createVendor, 
    updateVendor, 
    deleteVendor
  } = useVendors({ 
    chapterId: chapterId || '' 
  });

  // Event handlers
  const handleCreateEvent = async (eventData: CreateEventRequest) => {
    if (!chapterId) return;
    
    setIsSubmittingEvent(true);
    try {
      await createEvent({
        ...eventData,
        created_by: profile?.id || 'system',
        updated_by: profile?.id || 'system'
      });
      
      setShowEventForm(false);
      setEditingEvent(null);
      toast.success('Event created successfully!');
    } catch (error) {
      console.error('Error creating event:', error);
      toast.error('Failed to create event');
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  const handleUpdateEvent = async (eventData: UpdateEventRequest) => {
    if (!editingEvent) return;
    
    setIsSubmittingEvent(true);
    try {
      await updateEvent(editingEvent.id, {
        ...eventData,
        updated_by: profile?.id || 'system'
      });
      
      setShowEventForm(false);
      setEditingEvent(null);
      toast.success('Event updated successfully!');
    } catch (error) {
      console.error('Error updating event:', error);
      toast.error('Failed to update event');
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  const handleEditEvent = (event: Event) => {
    setEditingEvent(event);
    setShowEventForm(true);
  };

  // Handle event click to open detail modal
  const handleEventClick = (event: Event) => {
    setSelectedEventForModal(event);
    setIsEventModalOpen(true);
  };

  // Handle RSVP from modal (admin might need this for testing/viewing)
  const handleModalRsvpChange = async (eventId: string, status: RSVPStatus) => {
    if (!profile?.id) return;
    
    try {
      const response = await fetch(`/api/events/${eventId}/rsvp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status,
          user_id: profile.id,
        }),
      });

      if (response.ok) {
        setRsvpStatuses(prev => ({ ...prev, [eventId]: status as 'attending' | 'maybe' | 'not_attending' }));
        toast.success(`RSVP updated`);
      }
    } catch (error) {
      console.error('Error submitting RSVP:', error);
      toast.error('Failed to update RSVP');
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (confirm('Are you sure you want to archive this event? It will be removed from the main list but preserved for records.')) {
      const success = await deleteEvent(eventId);
      if (success) {
        toast.success('Event archived successfully!');
      } else {
        toast.error('Failed to archive event. Please try again.');
      }
    }
  };

  const handleCreateVendor = async (vendorData: CreateVendorRequest) => {
    if (!chapterId) return;
    
    setIsSubmittingVendor(true);
    try {
      const vendorWithUser = {
        ...vendorData,
        created_by: profile?.id || '',
        updated_by: profile?.id || ''
      };
      
      const newVendor = await createVendor(vendorWithUser);
      
      if (newVendor) {
        setShowVendorForm(false);
        setEditingVendor(null);
        toast.success('Vendor created successfully!');
      }
    } catch (error) {
      console.error('Error creating vendor:', error);
      toast.error('Failed to create vendor');
    } finally {
      setIsSubmittingVendor(false);
    }
  };

  const handleUpdateVendor = async (vendorData: UpdateVendorRequest) => {
    if (!editingVendor) return;
    
    setIsSubmittingVendor(true);
    try {
      const updatedVendor = await updateVendor(editingVendor.id, vendorData);
      
      if (updatedVendor) {
        setShowVendorForm(false);
        setEditingVendor(null);
        toast.success('Vendor updated successfully!');
      }
    } catch (error) {
      console.error('Error updating vendor:', error);
      toast.error('Failed to update vendor');
    } finally {
      setIsSubmittingVendor(false);
    }
  };

  const handleEditVendor = (vendor: VendorContact) => {
    setEditingVendor(vendor);
    setShowVendorForm(true);
  };

  const handleDeleteVendor = async (vendorId: string) => {
    if (confirm('Are you sure you want to delete this vendor? This action cannot be undone.')) {
      const success = await deleteVendor(vendorId);
      if (success) {
        toast.success('Vendor deleted successfully!');
      }
    }
  };

  // Budget statistics
  const budgetStats = useMemo(() => {
    const eventsWithBudget = events.filter(e => e.budget_amount && parseFloat(String(e.budget_amount)) > 0);
    const totalBudgetAllocated = eventsWithBudget.reduce((sum, e) => sum + parseFloat(String(e.budget_amount || 0)), 0);
    const remaining = startingBudget - totalBudgetAllocated;
    
    return {
      totalBudgetAllocated,
      eventsWithBudget: eventsWithBudget.length,
      totalEvents: events.length,
      startingBudget,
      remaining
    };
  }, [events, startingBudget]);

  const formatEventDate = (isoString: string | null): string => {
    if (!isoString || !isValidIsoDateTime(isoString)) return EVENT_TIME_TBD;
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Sort events by date (newest first)
  const sortedEvents = useMemo(() => {
    return [...events].sort(compareEventsByStartDesc);
  }, [events]);

  // Paginate events
  const paginatedEvents = useMemo(() => {
    const startIndex = (eventsPage - 1) * eventsPerPage;
    const endIndex = startIndex + eventsPerPage;
    return sortedEvents.slice(startIndex, endIndex);
  }, [sortedEvents, eventsPage, eventsPerPage]);

  // Paginate vendors
  const paginatedVendors = useMemo(() => {
    const startIndex = (vendorsPage - 1) * vendorsPerPage;
    const endIndex = startIndex + vendorsPerPage;
    return vendors.slice(startIndex, endIndex);
  }, [vendors, vendorsPage, vendorsPerPage]);

  // Calculate pagination info
  const eventsTotalPages = Math.ceil(sortedEvents.length / eventsPerPage);
  const eventsTotal = sortedEvents.length;
  const eventsStartIndex = (eventsPage - 1) * eventsPerPage;
  const eventsEndIndex = Math.min(eventsPage * eventsPerPage, eventsTotal);
  const eventsStart = eventsStartIndex + 1;

  const vendorsTotalPages = Math.ceil(vendors.length / vendorsPerPage);
  const vendorsTotal = vendors.length;
  const vendorsStartIndex = (vendorsPage - 1) * vendorsPerPage;
  const vendorsEndIndex = Math.min(vendorsPage * vendorsPerPage, vendorsTotal);
  const vendorsStart = vendorsStartIndex + 1;

  // Reset pages when switching tabs
  useEffect(() => {
    if (activeTab !== 'events') {
      setEventsPage(1);
    }
    if (activeTab !== 'vendors') {
      setVendorsPage(1);
    }
  }, [activeTab]);

  // Redirect to invitations if events tab is selected but flag is disabled
  useEffect(() => {
    if (activeTab === 'events' && !eventsManagementEnabled) {
      setActiveTab('invitations');
    }
  }, [activeTab, eventsManagementEnabled]);

  // Add mobile detection (it's mobile-only page, but still detect for drawer)
  const [isMobile, setIsMobile] = useState(true); // Default true since it's mobile page

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="min-h-screen w-full max-w-none bg-gray-50 pt-0 pb-20 px-0">
      {/* Full width of parent padded column (AdminOverview); no max-w-md gutter */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className={`grid w-full mb-2 h-11 bg-transparent p-0 rounded-none border-b border-gray-200 ${eventsManagementEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {eventsManagementEnabled && (
              <TabsTrigger value="events" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary data-[state=active]:shadow-none text-gray-500 data-[state=active]:bg-transparent bg-transparent">Events</TabsTrigger>
            )}
            <TabsTrigger value="vendors" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary data-[state=active]:shadow-none text-gray-500 data-[state=active]:bg-transparent bg-transparent">Vendors</TabsTrigger>
            <TabsTrigger value="invitations" className="text-sm font-medium rounded-none border-b-2 border-transparent data-[state=active]:border-brand-primary data-[state=active]:text-brand-primary data-[state=active]:shadow-none text-gray-500 data-[state=active]:bg-transparent bg-transparent">Invites</TabsTrigger>
          </TabsList>

          {/* Events Tab - Only render if flag is enabled */}
          {eventsManagementEnabled && (
            <TabsContent value="events" className="space-y-4">
              {/* Create Event Button */}
              <Button 
                onClick={() => {
                  setEditingEvent(null);
                  setShowEventForm(true);
                }}
                className="rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 w-full md:w-auto transition-all duration-300"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Event
              </Button>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:scale-[1.02] hover:bg-white/90">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-700 font-medium mb-1">Total Events</p>
                        <p className="text-xl font-semibold text-slate-900">{budgetStats.totalEvents}</p>
                      </div>
                      <Calendar className="h-5 w-5 text-brand-primary" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:scale-[1.02] hover:bg-white/90">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-700 font-medium mb-1">With Budget</p>
                        <p className="text-xl font-semibold text-slate-900">{budgetStats.eventsWithBudget}</p>
                      </div>
                      <DollarSign className="h-5 w-5 text-brand-primary" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Budget Overview */}
              <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90">
                <CardHeader className="pb-3 flex-shrink-0 border-b border-primary-100/30">
                  <CardTitle className="text-sm text-slate-900 font-semibold">Budget Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-700">Allocated</span>
                    <span className="font-semibold text-sm text-slate-900">${budgetStats.totalBudgetAllocated.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-700">Remaining</span>
                    <span className={`font-semibold text-sm ${budgetStats.remaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${budgetStats.remaining.toLocaleString()}
                    </span>
                  </div>
                  <Progress 
                    value={(budgetStats.totalBudgetAllocated / budgetStats.startingBudget) * 100} 
                    className="h-2"
                  />
                </CardContent>
              </Card>

              {/* Events List */}
              {eventsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
                </div>
              ) : eventsError ? (
                <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
                  <CardContent className="p-4 text-center">
                    <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                    <p className="text-sm text-red-500">Error loading events</p>
                  </CardContent>
                </Card>
              ) : sortedEvents.length === 0 ? (
                <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
                  <CardContent className="p-4 text-center">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500 mb-2">No events found</p>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setEditingEvent(null);
                        setShowEventForm(true);
                      }}
                      size="sm"
                      className="rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
                    >
                      Create First Event
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="space-y-2">
                    {paginatedEvents.map((event) => (
                      <Card 
                        key={event.id} 
                        className="p-3 bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 cursor-pointer"
                        onClick={() => handleEventClick(event)}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-sm truncate text-slate-900">{event.title}</h3>
                              <div className="flex items-center space-x-2 mt-1 text-xs text-slate-700">
                                <Clock className="h-3 w-3" />
                                <span>{formatEventDate(event.start_time)}</span>
                              </div>
                              {event.location && (
                                <div className="flex items-center space-x-2 mt-1 text-xs text-slate-700">
                                  <MapPin className="h-3 w-3" />
                                  <span className="truncate">{event.location}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center space-x-1 ml-2" onClick={(e) => e.stopPropagation()}>
                              <EventActionsMenu event={event} hideOnMobile />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditEvent(event)}
                                className="h-8 w-8 p-0 text-brand-primary-hover hover:text-primary-900 hover:bg-primary-50"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteEvent(event.id)}
                                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                title="Archive event"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            {event.budget_amount && (
                              <Badge variant="outline" className="text-xs border-primary-200 text-slate-700">
                                <DollarSign className="h-3 w-3 mr-1" />
                                ${parseFloat(String(event.budget_amount)).toLocaleString()}
                              </Badge>
                            )}
                            <Badge className={
                              event.status === 'published' ? 'bg-green-100 text-green-800' :
                              event.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                              'bg-red-100 text-red-800'
                            }>
                              {event.status}
                            </Badge>
                            {event.attendee_count !== undefined && (
                              <div className="flex items-center text-xs text-slate-700">
                                <Users className="h-3 w-3 mr-1" />
                                {event.attendee_count}
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  {/* Pagination Controls */}
                  {eventsTotalPages > 1 && (
                    <div className="flex flex-col items-center space-y-3 pt-4 border-t border-gray-200 mt-4">
                      <div className="text-xs text-gray-600">
                        Showing {eventsStart} to {eventsEndIndex} of {eventsTotal} events
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEventsPage(prev => Math.max(1, prev - 1))}
                          disabled={eventsPage === 1 || eventsLoading}
                          className="h-8 px-3 text-xs rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                          Previous
                        </Button>
                        <div className="flex items-center space-x-1 px-2">
                          <span className="text-xs text-gray-600">Page</span>
                          <span className="text-xs font-medium">{eventsPage}</span>
                          <span className="text-xs text-gray-600">of</span>
                          <span className="text-xs font-medium">{eventsTotalPages}</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEventsPage(prev => Math.min(eventsTotalPages, prev + 1))}
                          disabled={eventsPage === eventsTotalPages || eventsLoading}
                          className="h-8 px-3 text-xs rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                          <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </div>
                      {/* Page Number Buttons - Show up to 5 pages */}
                      {eventsTotalPages <= 5 && (
                        <div className="flex items-center space-x-1">
                          {Array.from({ length: eventsTotalPages }, (_, i) => i + 1).map((page) => (
                            <Button
                              key={page}
                              variant={eventsPage === page ? "default" : "outline"}
                              size="sm"
                              onClick={() => setEventsPage(page)}
                              className={`h-8 w-8 p-0 text-xs rounded-full transition-all duration-300 ${
                                eventsPage === page
                                  ? 'bg-brand-primary text-white hover:bg-brand-primary-hover shadow-lg shadow-navy-100/20'
                                  : 'bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900'
                              }`}
                              disabled={eventsLoading}
                            >
                              {page}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          )}

          {/* Vendors Tab */}
          <TabsContent value="vendors" className="space-y-4">
            {/* Add Vendor Button */}
            <Button 
              onClick={() => {
                setEditingVendor(null);
                setShowVendorForm(true);
              }}
              className="rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 w-full md:w-auto transition-all duration-300"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Vendor
            </Button>

            {/* Stats */}
            <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:scale-[1.02] hover:bg-white/90">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-700 font-medium mb-1">Total Vendors</p>
                    <p className="text-xl font-semibold text-slate-900">{vendors.length}</p>
                  </div>
                  <Building2 className="h-5 w-5 text-brand-primary" />
                </div>
              </CardContent>
            </Card>

            {/* Vendors List */}
            {vendorsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
              </div>
            ) : vendorsError ? (
              <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
                <CardContent className="p-4 text-center">
                  <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                  <p className="text-sm text-red-500">Error loading vendors</p>
                </CardContent>
              </Card>
            ) : vendors.length === 0 ? (
              <Card className="bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20">
                <CardContent className="p-4 text-center">
                  <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500 mb-2">No vendors found</p>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowVendorForm(true)}
                    size="sm"
                    className="rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
                  >
                    Add First Vendor
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="space-y-2">
                  {paginatedVendors.map((vendor) => (
                    <Card key={vendor.id} className="p-3 bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 transition-all duration-300 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-sm truncate text-slate-900">{vendor.name}</h3>
                            <Badge variant="secondary" className="text-xs mt-1 border-primary-200 text-slate-700">
                              {vendor.type}
                            </Badge>
                            {vendor.rating && (
                              <div className="flex items-center mt-1">
                                <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                                <span className="text-xs text-slate-700 ml-1">{vendor.rating}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center space-x-1 ml-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditVendor(vendor)}
                              className="h-8 w-8 p-0 text-brand-primary-hover hover:text-primary-900 hover:bg-primary-50"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteVendor(vendor.id)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1 text-xs text-slate-700">
                          {vendor.contact_person && (
                            <div className="flex items-center">
                              <Users className="h-3 w-3 mr-2" />
                              <span>{vendor.contact_person}</span>
                            </div>
                          )}
                          {vendor.phone && (
                            <div className="flex items-center">
                              <Phone className="h-3 w-3 mr-2" />
                              <span>{vendor.phone}</span>
                            </div>
                          )}
                          {vendor.email && (
                            <div className="flex items-center">
                              <Mail className="h-3 w-3 mr-2" />
                              <span className="truncate">{vendor.email}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Pagination Controls */}
                {vendorsTotalPages > 1 && (
                  <div className="flex flex-col items-center space-y-3 pt-4 border-t border-gray-200 mt-4">
                    <div className="text-xs text-gray-600">
                      Showing {vendorsStart} to {vendorsEndIndex} of {vendorsTotal} vendors
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVendorsPage(prev => Math.max(1, prev - 1))}
                        disabled={vendorsPage === 1 || vendorsLoading}
                        className="h-8 px-3 text-xs rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                        Previous
                      </Button>
                      <div className="flex items-center space-x-1 px-2">
                        <span className="text-xs text-gray-600">Page</span>
                        <span className="text-xs font-medium">{vendorsPage}</span>
                        <span className="text-xs text-gray-600">of</span>
                        <span className="text-xs font-medium">{vendorsTotalPages}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVendorsPage(prev => Math.min(vendorsTotalPages, prev + 1))}
                        disabled={vendorsPage === vendorsTotalPages || vendorsLoading}
                        className="h-8 px-3 text-xs rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </div>
                    {/* Page Number Buttons - Show up to 5 pages */}
                    {vendorsTotalPages <= 5 && (
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: vendorsTotalPages }, (_, i) => i + 1).map((page) => (
                          <Button
                            key={page}
                            variant={vendorsPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => setVendorsPage(page)}
                            className={`h-8 w-8 p-0 text-xs rounded-full transition-all duration-300 ${
                              vendorsPage === page
                                ? 'bg-brand-primary text-white hover:bg-brand-primary-hover shadow-lg shadow-navy-100/20'
                                : 'bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900'
                            }`}
                            disabled={vendorsLoading}
                          >
                            {page}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Invitations Tab */}
          <TabsContent value="invitations" className="space-y-4">
            {chapterId ? (
              <InviteManagement 
                chapterId={chapterId} 
                className="w-full"
              />
            ) : (
              <Card>
                <CardContent className="p-4 text-center">
                  <UserPlus className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500">No chapter access</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Event Form Modal - Mobile: Bottom drawer, Desktop: Centered */}
        {showEventForm && typeof window !== 'undefined' && createPortal(
          <div className={cn(
            "fixed inset-0 z-[9999]",
            isMobile 
              ? "flex items-end justify-center p-0"
              : "flex items-center justify-center p-4"
          )}>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
              onClick={() => {
                setShowEventForm(false);
                setEditingEvent(null);
              }}
            />
            
            {/* Mobile: Bottom Drawer */}
            {isMobile && (
              <div className="relative bg-white shadow-xl w-full flex flex-col max-h-[80vh] mt-[50vh] rounded-t-2xl rounded-b-none overflow-hidden">
                <EventForm
                  event={editingEvent}
                  onSubmit={async (data) => {
                    if (editingEvent) {
                      await handleUpdateEvent(data as UpdateEventRequest);
                    } else {
                      await handleCreateEvent(data as CreateEventRequest);
                    }
                  }}
                  onCancel={() => {
                    setShowEventForm(false);
                    setEditingEvent(null);
                  }}
                  loading={isSubmittingEvent}
                  isOpen={true}
                  isMobile={true}
                />
              </div>
            )}

            {/* Desktop: Centered Modal */}
            {!isMobile && (
              <div className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <EventForm
                  event={editingEvent}
                  onSubmit={async (data) => {
                    if (editingEvent) {
                      await handleUpdateEvent(data as UpdateEventRequest);
                    } else {
                      await handleCreateEvent(data as CreateEventRequest);
                    }
                  }}
                  onCancel={() => {
                    setShowEventForm(false);
                    setEditingEvent(null);
                  }}
                  loading={isSubmittingEvent}
                  isOpen={true}
                />
              </div>
            )}
          </div>,
          document.body
        )}

        {/* Vendor Form Modal - Mobile: Bottom drawer, Desktop: Centered */}
        {showVendorForm && typeof window !== 'undefined' && createPortal(
          <div className={cn(
            "fixed inset-0 z-[9999]",
            isMobile 
              ? "flex items-end justify-center p-0"
              : "flex items-center justify-center p-4"
          )}>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
              onClick={() => {
                setShowVendorForm(false);
                setEditingVendor(null);
              }}
            />
            
            {/* Mobile: Bottom Drawer */}
            {isMobile && (
              <div className="relative bg-white shadow-xl w-full flex flex-col max-h-[80vh] mt-[50vh] rounded-t-2xl rounded-b-none overflow-hidden">
                <VendorForm
                  vendor={editingVendor}
                  onSubmit={async (data) => {
                    if (editingVendor) {
                      await handleUpdateVendor(data as UpdateVendorRequest);
                    } else {
                      await handleCreateVendor(data as CreateVendorRequest);
                    }
                  }}
                  onCancel={() => {
                    setShowVendorForm(false);
                    setEditingVendor(null);
                  }}
                  loading={isSubmittingVendor}
                  isMobile={true}
                />
              </div>
            )}

            {/* Desktop: Centered Modal */}
            {!isMobile && (
              <div className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <VendorForm
                  vendor={editingVendor}
                  onSubmit={async (data) => {
                    if (editingVendor) {
                      await handleUpdateVendor(data as UpdateVendorRequest);
                    } else {
                      await handleCreateVendor(data as CreateVendorRequest);
                    }
                  }}
                  onCancel={() => {
                    setShowVendorForm(false);
                    setEditingVendor(null);
                  }}
                  loading={isSubmittingVendor}
                />
              </div>
            )}
          </div>,
          document.body
        )}

        {/* Event Detail Modal */}
        {selectedEventForModal && (
          <EventDetailModal
            event={selectedEventForModal}
            isOpen={isEventModalOpen}
            onClose={() => {
              setIsEventModalOpen(false);
              setSelectedEventForModal(null);
            }}
            currentUserRsvp={rsvpStatuses[selectedEventForModal.id] || null}
            onRsvpChange={handleModalRsvpChange}
          />
        )}
      </div>
  );
}

