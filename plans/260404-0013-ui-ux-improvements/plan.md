# UI/UX Improvements Plan

## Overview
Improve VNGeoGuessr visual design, user experience, and mobile responsiveness.

## Phases

### Phase 1: Visual Identity & Color Theme [completed]
- Vietnamese-inspired color palette (warm gradients, red/gold accents)
- Animated gradient background on homepage
- Better typography hierarchy (reduce ALL-CAPS overuse)

### Phase 2: Homepage Redesign [completed]
- Engaging hero section with gradient background
- City selection as visual cards with hover effects
- Better-spaced "How to Play" section with step icons
- Responsive donate modal

### Phase 3: Game Page Polish [completed]
- Compact, sleek header bar
- Better loading state with spinner animation
- Improved result modal with clearer visual hierarchy
- Score display with animated feedback

### Phase 4: Mobile Responsiveness [completed]
- Stacked layout on mobile for game page
- Responsive leaderboard modal
- Touch-friendly button sizing
- Responsive donate QR modal

## Files to Modify
- `src/app/globals.css` - Theme, animations, gradients
- `src/app/page.js` - Homepage redesign
- `src/app/components/GameClient.js` - Game page polish
- `src/app/components/DonateQRModal.js` - Responsive modal
- `src/app/components/UsernameModal.js` - Visual polish
- `src/app/game/page.js` - Loading state

## Constraints
- JavaScript only (no TypeScript)
- Use existing shadcn/ui components
- Keep all existing functionality intact
- Individual function parameters (no object destructuring)
