#!/usr/bin/env python3
"""
PicBest Indexer - Scans photos, computes embeddings, detects faces, and clusters similar images.
Now with face detection and person-aware clustering.
"""

import os
import sqlite3
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Optional
import json

import numpy as np
from PIL import Image
from PIL.ExifTags import TAGS
import imagehash
from tqdm import tqdm
from sklearn.cluster import DBSCAN, AgglomerativeClustering
from sentence_transformers import SentenceTransformer

# Face recognition (optional - graceful fallback if not installed)
try:
    import face_recognition
    FACE_RECOGNITION_AVAILABLE = True
except ImportError:
    FACE_RECOGNITION_AVAILABLE = False
    print("⚠ face_recognition not installed. Face features disabled.")

# Configuration - these can be overridden via CLI
SCRIPT_DIR = Path(__file__).parent
DEFAULT_PHOTOS_DIR = SCRIPT_DIR / "photos"  # Default: ./photos subfolder
BASE_DIR = DEFAULT_PHOTOS_DIR  # Will be set by CLI or default
DB_PATH = SCRIPT_DIR / "photos.db"
SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.heic'}

# Clustering parameters
CLIP_MODEL = "clip-ViT-B-32"  # Good balance of speed and quality
DBSCAN_EPS = 0.08  # Distance threshold for clustering (lower = tighter clusters)
DBSCAN_MIN_SAMPLES = 1  # Minimum photos to form a cluster
DHASH_THRESHOLD = 10  # Hamming distance threshold for near-duplicates

# Face clustering parameters
FACE_DISTANCE_THRESHOLD = 0.5  # Lower = stricter face matching (0.6 is default)
MIN_FACE_SIZE = 20  # Minimum face size in pixels to consider


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
            is_cluster_representative BOOLEAN DEFAULT 0,
            rating INTEGER DEFAULT 0,
            is_starred BOOLEAN DEFAULT 0,
            notes TEXT,
            face_count INTEGER DEFAULT 0,
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

        -- Persons table (unique individuals detected across all photos)
        CREATE TABLE IF NOT EXISTS persons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            photo_count INTEGER DEFAULT 0,
            thumbnail_face_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Faces table (each detected face in photos)
        CREATE TABLE IF NOT EXISTS faces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            photo_id INTEGER NOT NULL,
            person_id INTEGER,
            bbox_top INTEGER,
            bbox_right INTEGER,
            bbox_bottom INTEGER,
            bbox_left INTEGER,
            embedding BLOB,
            FOREIGN KEY (photo_id) REFERENCES photos(id),
            FOREIGN KEY (person_id) REFERENCES persons(id)
        );

        -- Photo-Person junction for quick lookups
        CREATE TABLE IF NOT EXISTS photo_persons (
            photo_id INTEGER NOT NULL,
            person_id INTEGER NOT NULL,
            face_count INTEGER DEFAULT 1,
            PRIMARY KEY (photo_id, person_id),
            FOREIGN KEY (photo_id) REFERENCES photos(id),
            FOREIGN KEY (person_id) REFERENCES persons(id)
        );

        -- Indexes for fast queries
        CREATE INDEX IF NOT EXISTS idx_photos_cluster ON photos(cluster_id);
        CREATE INDEX IF NOT EXISTS idx_photos_rating ON photos(rating);
        CREATE INDEX IF NOT EXISTS idx_photos_starred ON photos(is_starred);
        CREATE INDEX IF NOT EXISTS idx_photos_folder ON photos(folder);
        CREATE INDEX IF NOT EXISTS idx_faces_photo ON faces(photo_id);
        CREATE INDEX IF NOT EXISTS idx_faces_person ON faces(person_id);
        CREATE INDEX IF NOT EXISTS idx_photo_persons_person ON photo_persons(person_id);
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
        # Read in chunks for large files
        for chunk in iter(lambda: f.read(65536), b''):
            hasher.update(chunk)
    return hasher.hexdigest()


def compute_dhash(img: Image.Image, hash_size: int = 16) -> str:
    """Compute difference hash for similarity detection."""
    try:
        return str(imagehash.dhash(img, hash_size=hash_size))
    except Exception:
        return ""


def scan_photos() -> list[Path]:
    """Scan all photo directories and return list of photo paths."""
    photos = []

    for root, dirs, files in os.walk(BASE_DIR):
        # Skip the script directory itself (PicBest/curator folder)
        root_path = Path(root)
        if root_path == SCRIPT_DIR or SCRIPT_DIR in root_path.parents:
            continue

        for file in files:
            ext = Path(file).suffix.lower()
            if ext in SUPPORTED_EXTENSIONS:
                photos.append(Path(root) / file)

    return sorted(photos)


def index_photos(photos: list[Path]):
    """Index all photos: extract metadata and compute hashes."""
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

    for photo_path in tqdm(new_photos, desc="Indexing"):
        try:
            # Basic file info
            stat = photo_path.stat()
            file_size = stat.st_size

            # Open image and extract metadata
            with Image.open(photo_path) as img:
                width, height = img.size
                taken_at = get_exif_datetime(img)
                dhash = compute_dhash(img)

            # Compute file hash
            file_hash = compute_file_hash(photo_path)

            # Get folder name (relative to base)
            try:
                folder = str(photo_path.parent.relative_to(BASE_DIR))
            except ValueError:
                folder = str(photo_path.parent)

            cursor.execute("""
                INSERT OR IGNORE INTO photos
                (filepath, filename, folder, file_hash, dhash, taken_at, width, height, file_size)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                str(photo_path),
                photo_path.name,
                folder,
                file_hash,
                dhash,
                taken_at,
                width,
                height,
                file_size
            ))

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

    # Get photos without embeddings
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

    batch_size = 32
    for i in tqdm(range(0, len(photos_to_embed), batch_size), desc="Embedding"):
        batch = photos_to_embed[i:i+batch_size]
        images = []
        valid_ids = []

        for photo in batch:
            try:
                img = Image.open(photo['filepath']).convert('RGB')
                # Resize for faster processing
                img.thumbnail((336, 336), Image.Resampling.LANCZOS)
                images.append(img)
                valid_ids.append(photo['id'])
            except Exception as e:
                print(f"\n⚠ Error loading {photo['filepath']}: {e}")
                continue

        if images:
            # Compute embeddings in batch
            embeddings = model.encode(images, convert_to_numpy=True, show_progress_bar=False)

            for photo_id, embedding in zip(valid_ids, embeddings):
                cursor.execute("""
                    INSERT OR REPLACE INTO embeddings (photo_id, clip_embedding)
                    VALUES (?, ?)
                """, (photo_id, embedding.tobytes()))

        conn.commit()

    conn.close()
    print("✓ Embeddings computed")


def find_near_duplicates():
    """Find near-duplicate photos using dHash."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id, dhash FROM photos WHERE dhash IS NOT NULL AND dhash != ''")
    photos = cursor.fetchall()

    print(f"Finding near-duplicates among {len(photos)} photos...")

    # Build hash lookup
    hash_to_ids = {}
    for photo in photos:
        h = photo['dhash']
        if h not in hash_to_ids:
            hash_to_ids[h] = []
        hash_to_ids[h].append(photo['id'])

    # Find exact hash matches
    duplicate_groups = [ids for ids in hash_to_ids.values() if len(ids) > 1]

    exact_dupes = sum(len(g) - 1 for g in duplicate_groups)
    print(f"✓ Found {exact_dupes} exact duplicates in {len(duplicate_groups)} groups")

    conn.close()
    return duplicate_groups


def _process_single_photo(args):
    """Worker function to process a single photo for face detection."""
    photo_id, filepath, scale_factor = args

    try:
        # Load and resize image for faster processing
        image = face_recognition.load_image_file(filepath)

        # Resize for faster face detection
        if scale_factor < 1.0:
            h, w = image.shape[:2]
            small_h, small_w = int(h * scale_factor), int(w * scale_factor)
            small_image = np.array(Image.fromarray(image).resize((small_w, small_h)))
        else:
            small_image = image

        # Detect face locations on small image (much faster)
        face_locations_small = face_recognition.face_locations(small_image, model='hog')

        if not face_locations_small:
            return (photo_id, 0, [])  # No faces

        # Scale face locations back to original size
        face_locations = [
            (int(top / scale_factor), int(right / scale_factor),
             int(bottom / scale_factor), int(left / scale_factor))
            for (top, right, bottom, left) in face_locations_small
        ]

        # Get face encodings from ORIGINAL image (for better quality)
        face_encodings = face_recognition.face_encodings(image, face_locations, num_jitters=1)

        # Build faces list
        faces = []
        for (top, right, bottom, left), encoding in zip(face_locations, face_encodings):
            face_height = bottom - top
            face_width = right - left
            if face_height >= MIN_FACE_SIZE and face_width >= MIN_FACE_SIZE:
                faces.append((top, right, bottom, left, encoding.tobytes()))

        return (photo_id, len(faces), faces)

    except Exception as e:
        return (photo_id, -1, str(e))  # Error


def detect_faces():
    """Detect faces in all photos using multiprocessing."""
    if not FACE_RECOGNITION_AVAILABLE:
        print("⚠ Skipping face detection (face_recognition not installed)")
        return

    import multiprocessing as mp

    conn = get_db_connection()
    cursor = conn.cursor()

    # Get photos without face detection
    cursor.execute("""
        SELECT p.id, p.filepath
        FROM photos p
        WHERE p.id NOT IN (SELECT DISTINCT photo_id FROM faces)
    """)
    photos_to_scan = [(row['id'], row['filepath']) for row in cursor.fetchall()]

    if not photos_to_scan:
        print("✓ All faces already detected")
        conn.close()
        return

    # Use number of CPU cores (leave 1 for system)
    num_workers = max(1, mp.cpu_count() - 1)
    scale_factor = 0.25  # 1/4 scale for speed

    print(f"Detecting faces in {len(photos_to_scan)} photos...")
    print(f"Using {num_workers} parallel workers + 1/4 scale (~{num_workers * 4}x faster)")

    # Prepare args for workers
    work_items = [(photo_id, filepath, scale_factor) for photo_id, filepath in photos_to_scan]

    # Process in parallel with progress bar
    results = []
    with mp.Pool(num_workers) as pool:
        for result in tqdm(pool.imap(_process_single_photo, work_items),
                          total=len(work_items), desc="Face detection"):
            results.append(result)

            # Batch insert every 100 results
            if len(results) >= 100:
                _save_face_results(cursor, results)
                conn.commit()
                results = []

    # Save remaining results
    if results:
        _save_face_results(cursor, results)
        conn.commit()

    conn.close()
    print("✓ Face detection complete")


def _save_face_results(cursor, results):
    """Save batch of face detection results to database."""
    for photo_id, face_count, faces_or_error in results:
        if face_count == -1:
            # Error occurred
            print(f"\n⚠ Error processing photo {photo_id}: {faces_or_error}")
            continue

        # Update photo face count
        cursor.execute("UPDATE photos SET face_count = ? WHERE id = ?", (face_count, photo_id))

        # Insert faces
        if face_count > 0:
            for (top, right, bottom, left, encoding_bytes) in faces_or_error:
                cursor.execute("""
                    INSERT INTO faces (photo_id, bbox_top, bbox_right, bbox_bottom, bbox_left, embedding)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (photo_id, top, right, bottom, left, encoding_bytes))


def cluster_persons():
    """Cluster detected faces into unique persons."""
    if not FACE_RECOGNITION_AVAILABLE:
        print("⚠ Skipping person clustering (face_recognition not installed)")
        return

    conn = get_db_connection()
    cursor = conn.cursor()

    # Get all faces without person assignment
    cursor.execute("""
        SELECT id, photo_id, embedding FROM faces WHERE embedding IS NOT NULL
    """)
    faces = cursor.fetchall()

    if not faces:
        print("⚠ No faces found to cluster")
        conn.close()
        return

    print(f"Clustering {len(faces)} faces into persons...")

    # Convert embeddings to numpy array
    face_ids = [f['id'] for f in faces]
    embeddings = np.array([
        np.frombuffer(f['embedding'], dtype=np.float64)
        for f in faces
    ])

    # Use Agglomerative Clustering for face grouping
    # This works better than DBSCAN for face clustering
    clustering = AgglomerativeClustering(
        n_clusters=None,
        distance_threshold=FACE_DISTANCE_THRESHOLD,
        metric='euclidean',
        linkage='average'
    ).fit(embeddings)

    labels = clustering.labels_
    n_persons = len(set(labels))

    print(f"✓ Found {n_persons} unique persons")

    # Clear existing person assignments
    cursor.execute("DELETE FROM persons")
    cursor.execute("DELETE FROM photo_persons")
    cursor.execute("UPDATE faces SET person_id = NULL")

    # Create person records and assign faces
    person_map = {}  # label -> person_id

    for face_id, label in zip(face_ids, labels):
        if label not in person_map:
            cursor.execute("INSERT INTO persons (name) VALUES (?)", (f"Person {label + 1}",))
            person_map[label] = cursor.lastrowid

        person_id = person_map[label]
        cursor.execute("UPDATE faces SET person_id = ? WHERE id = ?", (person_id, face_id))

    # Build photo_persons junction table and update person stats
    for label, person_id in person_map.items():
        # Get all photos containing this person
        cursor.execute("""
            SELECT photo_id, COUNT(*) as cnt
            FROM faces
            WHERE person_id = ?
            GROUP BY photo_id
        """, (person_id,))

        photo_counts = cursor.fetchall()

        for row in photo_counts:
            cursor.execute("""
                INSERT OR REPLACE INTO photo_persons (photo_id, person_id, face_count)
                VALUES (?, ?, ?)
            """, (row['photo_id'], person_id, row['cnt']))

        # Update person photo count
        cursor.execute("""
            UPDATE persons SET photo_count = ? WHERE id = ?
        """, (len(photo_counts), person_id))

        # Set thumbnail to the largest face of this person
        cursor.execute("""
            SELECT f.id, (f.bbox_bottom - f.bbox_top) * (f.bbox_right - f.bbox_left) as area
            FROM faces f
            WHERE f.person_id = ?
            ORDER BY area DESC
            LIMIT 1
        """, (person_id,))
        thumb = cursor.fetchone()
        if thumb:
            cursor.execute("UPDATE persons SET thumbnail_face_id = ? WHERE id = ?",
                          (thumb['id'], person_id))

    conn.commit()

    # Print person stats
    cursor.execute("""
        SELECT name, photo_count FROM persons ORDER BY photo_count DESC LIMIT 10
    """)
    top_persons = cursor.fetchall()

    print("\nTop persons by photo count:")
    for p in top_persons:
        print(f"  {p['name']}: {p['photo_count']} photos")

    conn.close()


def get_photo_persons(cursor, photo_id):
    """Get set of person IDs in a photo."""
    cursor.execute("SELECT person_id FROM photo_persons WHERE photo_id = ?", (photo_id,))
    return set(row['person_id'] for row in cursor.fetchall())


def compute_face_similarity(persons1: set, persons2: set) -> float:
    """Compute Jaccard similarity between two sets of persons."""
    if not persons1 and not persons2:
        return 1.0  # Both have no faces - consider similar
    if not persons1 or not persons2:
        return 0.5  # One has faces, one doesn't - neutral
    intersection = len(persons1 & persons2)
    union = len(persons1 | persons2)
    return intersection / union if union > 0 else 0.0


def refine_clusters_by_faces(photo_ids: list, labels: np.ndarray, photo_persons: dict) -> np.ndarray:
    """
    Refine clusters by splitting those with inconsistent face sets.
    Photos in the same cluster should have the same people.
    """
    new_labels = labels.copy()
    next_label = max(labels) + 1

    # Group photos by cluster
    cluster_photos_map = {}
    for photo_id, label in zip(photo_ids, labels):
        if label == -1:
            continue
        if label not in cluster_photos_map:
            cluster_photos_map[label] = []
        cluster_photos_map[label].append(photo_id)

    # For each cluster, check face consistency
    for cluster_label, cluster_photo_ids in cluster_photos_map.items():
        if len(cluster_photo_ids) <= 1:
            continue

        # Get person sets for all photos in cluster
        person_sets = [photo_persons.get(pid, set()) for pid in cluster_photo_ids]

        # Skip if no faces in cluster
        if all(len(ps) == 0 for ps in person_sets):
            continue

        # Find the dominant person set (most common combination)
        # Group photos by their person set
        set_groups = {}
        for pid, pset in zip(cluster_photo_ids, person_sets):
            key = frozenset(pset) if pset else frozenset()
            if key not in set_groups:
                set_groups[key] = []
            set_groups[key].append(pid)

        # If all photos have same people (or no faces), keep cluster intact
        if len(set_groups) == 1:
            continue

        # Find the largest group - this keeps the original cluster label
        largest_group = max(set_groups.values(), key=len)
        largest_set = None
        for key, group in set_groups.items():
            if group == largest_group:
                largest_set = key
                break

        # Assign new cluster labels to non-dominant groups
        for person_set, group_photos in set_groups.items():
            if person_set == largest_set:
                continue  # Keep original label

            # Check if this group can merge with the dominant group
            # (e.g., subset relationship - same people but one photo has fewer detected)
            if person_set and largest_set:
                # If one is subset of other, keep together
                if person_set.issubset(largest_set) or largest_set.issubset(person_set):
                    continue

            # Assign new cluster label to this group
            for pid in group_photos:
                idx = photo_ids.index(pid)
                new_labels[idx] = next_label
            next_label += 1

    return new_labels


def cluster_photos():
    """Cluster photos using CLIP embeddings and face similarity."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Load all embeddings
    cursor.execute("""
        SELECT p.id, e.clip_embedding, p.taken_at
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

    # Convert to numpy array
    photo_ids = [row['id'] for row in rows]
    embeddings = np.array([
        np.frombuffer(row['clip_embedding'], dtype=np.float32)
        for row in rows
    ])

    # Normalize embeddings for cosine similarity
    embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

    # Check if we have face data
    cursor.execute("SELECT COUNT(*) as cnt FROM faces")
    has_faces = cursor.fetchone()['cnt'] > 0

    if has_faces:
        print("Using face-aware clustering...")
        # Pre-load person sets for all photos
        photo_persons = {}
        for photo_id in photo_ids:
            photo_persons[photo_id] = get_photo_persons(cursor, photo_id)

    # Run DBSCAN clustering
    print("Running DBSCAN clustering...")
    clustering = DBSCAN(
        eps=DBSCAN_EPS,
        min_samples=DBSCAN_MIN_SAMPLES,
        metric='cosine',
        n_jobs=-1
    ).fit(embeddings)

    labels = clustering.labels_
    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = list(labels).count(-1)

    print(f"✓ Found {n_clusters} initial clusters ({n_noise} unclustered photos)")

    # If we have face data, refine clusters by face consistency
    if has_faces:
        print("Refining clusters by face consistency...")
        refined_labels = refine_clusters_by_faces(photo_ids, labels, photo_persons)
        labels = refined_labels
        n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
        print(f"✓ Refined to {n_clusters} clusters")

    # Clear existing cluster assignments
    cursor.execute("DELETE FROM clusters")
    cursor.execute("UPDATE photos SET cluster_id = NULL, is_cluster_representative = 0")

    # Assign cluster IDs
    cluster_map = {}  # old_label -> new_cluster_id

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

    # Update cluster stats and pick representatives
    for old_label, cluster_id in cluster_map.items():
        # Count photos in cluster
        cursor.execute("""
            SELECT COUNT(*) as cnt FROM photos WHERE cluster_id = ?
        """, (cluster_id,))
        count = cursor.fetchone()['cnt']

        # Pick representative (first photo by timestamp, or highest resolution)
        cursor.execute("""
            SELECT id FROM photos
            WHERE cluster_id = ?
            ORDER BY taken_at ASC, (width * height) DESC
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

    cursor.execute("SELECT COUNT(*) as cnt FROM clusters")
    total_clusters = cursor.fetchone()['cnt']
    print(f"\n✓ Total: {total_clusters} clusters from {len(photo_ids)} photos")

    conn.close()


def print_stats():
    """Print database statistics."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) as cnt FROM photos")
    total_photos = cursor.fetchone()['cnt']

    cursor.execute("SELECT COUNT(*) as cnt FROM clusters")
    total_clusters = cursor.fetchone()['cnt']

    cursor.execute("SELECT COUNT(*) as cnt FROM photos WHERE rating > 0")
    rated = cursor.fetchone()['cnt']

    cursor.execute("SELECT COUNT(*) as cnt FROM photos WHERE is_starred = 1")
    starred = cursor.fetchone()['cnt']

    cursor.execute("SELECT folder, COUNT(*) as cnt FROM photos GROUP BY folder ORDER BY folder")
    folders = cursor.fetchall()

    # Face stats
    cursor.execute("SELECT COUNT(*) as cnt FROM faces")
    total_faces = cursor.fetchone()['cnt']

    cursor.execute("SELECT COUNT(*) as cnt FROM persons")
    total_persons = cursor.fetchone()['cnt']

    cursor.execute("SELECT COUNT(*) as cnt FROM photos WHERE face_count > 0")
    photos_with_faces = cursor.fetchone()['cnt']

    print("\n" + "="*50)
    print("DATABASE STATISTICS")
    print("="*50)
    print(f"Total photos:    {total_photos}")
    print(f"Total clusters:  {total_clusters}")
    print(f"Rated:           {rated}")
    print(f"Starred:         {starred}")
    print(f"\nFace Recognition:")
    print(f"  Photos with faces: {photos_with_faces}")
    print(f"  Total faces:       {total_faces}")
    print(f"  Unique persons:    {total_persons}")
    print("\nPhotos by folder:")
    for f in folders:
        print(f"  {f['folder']}: {f['cnt']}")
    print("="*50)

    conn.close()


def main():
    """Main indexing pipeline."""
    import argparse
    global BASE_DIR

    parser = argparse.ArgumentParser(description='PicBest - Index and cluster photos')
    parser.add_argument('--base-dir', '-d', type=str, default=None,
                        help=f'Directory containing photos (default: {DEFAULT_PHOTOS_DIR})')
    parser.add_argument('--recluster', action='store_true',
                        help='Only re-run clustering (skip scanning and embedding)')
    parser.add_argument('--faces', action='store_true',
                        help='Only run face detection')
    parser.add_argument('--no-faces', action='store_true',
                        help='Skip face detection')

    args = parser.parse_args()

    # Set base directory
    if args.base_dir:
        BASE_DIR = Path(args.base_dir).resolve()
    else:
        BASE_DIR = DEFAULT_PHOTOS_DIR.resolve()

    recluster_only = args.recluster
    faces_only = args.faces
    skip_faces = args.no_faces

    print("="*50)
    print("PicBest - PHOTO INDEXER")
    print("="*50)
    print(f"Base directory: {BASE_DIR}")
    print(f"Database: {DB_PATH}")
    if recluster_only:
        print("Mode: Re-clustering only")
    if faces_only:
        print("Mode: Face detection only")
    if skip_faces:
        print("Mode: Skipping face detection")
    print()

    # Step 1: Initialize database
    init_database()

    if faces_only:
        # Only run face detection and clustering
        detect_faces()
        cluster_persons()
        print_stats()
        print("\n✓ Face detection complete!")
        return

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

        # Step 4: Find near-duplicates
        find_near_duplicates()

        # Step 5: Detect faces (unless skipped)
        if not skip_faces:
            detect_faces()
            cluster_persons()

    # Step 6: Cluster similar photos (with face awareness if available)
    cluster_photos()

    # Print final stats
    print_stats()

    print("\n✓ Indexing complete! Run 'python server.py' to start the rating UI.")


if __name__ == "__main__":
    main()

