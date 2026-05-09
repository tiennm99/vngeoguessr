# Gameplay Flow

## Complete Game Flow

### 1. Username Setup
- Check localStorage for existing username
- Display UsernameModal if not set
- Store username for leaderboard tracking

### 2. Location Selection
- Choose from 5 Vietnamese locations:
  - Ha Noi
  - Da Nang
  - Ho Chi Minh
  - Da Lat
  - Duc Hoa (Long An)

### 3. Session Creation
- Server generates unique UUID v4 session ID
- Server stores exact target location securely in Redis with 30-minute expiry
- Client receives session ID but never the target coordinates

### 4. Location Display Process
- **Bbox Location Generation**: Server uses pre-defined city bounding boxes for random coordinate generation
- **Image Search**: Mapillary API dart-throw strategy (ported from viguessr):
  - Pick random point in city bbox
  - Query small fixed-size sub-bbox (side = 2×delta) centered on point
  - Retry up to 20 times if empty or error (re-roll position)
  - Per-city delta tuned to keep query cost below Mapillary cap (HN: 0.003°, others: 0.005°)
  - Filter for is_pano=true panoramic images, limit 3 results
- **Image Display**: Thumbnail images displayed (thumb_original_url)
- **Security**: Client never receives exact target coordinates

### 5. Guessing Phase
- **Image Interaction**: View street-level thumbnail image
- **Map Interaction**: Place guess marker on interactive Leaflet map with OpenStreetMap
- **Submission**: Click submit button to finalize guess

### 6. Server-Side Processing
- **Input**: Client submits guess coordinates + session ID only
- **Retrieval**: Server retrieves exact location from Redis session storage
- **Validation**: Server validates coordinate ranges and session existence
- **Calculation**: Server calculates distance using Turf.js distance function
- **Scoring**: Server-side score calculation with distance-based points
- **Cleanup**: Redis session deleted after successful submission

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
- Show accumulated total scores for both city and global score leaderboards
- Display current rankings in both city and global score leaderboards
- Show distance leaderboard rankings for current game (city and global)
- Show leaderboard update message with score increments
- Reveal exact target coordinates and location details
- Compare guess vs actual location on map

### 9. Leaderboard Management
- **Triple-Leaderboard Updates**: Each game updates score leaderboards AND distance leaderboards (city + global)
- **Score Leaderboards**: Accumulated scoring system with single entry per user
- **Distance Leaderboards**: Best distance records with multiple entries per user allowed
- **Redis Sorted Sets**: Persistent storage using ZADD/ZRANGE operations
- **Top 200 Limit**: Automatic trimming per leaderboard to maintain top performers only
- **Score Accumulation**: New scores added to existing totals in score leaderboards
- **Distance Records**: Each game creates new timestamped distance record entry
- **Real-time Ranking**: Dynamic rank calculation using ZREVRANK/ZRANK for all leaderboard types
- **Persistent Storage**: No expiration on leaderboard data

### 10. Continue or Exit
- Option to start next round with new session and location
- Option to return to city selection for different city
- Option to view full leaderboard with pagination
- Redis session cleanup ensures fresh start for each round