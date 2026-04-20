export type EventStatus = 'draft' | 'published' | 'cancelled';
export type RSVPStatus = 'attending' | 'maybe' | 'not_attending';

export interface Event {
  id: string;
  chapter_id: string;
  title: string;
  description?: string;
  location?: string;
  start_time: string | null;
  end_time: string | null;
  status: EventStatus;
  budget_label?: string;
  budget_amount?: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  /** When set, event is archived (hidden from main views); preserves budget, attendance, RSVP history */
  archived_at?: string | null;
  /** Chapter-scoped visibility: active members (non-alumni) */
  visible_to_active_members: boolean;
  /** Chapter-scoped visibility: alumni */
  visible_to_alumni: boolean;
  attendee_count?: number;
  maybe_count?: number;
  not_attending_count?: number;
  /** The current user's RSVP status, included when user_id is passed to /api/events */
  user_rsvp_status?: RSVPStatus | null;
}

export interface EventWithRSVPs extends Event {
  attendee_count: number;
  maybe_count: number;
  not_attending_count: number;
}

export interface EventRSVP {
  id: string;
  event_id: string;
  user_id: string;
  status: RSVPStatus;
  responded_at: string;
}

export interface CreateEventRequest {
  title: string;
  description?: string;
  location?: string;
  start_time?: string | null;
  end_time?: string | null;
  budget_label?: string;
  budget_amount?: number;
  send_sms?: boolean;
  /**
   * Whether to send an SMS notification to alumni.
   * Used when execs choose the "Send SMS to alumni" option.
   */
  send_sms_to_alumni?: boolean;
  /** Default true when omitted (DB default). At least one of active/alumni must be true. */
  visible_to_active_members?: boolean;
  /** Default true when omitted (DB default). At least one of active/alumni must be true. */
  visible_to_alumni?: boolean;
  created_by?: string;
  updated_by?: string;
}

export interface UpdateEventRequest extends Partial<CreateEventRequest> {
  status?: EventStatus;
  updated_by?: string;
}

export interface RSVPRequest {
  status: RSVPStatus;
}

// For display purposes
export interface EventDisplay {
  id: string;
  title: string;
  description?: string;
  location?: string;
  start_time: string | null;
  end_time: string | null;
  status: EventStatus;
  budget_label?: string;
  budget_amount?: number;
  attendee_count: number;
  maybe_count: number;
  not_attending_count: number;
  formatted_date: string;
  formatted_time: string;
}

// QR check-in / event attendance (one row per member per event)
export interface EventAttendance {
  id: string;
  event_id: string;
  user_id: string;
  checked_in_at: string;
}

/** Optional body for POST /api/events/[id]/check-in (in-app QR scan flow) */
export interface EventCheckInRequestBody {
  /** Raw string read from chapter check-in QR (JSON with c, i, s). */
  qr_payload?: string;
  /**
   * Serialized event check-in URL token (`t` query param from camera / web link).
   * Do not send alongside `qr_payload`; the API returns 400 if both are set.
   */
  url_check_in_token?: string;
}

/** Response from POST /api/events/[id]/check-in */
export interface CheckInResponse {
  data: {
    checked_in_at: string;
    already_checked_in?: boolean;
  };
}

/** Single attendance row with profile for GET /api/events/[id]/attendance */
export interface AttendanceWithProfile {
  id: string;
  event_id: string;
  user_id: string;
  checked_in_at: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

/** Response from GET /api/events/[id]/attendance */
export interface AttendanceListResponse {
  data: { attendance: AttendanceWithProfile[] };
}

/**
 * Response from GET /api/chapters/[id]/check-in-qr
 * `qr_value` is the exact string to pass to QRCodeSVG (signed chapter payload).
 */
export interface ChapterCheckInQrResponse {
  data: {
    qr_value: string;
    chapter_id: string;
    issued_at: number;
  };
}

/**
 * Response from GET /api/events/[id]/check-in-qr (exec-only).
 * `qr_value` — in-app scan (JSON chapter payload).
 * `check_in_url` — absolute https URL `/check-in?event=&t=` for native camera / print (public layout).
 */
export interface EventCheckInQrResponse {
  data: {
    qr_value: string;
    check_in_url: string;
    event_id: string;
    chapter_id: string;
    /** Unix seconds (event URL token `i`; used for camera link TTL in TRA-514). */
    issued_at: number;
  };
}
