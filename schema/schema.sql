-- PicBest Database Schema
-- SQLite database schema for photo indexing and clustering

-- Photos table
CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filepath TEXT UNIQUE NOT NULL,
    filename TEXT NOT NULL,
    folder TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    dhash TEXT,
    taken_at TIMESTAMP,
    width INTEGER,
    height INTEGER,
    file_size INTEGER,
    cluster_id INTEGER,
    duplicate_group_id INTEGER,
    is_cluster_representative BOOLEAN DEFAULT 0,
    is_starred BOOLEAN DEFAULT 0,
    is_rejected BOOLEAN DEFAULT 0,
    notes TEXT,
    sharpness REAL,
    exif_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Embeddings table (stored separately for efficiency)
CREATE TABLE IF NOT EXISTS embeddings (
    photo_id INTEGER PRIMARY KEY,
    clip_embedding BLOB,
    FOREIGN KEY (photo_id) REFERENCES photos(id)
);

-- Clusters table
CREATE TABLE IF NOT EXISTS clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_count INTEGER DEFAULT 0,
    representative_photo_id INTEGER,
    avg_timestamp TIMESTAMP,
    FOREIGN KEY (representative_photo_id) REFERENCES photos(id)
);

-- Indexing jobs table (for tracking indexing progress)
CREATE TABLE IF NOT EXISTS indexing_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    directory TEXT NOT NULL,
    status TEXT NOT NULL,
    phase TEXT,
    message TEXT,
    current INTEGER DEFAULT 0,
    total INTEGER DEFAULT 0,
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_photos_cluster ON photos(cluster_id);
CREATE INDEX IF NOT EXISTS idx_photos_duplicate_group ON photos(duplicate_group_id);
CREATE INDEX IF NOT EXISTS idx_photos_starred ON photos(is_starred);
CREATE INDEX IF NOT EXISTS idx_photos_rejected ON photos(is_rejected);
CREATE INDEX IF NOT EXISTS idx_photos_folder ON photos(folder);
CREATE INDEX IF NOT EXISTS idx_photos_dhash ON photos(dhash);

