#!/usr/bin/env python3
"""
PicBest Indexer - Scans photos, computes embeddings, and clusters similar images.
Uses two-stage clustering: near-duplicates first, then semantic similarity.
"""

import os
import sqlite3
import hashlib
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional
import time

import numpy as np
from PIL import Image
from PIL.ExifTags import TAGS
import imagehash
from tqdm import tqdm
from sentence_transformers import SentenceTransformer

# Try HDBSCAN first (better), fallback to DBSCAN
try:
    import hdbscan
    USE_HDBSCAN = True
except ImportError:
    from sklearn.cluster import DBSCAN
    USE_HDBSCAN = False
    print("⚠ hdbscan not installed, using DBSCAN (pip install hdbscan for better results)")

# Configuration - these can be overridden via CLI
SCRIPT_DIR = Path(__file__).parent
DEFAULT_PHOTOS_DIR = SCRIPT_DIR / "photos"
BASE_DIR = DEFAULT_PHOTOS_DIR
DB_PATH = SCRIPT_DIR / "photos.db"
SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.heic'}


def get_db():
    """Get database connection."""
    return sqlite3.connect(DB_PATH, check_same_thread=False)


JOB_ID = None
START_TIME = None

# Clustering parameters
CLIP_MODEL = "clip-ViT-B-32"

# HDBSCAN params (auto-adapts, no manual eps)
HDBSCAN_MIN_CLUSTER_SIZE = 2  # Min photos to form a cluster
HDBSCAN_MIN_SAMPLES = 1       # More permissive

# DBSCAN fallback params
DBSCAN_EPS = 0.15             # Cosine distance threshold
DBSCAN_MIN_SAMPLES = 1

# Near-duplicate detection
DHASH_THRESHOLD = 12  # Hamming distance for near-duplicates (0-256, lower=stricter)

# Temporal clustering
TIME_WEIGHT = 0.3     # How much time proximity matters (0-1)
TIME_WINDOW_MINS = 5  # Photos within X minutes get time bonus


def update_progress(phase: str, current: int, total: int, message: str):
    """Write progress update to database for live monitoring."""
    if not JOB_ID:
        return

    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE indexing_jobs
            SET phase = ?, current = ?, total = ?, message = ?
            WHERE id = ?
        """, (phase, current, total, message, JOB_ID))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Warning: Failed to update progress: {e}")


def get_db_connection():
    """Get SQLite connection with proper settings."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    """Initialize the SQLite database schema."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.executescript("""
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
            rating INTEGER DEFAULT 0,
            is_starred BOOLEAN DEFAULT 0,
            notes TEXT,
            sharpness REAL,
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

        -- Indexes for fast queries
        CREATE INDEX IF NOT EXISTS idx_photos_cluster ON photos(cluster_id);
        CREATE INDEX IF NOT EXISTS idx_photos_duplicate_group ON photos(duplicate_group_id);
        CREATE INDEX IF NOT EXISTS idx_photos_rating ON photos(rating);
        CREATE INDEX IF NOT EXISTS idx_photos_starred ON photos(is_starred);
        CREATE INDEX IF NOT EXISTS idx_photos_folder ON photos(folder);
        CREATE INDEX IF NOT EXISTS idx_photos_dhash ON photos(dhash);
    """)

    conn.commit()
    conn.close()
    print("✓ Database initialized")


def get_exif_datetime(img: Image.Image) -> Optional[datetime]:
    """Extract datetime from EXIF data."""
    try:
        exif = img._getexif()
        if exif:
            for tag_id, value in exif.items():
                tag = TAGS.get(tag_id, tag_id)
                if tag == 'DateTimeOriginal':
                    return datetime.strptime(value, '%Y:%m:%d %H:%M:%S')
    except Exception:
        pass
    return None


def compute_file_hash(filepath: Path) -> str:
    """Compute MD5 hash of file for deduplication."""
    hasher = hashlib.md5()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            hasher.update(chunk)
    return hasher.hexdigest()


def compute_dhash(img: Image.Image, hash_size: int = 16) -> str:
    """Compute difference hash for similarity detection."""
    try:
        return str(imagehash.dhash(img, hash_size=hash_size))
    except Exception:
        return ""


def compute_sharpness(img: Image.Image) -> float:
    """Compute image sharpness using Laplacian variance."""
    try:
        # Convert to grayscale and resize for speed
        gray = img.convert('L')
        gray.thumbnail((500, 500), Image.Resampling.LANCZOS)

        # Compute Laplacian variance (higher = sharper)
        arr = np.array(gray, dtype=np.float64)
        # Simple Laplacian kernel convolution
        laplacian = (
            arr[:-2, 1:-1] + arr[2:, 1:-1] +
            arr[1:-1, :-2] + arr[1:-1, 2:] -
            4 * arr[1:-1, 1:-1]
        )
        return float(np.var(laplacian))
    except Exception:
        return 0.0


def scan_photos() -> list[Path]:
    """Scan all photo directories and return list of photo paths."""
    photos = []

    for root, dirs, files in os.walk(BASE_DIR):
        root_path = Path(root)
        if root_path == SCRIPT_DIR or SCRIPT_DIR in root_path.parents:
            continue

        for file in files:
            ext = Path(file).suffix.lower()
            if ext in SUPPORTED_EXTENSIONS:
                photos.append(Path(root) / file)

    return sorted(photos)


def index_photos(photos: list[Path]):
    """Index all photos: extract metadata, hashes, and sharpness."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Get already indexed photos
    cursor.execute("SELECT filepath FROM photos")
    indexed = {row['filepath'] for row in cursor.fetchall()}

    new_photos = [p for p in photos if str(p) not in indexed]

    if not new_photos:
        print("✓ All photos already indexed")
        return

    print(f"Indexing {len(new_photos)} new photos...")
    total = len(new_photos)
    commit_every = 10

    for idx, photo_path in enumerate(tqdm(new_photos, desc="Indexing"), 1):
        try:
            update_progress('scanning', idx, total, f'Scanning photo {idx} of {total}')

            stat = photo_path.stat()
            file_size = stat.st_size

            with Image.open(photo_path) as img:
                width, height = img.size
                taken_at = get_exif_datetime(img)
                dhash = compute_dhash(img)
                sharpness = compute_sharpness(img)

            file_hash = compute_file_hash(photo_path)

            try:
                folder = str(photo_path.parent.relative_to(BASE_DIR))
            except ValueError:
                folder = str(photo_path.parent)

            cursor.execute("""
                INSERT OR IGNORE INTO photos
                (filepath, filename, folder, file_hash, dhash, taken_at, width, height, file_size, sharpness)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                str(photo_path),
                photo_path.name,
                folder,
                file_hash,
                dhash,
                taken_at,
                width,
                height,
                file_size,
                sharpness
            ))

            if idx % commit_every == 0:
                conn.commit()

        except Exception as e:
            print(f"\n⚠ Error indexing {photo_path}: {e}")
            continue

    conn.commit()
    conn.close()
    print(f"✓ Indexed {len(new_photos)} photos")


def compute_embeddings():
    """Compute CLIP embeddings for all photos."""
    print(f"Loading CLIP model ({CLIP_MODEL})...")
    model = SentenceTransformer(CLIP_MODEL)

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT p.id, p.filepath
        FROM photos p
        LEFT JOIN embeddings e ON p.id = e.photo_id
        WHERE e.photo_id IS NULL
    """)
    photos_to_embed = cursor.fetchall()

    if not photos_to_embed:
        print("✓ All embeddings already computed")
        conn.close()
        return

    print(f"Computing embeddings for {len(photos_to_embed)} photos...")
    total = len(photos_to_embed)

    batch_size = 32
    for i in tqdm(range(0, total, batch_size), desc="Embedding"):
        batch = photos_to_embed[i:i+batch_size]

        update_progress('embedding', min(i + batch_size, total), total,
                       f'Computing embeddings {min(i + batch_size, total)} of {total}')

        images = []
        valid_ids = []

        for photo in batch:
            try:
                img = Image.open(photo['filepath']).convert('RGB')
                img.thumbnail((336, 336), Image.Resampling.LANCZOS)
                images.append(img)
                valid_ids.append(photo['id'])
            except Exception as e:
                print(f"\n⚠ Error loading {photo['filepath']}: {e}")
                continue

        if images:
            embeddings = model.encode(images, convert_to_numpy=True, show_progress_bar=False)

            for photo_id, embedding in zip(valid_ids, embeddings):
                cursor.execute("""
                    INSERT OR REPLACE INTO embeddings (photo_id, clip_embedding)
                    VALUES (?, ?)
                """, (photo_id, embedding.tobytes()))

        conn.commit()

    conn.close()
    print("✓ Embeddings computed")


def hamming_distance(hash1: str, hash2: str) -> int:
    """Compute Hamming distance between two hex hash strings."""
    if not hash1 or not hash2 or len(hash1) != len(hash2):
        return 256  # Max distance

    # Convert hex to binary and count differences
    try:
        int1 = int(hash1, 16)
        int2 = int(hash2, 16)
        return bin(int1 ^ int2).count('1')
    except ValueError:
        return 256


def find_duplicate_groups() -> dict[int, int]:
    """
    Stage 1: Find near-duplicate photos using dHash.
    Returns mapping of photo_id -> duplicate_group_id.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, dhash FROM photos
        WHERE dhash IS NOT NULL AND dhash != ''
        ORDER BY id
    """)
    photos = cursor.fetchall()

    print(f"Finding near-duplicates among {len(photos)} photos...")

    # Union-Find for grouping duplicates
    parent = {p['id']: p['id'] for p in photos}

    def find(x):
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    def union(x, y):
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    # Compare all pairs (O(n²) but fast for dHash comparison)
    photo_list = list(photos)
    comparisons = 0
    duplicates_found = 0

    for i in range(len(photo_list)):
        for j in range(i + 1, len(photo_list)):
            dist = hamming_distance(photo_list[i]['dhash'], photo_list[j]['dhash'])
            comparisons += 1
            if dist <= DHASH_THRESHOLD:
                union(photo_list[i]['id'], photo_list[j]['id'])
                duplicates_found += 1

    # Build group mapping
    groups = {}
    for photo in photos:
        root = find(photo['id'])
        if root not in groups:
            groups[root] = len(groups) + 1

    photo_to_group = {photo['id']: groups[find(photo['id'])] for photo in photos}

    # Update database
    for photo_id, group_id in photo_to_group.items():
        cursor.execute(
            "UPDATE photos SET duplicate_group_id = ? WHERE id = ?",
            (group_id, photo_id)
        )
    conn.commit()

    # Count actual duplicate groups (more than 1 photo)
    group_sizes = {}
    for gid in photo_to_group.values():
        group_sizes[gid] = group_sizes.get(gid, 0) + 1

    multi_photo_groups = sum(1 for size in group_sizes.values() if size > 1)
    total_dupes = sum(size - 1 for size in group_sizes.values() if size > 1)

    print(f"✓ Found {total_dupes} near-duplicates in {multi_photo_groups} groups")

    conn.close()
    return photo_to_group


def compute_time_distance_matrix(timestamps: list[Optional[datetime]]) -> np.ndarray:
    """
    Compute normalized time distance matrix.
    Photos within TIME_WINDOW_MINS get distance 0, beyond that scales to 1.
    """
    n = len(timestamps)
    time_dist = np.ones((n, n))

    window = timedelta(minutes=TIME_WINDOW_MINS)
    max_window = timedelta(hours=24)  # Beyond 24h, max time distance

    for i in range(n):
        for j in range(i + 1, n):
            t1, t2 = timestamps[i], timestamps[j]
            if t1 is None or t2 is None:
                dist = 0.5  # Unknown time - neutral
            else:
                delta = abs((t1 - t2).total_seconds())
                if delta <= window.total_seconds():
                    dist = 0.0  # Same time window
                elif delta >= max_window.total_seconds():
                    dist = 1.0  # Very far apart
                else:
                    # Linear interpolation
                    dist = (delta - window.total_seconds()) / (max_window.total_seconds() - window.total_seconds())

            time_dist[i, j] = dist
            time_dist[j, i] = dist
        time_dist[i, i] = 0.0

    return time_dist


def cluster_photos():
    """
    Stage 2: Cluster photos using CLIP embeddings + temporal proximity.
    Uses HDBSCAN for automatic cluster detection.
    """
    update_progress('clustering', 0, 100, 'Starting clustering...')

    conn = get_db_connection()
    cursor = conn.cursor()

    # Load all embeddings with timestamps
    cursor.execute("""
        SELECT p.id, e.clip_embedding, p.taken_at, p.sharpness, p.width, p.height
        FROM photos p
        JOIN embeddings e ON p.id = e.photo_id
        ORDER BY p.taken_at, p.id
    """)
    rows = cursor.fetchall()

    if not rows:
        print("⚠ No embeddings found. Run embedding computation first.")
        conn.close()
        return

    print(f"Clustering {len(rows)} photos...")
    update_progress('clustering', 10, 100, f'Clustering {len(rows)} photos...')

    # Build data arrays
    photo_ids = [row['id'] for row in rows]
    embeddings = np.array([
        np.frombuffer(row['clip_embedding'], dtype=np.float32)
        for row in rows
    ])
    timestamps = []
    for row in rows:
        if row['taken_at']:
            try:
                ts = datetime.fromisoformat(row['taken_at']) if isinstance(row['taken_at'], str) else row['taken_at']
                timestamps.append(ts)
            except:
                timestamps.append(None)
        else:
            timestamps.append(None)

    sharpness_scores = [row['sharpness'] or 0 for row in rows]
    resolutions = [(row['width'] or 0) * (row['height'] or 0) for row in rows]

    # Normalize embeddings
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1  # Avoid division by zero
    embeddings = embeddings / norms

    # Compute visual distance matrix (cosine distance)
    print("Computing visual similarity matrix...")
    visual_dist = 1 - np.dot(embeddings, embeddings.T)
    visual_dist = np.clip(visual_dist, 0, 2)  # Clamp numerical errors

    # Compute time distance matrix
    print("Computing temporal proximity matrix...")
    time_dist = compute_time_distance_matrix(timestamps)

    # Combined distance: weighted average
    print(f"Combining distances (visual weight: {1-TIME_WEIGHT:.0%}, time weight: {TIME_WEIGHT:.0%})...")
    combined_dist = (1 - TIME_WEIGHT) * visual_dist + TIME_WEIGHT * time_dist

    # Run clustering
    if USE_HDBSCAN:
        print("Running HDBSCAN clustering...")
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=HDBSCAN_MIN_CLUSTER_SIZE,
            min_samples=HDBSCAN_MIN_SAMPLES,
            metric='precomputed',
            cluster_selection_method='eom',  # Excess of Mass - good for varying densities
            cluster_selection_epsilon=0.0,    # Let HDBSCAN decide
        )
        labels = clusterer.fit_predict(combined_dist)
    else:
        print("Running DBSCAN clustering...")
        clusterer = DBSCAN(
            eps=DBSCAN_EPS,
            min_samples=DBSCAN_MIN_SAMPLES,
            metric='precomputed',
            n_jobs=-1
        )
        labels = clusterer.fit_predict(combined_dist)

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = list(labels).count(-1)

    print(f"✓ Found {n_clusters} clusters ({n_noise} unclustered photos)")

    # Clear existing cluster assignments
    cursor.execute("DELETE FROM clusters")
    cursor.execute("UPDATE photos SET cluster_id = NULL, is_cluster_representative = 0")

    # Assign cluster IDs
    cluster_map = {}

    for photo_id, label in zip(photo_ids, labels):
        if label == -1:
            # Unclustered photo gets its own cluster
            cursor.execute("INSERT INTO clusters (photo_count) VALUES (1)")
            cluster_id = cursor.lastrowid
            cursor.execute("""
                UPDATE photos SET cluster_id = ?, is_cluster_representative = 1
                WHERE id = ?
            """, (cluster_id, photo_id))
            cursor.execute("""
                UPDATE clusters SET representative_photo_id = ? WHERE id = ?
            """, (photo_id, cluster_id))
        else:
            if label not in cluster_map:
                cursor.execute("INSERT INTO clusters (photo_count) VALUES (0)")
                cluster_map[label] = cursor.lastrowid

            cluster_id = cluster_map[label]
            cursor.execute("UPDATE photos SET cluster_id = ? WHERE id = ?", (cluster_id, photo_id))

    # Update cluster stats and pick best representative
    for old_label, cluster_id in cluster_map.items():
        cursor.execute("SELECT COUNT(*) as cnt FROM photos WHERE cluster_id = ?", (cluster_id,))
        count = cursor.fetchone()['cnt']

        # Pick representative: highest sharpness, then resolution, then earliest
        cursor.execute("""
            SELECT id FROM photos
            WHERE cluster_id = ?
            ORDER BY sharpness DESC, (width * height) DESC, taken_at ASC
            LIMIT 1
        """, (cluster_id,))
        rep = cursor.fetchone()

        if rep:
            cursor.execute("""
                UPDATE clusters
                SET photo_count = ?, representative_photo_id = ?
                WHERE id = ?
            """, (count, rep['id'], cluster_id))

            cursor.execute("""
                UPDATE photos SET is_cluster_representative = 1 WHERE id = ?
            """, (rep['id'],))

    conn.commit()

    # Print cluster size distribution
    cursor.execute("""
        SELECT photo_count, COUNT(*) as num_clusters
        FROM clusters
        GROUP BY photo_count
        ORDER BY photo_count
    """)
    dist = cursor.fetchall()

    print("\nCluster size distribution:")
    for row in dist[:10]:
        print(f"  {row['photo_count']} photos: {row['num_clusters']} clusters")
    if len(dist) > 10:
        print(f"  ... and {len(dist) - 10} more size categories")

    # Show multi-photo clusters
    cursor.execute("""
        SELECT COUNT(*) as cnt FROM clusters WHERE photo_count > 1
    """)
    multi = cursor.fetchone()['cnt']

    cursor.execute("SELECT COUNT(*) as cnt FROM clusters")
    total_clusters = cursor.fetchone()['cnt']
    print(f"\n✓ {multi} multi-photo clusters, {total_clusters - multi} singletons")
    print(f"✓ Total: {total_clusters} clusters from {len(photo_ids)} photos")

    conn.close()


def print_stats():
    """Print database statistics."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as cnt FROM photos")
    total_photos = cursor.fetchone()['cnt']

    cursor.execute("SELECT COUNT(*) as cnt FROM clusters")
    total_clusters = cursor.fetchone()['cnt']

    cursor.execute("SELECT COUNT(*) as cnt FROM clusters WHERE photo_count > 1")
    multi_clusters = cursor.fetchone()['cnt']

    cursor.execute("SELECT COUNT(*) as cnt FROM photos WHERE rating > 0")
    rated = cursor.fetchone()['cnt']

    cursor.execute("SELECT COUNT(*) as cnt FROM photos WHERE is_starred = 1")
    starred = cursor.fetchone()['cnt']

    # Duplicate stats
    cursor.execute("""
        SELECT COUNT(DISTINCT duplicate_group_id) as groups,
               COUNT(*) as photos
        FROM photos
        WHERE duplicate_group_id IN (
            SELECT duplicate_group_id FROM photos
            GROUP BY duplicate_group_id HAVING COUNT(*) > 1
        )
    """)
    dup_stats = cursor.fetchone()

    cursor.execute("SELECT folder, COUNT(*) as cnt FROM photos GROUP BY folder ORDER BY folder")
    folders = cursor.fetchall()

    print("\n" + "="*50)
    print("DATABASE STATISTICS")
    print("="*50)
    print(f"Total photos:      {total_photos}")
    print(f"Total clusters:    {total_clusters}")
    print(f"  Multi-photo:     {multi_clusters}")
    print(f"  Singletons:      {total_clusters - multi_clusters}")
    if dup_stats['groups']:
        print(f"Duplicate groups:  {dup_stats['groups']} ({dup_stats['photos']} photos)")
    print(f"Rated:             {rated}")
    print(f"Starred:           {starred}")
    print("\nPhotos by folder:")
    for f in folders:
        print(f"  {f['folder']}: {f['cnt']}")
    print("="*50)

    conn.close()


def main():
    """Main indexing pipeline."""
    import argparse
    global BASE_DIR, JOB_ID, START_TIME

    parser = argparse.ArgumentParser(description='PicBest - Index and cluster photos')
    parser.add_argument('--base-dir', '-d', type=str, default=None,
                        help=f'Directory containing photos (default: {DEFAULT_PHOTOS_DIR})')
    parser.add_argument('--job-id', type=int, default=None,
                        help='Database job ID for progress tracking')
    parser.add_argument('--recluster', action='store_true',
                        help='Only re-run clustering (skip scanning and embedding)')
    parser.add_argument('--eps', type=float, default=None,
                        help='DBSCAN epsilon (only if HDBSCAN not available)')
    parser.add_argument('--time-weight', type=float, default=None,
                        help='Time proximity weight (0-1, default 0.3)')

    args = parser.parse_args()

    # Set base directory
    if args.base_dir:
        BASE_DIR = Path(args.base_dir).resolve()
    else:
        BASE_DIR = DEFAULT_PHOTOS_DIR.resolve()

    # Override clustering params
    global DBSCAN_EPS, TIME_WEIGHT
    if args.eps:
        DBSCAN_EPS = args.eps
    if args.time_weight is not None:
        TIME_WEIGHT = args.time_weight

    # Set job ID for progress tracking
    if args.job_id:
        JOB_ID = args.job_id
        START_TIME = time.time()

    recluster_only = args.recluster

    print("="*50)
    print("PicBest - PHOTO INDEXER")
    print("="*50)
    print(f"Base directory: {BASE_DIR}")
    print(f"Database: {DB_PATH}")
    print(f"Clustering: {'HDBSCAN (auto-tuning)' if USE_HDBSCAN else f'DBSCAN (eps={DBSCAN_EPS})'}")
    print(f"Time weight: {TIME_WEIGHT:.0%}")
    if JOB_ID:
        print(f"Job ID: {JOB_ID}")
    if recluster_only:
        print("Mode: Re-clustering only")
    print()

    # Step 1: Initialize database
    init_database()

    if not recluster_only:
        # Step 2: Scan and index photos
        photos = scan_photos()
        print(f"Found {len(photos)} photos in {BASE_DIR}")

        if not photos:
            print("⚠ No photos found!")
            return

        index_photos(photos)

        # Step 3: Compute CLIP embeddings
        compute_embeddings()

        # Step 4: Find near-duplicates (Stage 1)
        find_duplicate_groups()

    # Step 5: Cluster similar photos (Stage 2)
    cluster_photos()

    # Print final stats
    print_stats()

    print("\n✓ Indexing complete! Run 'python server.py' to start the rating UI.")

    # Mark job as complete
    if JOB_ID:
        try:
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE indexing_jobs
                SET status = 'completed', phase = 'complete', message = 'Indexing complete!',
                    completed_at = ?
                WHERE id = ?
            """, (datetime.now().isoformat(), JOB_ID))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Warning: Failed to mark job complete: {e}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        if JOB_ID:
            try:
                conn = get_db()
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE indexing_jobs
                    SET status = 'error', error = ?, completed_at = ?
                    WHERE id = ?
                """, (str(e), datetime.now().isoformat(), JOB_ID))
                conn.commit()
                conn.close()
            except:
                pass
        raise
