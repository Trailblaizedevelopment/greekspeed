import { NextResponse } from 'next/server';
import type { MembershipRequestServiceErrorCode } from '@/lib/services/membershipRequestService';

export function membershipRequestServiceErrorResponse(
  code: MembershipRequestServiceErrorCode,
  message: string
): NextResponse {
  switch (code) {
    case 'NOT_FOUND':
      return NextResponse.json({ error: message }, { status: 404 });
    case 'NOT_PENDING':
    case 'INVALID_STATE':
    case 'WRONG_CHAPTER':
    case 'INVITATION_CHAPTER_MISMATCH':
      return NextResponse.json({ error: message }, { status: 409 });
    case 'INVITATION_REQUIRED':
    case 'INVITATION_NOT_FOUND':
    case 'DUPLICATE_PENDING':
      return NextResponse.json({ error: message }, { status: 400 });
    case 'INVITATION_USAGE_FAILED':
    case 'PROFILE_UPDATE_FAILED':
    case 'ALUMNI_SYNC_FAILED':
    case 'REQUEST_UPDATE_FAILED':
    default:
      return NextResponse.json({ error: message }, { status: 500 });
  }
}
