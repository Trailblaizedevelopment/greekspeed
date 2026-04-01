/**
 * Crowded API (sandbox) response shapes — aligned with Postman verification.
 * @see docs/development/features/crowded_cursor_postman_session.md
 */

/** Pagination object under `meta` for list endpoints */
export interface CrowdedPaginationMeta {
  total: number;
  limit: number;
  offset: number;
  sort: string;
  order: string;
}

export interface CrowdedListMeta {
  pagination: CrowdedPaginationMeta;
}

/** Standard list wrapper: `{ data: T[], meta: { pagination } }` */
export interface CrowdedListResponse<T> {
  data: T[];
  meta: CrowdedListMeta;
}

/** Single-resource wrapper used by GET contact by id: `{ data: T }` */
export interface CrowdedSingleResponse<T> {
  data: T;
}

export interface CrowdedOrganization {
  id: string;
  name: string;
  createdAt: string;
}

export type CrowdedChapterStatus = string;
export type CrowdedBusinessVertical = string;

export interface CrowdedChapter {
  id: string;
  name: string | null;
  organization: string;
  organizationId: string;
  status: CrowdedChapterStatus;
  businessVertical: CrowdedBusinessVertical;
  createdAt: string;
}

export type CrowdedContactStatus = string;

export interface CrowdedContact {
  id: string;
  chapterId: string;
  firstName: string;
  lastName: string;
  mobile?: string;
  email?: string;
  dateOfBirth?: string;
  status: CrowdedContactStatus;
  createdAt: string;
  updatedAt?: string;
  archivedAt?: string | null;
}

/** Crowded error JSON body (non-2xx) */
export interface CrowdedErrorBody {
  type?: string;
  statusCode?: number;
  message?: string;
  details?: string[];
  requestId?: string;
}
