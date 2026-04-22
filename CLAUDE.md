# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server (localhost:3000)
npm run build        # Build for production
npm run lint         # Run ESLint
npm run typecheck    # TypeScript type check (no emit)
```

No automated test suite is configured. Validate changes manually in the browser, checking mobile responsiveness and error cases. Before committing, run `npm run lint` and `npm run typecheck`.

## Architecture

**Trailblaize** is a Next.js 15 (App Router) platform for Greek life chapter management — alumni networking, dues, social feed, events, announcements, messaging, and recruitment.

### Tech Stack
- **Framework**: Next.js 15.4.8 with App Router, React 19, TypeScript strict mode
- **Database/Auth**: Supabase (PostgreSQL + Auth + Storage)
- **Styling**: Tailwind CSS 3 with `cn()` utility (`lib/utils.ts`)
- **Server state**: TanStack React Query
- **Client state**: React Context
- **Payments**: Stripe | **Email**: SendGrid | **SMS**: Twilio/Telnyx | **Monitoring**: Sentry

### Route Groups
- `app/(auth)/` — sign-in, sign-up, auth callback
- `app/(marketing)/` — public pages (landing, privacy, terms, contact)
- `app/dashboard/` — protected chapter management pages
- `app/api/` — all API route handlers
- `app/onboarding/` — user onboarding flow
- `app/profile/` — user profiles

### Key Directories
- `components/ui/` — shadcn/ui base primitives
- `components/features/` — feature-organized components (e.g., `social/`, `alumni/`, `dashboard/`)
- `lib/hooks/` — custom React Query hooks (e.g., `usePosts`, `useComments`)
- `lib/services/` — business logic called by API routes and hooks
- `lib/contexts/` — React Context providers
- `lib/supabase/` — Supabase client setup
- `types/` — TypeScript type definitions
- `supabase/migrations/` — SQL migrations (run against dev first, then prod)

### Data Flow
- Components call hooks → hooks use React Query to hit API routes → API routes call services → services query Supabase
- Writes: component mutation → API route validates → service updates DB → React Query invalidates cache

### Authentication & Security
- Auth via Supabase Auth with session in HTTP-only cookies (`@supabase/ssr`)
- Middleware (`middleware.ts`) refreshes sessions and handles a maintenance mode gate
- Row Level Security (RLS) enforces chapter-scoped and user-scoped data access
- API routes must verify authentication and authorization; use service role key server-side

### Business Logic
- Every user belongs to one chapter (`profiles.chapter_id`)
- Data is chapter-scoped: posts, events, announcements, tasks, dues — always filter by `chapter_id`
- Three roles: `active` member, `alumni`, exec/admin (elevated permissions)
- `profiles.member_status` distinguishes active vs alumni

### Key Database Tables
| Table | Purpose |
|---|---|
| `profiles` | User profiles; `chapter_id`, `member_status`, `chapter_role` |
| `chapters` | Greek organizations |
| `posts` | Chapter-scoped social feed; `metadata` JSONB for images/link_previews |
| `post_comments` | Nested comments (`parent_comment_id` for replies) |
| `post_likes` / `comment_likes` | Like tracking |
| `events` / `event_rsvps` | Events and RSVPs |
| `dues_assignments` | Payment tracking per user per chapter |
| `announcements` / `announcement_recipients` | Broadcast messaging |
| `messages` | Direct messages between users |
| `connections` | Alumni networking connections |
| `tasks` | Chapter task assignments |
| `invitations` / `recruits` | Member onboarding pipeline |

## Code Conventions

### TypeScript
- Strict mode; no `any` without justification; no `@ts-ignore` without comment
- Interfaces for object shapes; types for unions/primitives
- All types exported from `types/`
- Path aliases: `@/components`, `@/lib`, `@/types`

### Components
- Server components by default; add `'use client'` only for interactivity/hooks/browser APIs
- Props interface named `ComponentNameProps`
- Use `cn()` for all conditional className merging — never inline styles or string concatenation
- Use `ClickableAvatar` and `ClickableUserName` from `components/features/user-profile/` for user display
- Use Radix UI / shadcn Dialog for modals; check `components/ui/` before building new primitives

### Styling
- Mobile-first Tailwind; responsive via `sm:`, `md:`, `lg:` prefixes
- Brand colors via CSS variables: `bg-brand-primary`, `text-brand-primary`, etc. (chapter-specific theming)
- Standard semantic palette: `text-gray-900` (primary), `text-gray-500` (muted), `bg-white`/`bg-gray-50` (backgrounds)
- Cards: `rounded-xl border border-gray-200 bg-white shadow p-4`

### API Routes
- Pattern: authenticate → authorize → validate input → call service → return `{ data }` or `{ error: string }`
- Use `SUPABASE_SERVICE_ROLE_KEY` for server-side admin operations
- Return consistent error format with appropriate HTTP status codes

### Adding a New Feature
1. Define types in `types/`
2. Create API route in `app/api/[resource]/route.ts`
3. Create service in `lib/services/`
4. Create hook in `lib/hooks/` (React Query)
5. Create components in `components/features/[feature]/`

## Environment

Uses separate Supabase projects for dev and prod — determined entirely by env vars, never by code branching.

- Local (`.env.local`) → dev Supabase project
- Production (Vercel env vars) → prod Supabase project → `trailblaize.net`
- Staging/preview (`develop` branch) → `greekspeed.vercel.app`

Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SENDGRID_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`.

Optional (Mapbox geocoding): `MAPBOX_SECRET_ACCESS_TOKEN` for `GET /api/geocoding/suggest` and `POST /api/geocoding/confirm`. Set `MAPBOX_GEOCODING_PERMANENT=false` only for local/dev without Mapbox billing; omit or `true` for stored results per [Mapbox permanent geocoding](https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results).

**Supabase Auth → URL Configuration → Redirect URLs:** allow the app OAuth callback with query strings used by chapter join (e.g. `chapter_slug`, `join_role`). Add each origin with a wildcard suffix, for example `https://www.trailblaize.net/auth/callback*`, `https://greekspeed.vercel.app/auth/callback*`, and `http://localhost:3000/auth/callback*` for local dev. See [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## Branch Workflow

- Feature branches → `develop` via PR (deploys to greekspeed.vercel.app)
- `develop` → `main` for production releases (deploys to trailblaize.net)
- Branch naming: `feature/name`, `bugfix/name`, `fix/name`

## Reference Files

- `docs/ARCHITECTURE.md` — detailed architecture documentation
- `docs/DATABASE_SCHEMA.md` — full schema with query patterns
- `docs/COMPONENT_STYLING.md` — component patterns and complete styling guide
- `docs/CODE_STYLE.md` — code style with examples
- `app/api/posts/route.ts` — API route reference pattern
- `components/features/social/PostCard.tsx` — complex component reference
- `lib/hooks/usePosts.ts` — React Query hook reference

## Editing Rules

- Always explain planned changes before editing files.
- Prefer minimal targeted edits over large refactors.
- Respect existing TypeScript strict mode.
- Preserve current architecture unless explicitly asked to redesign.
- Run lint and typecheck commands before suggesting commits.