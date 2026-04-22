# Trailblaize Architecture Documentation

## Overview
Trailblaize is a Next.js 15 application using the App Router, React 19, TypeScript, Supabase (PostgreSQL), and Tailwind CSS.

## Tech Stack

### Frontend
- **Framework**: Next.js 15.4.8 (App Router)
- **React**: 19.1.2
- **TypeScript**: 5.x (strict mode)
- **Styling**: Tailwind CSS 3.4.4
- **UI Components**: Radix UI primitives, shadcn/ui
- **State Management**: 
  - TanStack React Query (server state)
  - React Context (client state)
- **Animations**: Framer Motion
- **Icons**: Lucide React

### Backend
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **API**: Next.js API Routes (App Router)

### Third-Party Services
- **Payments**: Stripe
- **Email**: SendGrid
- **SMS**: Twilio, Telnyx
- **Monitoring**: Sentry
- **Analytics**: Vercel Analytics

## Project Structure

```
greekspeed/
├── app/                          # Next.js App Router
│   ├── (auth)/                  # Route group - authentication pages
│   │   ├── auth/                # Auth callback handlers
│   │   ├── sign-in/             # Sign in page
│   │   └── sign-up/             # Sign up page
│   ├── (marketing)/             # Route group - public marketing pages
│   │   ├── contact/             # Contact page
│   │   ├── privacy/             # Privacy policy
│   │   ├── terms/               # Terms of service
│   │   └── sms-terms/           # SMS terms
│   ├── api/                     # API route handlers
│   │   ├── posts/               # Post-related endpoints
│   │   ├── comments/            # Comment endpoints
│   │   └── ...                   # Other API routes
│   ├── dashboard/                # Protected dashboard pages
│   ├── onboarding/              # User onboarding flow
│   ├── profile/                 # User profile pages
│   └── layout.tsx               # Root layout
├── components/                   # React components
│   ├── ui/                      # Base UI components (shadcn/ui)
│   ├── features/                # Feature-specific components
│   │   ├── social/              # Social feed components
│   │   ├── alumni/              # Alumni-related components
│   │   └── ...                   # Other features
│   ├── marketing/               # Marketing page components
│   └── shared/                  # Shared components
├── lib/                          # Utilities and services
│   ├── contexts/                # React Context providers
│   ├── hooks/                   # Custom React hooks
│   ├── services/                # Business logic services
│   ├── supabase/                # Supabase client setup
│   ├── utils/                   # Utility functions
│   └── config/                  # Configuration files
├── types/                        # TypeScript type definitions
├── styles/                       # Global styles
├── public/                       # Static assets
└── supabase/                     # Supabase config
    └── migrations/               # Database migrations
```

## Key Architectural Patterns

### 1. Server Components by Default
- Next.js App Router uses Server Components by default
- Add `'use client'` only when needed (interactivity, hooks, browser APIs)
- Server Components can directly access Supabase with service role key

### 2. API Route Pattern
```typescript
// app/api/resource/route.ts
export async function GET(request: NextRequest) {
  // Authentication
  // Authorization
  // Data fetching
  // Response
}

export async function POST(request: NextRequest) {
  // Validation
  // Processing
  // Database operations
  // Response
}
```

### 3. Service Layer Pattern
- Business logic in `lib/services/`
- API routes call services
- Services handle database operations
- Reusable across components and API routes

### 4. Custom Hooks Pattern
- Data fetching: `lib/hooks/useResource.ts`
- Uses React Query for caching and state management
- Handles loading, error, and success states

### 5. Component Composition
- Small, focused components
- Compose larger features from smaller pieces
- Feature-based organization

## Data Flow

### Reading Data
1. Component calls custom hook (`usePosts`)
2. Hook uses React Query to fetch from API
3. API route queries Supabase
4. Data flows back through hook to component

### Writing Data
1. Component calls mutation function from hook
2. Hook makes POST/PUT/DELETE to API route
3. API route validates and processes
4. Supabase database updated
5. React Query invalidates cache
6. UI updates automatically

## Authentication Flow

1. User signs in via Supabase Auth
2. Session stored in cookies (via `@supabase/ssr`)
3. Middleware validates session on protected routes
4. API routes extract user from session
5. RLS policies enforce data access

## State Management Strategy

### Server State (React Query)
- Posts, comments, user profiles
- Automatically cached and synchronized
- Optimistic updates for better UX

### Client State (React Context)
- UI state (modals, themes)
- User preferences
- Global app state

### Local State (useState)
- Form inputs
- Component-specific UI state
- Temporary values

## Security Considerations

### Authentication
- Supabase Auth handles user authentication
- Sessions managed via HTTP-only cookies
- Middleware protects routes

### Authorization
- Row Level Security (RLS) policies in Supabase
- Role-based access control (RBAC) in application
- Permission checks in API routes

### Data Validation
- Input validation on both client and server
- TypeScript types provide compile-time safety
- Runtime validation with Zod (when needed)

## Performance Optimizations

### Caching
- React Query caches API responses
- Next.js caches static pages
- Supabase connection pooling

### Code Splitting
- Next.js automatic code splitting
- Dynamic imports for heavy components
- Route-based splitting

### Image Optimization
- Next.js Image component
- Supabase Storage CDN
- Lazy loading

## Environment Configuration

### Development
- `greekspeed.vercel.app` - Development deployment
- `localhost:3000` - Local development

### Production
- `trailblaize.net` - Production deployment
- Environment detection via `lib/env.ts`

## Database Schema

### Key Tables
- `profiles` - User profiles
- `posts` - Social feed posts
- `post_comments` - Comments on posts
- `chapters` - Greek life chapters
- `events` - Chapter events
- `dues` - Payment tracking

### Relationships
- Users belong to chapters (many-to-one)
- Posts belong to chapters (many-to-one)
- Comments belong to posts (many-to-one)
- Comments can have replies (self-referential)

## Common Patterns Reference

### Creating a New API Endpoint
1. Create route file: `app/api/resource/route.ts`
2. Export GET/POST/PUT/DELETE handlers
3. Add authentication check
4. Add authorization check
5. Validate input
6. Call service function
7. Return JSON response

### Creating a New Component
1. Create file: `components/features/[feature]/ComponentName.tsx`
2. Define TypeScript interface for props
3. Implement component logic
4. Add proper error handling
5. Style with Tailwind
6. Export component

### Adding a New Feature
1. Define types in `types/`
2. Create API routes in `app/api/`
3. Create services in `lib/services/`
4. Create hooks in `lib/hooks/`
5. Create components in `components/features/`
6. Add to appropriate page

## Migration Strategy

### Database Migrations
- Store in `supabase/migrations/`
- Use Supabase CLI for migrations
- Test migrations in development first
- Backup production before migration

### Code Migrations
- Use feature flags for gradual rollout
- Maintain backward compatibility when possible
- Document breaking changes
