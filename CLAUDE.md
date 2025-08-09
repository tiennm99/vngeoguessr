# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VNGeoGuessr is a GeoGuessr clone focused on Vietnamese locations, supporting 6 major cities with accurate boundary detection and anti-cheat security. Built with Next.js 15.4.6, React 19, and Tailwind CSS 4.

## Game Features

- **Location Coverage**: 6 Vietnamese cities - Ho Chi Minh City, Hanoi, Hai Phong, Nam Dinh, Da Nang, Da Lat
- **Accurate Location Generation**: Nominatim API + Turf.js for precise city boundary detection
- **Street View**: Mapillary panoramic images with 3-tier search (1km→2km→5km radius)
- **360° Panorama Viewer**: PhotoSphere Viewer with zoom and fullscreen controls
- **Interactive Maps**: Leaflet + OpenStreetMap with click-to-place guess markers
- **Anti-Cheat Security**: Server-side session management, no client-side target coordinates
- **Scoring System**: Distance-based points (0-5 scale) with time bonuses
- **Leaderboards**: Redis-based persistent storage, top 200 players, highest score tracking
- **Timer**: 3-minute countdown with auto-submit functionality

## Tech Stack

- **Frontend**: Next.js 15 + React 19 + Tailwind CSS 4
- **Street View**: Mapillary API + PhotoSphere Viewer with dynamic imports
- **Geographic Data**: Nominatim OpenStreetMap API for city boundaries
- **Spatial Operations**: Turf.js for point-in-polygon detection and distance calculations
- **Maps**: Leaflet + OpenStreetMap with dynamic imports
- **Session Management**: In-memory Map storage with automatic cleanup (30min expiry)
- **Backend**: Redis for persistent leaderboard storage (top 200 entries)
- **UI**: shadcn/ui components (new-york style)
- **Security**: Server-side session isolation, no client-side target coordinates

## Development Commands

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build the application for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## Project Structure

- `src/app/` - Next.js App Router pages and layouts
- `src/lib/utils.js` - Utility functions including `cn()` for class name merging
- `/docs` - Documentation files
- `/plans` - Project planning documents
- `components.json` - shadcn/ui configuration

## Key Dependencies

- **UI**: shadcn/ui components with class-variance-authority
- **Styling**: Tailwind CSS with tailwind-merge and clsx
- **Icons**: Lucide React
- **Development**: ESLint with Next.js config
- **Analytics**: Vercel Analytics + Speed Insights

## shadcn/ui Configuration

- Style: "new-york"
- Path aliases configured for `@/components`, `@/lib`, etc.
- Components use JavaScript (.js) not TypeScript
- CSS variables enabled for theming

## Gameplay Flow

1. **Username Setup**: Check localStorage for username, prompt if not set
2. **City Selection**: Choose from Ho Chi Minh City, Hanoi, Hai Phong, Nam Dinh, Da Nang, Da Lat
3. **Session Creation**: Server generates unique session ID and stores exact location securely
4. **Location Display**: 
   - Server uses accurate city boundary detection via Nominatim API and Turf.js
   - Mapillary API searches with 3-retry logic: 1km → 2km → 5km radius
   - PhotoSphereViewer displays panoramic street view (client never receives exact coordinates)
5. **Guessing Phase**: 
   - View 360° street-level image with PhotoSphereViewer controls
   - 3-minute countdown timer per location
   - Place guess marker on interactive Leaflet map with OpenStreetMap
   - Auto-submit when timer expires (with penalty) or manual submission
6. **Server-Side Processing**: 
   - Client submits guess coordinates + session ID (no target location exposed)
   - Server retrieves exact location from session, calculates distance using Turf.js
   - Server-side score calculation prevents client-side cheating
   - Session cleanup after submission for security
7. **Scoring System**: Distance-based points (0-5 scale):
   - 0-50m = 5 points
   - 50m-100m = 4 points  
   - 100m-200m = 3 points
   - 200m-500m = 2 points
   - 500m-1km = 1 point
   - 1km+ = 0 points
   - Small time bonus for quick submissions (>2 minutes remaining)
8. **Results Display**: 
   - Show distance, score, exact location coordinates
   - Display current leaderboard rank (Vietnam-wide)
   - Compare guess vs actual location coordinates
9. **Leaderboard Management**:
   - Redis-based storage with username + highest score only
   - Maximum 200 entries (auto-trimmed to top performers)
   - Persistent storage (no expiration)
   - Score updates only if new score is higher
10. **Continue**: Next round with new session or return to city selection

## Important Development Guidelines

- **JavaScript Only**: This project uses JavaScript exclusively. Never create or suggest TypeScript files (.ts, .tsx)
- **Function Parameters**: All functions should use individual parameters instead of object destructuring. Use `function(param1, param2)` instead of `function({param1, param2})`
- **File Modifications**: Only modify source code files, documentation (/docs), and plans (/plans)
- **Configuration Changes**: Any changes to configuration files (package.json, next.config.mjs, eslint.config.mjs, components.json, etc.), environment files, or build settings should be highlighted for manual processing by the developer
- **Security**: Never expose or commit secret keys and sensitive information
- **Testing**: After completing implementation tasks, inform the user that the work is complete and ready for manual testing. Do NOT attempt to run test commands or start development servers - the user will handle testing manually.