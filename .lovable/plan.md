

# Client Logo Upload + Display on Cards

Currently `clients.logo_url` exists but isn't user-uploadable, and the four card surfaces (Clients, Projects, Project Openings, Applications) don't show it. This wires up upload + display end-to-end.

## What you'll be able to do
- On the admin Client form: upload, preview, and remove a client logo (PNG/JPG/WebP, ≤2 MB).
- See that logo automatically on every card in:
  - **Clients** (`/admin/clients`)
  - **Projects** (under each client + `/admin/clients` project view)
  - **Project Openings** (`/project-openings` + public opening detail)
  - **Applications** (Your Applications + All Applications tabs + status page)

## Implementation

### 1. Storage
- Create a public `client-logos` Supabase storage bucket (mirrors existing `avatars` pattern).
- RLS:
  - `SELECT`: public (logos are shown on public project openings).
  - `INSERT/UPDATE/DELETE`: only admins (`has_role(auth.uid(), 'admin')`).
- Path convention: `{client_id}/logo.{ext}`, `upsert: true`, cache-busted with `?t={timestamp}`.

### 2. Upload component
- New `src/components/ClientLogoUpload.tsx` modeled after `AvatarUpload.tsx`:
  - Accepts `clientId`, `currentUrl`, `onUploaded`.
  - 2 MB cap, PNG/JPG/WebP only, square preview with rounded corners (not circle — logos look bad cropped to circles).
  - Upload writes to bucket, then updates `clients.logo_url`.
  - Remove button clears storage + sets `logo_url = ''`.
- Wire it into the existing client create/edit form on `/admin/clients` (the `ClientsPage` form panel).

### 3. Reusable display primitive
- New `src/components/ClientLogo.tsx`:
  - Props: `url`, `name`, `size` (`sm | md | lg`), `className`.
  - Renders the image when `url` is non-empty; otherwise renders a neutral fallback tile with the client's initials (so cards look intentional, never broken).
  - Uses `<img loading="lazy" />` with proper alt text (`{client.name} logo`).

### 4. Card surfaces to update
For each, fetch `clients.logo_url` alongside the existing client name and render `<ClientLogo />` in the card header:

| Surface | File(s) |
|---|---|
| Clients list cards | `src/pages/ClientsPage.tsx` |
| Projects cards (within Clients page) | same file, project sub-cards |
| Project Openings list + detail | `src/pages/ProjectOpeningsPage.tsx`, `src/pages/ProjectOpeningDetailPage.tsx` |
| Public opening detail (edge fn already returns `client`) | confirm `public-project-detail` already selects `logo_url` — if not, add it to the select |
| My Project Applications | `src/pages/MyProjectApplicationsPage.tsx` |
| All Applications (admin tab) | `src/pages/ApplicationsPage.tsx` (and the AG Grid cell renderer for the client column gets a small 24px logo) |
| Application status page | `src/pages/ProjectApplicationStatusPage.tsx` |

For the AG Grid "All Applications" view, a compact 24px square logo + name in the same cell keeps row height unchanged.

### 5. Memory + docs
- Save a project memory at `mem://features/admin/client-logos` describing the bucket, validation, and the four card surfaces, so future work stays consistent.

## Out of scope
- Bulk logo import / scraping from client websites.
- Cropping UI — users upload their preferred square version (matches existing avatar UX).
- WebP→AVIF conversion or CDN resizing — Supabase image transformation can be a follow-up if file sizes become an issue.

