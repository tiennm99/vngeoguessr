# Project Structure

## Root Directory
- `CLAUDE.md` - Project instructions and guidelines for Claude Code
- `components.json` - shadcn/ui configuration
- `package.json` - Dependencies and scripts
- `next.config.mjs` - Next.js configuration
- `eslint.config.mjs` - ESLint configuration
- `postcss.config.mjs` - PostCSS configuration
- `jsconfig.json` - JavaScript project configuration

## Source Code (`src/`)

### App Router (`src/app/`)
Next.js 15 App Router structure:

#### Pages
- `page.js` - Homepage with city selection
- `layout.js` - Root layout component
- `globals.css` - Global styles
- `favicon.ico` - Site favicon

#### Game Pages
- `game/page.js` - Main game interface
- `leaderboard/page.js` - Leaderboard display
- `debug/page.js` - Development debugging tools

#### API Routes (`src/app/api/`)
- `new-game/route.js` - Creates new game sessions with Redis storage
- `guess/route.js` - Processes guess submissions and calculates scores
- `leaderboard/route.js` - Leaderboard data management with Redis
- `skip/route.js` - Skip current round functionality
- `debug/mapillary/route.js` - Mapillary API debugging and testing

#### React Components (`src/app/components/`)
- `GameClient.js` - Main game client component
- `LeafletMap.js` - Interactive map for guess placement
- `PanoramaViewer.js` - 360° street view display
- `UsernameModal.js` - Username input modal
- `DonateQRModal.js` - Donation QR code modal

### Reusable Components (`src/components/`)

#### shadcn/ui Components (`src/components/ui/`)
- `alert.jsx` - Alert notifications
- `avatar.jsx` - User avatars
- `badge.jsx` - Badge components
- `button.jsx` - Button variants
- `card.jsx` - Card layouts
- `dialog.jsx` - Modal dialogs
- `form.jsx` - Form components
- `input.jsx` - Input fields
- `label.jsx` - Form labels
- `popover.jsx` - Popover components
- `progress.jsx` - Progress indicators
- `separator.jsx` - Visual separators
- `sheet.jsx` - Side sheets
- `skeleton.jsx` - Loading skeletons
- `table.jsx` - Data tables
- `tabs.jsx` - Tab navigation
- `tooltip.jsx` - Tooltips

### Utility Libraries (`src/lib/`)
- `utils.js` - Utility functions including `cn()` for class name merging
- `game.js` - Game logic, scoring, distance calculations, city definitions, Mapillary delta config
- `leaderboard.js` - Leaderboard operations with Redis sorted sets
- `mapillary.js` - Mapillary API integration (dart-throw strategy, per-city delta)
- `session.js` - Redis-based session management with 30-min expiry
- `upstash.js` - Upstash Redis REST client adapter with multi-tenant key prefix support

## Documentation (`/docs/`)
- `project-overview.md` - Project overview and key characteristics
- `features.md` - Detailed game features documentation
- `tech-stack.md` - Technology stack and dependencies
- `development.md` - Development guidelines and commands
- `game-flow.md` - Complete gameplay flow documentation
- `project-structure.md` - This file - project organization

## Planning (`/plans/`)
- Project planning documents and implementation plans

## Public Assets (`public/`)
- `*.svg` - SVG icons and graphics
- Static assets served directly by Next.js