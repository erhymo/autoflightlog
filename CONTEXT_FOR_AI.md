# AutoFlightLog - Context for AI Assistant

## Project Overview
**AutoFlightLog** is a professional flight logbook application for pilots. It allows pilots to track flight hours, manage logbook entries, and sync with employer crew management systems.

**Tech Stack:**
- Next.js 16.1.1 (App Router)
- React 19.2.3
- TypeScript 5
- Tailwind CSS 4
- Firebase 12.7.0 (Firestore for data)
- React Hook Form + Zod (form validation)
- @dnd-kit (drag & drop for column reordering)

**Development:**
- Run: `npm run dev` (localhost:3000)
- Build: `npm run build`
- Lint: `npm run lint`

---

## Branding & Design System

### Brand Identity
- **Name:** AutoFlightLog
- **Tagline:** "Professional Flight Logbook"
- **Logo:** SVG files in `src/assets/logo/` and `public/assets/logo/`
  - `a-log-icon.svg` - Dark version (for light backgrounds)
  - `a-log-icon-light.svg` - Light/white version (for dark backgrounds)
  - `a-log.svg` - Full logo with text (dark)
  - `a-log-light.svg` - Full logo with text (light) (in `src/assets/logo/`)

### Color Palette (CSS Variables in `src/app/globals.css`)
```
--aviation-blue: #0F2A44 (primary brand color)
--aviation-blue-light: #1A3A5A
--aviation-blue-dark: #0A1F33

--text-primary: #0F172A
--text-secondary: #64748B
--text-muted: #94A3B8

--bg-primary: #F8FAFC
--bg-card: #FFFFFF
--bg-hover: #F1F5F9

--border-default: #E2E8F0
--border-light: #F1F5F9

--status-active: #16A34A
--status-pending: #F59E0B
--status-error: #DC2626
--status-info: #3B82F6
```

### Design Principles
- **Aviation-grade premium UI** (ForeFlight/Garmin-inspired)
- **Gradient backgrounds** for sidebar/headers: `linear-gradient(180deg, #0F2A44 0%, #1A3A5A 100%)`
- **Active states:** Light blue accent (#38BDF8) with left border (desktop) or bottom border (mobile)
- **Clean spacing:** Professional padding and gaps
- **No tagline in sidebar/mobile header** - only on login page

---

## Project Structure

### File Organization
```
src/
├── app/
│   ├── (app)/app/          # Authenticated app routes
│   │   ├── layout.tsx      # App shell with sidebar/mobile header
│   │   ├── dashboard/      # Dashboard page
│   │   ├── logbook/        # Logbook list & edit
│   │   ├── integrations/   # Employer integrations
│   │   └── me/             # User settings
│   ├── (public)/           # Public routes
│   │   ├── login/          # Login page (mock auth)
│   │   └── employer/       # Employer-specific pages
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Root redirect
│   └── globals.css         # Global styles & CSS variables
├── components/
│   ├── auth/AuthGate.tsx   # Auth wrapper component
│   └── FormBuilder.tsx     # Dynamic form builder
├── lib/
│   ├── state/session.ts    # localStorage session management
│   ├── repo/               # Data repositories (mock + Firestore)
│   ├── defaults/           # Default templates (EASA)
│   ├── firebase.ts         # Firebase config
│   └── firestorePaths.ts   # Firestore path helpers
├── types/
│   ├── domain.ts           # Core domain types
│   └── fieldCatalog.ts     # Field definitions
└── assets/
    └── logo/               # SVG logo files
```

### Route Groups
- **(app)** - Authenticated routes with sidebar layout
- **(public)** - Public routes without sidebar

---

## Authentication
**Mock authentication** for development (no real Firebase Auth yet):
- Login: Enter any email → creates mock user
- Session: Stored in localStorage (`pilotlog_session`)
- AuthGate: Wraps authenticated routes, redirects to `/login` if no session

**Files:**
- `src/lib/state/session.ts` - Session helpers
- `src/components/auth/AuthGate.tsx` - Auth wrapper
- `src/app/(public)/login/page.tsx` - Login UI

---

## Data Model

### Core Types (`src/types/domain.ts`)
```typescript
User { uid, email, setupComplete }
Template { id, name, fields[], formOrder[], createdAt, updatedAt }
TemplateField { id, name, type, required, order }
View { id, name, templateId, columns[], sortBy, sortOrder }
ViewColumn { fieldId, width, order }
LogbookEntry { id, userId, templateId, values: Record<string, any>, createdAt, updatedAt }
Connector { id, userId, companyId, companyName, status, lastSyncAt }
```

### Field Types
`text | number | date | time | select | multiselect | checkbox`

### Default Template
EASA-compliant logbook template with fields like:
- date, departure, arrival, aircraft, registration
- flightMinutes, picMinutes, copilotMinutes
- seMinutes, meMinutes, landingsDay, landingsNight
- etc.

---

## Key Features

### 1. Dashboard (`/app/dashboard`)
- **Total stats:** Entries, flight time, PIC, co-pilot, SE, ME, landings
- **Period stats:** Hours for last 24h, 3d, 7d, 30d, 365d
- **Integrations:** Compact status card at bottom

### 2. Logbook (`/app/logbook`)
- Spreadsheet-like table view
- Drag-to-resize columns
- Drag-to-reorder columns
- Inline editing (click cell to edit)
- Add/edit entries via form
- Multiple views per template

### 3. Integrations (`/app/integrations`)
- Connect to employer crew management systems
- Mock connectors for testing
- Email-based connection flow

### 4. Settings (`/app/me`)
- User profile
- Template management
- View customization
- **Import CSV** (`/app/me/import`) - Import logbook from CSV files
  - Automatic column mapping with confidence scoring
  - Review and adjust mappings
  - Duplicate detection
  - Validation with warnings
- **Export** (`/app/me/export`) - Export logbook data
  - CSV or PDF format
  - Select all entries or last 5/15/30
  - Include all fields or selected fields only
  - Send via email (opens email client with PDF)

---

## Working Preferences

### Communication Style
1. **Be concise** - Short summaries, only essential info
2. **No code snippets** - User doesn't need to see code
3. **Execute fully** - When task is agreed upon, complete it without stopping for approval
4. **Trust & autonomy** - User trusts you to make good decisions

### Development Workflow
1. **Use package managers** - Never manually edit package.json, use `npm install`
2. **Respect codebase** - Conservative changes, follow existing patterns
3. **No unsolicited files** - Don't create docs/README unless asked
4. **Complete downstream changes** - Update all affected files (callers, tests, types)
5. **Use task management** - For complex work, use task tools to track progress

### Code Style
- **TypeScript** - Strict typing
- **Tailwind CSS** - Utility-first, use CSS variables for colors
- **Client components** - Use `"use client"` when needed (hooks, state)
- **Inline styles** - For dynamic CSS variable usage: `style={{ color: "var(--aviation-blue)" }}`

---

## Common Patterns

### Styling Pattern
```tsx
<div 
  className="rounded-xl border p-6"
  style={{
    backgroundColor: "var(--bg-card)",
    borderColor: "var(--border-default)"
  }}
>
```

### Active Navigation
```tsx
style={{
  backgroundColor: isActive ? "rgba(255, 255, 255, 0.1)" : "transparent",
  borderLeft: isActive ? "3px solid #38BDF8" : "3px solid transparent",
}}
```

### Time Formatting
```typescript
function formatMinutesToHHMM(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}
```

---

## Important Notes
- **Internal names** (package.json, folder names) are separate from user-facing branding (AutoFlightLog)
- **Mock data** is used throughout for development
- **Firebase** is configured but not fully integrated yet
- **No real authentication** - mock login only
- **Responsive design** - Mobile-first, works on all screen sizes

