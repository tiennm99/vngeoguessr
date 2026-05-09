# Game Features

## Location Coverage
- **5 Vietnamese Locations**: Ha Noi, Da Nang, Ho Chi Minh, Da Lat, Duc Hoa (Long An)
- **Bbox-based Location Generation**: Pre-defined city bounding boxes for accurate area targeting
- **Random Location Selection**: Server-side random coordinate generation within city boundaries

## Street View System
- **Mapillary Integration**: Panoramic street-level images via Mapillary API
- **Dart-throw Strategy**: Pick random point in city bbox, query small fixed-size sub-bbox, retry on empty/error (20 attempts max)
- **Per-city Optimization**: Delta tuned per city to balance coverage and Mapillary query cost
  - Ha Noi: 0.003° (~333m square)
  - Ho Chi Minh, Da Lat, Da Nang, Duc Hoa: 0.005° (~556m square)
- **Panoramic Image Priority**: Filters for is_pano=true images (limit 3 per query)
- **Thumbnail Display**: Uses thumb_original_url for image display

## Interactive Maps
- **Leaflet Integration**: OpenStreetMap-based interactive mapping
- **Click-to-Place**: Intuitive guess marker placement

## Anti-Cheat Security
- **Redis Session Management**: Target coordinates stored server-side in Redis
- **UUID Session IDs**: Unique session identifiers using uuid v4
- **30-minute Expiry**: Automatic Redis session cleanup for security
- **Server-side Calculations**: All distance and scoring computed server-side using Turf.js
- **Session Cleanup**: Automatic session deletion after guess submission

## Scoring System
Distance-based points (0-5 scale):
- **0-50m**: 5 points
- **50m-100m**: 4 points
- **100m-200m**: 3 points
- **200m-500m**: 2 points
- **500m-1km**: 1 point
- **1km+**: 0 points

## Leaderboards
- **Triple-Leaderboard System**: Score leaderboards (accumulated points) + Distance leaderboards (best distances)
- **Score Leaderboards**: Separate accumulated score leaderboards for each city plus global Vietnam
- **Distance Leaderboards**: Best distance records for each city plus global Vietnam (multiple entries per user)
- **Redis Sorted Sets**: Persistent leaderboard data using Redis ZADD/ZRANGE
- **Top 200 Entries**: Maximum entry limit with automatic trimming per leaderboard
- **Accumulated Scoring**: All scores are added to both city and global score totals simultaneously
- **Distance Records**: Each game creates a new distance record entry (users can have multiple positions)
- **Persistent Storage**: No expiration on leaderboard data
- **Real-time Ranking**: Dynamic rank calculation for all leaderboard types
- **Triple Updates**: Each game updates score leaderboards AND distance leaderboards (city + global)
