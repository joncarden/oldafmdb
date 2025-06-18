# FilmAge Setup Guide

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up API keys:**
   - Get a TMDB API key from https://www.themoviedb.org/settings/api
   - Add your OpenAI API key to `openai_credentials.txt`
   - Set environment variables (optional):
     ```bash
     export TMDB_API_KEY="your_tmdb_key"
     export OPENAI_API_KEY="your_openai_key"
     ```

3. **Initialize database:**
   ```bash
   npm run setup-db
   ```

4. **Populate with movie data:**
   ```bash
   TMDB_API_KEY="your_key" npm run populate-data
   ```

5. **Start the server:**
   ```bash
   npm run dev
   ```

## Configuration

### Required API Keys

1. **TMDB API Key** (free)
   - Sign up at https://www.themoviedb.org/
   - Go to Settings > API
   - Request an API key (free, instant approval)

2. **OpenAI API Key** (paid)
   - Sign up at https://platform.openai.com/
   - Generate an API key
   - Add credits to your account for GPT-4o usage

### Environment Setup

You can configure the app in two ways:

1. **Environment variables:**
   ```bash
   export TMDB_API_KEY="your_tmdb_key"
   export OPENAI_API_KEY="your_openai_key"
   export PORT=3000
   ```

2. **File-based credentials:**
   - Add OpenAI key to `openai_credentials.txt`
   - Pass TMDB key directly to populate script

## Database Population

The populate script fetches popular movies from TMDB that are 10+ years old:

```bash
TMDB_API_KEY="your_key" npm run populate-data
```

This process:
- Fetches 200+ popular movies released 10+ years ago
- Gets cast information for each movie
- Calculates actor ages at filming time
- Assigns prominence scores based on billing order
- Prioritizes recognizable films and lead roles

## Architecture Overview

### Backend (server.js)
- **Express.js** server with SQLite database
- **Popularity-based search** algorithm
- **OpenAI GPT-4o** integration for witty captions
- **Sharp.js** image processing for share cards

### Frontend (public/)
- **Mobile-first** responsive design
- **Age picker** with localStorage persistence
- **Gender filter** pills with animations
- **Lazy-loaded** poster grid
- **Native sharing** with fallback to clipboard

### Database Schema
- `movies` - TMDB movie data with popularity scores
- `actors` - Actor information and profiles
- `roles` - Actor-movie relationships with ages and prominence
- `captions` - Cached OpenAI-generated captions

## Performance Features

- **Sub-300ms response times** via optimized indexes
- **Indefinite caption caching** as per PRD requirements
- **Lazy loading** for movie posters
- **Image caching** for share cards
- **LocalStorage** for user preferences

## Deployment Notes

### Production Setup
1. Set up environment variables on your hosting platform
2. Ensure SQLite file permissions are correct
3. Create `uploads/` directory for share images
4. Configure reverse proxy for static assets

### Scaling Considerations
- SQLite handles the expected load well
- For high traffic, consider PostgreSQL migration
- CDN recommended for poster images and share cards
- Rate limiting recommended for OpenAI API calls

## API Endpoints

- `GET /api/search?age={age}&gender={gender}` - Core search
- `GET /api/caption/{movieId}/{actorId}` - Get witty caption
- `GET /api/share/{movieId}/{actorId}` - Generate share data
- `GET /share/{movieId}/{actorId}` - Shareable URL with OG tags
- `GET /api/health` - Health check

## Troubleshooting

### Common Issues

1. **No search results**
   - Ensure database is populated with `npm run populate-data`
   - Try different ages (20-50 typically have more matches)

2. **OpenAI captions not working**
   - Verify API key in `openai_credentials.txt`
   - Check API credits and rate limits
   - Fallback captions will be used on errors

3. **Share images not generating**
   - Ensure Sharp.js is properly installed
   - Check `public/uploads/` directory permissions
   - TMDB images must be accessible

### Performance Issues

1. **Slow search responses**
   - Check database indexes with `.schema` in sqlite3
   - Consider rebuilding database with `npm run setup-db`

2. **Caption generation timeout**
   - OpenAI API can be slow; normal for first-time captions
   - Cached captions load instantly

## Success Metrics (Per PRD)

- **Time to first results**: ≤ 0.3s p95
- **NPS target**: ≥ 60
- **Shares per 100 sessions**: ≥ 25
- **Day-7 return rate**: ≥ 30%

The app is optimized for these metrics through recognition-first results and viral sharing features.