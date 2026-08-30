# Gameplay Flow

## Complete Game Flow

### 1. Username Setup
- Check localStorage for existing username
- Display UsernameModal if not set
- Store username for leaderboard tracking

### 2. Region Selection
- Choose anywhere on the region tree:
  - **Vietnam** — draws from every covered province
  - **A province** — Ha Noi, Ho Chi Minh, Da Nang, Lam Dong, Long An
  - **A district or town** — 61 of them, expanded from their province
- Regions with no usable panoramas are listed but disabled, with the reason
  shown. See the Coverage note in [project-overview.md](project-overview.md)

### 3. Session Creation
- Server generates unique UUID v4 session ID
- Server stores the exact target location **and the district the panorama sits
  in** in Redis with 30-minute expiry
- Client receives session ID only — never the coordinates, never the district

### 4. Location Display Process
- **Pick from the index**: the server draws a random panorama id from the
  prebuilt index for the selected region (`pickRandomPano` in
  `src/lib/pano-index.js`). A country draw picks a province uniformly first, so
  the round is not dominated by whichever province has the most panoramas
- **Resolve the image**: one Mapillary lookup by id, ~230ms. Up to three
  candidates are tried in case an image was deleted upstream
- **Credit the district that won**: the resolving district comes from the attempt
  that succeeded, not the first candidate — each retry may sit in a different
  district
- **Image Display**: `thumb_2048_url`, falling back to `thumb_original_url`
- **Security**: client never receives the coordinates or the district

### 5. Guessing Phase
- **Image Interaction**: View street-level thumbnail image
- **Map Interaction**: Place guess marker on interactive Leaflet map with OpenStreetMap
- **Map Search**: optional search for a district, street, or place to pan the
  map before clicking; results never reveal or place the answer
- **Submission**: Click submit button to finalize guess

### 6. Server-Side Processing
- **Input**: Client submits guess coordinates + session ID only
- **Retrieval**: Server retrieves exact location from Redis session storage
- **Validation**: Server validates coordinate ranges and session existence
- **Calculation**: Server calculates distance using Turf.js distance function
- **Scoring**: Server-side score calculation with distance-based points
- **Cleanup**: the session is claimed with an atomic `DEL` *before* any score is
  written, so a replay or a concurrent submit scores exactly once

### 7. Scoring System
Distance-based points (0-5 scale):
- **0-50m**: 5 points
- **50m-100m**: 4 points  
- **100m-200m**: 3 points
- **200m-500m**: 2 points
- **500m-1km**: 1 point
- **1km+**: 0 points

### 8. Results Display
- Show calculated distance between guess and actual location
- Display earned points for current round (0-5 scale)
- Reveal the region path the panorama was in, e.g. Vietnam › Ho Chi Minh ›
  District 7 — this is the first time the client learns the district
- Show the accumulated total and rank at each of the three levels
- Show distance leaderboard rankings for the current game at each level
- Reveal exact target coordinates and compare guess vs actual on the map

### 9. Leaderboard Management
- **Rollup fan-out**: each game updates the score board and the distance board
  at every level above the panorama — normally district, province and
  Vietnam, or province and Vietnam when the panorama fell outside every
  district outline. The levels are written concurrently
- **Score Leaderboards**: Accumulated scoring system with single entry per user
- **Distance Leaderboards**: Best distance records with multiple entries per user allowed
- **Redis Sorted Sets**: Persistent storage using ZADD/ZRANGE operations
- **Top 200 Limit**: Automatic trimming per leaderboard to maintain top performers only
- **Score Accumulation**: New scores added to existing totals in score leaderboards
- **Distance Records**: Each game creates new timestamped distance record entry
- **Real-time Ranking**: Dynamic rank calculation using ZREVRANK/ZRANK for all leaderboard types
- **Persistent Storage**: No expiration on leaderboard data

### 10. Continue or Exit
- Option to start next round with new session and location in the same region
- Option to return to the region picker and choose somewhere else
- Option to view full leaderboard with pagination
- Redis session cleanup ensures fresh start for each round