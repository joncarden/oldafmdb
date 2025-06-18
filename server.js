const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { searchActorsByAge } = require('./services/tmdb-search');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Removed OpenAI functions - no longer needed

// API Routes

// Core search endpoint with just-in-time TMDB search
app.get('/api/search', async (req, res) => {
  const { age, gender = 'both' } = req.query;
  
  if (!age || age < 1 || age > 100) {
    return res.status(400).json({ error: 'Valid age required (1-100)' });
  }
  
  try {
    console.log(`Searching for actors aged ${age} (${gender})...`);
    const results = await searchActorsByAge(parseInt(age), gender, 20);
    
    console.log(`Found ${results.length} results for age ${age}`);
    res.json({ results, count: results.length });
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      error: 'Search failed',
      message: error.message 
    });
  }
});

// Removed caption generation - no longer needed

// Generate shareable image
app.get('/api/share/:movieId/:actorId', (req, res) => {
  const { movieId, actorId } = req.params;
  
  // Get movie and actor details
  const query = `
    SELECT 
      m.title,
      m.release_year,
      m.poster_path,
      a.name as actor_name,
      a.profile_path,
      r.character_name,
      r.age_at_filming,
      c.caption
    FROM movies m
    JOIN roles r ON m.id = r.movie_id
    JOIN actors a ON r.actor_id = a.id
    LEFT JOIN captions c ON c.movie_id = m.id AND c.actor_id = a.id
    WHERE m.tmdb_id = ? AND a.tmdb_id = ?
  `;
  
  db.get(query, [movieId, actorId], async (err, row) => {
    if (err || !row) {
      return res.status(404).json({ error: 'Movie/actor combination not found' });
    }
    
    try {
      const shareImageUrl = await generateShareImage(row);
      res.json({ 
        shareUrl: shareImageUrl,
        ogTitle: `${row.actor_name} was ${row.age_at_filming} in ${row.title}`,
        ogDescription: row.caption || `${row.actor_name} played ${row.character_name} in ${row.title} (${row.release_year})`
      });
    } catch (error) {
      console.error('Error generating share image:', error);
      res.status(500).json({ error: 'Failed to generate share image' });
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve share image directly
app.get('/api/share-image/:movieId/:actorId', async (req, res) => {
  const { movieId, actorId } = req.params;
  
  try {
    const query = `
      SELECT 
        m.tmdb_id,
        m.title,
        m.release_year,
        m.poster_path,
        a.tmdb_id as actor_tmdb_id,
        a.name as actor_name,
        a.profile_path,
        r.character_name,
        r.age_at_filming,
        c.caption
      FROM movies m
      JOIN roles r ON m.id = r.movie_id
      JOIN actors a ON r.actor_id = a.id
      LEFT JOIN captions c ON c.movie_id = m.id AND c.actor_id = a.id
      WHERE m.tmdb_id = ? AND a.tmdb_id = ?
    `;
    
    db.get(query, [movieId, actorId], async (err, row) => {
      if (err || !row) {
        return res.status(404).send('Image not found');
      }
      
      try {
        const imageUrl = await generateShareImage(row);
        const imagePath = path.join(__dirname, 'public', imageUrl);
        
        if (fs.existsSync(imagePath)) {
          res.sendFile(imagePath);
        } else {
          res.status(404).send('Image not found');
        }
      } catch (error) {
        console.error('Error serving share image:', error);
        res.status(500).send('Error generating image');
      }
    });
  } catch (error) {
    console.error('Error in share image endpoint:', error);
    res.status(500).send('Server error');
  }
});

// Dynamic OG tags for shared content
app.get('/share/:movieId/:actorId', (req, res) => {
  const { movieId, actorId } = req.params;
  
  const query = `
    SELECT 
      m.title,
      m.release_year,
      a.name as actor_name,
      r.age_at_filming,
      c.caption
    FROM movies m
    JOIN roles r ON m.id = r.movie_id
    JOIN actors a ON r.actor_id = a.id
    LEFT JOIN captions c ON c.movie_id = m.id AND c.actor_id = a.id
    WHERE m.tmdb_id = ? AND a.tmdb_id = ?
  `;
  
  db.get(query, [movieId, actorId], (err, row) => {
    if (err || !row) {
      return res.redirect('/');
    }
    
    const ogTitle = `${row.actor_name} was ${row.age_at_filming} in ${row.title}`;
    const ogDescription = row.caption || `${row.actor_name} was exactly ${row.age_at_filming} when they starred in ${row.title} (${row.release_year})`;
    const ogImage = `${req.protocol}://${req.get('host')}/api/share-image/${movieId}/${actorId}`;
    const ogUrl = `${req.protocol}://${req.get('host')}/share/${movieId}/${actorId}`;
    
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${ogTitle} - FilmAge</title>
        
        <!-- Open Graph tags -->
        <meta property="og:title" content="${ogTitle}">
        <meta property="og:description" content="${ogDescription}">
        <meta property="og:image" content="${ogImage}">
        <meta property="og:url" content="${ogUrl}">
        <meta property="og:type" content="website">
        <meta property="og:site_name" content="FilmAge">
        
        <!-- Twitter Card tags -->
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="${ogTitle}">
        <meta name="twitter:description" content="${ogDescription}">
        <meta name="twitter:image" content="${ogImage}">
        
        <script>
          // Redirect to main app after a short delay to show OG preview
          setTimeout(() => {
            window.location.href = '/?age=${row.age_at_filming}';
          }, 1000);
        </script>
    </head>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
        <h1>FilmAge</h1>
        <p>Redirecting you to discover more actors your age...</p>
        <p>If you're not redirected, <a href="/?age=${row.age_at_filming}" style="color: #4ecdc4;">click here</a></p>
    </body>
    </html>
    `;
    
    res.send(html);
  });
});

// Serve main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper function to get TMDB API key
function getTMDBKey() {
  try {
    const keyPath = path.join(__dirname, 'openai_credentials.txt');
    if (fs.existsSync(keyPath)) {
      const content = fs.readFileSync(keyPath, 'utf8');
      const match = content.match(/TMDB_API_KEY='([^']+)'/);
      if (match) {
        return match[1];
      }
    }
  } catch (error) {
    console.error('Error reading TMDB credentials:', error.message);
  }
  return process.env.TMDB_API_KEY;
}

// OpenAI integration for witty captions
// Removed generateCaption function - no longer needed

async function generateShareImage(data) {
  try {
    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filename = `share_${data.tmdb_id}_${data.actor_tmdb_id}.png`;
    const outputPath = path.join(uploadsDir, filename);

    // Check if image already exists
    if (fs.existsSync(outputPath)) {
      return `/uploads/${filename}`;
    }

    // Download movie poster
    let posterBuffer;
    if (data.poster_path) {
      try {
        const posterResponse = await fetch(`https://image.tmdb.org/t/p/w500${data.poster_path}`);
        posterBuffer = await posterResponse.buffer();
      } catch (error) {
        console.error('Error downloading poster:', error);
      }
    }

    // Download actor profile image
    let profileBuffer;
    if (data.profile_path) {
      try {
        const profileResponse = await fetch(`https://image.tmdb.org/t/p/w500${data.profile_path}`);
        profileBuffer = await profileResponse.buffer();
      } catch (error) {
        console.error('Error downloading profile:', error);
      }
    }

    // Create base canvas
    const width = 800;
    const height = 600;
    
    // Create background gradient
    const background = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 20, g: 20, b: 30, alpha: 1 }
      }
    }).png();

    let composite = [];

    // Add poster if available
    if (posterBuffer) {
      const resizedPoster = await sharp(posterBuffer)
        .resize(300, 450, { fit: 'cover' })
        .png();
      
      composite.push({
        input: await resizedPoster.toBuffer(),
        left: 50,
        top: 75
      });
    }

    // Add actor profile overlay if available  
    if (profileBuffer) {
      const resizedProfile = await sharp(profileBuffer)
        .resize(120, 120, { fit: 'cover' })
        .composite([{
          input: Buffer.from(
            '<svg><circle cx="60" cy="60" r="60" fill="white"/></svg>'
          ),
          blend: 'dest-in'
        }])
        .png();

      composite.push({
        input: await resizedProfile.toBuffer(),
        left: posterBuffer ? 280 : 50,
        top: posterBuffer ? 400 : 50
      });
    }

    // Add text overlay
    const textSvg = `
      <svg width="${width}" height="${height}">
        <defs>
          <style>
            .title { font-family: Arial, sans-serif; font-size: 36px; font-weight: bold; fill: #ffffff; }
            .actor { font-family: Arial, sans-serif; font-size: 28px; fill: #ff6b6b; }
            .age { font-family: Arial, sans-serif; font-size: 24px; fill: #4ecdc4; }
            .caption { font-family: Arial, sans-serif; font-size: 20px; fill: #ffe66d; }
          </style>
        </defs>
        <text x="${posterBuffer ? 420 : 200}" y="150" class="title">${data.title}</text>
        <text x="${posterBuffer ? 420 : 200}" y="190" class="actor">${data.actor_name}</text>
        <text x="${posterBuffer ? 420 : 200}" y="230" class="age">was ${data.age_at_filming} years old</text>
        ${data.caption ? `<text x="${posterBuffer ? 420 : 200}" y="300" class="caption">"${data.caption}"</text>` : ''}
        <text x="50" y="550" style="font-family: Arial, sans-serif; font-size: 16px; fill: #888;">FilmAge - Discover actors your age</text>
      </svg>
    `;

    composite.push({
      input: Buffer.from(textSvg),
      left: 0,
      top: 0
    });

    // Generate final image
    await background
      .composite(composite)
      .png()
      .toFile(outputPath);

    return `/uploads/${filename}`;

  } catch (error) {
    console.error('Error generating share image:', error);
    throw error;
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`FilmAge server running on port ${PORT}`);
  console.log(`Database: ${dbPath}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  db.close();
  process.exit(0);
});