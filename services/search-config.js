// Search configuration for TMDB queries
// Edit these values to tune search behavior without changing code logic

module.exports = {
  // Year range for movie search
  yearStart: 1950,
  yearEnd: 2010,

  // Number of most popular movies to fetch (TMDB returns 20 per page)
  totalMovies: 500,

  // Language filter
  originalLanguage: 'en',

  // Exclude animation (genre id 16)
  excludeGenreId: 16,

  // Minimum TMDB popularity score for a movie to be considered
  minMoviePopularity: 0,

  // Minimum TMDB vote count for a movie to be considered
  minVoteCount: 10,

  // Number of top-billed actors to check per movie
  actorsPerMovie: 4,

  // Minimum actor popularity to consider
  minActorPopularity: 1,

  // Batch size for parallel movie processing
  batchSize: 10,

  // Max results to return (will fetch up to 2x this for filtering)
  resultLimit: 20,

  // Extra: Early termination threshold (fetches up to this many before stopping)
  earlyTerminateCount: 50
}; 