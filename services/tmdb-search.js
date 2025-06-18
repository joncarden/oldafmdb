const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const path = require('path');
const fs = require('fs');
const config = require('./search-config');

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

async function searchActorsByAge(targetAge, gender = 'both', limit = config.resultLimit) {
  try {
    console.log(`Searching TMDB for actors aged ${targetAge}...`);
    const startTime = Date.now();

    // Calculate how many pages to fetch (TMDB returns 20 movies per page)
    const moviesPerPage = 20;
    const totalPages = Math.ceil(config.totalMovies / moviesPerPage);
    let allMovies = [];

    // Fetch all pages of most popular movies in the year range
    for (let page = 1; page <= totalPages; page++) {
      const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}` +
        `&sort_by=popularity.desc` +
        `&primary_release_date.gte=${config.yearStart}-01-01` +
        `&primary_release_date.lte=${config.yearEnd}-12-31` +
        `&with_original_language=${config.originalLanguage}` +
        `&without_genres=${config.excludeGenreId}` +
        `&vote_count.gte=${config.minVoteCount}` +
        `&page=${page}`;
      const response = await fetch(url);
      if (!response.ok) break;
      const data = await response.json();
      allMovies.push(...data.results);
      // Early exit if we have enough movies
      if (allMovies.length >= config.totalMovies) break;
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    // Only keep the top N
    allMovies = allMovies.slice(0, config.totalMovies);

    // Remove duplicates by TMDB id
    const uniqueMovies = allMovies.filter((movie, idx, arr) =>
      idx === arr.findIndex(m => m.id === movie.id)
    );

    // Filter by popularity if needed
    const filteredMovies = uniqueMovies.filter(m => (m.popularity || 0) >= config.minMoviePopularity);

    // Process movies in batches for better performance
    const batchSize = config.batchSize;
    let allResults = [];
    for (let i = 0; i < filteredMovies.length; i += batchSize) {
      if (allResults.length >= config.earlyTerminateCount) break;
      const batch = filteredMovies.slice(i, i + batchSize);
      const batchPromises = batch.map(movie => findActorsInMovie(movie, targetAge, gender));
      const batchResults = await Promise.all(batchPromises);
      allResults.push(...batchResults.flat());
      // Small delay between batches
      if (i + batchSize < filteredMovies.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
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
      const actorPopularityDiff = (b.actor_popularity || 0) - (a.actor_popularity || 0);
      if (Math.abs(actorPopularityDiff) > 0.1) return actorPopularityDiff;
      const moviePopularityDiff = (b.popularity_score || 0) - (a.popularity_score || 0);
      if (Math.abs(moviePopularityDiff) > 0.1) return moviePopularityDiff;
      return (a.billing_order || 0) - (b.billing_order || 0);
    });

    const searchTime = Date.now() - startTime;
    console.log(`Search completed in ${searchTime}ms, found ${uniqueResults.length} unique results`);

    return formatResults(uniqueResults.slice(0, Math.max(limit, config.resultLimit)));
  } catch (error) {
    throw error;
  }
}

async function findActorsInMovie(movie, targetAge, gender) {
  const results = [];
  
  try {
    // Get movie credits
    const creditsResponse = await fetch(`${TMDB_BASE_URL}/movie/${movie.id}/credits?api_key=${TMDB_API_KEY}`);
    
    if (!creditsResponse.ok) return results;
    
    const credits = await creditsResponse.json();
    const topCast = credits.cast.slice(0, config.actorsPerMovie); // Use config for number of actors
    
    // Batch actor detail requests for better performance
    const actorPromises = topCast.map(async (actor, index) => {
      if (actor.known_for_department !== 'Acting') return null;
      if (!actor.popularity || actor.popularity < config.minActorPopularity) return null; // Use config for actor popularity
      
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