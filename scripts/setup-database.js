const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Movies table with popularity scoring
  db.run(`CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY,
    tmdb_id INTEGER UNIQUE,
    title TEXT NOT NULL,
    release_year INTEGER NOT NULL,
    poster_path TEXT,
    popularity_score REAL DEFAULT 0,
    vote_average REAL DEFAULT 0,
    vote_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Indexes for movies table
  db.run(`CREATE INDEX IF NOT EXISTS idx_movies_release_year ON movies(release_year)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_movies_popularity ON movies(popularity_score DESC)`);

  // Actors table
  db.run(`CREATE TABLE IF NOT EXISTS actors (
    id INTEGER PRIMARY KEY,
    tmdb_id INTEGER UNIQUE,
    name TEXT NOT NULL,
    gender INTEGER, -- 1=female, 2=male
    profile_path TEXT,
    popularity REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Indexes for actors table
  db.run(`CREATE INDEX IF NOT EXISTS idx_actors_gender ON actors(gender)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_actors_popularity ON actors(popularity DESC)`);

  // Roles table connecting actors to movies with prominence
  db.run(`CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY,
    movie_id INTEGER,
    actor_id INTEGER,
    character_name TEXT,
    billing_order INTEGER, -- Lower number = more prominent
    age_at_filming INTEGER, -- Key field for age matching
    prominence_score INTEGER DEFAULT 0, -- 0=lead, 1=supporting, 2=minor
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(movie_id) REFERENCES movies(id),
    FOREIGN KEY(actor_id) REFERENCES actors(id)
  )`);

  // Indexes for roles table
  db.run(`CREATE INDEX IF NOT EXISTS idx_roles_age ON roles(age_at_filming)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_roles_prominence ON roles(prominence_score)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_roles_movie_prominence ON roles(movie_id, prominence_score)`);

  // Captions cache table
  db.run(`CREATE TABLE IF NOT EXISTS captions (
    id INTEGER PRIMARY KEY,
    movie_id INTEGER,
    actor_id INTEGER,
    caption TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(movie_id) REFERENCES movies(id),
    FOREIGN KEY(actor_id) REFERENCES actors(id),
    UNIQUE(movie_id, actor_id)
  )`);

  console.log('Database schema created successfully');
});

db.close();