import { createClient } from '@supabase/supabase-js';
import { Event } from '@/types/events';

// Use service role for server-side fetching (public event pages)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Cache for events (in-memory, cleared on page refresh)
const eventCache = new Map<string, { data: Event; timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes (shorter for events since RSVPs change)

/**
 * Check if a string is a valid UUID
 */
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Fetch event by slug or ID
 * Supports both UUID lookup and slug-based lookup
 * Used for public event pages
 */
export async function fetchEventBySlugOrId(slugOrId: string): Promise<Event | null> {
  // Check cache first
  const cacheKey = `event:${slugOrId}`;
  const cached = eventCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    let query;
    
    if (isValidUUID(slugOrId)) {
      // Direct ID lookup
      query = supabase
        .from('events')
        .select('*')
        .eq('id', slugOrId)
        .eq('status', 'published') // Only show published events publicly
        .is('archived_at', null) // Exclude archived events
        // Public marketing page: only events visible to both in-app audiences
        .eq('visible_to_active_members', true)
        .eq('visible_to_alumni', true)
        .single();
    } else {
      // Slug-based lookup (if slug column exists)
      // Fall back to searching by ID if slug column doesn't exist
      query = supabase
        .from('events')
        .select('*')
        .or(`event_slug.eq.${slugOrId},id.eq.${slugOrId}`)
        .eq('status', 'published')
        .is('archived_at', null) // Exclude archived events
        .eq('visible_to_active_members', true)
        .eq('visible_to_alumni', true)
        .single();
    }

    const { data, error } = await query;

    if (error) {
      // If slug column doesn't exist, try direct ID lookup
      if (error.message?.includes('event_slug')) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('events')
          .select('*')
          .eq('id', slugOrId)
          .eq('status', 'published')
          .is('archived_at', null)
          .eq('visible_to_active_members', true)
          .eq('visible_to_alumni', true)
          .single();
        
        if (fallbackError || !fallbackData) {
          console.error('Error fetching event:', fallbackError);
          return null;
        }
        
        // Cache the result
        eventCache.set(cacheKey, { data: fallbackData, timestamp: Date.now() });
        eventCache.set(`event:${fallbackData.id}`, { data: fallbackData, timestamp: Date.now() });
        return fallbackData;
      }
      
      console.error('Error fetching event:', error);
      return null;
    }

    if (!data) {
      return null;
    }

    // Cache the result
    eventCache.set(cacheKey, { data, timestamp: Date.now() });
    eventCache.set(`event:${data.id}`, { data, timestamp: Date.now() });
    
    return data;
  } catch (error) {
    console.error('Error in fetchEventBySlugOrId:', error);
    return null;
  }
}

/**
 * Fetch event attendee counts
 */
export async function fetchEventAttendees(eventId: string): Promise<{
  attending: number;
  maybe: number;
  not_attending: number;
} | null> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data, error } = await supabase
      .from('event_rsvps')
      .select('status')
      .eq('event_id', eventId);

    if (error) {
      console.error('Error fetching attendees:', error);
      return null;
    }

    const counts = {
      attending: 0,
      maybe: 0,
      not_attending: 0,
    };

    data?.forEach((rsvp) => {
      if (rsvp.status === 'attending') counts.attending++;
      else if (rsvp.status === 'maybe') counts.maybe++;
      else if (rsvp.status === 'not_attending') counts.not_attending++;
    });

    return counts;
  } catch (error) {
    console.error('Error in fetchEventAttendees:', error);
    return null;
  }
}

/**
 * Clear event cache
 */
export function clearEventCache(eventId?: string) {
  if (eventId) {
    eventCache.delete(`event:${eventId}`);
  } else {
    eventCache.clear();
  }
}

