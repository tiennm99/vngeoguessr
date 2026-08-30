# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation

For detailed information about this project, refer to the documentation files in `/docs/`:

- **[Project Overview](/docs/project-overview.md)** - Project summary, key characteristics, and game mechanics
- **[Features](/docs/features.md)** - Detailed game features, scoring system, and security measures
- **[Tech Stack](/docs/tech-stack.md)** - Complete technology stack and dependencies
- **[Development Guidelines](/docs/development.md)** - Development commands, coding standards, and best practices
- **[Game Flow](/docs/game-flow.md)** - Complete gameplay flow from start to finish
- **[Project Structure](/docs/project-structure.md)** - Directory organization and file purposes

## Quick Reference

**Development Commands:**
- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build the application for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm test` - Run tests against the in-memory Redis fake (no service needed)
- `npm run test:integration` - Same tests against local Redis (`npm run redis:up` first)

**Key Guidelines:**
- **JavaScript Only**: No TypeScript files (.ts, .tsx)
- **Function Parameters**: Use individual parameters, not object destructuring
- **File Modifications**: Only modify source code, `/docs`, and `/plans`
- **Generated Data**: `src/data/` is build output. Change the scripts in
  `scripts/`, never the files
- **Client Safety**: `src/lib/pano-index.js` and `src/data/panos/` are
  server-only. Client components use `src/lib/regions.js`
- **Security**: Never expose secrets or keys
- **Testing**: Run `npm test` for changes under `src/lib/` or `src/data/`; inform user when complete - they handle manual testing of the UI

## Critical Instructions

When working on this codebase, always:
1. Read the relevant documentation files in `/docs/` for context
2. Follow the JavaScript-only approach with individual function parameters
3. Maintain server-side security for game sessions, coordinates, and the
   district a panorama resolved to
4. Use existing patterns and libraries already present in the codebase
5. Highlight any configuration file changes for manual processing