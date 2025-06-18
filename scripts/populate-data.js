const sqlite3 = require('sqlite3').verbose();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const path = require('path');

// Helper function to get TMDB API key
function getTMDBKey() {
  try {
    const fs = require('fs');
    const keyPath = path.join(__dirname, '..', 'openai_credentials.txt');
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

const TMDB_API_KEY = getTMDBKey();
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const dbPath = path.join(__dirname, '..', 'database.db');
const db = new sqlite3.Database(dbPath);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchMoviesFromDecade(startYear, endYear, maxPages = 2) {
  const movies = [];
  
  for (let page = 1; page <= maxPages; page++) {
    try {
      const response = await fetch(
        `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&page=${page}&sort_by=popularity.desc&primary_release_date.gte=${startYear}-01-01&primary_release_date.lte=${endYear}-12-31&vote_count.gte=200`
      );
      
      if (!response.ok) {
        console.error(`Failed to fetch ${startYear}-${endYear} page ${page}: ${response.statusText}`);
        continue;
      }
      
      const data = await response.json();
      movies.push(...data.results);
      
      console.log(`Fetched ${startYear}-${endYear} page ${page}: ${data.results.length} movies`);
      
      // Rate limit to avoid hitting TMDB limits
      await sleep(150);
    } catch (error) {
      console.error(`Error fetching ${startYear}-${endYear} page ${page}:`, error.message);
    }
  }
  
  return movies;
}

async function fetchPopularMovies() {
  const currentYear = new Date().getFullYear();
  const cutoffYear = currentYear - 20; // 20+ years old for better nostalgia
  
  console.log(`Fetching popular movies from different decades (released before ${cutoffYear})...`);
  
  const allMovies = [];
  
  // Define decades to get variety (going back to ensure 20+ years)
  const decades = [
    { start: 2000, end: 2004, name: "Early 2000s" },
    { start: 1995, end: 1999, name: "Late 90s" },
    { start: 1990, end: 1994, name: "Early 90s" },
    { start: 1985, end: 1989, name: "Late 80s" },
    { start: 1980, end: 1984, name: "Early 80s" },
    { start: 1970, end: 1979, name: "70s" }
  ];
  
  // Fetch movies from each decade
  for (const decade of decades) {
    console.log(`\nFetching ${decade.name} movies...`);
    const decadeMovies = await fetchMoviesFromDecade(decade.start, decade.end, 2);
    allMovies.push(...decadeMovies);
    await sleep(200);
  }
  
  // Remove duplicates and sort by popularity
  const uniqueMovies = allMovies.filter((movie, index, self) => 
    index === self.findIndex(m => m.id === movie.id)
  );
  
  // Sort by popularity and take top movies for better recognition
  uniqueMovies.sort((a, b) => b.popularity - a.popularity);
  
  console.log(`\nTotal unique movies found: ${uniqueMovies.length}`);
  return uniqueMovies.slice(0, 120); // Limit to top 120 movies
}

async function fetchMovieCredits(movieId) {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/${movieId}/credits?api_key=${TMDB_API_KEY}`
    );
    
    if (!response.ok) {
      console.error(`Failed to fetch credits for movie ${movieId}`);
      return { cast: [] };
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching credits for movie ${movieId}:`, error.message);
    return { cast: [] };
  }
}

async function fetchActorDetails(actorId) {
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/person/${actorId}?api_key=${TMDB_API_KEY}`
    );
    
    if (!response.ok) {
      console.error(`Failed to fetch actor details for ${actorId}`);
      return null;
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching actor details for ${actorId}:`, error.message);
    return null;
  }
}

function calculateAge(birthDate, releaseDate) {
  const birth = new Date(birthDate);
  const release = new Date(releaseDate);
  
  if (isNaN(birth.getTime()) || isNaN(release.getTime())) {
    return null;
  }
  
  let age = release.getFullYear() - birth.getFullYear();
  const monthDiff = release.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && release.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
}

async function populateDatabase() {
  console.log('Starting database population...');
  
  const movies = await fetchPopularMovies();
  console.log(`Found ${movies.length} movies to process`);
  
  for (const movie of movies) {
    try {
      // Insert movie
      const movieQuery = `
        INSERT OR REPLACE INTO movies 
        (tmdb_id, title, release_year, poster_path, popularity_score, vote_average, vote_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      const releaseYear = new Date(movie.release_date).getFullYear();
      
      db.run(movieQuery, [
        movie.id,
        movie.title,
        releaseYear,
        movie.poster_path,
        movie.popularity,
        movie.vote_average,
        movie.vote_count
      ]);
      
      // Fetch and process cast
      const credits = await fetchMovieCredits(movie.id);
      
      // Focus on ONLY top 5 billed actors for maximum recognition
      // These are the actors people actually remember from the movie
      const topCast = credits.cast.slice(0, 5);
      
      for (const [index, actor] of topCast.entries()) {
        // Skip if no known_for_department or not an actor
        if (actor.known_for_department !== 'Acting') continue;
        
        // Skip if actor doesn't have a recognizable name/popularity
        if (!actor.popularity || actor.popularity < 1) continue;
        
        // Fetch detailed actor information to get birth date
        const actorDetails = await fetchActorDetails(actor.id);
        await sleep(100); // Rate limit for actor details
        
        let birthday = null;
        if (actorDetails && actorDetails.birthday) {
          birthday = actorDetails.birthday;
        }
        
        // Insert or update actor
        const actorQuery = `
          INSERT OR REPLACE INTO actors 
          (tmdb_id, name, gender, profile_path, popularity)
          VALUES (?, ?, ?, ?, ?)
        `;
        
        db.run(actorQuery, [
          actor.id,
          actor.name,
          actor.gender,
          actor.profile_path,
          actor.popularity || 0
        ]);
        
        // Calculate age if birth date is available
        let ageAtFilming = null;
        if (birthday) {
          ageAtFilming = calculateAge(birthday, movie.release_date);
        }
        
        // Determine prominence score based on billing order (top 5 only)
        let prominenceScore = 0; // Lead roles (positions 0-1)
        if (index >= 2) prominenceScore = 1; // Main supporting (positions 2-4)
        // No minor roles since we only take top 5
        
        // Insert role
        const roleQuery = `
          INSERT OR REPLACE INTO roles 
          (movie_id, actor_id, character_name, billing_order, age_at_filming, prominence_score)
          VALUES (
            (SELECT id FROM movies WHERE tmdb_id = ?),
            (SELECT id FROM actors WHERE tmdb_id = ?),
            ?, ?, ?, ?
          )
        `;
        
        db.run(roleQuery, [
          movie.id,
          actor.id,
          actor.character,
          index,
          ageAtFilming,
          prominenceScore
        ]);
        
        if (ageAtFilming) {
          console.log(`  ${actor.name} was ${ageAtFilming} in ${movie.title}`);
        }
      }
      
      console.log(`Processed: ${movie.title} (${releaseYear})`);
      
      // Rate limit
      await sleep(200);
      
    } catch (error) {
      console.error(`Error processing movie ${movie.title}:`, error.message);
    }
  }
  
  console.log('Database population completed!');
}

// Run the population
populateDatabase().then(() => {
  db.close();
  console.log('Database connection closed.');
}).catch(error => {
  console.error('Population failed:', error);
  db.close();
});