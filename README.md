# VNGeoGuessr

A GeoGuessr clone focused on Vietnamese locations with accurate boundary detection and anti-cheat security. Play geolocation guessing games across 5 Vietnamese locations using real street-level imagery.

## 🎮 Features

- **5 Vietnamese Locations**: Ha Noi, Da Nang, Ho Chi Minh, Da Lat, Duc Hoa (Long An)
- **360° Street View**: Mapillary panoramic images with PhotoSphere viewer
- **Anti-Cheat Security**: Server-side session management prevents cheating
- **Distance-Based Scoring**: 0-5 point system based on accuracy
- **Persistent Leaderboards**: Redis-powered top 200 player rankings
- **Accurate Boundaries**: Nominatim API + Turf.js for precise city detection

## 📚 Documentation

For detailed information about this project, see the documentation in `/docs/`:

- **[Project Overview](docs/project-overview.md)** - Project summary and key characteristics
- **[Features](docs/features.md)** - Complete feature list and game mechanics
- **[Tech Stack](docs/tech-stack.md)** - Technology stack and dependencies
- **[Development Guidelines](docs/development.md)** - Development setup and coding standards
- **[Game Flow](docs/game-flow.md)** - Complete gameplay flow documentation
- **[Project Structure](docs/project-structure.md)** - Codebase organization and architecture

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- pnpm 11+
- Redis server (for leaderboards)

### Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run linting
pnpm lint
```

Open [http://localhost:3000](http://localhost:3000) to play the game.

## 🏗️ Built With

- **Frontend**: Next.js 15 + React 19 + Tailwind CSS 4
- **Street View**: Mapillary API + PhotoSphere Viewer
- **Maps**: Leaflet + OpenStreetMap
- **Geographic Data**: Nominatim API + Turf.js
- **Storage**: Redis (leaderboards) + In-memory sessions
- **UI Components**: shadcn/ui

## 🎯 How to Play

1. Enter your username
2. Select a Vietnamese location
3. View the 360° street panorama
4. Place your guess on the map
5. Earn points based on accuracy (closer = more points)
6. Compete for the top 200 leaderboard spots!

## 📋 Development Notes

- **JavaScript Only**: No TypeScript files
- **Individual Parameters**: Functions use separate parameters, not object destructuring
- **Server-Side Security**: Game coordinates never sent to client
- **Session Management**: Automatic cleanup after 30 minutes

## 🤝 Contributing

This project follows specific development guidelines. Please read the [Development Guidelines](docs/development.md) before contributing.
