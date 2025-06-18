const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const path = require('path');
const fs = require('fs');

// Helper function to get TMDB API key
function getTMDBKey() {
  try {
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

async function searchActorsByAge(targetAge, gender = 'both', limit = 20) {
  try {
    console.log(`Searching TMDB for actors aged ${targetAge}...`);
    const startTime = Date.now();
    
    // Search TMDB for popular movies from different decades (20+ years old)
    // Process decades in priority order (most recent first for better results)
    const decades = [
      { start: 2000, end: 2005 },
      { start: 1995, end: 1999 },
      { start: 1990, end: 1994 },
      { start: 1985, end: 1989 },
      { start: 1980, end: 1984 },
      { start: 1975, end: 1979 },
      { start: 1970, end: 1974 }
    ];
    
    const allResults = [];
    const targetResultCount = Math.max(limit * 2, 50); // Get extra results for better filtering
    
    // Process decades sequentially with early termination
    for (const decade of decades) {
      if (allResults.length >= targetResultCount) {
        console.log(`Early termination: Found ${allResults.length} results`);
        break;
      }
      
      const decadeResults = await searchDecadeForAge(decade.start, decade.end, targetAge, gender, targetResultCount - allResults.length);
      allResults.push(...decadeResults);
      
      console.log(`Decade ${decade.start}-${decade.end}: ${decadeResults.length} results (total: ${allResults.length})`);
    }
    
    // Remove duplicates and sort by relevance
    const uniqueResults = allResults.filter((result, index, self) => 
      index === self.findIndex(r => 
        r.movie_tmdb_id === result.movie_tmdb_id && 
        r.actor_tmdb_id === result.actor_tmdb_id
      )
    );
    
    // Sort by actor popularity first, then by movie popularity, then by actor prominence
    uniqueResults.sort((a, b) => {
      // Primary sort: Actor popularity (higher is better) - most famous actors first
      const actorPopularityDiff = (b.actor_popularity || 0) - (a.actor_popularity || 0);
      if (Math.abs(actorPopularityDiff) > 0.1) return actorPopularityDiff;
      
      // Secondary sort: Movie popularity (higher is better)
      const moviePopularityDiff = (b.popularity_score || 0) - (a.popularity_score || 0);
      if (Math.abs(moviePopularityDiff) > 0.1) return moviePopularityDiff;
      
      // Tertiary sort: Actor prominence (lower billing_order is better)
      return (a.billing_order || 0) - (b.billing_order || 0);
    });
    
    const searchTime = Date.now() - startTime;
    console.log(`Search completed in ${searchTime}ms, found ${uniqueResults.length} unique results`);
    
    return formatResults(uniqueResults.slice(0, Math.max(limit, 30))); // Ensure we return at least 30 results if available
    
  } catch (error) {
    throw error;
  }
}

async function searchDecadeForAge(startYear, endYear, targetAge, gender, limit) {
  const results = [];
  
  try {
    // Search for popular English movies in this decade - reduced scope for speed
    const response = await fetch(
      `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&sort_by=popularity.desc&primary_release_date.gte=${startYear}-01-01&primary_release_date.lte=${endYear}-12-31&vote_count.gte=50&with_original_language=en&page=1`
    );
    
    if (!response.ok) return results;
    
    const data = await response.json();
    const movies = data.results.slice(0, 50); // Reduced from 200 to 50 for speed
    
    // Process movies in batches for better performance
    const batchSize = 10;
    for (let i = 0; i < movies.length; i += batchSize) {
      // Early termination if we have enough results
      if (results.length >= limit) {
        console.log(`  Early termination at movie ${i}/${movies.length}, found ${results.length} results`);
        break;
      }
      
      const batch = movies.slice(i, i + batchSize);
      const batchPromises = batch.map(movie => findActorsInMovie(movie, targetAge, gender));
      
      const batchResults = await Promise.all(batchPromises);
      const flatResults = batchResults.flat();
      results.push(...flatResults);
      
      // Reduced rate limiting - only between batches, not individual calls
      if (i + batchSize < movies.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
  } catch (error) {
    console.error(`Error searching ${startYear}-${endYear}:`, error.message);
  }
  
  return results.slice(0, limit);
}

async function findActorsInMovie(movie, targetAge, gender) {
  const results = [];
  
  try {
    // Get movie credits
    const creditsResponse = await fetch(`${TMDB_BASE_URL}/movie/${movie.id}/credits?api_key=${TMDB_API_KEY}`);
    
    if (!creditsResponse.ok) return results;
    
    const credits = await creditsResponse.json();
    const topCast = credits.cast.slice(0, 3); // Reduced from 5 to 3 for speed
    
    // Batch actor detail requests for better performance
    const actorPromises = topCast.map(async (actor, index) => {
      if (actor.known_for_department !== 'Acting') return null;
      if (!actor.popularity || actor.popularity < 0.5) return null; // Increased threshold for better quality
      
      // Skip if gender doesn't match
      if (gender === 'actors' && actor.gender !== 2) return null;
      if (gender === 'actresses' && actor.gender !== 1) return null;
      
      try {
        // Get actor details for birth date
        const actorResponse = await fetch(
          `${TMDB_BASE_URL}/person/${actor.id}?api_key=${TMDB_API_KEY}`
        );
        
        if (!actorResponse.ok) return null;
        
        const actorDetails = await actorResponse.json();
        
        if (actorDetails.birthday) {
          const age = calculateAge(actorDetails.birthday, movie.release_date);
          
          if (age === targetAge) {
            // Filter out voice acting roles
            if (actor.character && actor.character.toLowerCase().includes('(voice)')) {
              return null;
            }
            
            const prominenceScore = index >= 2 ? 1 : 0;
            const combinedScore = movie.popularity * 0.7 + (3 - prominenceScore) * 0.3;
            
            return {
              movie_tmdb_id: movie.id,
              title: movie.title,
              release_year: new Date(movie.release_date).getFullYear(),
              popularity_score: movie.popularity,
              actor_tmdb_id: actor.id,
              actor_name: actor.name,
              actor_gender: actor.gender,
              actor_popularity: actor.popularity,
              character_name: actor.character,
              age_at_filming: age,
              prominence_score: prominenceScore,
              billing_order: index,
              combined_score: combinedScore,
              birthday: actorDetails.birthday
            };
          }
        }
      } catch (error) {
        console.error(`Error fetching actor details for ${actor.name}:`, error.message);
      }
      
      return null;
    });
    
    // Wait for all actor requests to complete
    const actorResults = await Promise.all(actorPromises);
    
    // Filter out null results and add to results array
    results.push(...actorResults.filter(result => result !== null));
    
  } catch (error) {
    console.error(`Error processing movie ${movie.title}:`, error.message);
  }
  
  return results;
}


function formatResults(rows) {
  return rows.map(row => ({
    movie: {
      tmdb_id: row.movie_tmdb_id,
      title: row.title,
      release_year: row.release_year,
      popularity_score: row.popularity_score
    },
    actor: {
      tmdb_id: row.actor_tmdb_id,
      name: row.actor_name,
      gender: row.actor_gender
    },
    role: {
      character_name: row.character_name,
      age_at_filming: row.age_at_filming,
      prominence_score: row.prominence_score,
      billing_order: row.billing_order
    },
    combined_score: row.combined_score
  }));
}

module.exports = { searchActorsByAge };