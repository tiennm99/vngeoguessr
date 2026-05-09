# Development Guidelines

## Development Commands

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build the application for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## Important Development Guidelines

### JavaScript Only
- This project uses **JavaScript exclusively**
- Never create or suggest TypeScript files (.ts, .tsx)
- All components and utilities should be .js or .jsx files

### Function Parameters
- All functions should use **individual parameters** instead of object destructuring
- Use `function(param1, param2)` instead of `function({param1, param2})`
- This applies to React components, utility functions, and API handlers

### File Modification Policy
- **Only modify source code files**, documentation (/docs), and plans (/plans)
- Configuration changes (package.json, next.config.mjs, eslint.config.mjs, components.json, etc.) should be highlighted for manual processing
- Environment files and build settings require manual review

### Security Best Practices
- Never expose or commit secret keys and sensitive information
- Server-side session management prevents client-side coordinate access (Redis TTL 30 min)
- All geographic calculations must be performed server-side
- Session cleanup after guess submission for security

### Environment Variables

**Redis (required)**:
- Either `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (vanilla Upstash)
- Or `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Vercel Marketplace)
- Optional: `KEY_PREFIX` (default: `vngeoguessr:`) for multi-tenant DB sharing

**Mapillary (required)**:
- `MAPILLARY_ACCESS_TOKEN` - Mapillary API token for image fetching

### Testing & Completion
- After completing implementation tasks, inform the user that work is complete
- Ready for manual testing - do NOT attempt to run test commands
- Do NOT start development servers - user handles testing manually

## shadcn/ui Configuration

- **Style**: "new-york"
- **Path aliases**: Configured for `@/components`, `@/lib`, etc.
- **Components**: Use JavaScript (.js) not TypeScript
- **CSS variables**: Enabled for theming
- **Components location**: `src/components/ui/`

## Code Style Standards

- Follow existing code patterns in the codebase
- Use established libraries and utilities already present
- Maintain consistent naming conventions
- No comments unless explicitly requested
- Prefer editing existing files over creating new ones