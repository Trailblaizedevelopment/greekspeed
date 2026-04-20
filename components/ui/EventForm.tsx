'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { X, Calendar, MapPin, DollarSign, FileText, Mail, Smartphone, Loader2 } from 'lucide-react';
import { Event, CreateEventRequest, UpdateEventRequest } from '@/types/events';
import { useAuth} from '@/lib/supabase/auth-context';
import { useProfile } from '@/lib/contexts/ProfileContext';
import { cn } from '@/lib/utils';

interface EventFormProps {
  event?: Event | null;
  onSubmit: (data: CreateEventRequest | UpdateEventRequest) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  isOpen?: boolean; // Optional: if provided, renders as modal. If not, renders as card only
  isMobile?: boolean; // Add this prop - explicitly passed from parent instead of detecting internally
}

export function EventForm({ event, onSubmit, onCancel, loading = false, isOpen = undefined, isMobile = false }: EventFormProps) {
  const { session } = useAuth();
  const { profile } = useProfile();
  const chapterId = profile?.chapter_id;

  const [formData, setFormData] = useState<CreateEventRequest>({
    title: '',
    description: '',
    location: '',
    start_time: '',
    end_time: '',
    budget_label: '',
    budget_amount: undefined,
    send_sms: false,
    send_sms_to_alumni: false,
    visible_to_active_members: true,
    visible_to_alumni: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const [emailRecipientCount, setEmailRecipientCount] = useState<number | null>(null);
  const [smsRecipientCount, setSmsRecipientCount] = useState<number | null>(null);
  const [alumniSmsRecipientCount, setAlumniSmsRecipientCount] = useState<number | null>(null);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  useEffect(() => {
    if (event) {
      setFormData({
        title: event.title,
        description: event.description || '',
        location: event.location || '',
        start_time: event.start_time ?? '',
        end_time: event.end_time ?? '',
        budget_label: event.budget_label || '',
        budget_amount: event.budget_amount || undefined,
        send_sms: false,
        send_sms_to_alumni: false,
        visible_to_active_members: event.visible_to_active_members ?? true,
        visible_to_alumni: event.visible_to_alumni ?? true,
      });
    }
  }, [event]);

  // Smart default: Check SMS for important events
  useEffect(() => {
    if (!event && formData.title && formData.start_time) {
      const isImportant = checkIfEventIsImportant(formData.title, formData.start_time);
      setFormData(prev => ({ ...prev, send_sms: isImportant }));
    }
  }, [formData.title, formData.start_time, event]);

  // Fetch recipient counts
  useEffect(() => {
    const fetchRecipientCounts = async () => {
      if (!chapterId || !session?.access_token) return;
      
      setLoadingRecipients(true);
      try {
        const vActive = formData.visible_to_active_members !== false;
        const vAlumni = formData.visible_to_alumni !== false;
        const response = await fetch(
          `/api/events/recipient-counts?chapter_id=${encodeURIComponent(chapterId)}&visible_to_active_members=${vActive}&visible_to_alumni=${vAlumni}`,
          {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          setEmailRecipientCount(data.email_recipients);
          setSmsRecipientCount(data.sms_recipients);
          setAlumniSmsRecipientCount(
            typeof data.alumni_sms_recipients === 'number'
              ? data.alumni_sms_recipients
              : null
          );
        }
      } catch (error) {
        console.error('Error fetching recipient counts:', error);
      } finally {
        setLoadingRecipients(false);
      }
    };

    fetchRecipientCounts();
  }, [chapterId, session?.access_token, formData.visible_to_active_members, formData.visible_to_alumni]);

  // Helper function to determine if event is important
  const checkIfEventIsImportant = (title: string, startTime: string): boolean => {
    const importantKeywords = ['meeting', 'required', 'mandatory', 'urgent', 'important', 'must'];
    const titleLower = title.toLowerCase();
    
    // Check for keywords
    const hasKeyword = importantKeywords.some(keyword => titleLower.includes(keyword));
    
    // Check if event is within 7 days (time-sensitive)
    if (startTime) {
      const eventDate = new Date(startTime);
      const now = new Date();
      const daysUntil = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      
      if (hasKeyword || daysUntil <= 7) {
        return true;
      }
    }
    
    return false;
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (formData.start_time && formData.end_time) {
      if (new Date(formData.end_time) <= new Date(formData.start_time)) {
        newErrors.end_time = 'End time must be after start time';
      }
    }

    if (formData.budget_amount && formData.budget_amount < 0) {
      newErrors.budget_amount = 'Budget amount cannot be negative';
    }

    const showActive = formData.visible_to_active_members !== false;
    const showAlumni = formData.visible_to_alumni !== false;
    if (!showActive && !showAlumni) {
      newErrors.audience = 'Select at least one audience: Active Members and/or Alumni.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      const payload = {
        ...formData,
        start_time: formData.start_time
          ? new Date(formData.start_time).toISOString()
          : null,
        end_time: formData.end_time
          ? new Date(formData.end_time).toISOString()
          : null,
      };
      await onSubmit(payload);
    } catch (error) {
      console.error('Error submitting form:', error);
    }
  };

  const handleInputChange = (field: keyof CreateEventRequest, value: string | number | boolean | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    if (
      (field === 'visible_to_active_members' || field === 'visible_to_alumni') &&
      errors.audience
    ) {
      setErrors(prev => ({ ...prev, audience: '' }));
    }
  };

  const formatDateTimeLocal = (isoString: string | null | undefined): string => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Form content (shared between modal and card-only mode)
  const formContent = (
    <Card className={cn(
      "w-full mx-auto flex flex-col",
      isOpen === undefined 
        ? "max-w-2xl max-h-[90vh]" // Card-only mode
        : isMobile
          ? "rounded-none shadow-none border-0 h-full min-h-0 bg-transparent" // Transparent background, let drawer handle it (like VendorForm)
          : "max-w-2xl max-h-[90vh] rounded-xl"
    )}>
      {/* Fixed Header */}
      <CardHeader className={cn(
        "pb-4 sm:pb-6 flex-shrink-0 bg-white",
        isMobile ? "p-4 border-b border-gray-200" : "rounded-lg border-b border-gray-100"
      )}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-3 sm:space-x-2 text-xl sm:text-lg">
            <Calendar className="h-6 w-6 sm:h-5 sm:w-5 text-brand-primary" />
            <span>{event ? 'Edit Event' : 'Create New Event'}</span>
          </CardTitle>
          {isMobile && (
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          )}
          {isOpen !== undefined && !isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-8 w-8 p-0 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      {/* Scrollable Content Area */}
      <div className={cn("flex-1 overflow-y-auto overflow-x-hidden min-h-0", !isMobile && "rounded-lg")}>
        <CardContent className={cn(
          "p-4 sm:p-6",
          isMobile ? "p-4" : "pt-0"
        )}>
          <form onSubmit={handleSubmit} id="event-form" className="space-y-4">
            {/* Title */}
            <div className="space-y-3 sm:space-y-2">
              <Label htmlFor="title" className="flex items-center space-x-2 text-base sm:text-sm">
                <FileText className="h-5 w-5 sm:h-4 sm:w-4" />
                <span>Event Title *</span>
              </Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Enter event title"
                className={`h-12 sm:h-10 text-base sm:text-sm ${errors.title ? 'border-red-500' : ''}`}
              />
              {errors.title && (
                <p className="text-sm text-red-500">{errors.title}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-3 sm:space-y-2">
              <Label htmlFor="description" className="text-base sm:text-sm">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Enter event description (optional)"
                rows={4}
                className="text-base sm:text-sm min-h-[120px] sm:min-h-[80px] resize-none"
              />
            </div>

            {/* Location */}
            <div className="space-y-3 sm:space-y-2">
              <Label htmlFor="location" className="flex items-center space-x-2 text-base sm:text-sm">
                <MapPin className="h-5 w-5 sm:h-4 sm:w-4" />
                <span>Location</span>
              </Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => handleInputChange('location', e.target.value)}
                placeholder="Enter event location (optional)"
                className="h-12 sm:h-10 text-base sm:text-sm"
              />
            </div>

            {/* Date and Time - Stack on mobile, side-by-side on desktop */}
            <div className={cn(
              "gap-4 min-w-0",
              isMobile ? "space-y-4 min-w-0" : "space-y-4 sm:space-y-0 sm:grid sm:grid-cols-1 sm:md:grid-cols-2"
            )}>
              <div className="space-y-3 sm:space-y-2 min-w-0">
                <Label htmlFor="start_time" className="text-base sm:text-sm">Start Date & Time (optional)</Label>
                <Input
                  id="start_time"
                  type="datetime-local"
                  value={formatDateTimeLocal(formData.start_time)}
                  onChange={(e) => handleInputChange('start_time', e.target.value)}
                  className={cn("h-12 sm:h-10 text-base sm:text-sm min-w-0 w-full max-w-full", errors.start_time && "border-red-500")}
                />
                {errors.start_time && (
                  <p className="text-sm text-red-500">{errors.start_time}</p>
                )}
              </div>

              <div className="space-y-3 sm:space-y-2 min-w-0">
                <Label htmlFor="end_time" className="text-base sm:text-sm">End Date & Time (optional)</Label>
                <Input
                  id="end_time"
                  type="datetime-local"
                  value={formatDateTimeLocal(formData.end_time)}
                  onChange={(e) => handleInputChange('end_time', e.target.value)}
                  className={cn("h-12 sm:h-10 text-base sm:text-sm min-w-0 w-full max-w-full", errors.end_time && "border-red-500")}
                />
                {errors.end_time && (
                  <p className="text-sm text-red-500">{errors.end_time}</p>
                )}
              </div>
            </div>

            {/* Budget - Stack on mobile, side-by-side on desktop */}
            <div className={cn(
              "gap-4",
              isMobile ? "space-y-4" : "space-y-4 sm:space-y-0 sm:grid sm:grid-cols-1 sm:md:grid-cols-2"
            )}>
              <div className="space-y-3 sm:space-y-2">
                <Label htmlFor="budget_label" className="flex items-center space-x-2 text-base sm:text-sm">
                  <DollarSign className="h-5 w-5 sm:h-4 sm:w-4" />
                  <span>Budget Label</span>
                </Label>
                <Input
                  id="budget_label"
                  value={formData.budget_label}
                  onChange={(e) => handleInputChange('budget_label', e.target.value)}
                  placeholder="e.g., Food, Venue, Entertainment"
                  className="h-12 sm:h-10 text-base sm:text-sm"
                />
              </div>

              <div className="space-y-3 sm:space-y-2">
                <Label htmlFor="budget_amount" className="text-base sm:text-sm">Budget Amount</Label>
                <Input
                  id="budget_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.budget_amount || ''}
                  onChange={(e) => handleInputChange('budget_amount', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="0.00"
                  className={`h-12 sm:h-10 text-base sm:text-sm ${errors.budget_amount ? 'border-red-500' : ''}`}
                />
                {errors.budget_amount && (
                  <p className="text-sm text-red-500">{errors.budget_amount}</p>
                )}
              </div>
            </div>

            {/* Chapter visibility (who can see this event in the app) */}
            <div className="space-y-3 sm:space-y-2 rounded-lg border border-gray-100 bg-gray-50/80 p-3 sm:p-4">
              <Label className="text-base sm:text-sm font-medium text-gray-900">Who can see this event?</Label>
              <p className="text-xs text-gray-500">
                Notification counts below reflect these choices (email to active members; SMS options are separate).
              </p>
              <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-6">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="visibility_active_members"
                    checked={formData.visible_to_active_members !== false}
                    onCheckedChange={(checked) =>
                      handleInputChange('visible_to_active_members', checked === true)
                    }
                  />
                  <Label htmlFor="visibility_active_members" className="text-base sm:text-sm cursor-pointer">
                    Active Members
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="visibility_alumni"
                    checked={formData.visible_to_alumni !== false}
                    onCheckedChange={(checked) =>
                      handleInputChange('visible_to_alumni', checked === true)
                    }
                  />
                  <Label htmlFor="visibility_alumni" className="text-base sm:text-sm cursor-pointer">
                    Alumni
                  </Label>
                </div>
              </div>
              {errors.audience && (
                <p className="text-sm text-red-500">{errors.audience}</p>
              )}
            </div>
            
            {/* SMS Notification Checkboxes */}
            <div className="space-y-3 sm:space-y-2">
              <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-6">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="send_sms"
                    checked={formData.send_sms || false}
                    onCheckedChange={(checked) => handleInputChange('send_sms', checked as boolean)}
                  />
                  <Label htmlFor="send_sms" className="text-base sm:text-sm cursor-pointer">
                    Send SMS to active members
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="send_sms_to_alumni"
                    checked={formData.send_sms_to_alumni || false}
                    onCheckedChange={(checked) => handleInputChange('send_sms_to_alumni', checked as boolean)}
                  />
                  <Label htmlFor="send_sms_to_alumni" className="text-base sm:text-sm cursor-pointer">
                    Send SMS to alumni
                  </Label>
                </div>
              </div>
              
              {/* Notification disclaimers */}
              <div className="text-xs text-gray-600 space-y-1 pl-6">
                {emailRecipientCount !== null && (
                  <p className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {/* Mobile: Shorter text */}
                  <span className="sm:hidden">
                    Email to <span className="font-medium">{emailRecipientCount}</span> email notifs enabled
                  </span>
                  {/* Desktop: Full text */}
                  <span className="hidden sm:inline">
                    Email will be sent to <span className="font-medium">{emailRecipientCount}</span> {emailRecipientCount === 1 ? 'member' : 'members'} with email notifications enabled
                  </span>
                </p>
                )}
                {formData.send_sms && smsRecipientCount !== null && (
                  <p className="flex items-center gap-1">
                    <Smartphone className="h-3 w-3" />
                    SMS to members: <span className="font-medium">{smsRecipientCount}</span> {smsRecipientCount === 1 ? 'recipient' : 'recipients'}
                  </p>
                )}
                {formData.send_sms_to_alumni && alumniSmsRecipientCount !== null && (
                  <p className="flex items-center gap-1">
                    <Smartphone className="h-3 w-3" />
                    SMS to alumni: <span className="font-medium">{alumniSmsRecipientCount}</span> {alumniSmsRecipientCount === 1 ? 'recipient' : 'recipients'}
                  </p>
                )}
                {loadingRecipients && (
                  <p className="text-gray-400">Loading recipient counts...</p>
                )}
              </div>
            </div>
          </form>
        </CardContent>
      </div>

      {/* Fixed Action Buttons */}
      {isMobile ? (
        <div className="flex-shrink-0 border-t border-gray-200 bg-white p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <div className="flex flex-row space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-full bg-white/80 backdrop-blur-md border border-brand-primary/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="event-form"
              disabled={loading}
              className="flex-1 rounded-full bg-brand-primary text-white hover:bg-brand-primary-hover shadow-lg shadow-navy-100/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{event ? 'Updating...' : 'Creating...'}</span>
                </div>
              ) : (
                event ? 'Update Event' : 'Create Event'
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className={cn(
          "rounded-lg flex-shrink-0 bg-white border-t border-gray-100",
          "p-4 sm:p-6"
        )}>
          <div className="flex space-x-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
              className="rounded-full bg-white/80 backdrop-blur-md border border-primary-100/50 shadow-lg shadow-navy-100/20 hover:shadow-xl hover:shadow-navy-100/30 hover:bg-white/90 text-brand-primary-hover hover:text-primary-900 transition-all duration-300 h-12 sm:h-10 w-full sm:w-auto text-base sm:text-sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="event-form"
              disabled={loading}
              className="rounded-full bg-brand-primary text-white hover:bg-brand-primary-hover shadow-lg shadow-navy-100/20 disabled:opacity-50 disabled:cursor-not-allowed h-12 sm:h-10 w-full sm:w-auto text-base sm:text-sm"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{event ? 'Updating...' : 'Creating...'}</span>
                </div>
              ) : (
                event ? 'Update Event' : 'Create Event'
              )}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );

  // Remove portal creation - parent will handle it
  // If isOpen is not provided, render as card only (backward compatible)
  return formContent;
}
