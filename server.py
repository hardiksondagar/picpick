#!/usr/bin/env python3
"""
PicBest - Smart Photo Curator - Web Server
FastAPI backend for browsing and rating photos.
"""

import sqlite3
import hashlib
from pathlib import Path
from typing import Optional
import mimetypes
import json
import subprocess
import os
import signal
import time
from datetime import datetime

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, Response
from pydantic import BaseModel
from PIL import Image, ImageOps
import uvicorn

# Configuration
BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
THUMB_DIR = BASE_DIR / "thumbnails"

# Thumbnail sizes
THUMB_SIZES = {
    'grid': 400,    # For grid view
    'modal': 1200,  # For modal view
    'full': None    # Original size
}

# Current database (can be switched dynamically)
_current_db_path = BASE_DIR / "photos.db"

# Directory browsing restrictions (for security)
ALLOWED_BASE_PATHS = [
    Path.home(),  # User's home directory
    Path("/Volumes"),  # macOS external drives
    Path("/mnt"),  # Linux mount points
]

app = FastAPI(title="PicBest")


def get_db():
    """Get database connection."""
    conn = sqlite3.connect(_current_db_path)
    conn.row_factory = sqlite3.Row
    return conn


def get_available_databases():
    """List all available database files."""
    dbs = []

    # Look for .db files in base directory
    for db_file in BASE_DIR.glob("*.db"):
        db_info = {
            'name': db_file.stem,
            'filename': db_file.name,
            'path': str(db_file),
            'size': db_file.stat().st_size,
            'modified': db_file.stat().st_mtime,
            'active': db_file == _current_db_path
        }
        dbs.append(db_info)

    # Sort by modified time (newest first)
    dbs.sort(key=lambda x: x['modified'], reverse=True)
    return dbs


def is_path_allowed(path: Path) -> bool:
    """Check if a path is within allowed directories."""
    try:
        resolved = path.resolve()
        for allowed in ALLOWED_BASE_PATHS:
            if resolved.is_relative_to(allowed):
                return True
        return False
    except (ValueError, OSError):
        return False


def count_image_files(directory: Path, max_depth: int = 2) -> int:
    """Estimate number of image files in a directory (quick scan)."""
    count = 0
    extensions = {'.jpg', '.jpeg', '.png', '.webp', '.heic'}

    try:
        for item in directory.iterdir():
            if item.is_file() and item.suffix.lower() in extensions:
                count += 1
            elif item.is_dir() and max_depth > 0:
                count += count_image_files(item, max_depth - 1)

            # Stop early if we've found a lot (performance)
            if count > 1000:
                return count
    except (PermissionError, OSError):
        pass

    return count


def create_indexing_job(directory: str) -> int:
    """Create a new indexing job and return its ID."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO indexing_jobs (directory, status, phase, message)
        VALUES (?, 'running', 'starting', 'Initializing...')
    """, (directory,))
    job_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return job_id


def update_indexing_job(job_id: int, **kwargs):
    """Update indexing job fields."""
    conn = get_db()
    cursor = conn.cursor()

    # Build dynamic update
    fields = []
    values = []
    for key, value in kwargs.items():
        fields.append(f"{key} = ?")
        values.append(value)

    if fields:
        values.append(job_id)
        cursor.execute(f"""
            UPDATE indexing_jobs
            SET {', '.join(fields)}
            WHERE id = ?
        """, values)
        conn.commit()

    conn.close()


# ============== API Models ==============

class PhotoRating(BaseModel):
    rating: int  # 0-5

class PhotoStar(BaseModel):
    is_starred: bool

class PhotoReject(BaseModel):
    is_rejected: bool

class PhotoNotes(BaseModel):
    notes: str


# ============== API Endpoints ==============

@app.get("/api/directories")
def browse_directories(path: str = Query(None)):
    """Browse server-side directories."""
    # Default to home directory
    if not path:
        target = Path.home()
    else:
        target = Path(path)

    # Security check
    if not is_path_allowed(target):
        raise HTTPException(status_code=403, detail="Access to this directory is not allowed")

    if not target.exists():
        raise HTTPException(status_code=404, detail="Directory not found")

    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory")

    # Get parent directory
    parent = str(target.parent) if target.parent != target else None

    # List subdirectories
    directories = []
    try:
        for item in sorted(target.iterdir(), key=lambda x: x.name.lower()):
            if item.is_dir() and not item.name.startswith('.'):
                # Estimate photo count (quick scan)
                photo_count = count_image_files(item, max_depth=1)

                directories.append({
                    'name': item.name,
                    'path': str(item),
                    'photo_count_estimate': photo_count
                })
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    return {
        'current': str(target),
        'parent': parent if parent and is_path_allowed(Path(parent)) else None,
        'directories': directories
    }


@app.get("/api/directories/home")
def get_home_directory():
    """Get user's home directory path."""
    return {'path': str(Path.home())}


@app.get("/api/databases")
def list_databases():
    """Get list of available database files."""
    return {'databases': get_available_databases()}


@app.post("/api/databases/switch")
def switch_database(db_name: str = Query(...)):
    """Switch to a different database file."""
    global _current_db_path

    target_path = BASE_DIR / f"{db_name}.db"
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Database not found")

    _current_db_path = target_path
    return {'success': True, 'active_database': db_name}


@app.get("/api/stats")
def get_stats():
    """Get overall statistics."""
    # Check if database exists and has tables
    if not _current_db_path.exists():
        return {
            'total_photos': 0,
            'total_clusters': 0,
            'rated_photos': 0,
            'starred_photos': 0,
            'rejected_photos': 0,
            'keeper_photos': 0,
            'rating_distribution': {},
            'folders': []
        }

    try:
        conn = get_db()
        cursor = conn.cursor()

        stats = {}

        cursor.execute("SELECT COUNT(*) as cnt FROM photos")
        stats['total_photos'] = cursor.fetchone()['cnt']

        cursor.execute("SELECT COUNT(*) as cnt FROM clusters")
        stats['total_clusters'] = cursor.fetchone()['cnt']

        cursor.execute("SELECT COUNT(*) as cnt FROM photos WHERE rating > 0 OR is_starred = 1 OR is_rejected = 1")
        stats['rated_photos'] = cursor.fetchone()['cnt']

        cursor.execute("SELECT COUNT(*) as cnt FROM photos WHERE is_starred = 1")
        stats['starred_photos'] = cursor.fetchone()['cnt']

        cursor.execute("SELECT COUNT(*) as cnt FROM photos WHERE is_rejected = 1")
        stats['rejected_photos'] = cursor.fetchone()['cnt']

        cursor.execute("SELECT COUNT(*) as cnt FROM photos WHERE rating >= 3")
        stats['keeper_photos'] = cursor.fetchone()['cnt']

        # Rating distribution
        cursor.execute("""
            SELECT rating, COUNT(*) as cnt
            FROM photos
            GROUP BY rating
            ORDER BY rating
        """)
        stats['rating_distribution'] = {row['rating']: row['cnt'] for row in cursor.fetchall()}

        # Folders
        cursor.execute("""
            SELECT folder, COUNT(*) as cnt
            FROM photos
            GROUP BY folder
            ORDER BY folder
        """)
        stats['folders'] = [{'name': row['folder'], 'count': row['cnt']} for row in cursor.fetchall()]


        conn.close()
        return stats

    except sqlite3.OperationalError:
        # Database exists but tables not created yet
        return {
            'total_photos': 0,
            'total_clusters': 0,
            'rated_photos': 0,
            'starred_photos': 0,
            'keeper_photos': 0,
            'rating_distribution': {},
            'folders': []
        }


@app.get("/api/clusters")
def get_clusters(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    folder: Optional[str] = None,
    min_rating: Optional[int] = None,
    starred_only: bool = False,
    rejected_only: bool = False,
    unrated_only: bool = False
):
    """Get clusters with their representative photos."""
    # Check if database exists
    if not _current_db_path.exists():
        return {
            'clusters': [],
            'total': 0,
            'page': page,
            'per_page': per_page,
            'total_pages': 0
        }

    try:
        conn = get_db()
        cursor = conn.cursor()

        # Build query
        conditions = []
        params = []
        joins = []

        if folder:
            conditions.append("p.folder = ?")
            params.append(folder)

        if min_rating is not None:
            conditions.append("p.rating >= ?")
            params.append(min_rating)

        if starred_only:
            conditions.append("p.is_starred = 1")

        if rejected_only:
            conditions.append("p.is_rejected = 1")

        if unrated_only:
            conditions.append("p.rating = 0")

        where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
        join_clause = " ".join(joins) if joins else ""

        # Count total matching clusters
        count_query = f"""
            SELECT COUNT(DISTINCT c.id) as cnt
            FROM clusters c
            JOIN photos p ON c.representative_photo_id = p.id
            {join_clause}
            {where_clause}
        """
        cursor.execute(count_query, params)
        total_row = cursor.fetchone()
        total = total_row['cnt'] if total_row else 0

        # If no clusters exist, show unclustered photos instead
        if total == 0:
            # Count unclustered photos
            unclustered_conditions = conditions.copy() if conditions else []
            unclustered_params = params.copy()
            unclustered_where = "WHERE " + " AND ".join(unclustered_conditions) if unclustered_conditions else ""

            count_query = f"""
                SELECT COUNT(*) as cnt
                FROM photos p
                {join_clause}
                {unclustered_where}
            """
            cursor.execute(count_query, unclustered_params)
            total_row = cursor.fetchone()
            total = total_row['cnt'] if total_row else 0

            # Get unclustered photos as individual "clusters"
            offset = (page - 1) * per_page
            query = f"""
                SELECT
                    p.id as photo_id,
                    p.filepath,
                    p.filename,
                    p.folder,
                    p.rating,
                    p.is_starred,
                    p.is_rejected,
                    p.taken_at,
                    p.width,
                    p.height
                FROM photos p
                {join_clause}
                {unclustered_where}
                ORDER BY p.taken_at ASC, p.id ASC
                LIMIT ? OFFSET ?
            """
            cursor.execute(query, unclustered_params + [per_page, offset])

            clusters = []
            for row in cursor.fetchall():
                clusters.append({
                    'cluster_id': row['photo_id'],  # Use photo ID as cluster ID
                    'photo_count': 1,
                    'representative': {
                        'id': row['photo_id'],
                        'filepath': row['filepath'],
                        'filename': row['filename'],
                        'folder': row['folder'],
                        'rating': row['rating'],
                        'is_starred': bool(row['is_starred']),
                        'is_rejected': bool(row['is_rejected']),
                        'taken_at': row['taken_at'],
                        'width': row['width'],
                        'height': row['height']
                    }
                })

            conn.close()

            return {
                'clusters': clusters,
                'total': total,
                'page': page,
                'per_page': per_page,
                'total_pages': (total + per_page - 1) // per_page
            }

        # Get clusters with representative photos
        offset = (page - 1) * per_page
        query = f"""
            SELECT DISTINCT
                c.id as cluster_id,
                c.photo_count,
                p.id as photo_id,
                p.filepath,
                p.filename,
                p.folder,
                p.rating,
                p.is_starred,
                p.is_rejected,
                p.taken_at,
                p.width,
                p.height
            FROM clusters c
            JOIN photos p ON c.representative_photo_id = p.id
            {join_clause}
            {where_clause}
            ORDER BY p.taken_at ASC, c.id ASC
            LIMIT ? OFFSET ?
        """
        cursor.execute(query, params + [per_page, offset])

        clusters = []
        for row in cursor.fetchall():
            clusters.append({
                'cluster_id': row['cluster_id'],
                'photo_count': row['photo_count'],
                'representative': {
                    'id': row['photo_id'],
                    'filepath': row['filepath'],
                    'filename': row['filename'],
                    'folder': row['folder'],
                    'rating': row['rating'],
                    'is_starred': bool(row['is_starred']),
                    'is_rejected': bool(row['is_rejected']),
                    'taken_at': row['taken_at'],
                    'width': row['width'],
                    'height': row['height']
                }
            })

        conn.close()

        return {
            'clusters': clusters,
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page
        }

    except sqlite3.OperationalError:
        # Database exists but tables not created yet
        return {
            'clusters': [],
            'total': 0,
            'page': page,
            'per_page': per_page,
            'total_pages': 0
        }


@app.get("/api/clusters/{cluster_id}/photos")
def get_cluster_photos(cluster_id: int):
    """Get all photos in a cluster."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            id, filepath, filename, folder, rating, is_starred, is_rejected,
            taken_at, width, height, is_cluster_representative, notes, exif_data
        FROM photos
        WHERE cluster_id = ?
        ORDER BY taken_at ASC, id ASC
    """, (cluster_id,))

    photos = []
    for row in cursor.fetchall():
        photo = {
            'id': row['id'],
            'filepath': row['filepath'],
            'filename': row['filename'],
            'folder': row['folder'],
            'rating': row['rating'],
            'is_starred': bool(row['is_starred']),
            'is_rejected': bool(row['is_rejected']),
            'taken_at': row['taken_at'],
            'width': row['width'],
            'height': row['height'],
            'is_representative': bool(row['is_cluster_representative']),
            'notes': row['notes']
        }

        # Parse EXIF data if requested (optional - can be removed if not needed in cluster view)
        if row['exif_data']:
            try:
                photo['exif_data'] = json.loads(row['exif_data'])
            except json.JSONDecodeError:
                photo['exif_data'] = {}

        photos.append(photo)

    conn.close()
    return {'photos': photos, 'count': len(photos)}


@app.get("/api/photos/{photo_id}")
def get_photo(photo_id: int):
    """Get single photo details."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            p.*, c.photo_count as cluster_size
        FROM photos p
        LEFT JOIN clusters c ON p.cluster_id = c.id
        WHERE p.id = ?
    """, (photo_id,))

    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Photo not found")

    photo = dict(row)
    photo['is_starred'] = bool(photo['is_starred'])
    photo['is_rejected'] = bool(photo['is_rejected'])
    photo['is_cluster_representative'] = bool(photo['is_cluster_representative'])

    # Parse EXIF data from JSON
    if photo.get('exif_data'):
        try:
            photo['exif_data'] = json.loads(photo['exif_data'])
        except json.JSONDecodeError:
            photo['exif_data'] = {}
    else:
        photo['exif_data'] = {}

    conn.close()
    return photo


@app.put("/api/photos/{photo_id}/rating")
def update_rating(photo_id: int, data: PhotoRating):
    """Update photo rating (0-5)."""
    if not 0 <= data.rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be 0-5")

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE photos
        SET rating = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (data.rating, photo_id))

    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Photo not found")

    conn.commit()
    conn.close()

    return {"success": True, "photo_id": photo_id, "rating": data.rating}


@app.put("/api/photos/{photo_id}/star")
def update_star(photo_id: int, data: PhotoStar):
    """Toggle photo starred status."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE photos
        SET is_starred = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (data.is_starred, photo_id))

    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Photo not found")

    conn.commit()
    conn.close()

    return {"success": True, "photo_id": photo_id, "is_starred": data.is_starred}


@app.put("/api/photos/{photo_id}/reject")
def update_reject(photo_id: int, data: PhotoReject):
    """Toggle photo rejected status."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE photos
        SET is_rejected = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (data.is_rejected, photo_id))

    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Photo not found")

    conn.commit()
    conn.close()

    return {"success": True, "photo_id": photo_id, "is_rejected": data.is_rejected}


@app.put("/api/photos/{photo_id}/notes")
def update_notes(photo_id: int, data: PhotoNotes):
    """Update photo notes."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE photos
        SET notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (data.notes, photo_id))

    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Photo not found")

    conn.commit()
    conn.close()

    return {"success": True, "photo_id": photo_id}


@app.put("/api/clusters/{cluster_id}/rating")
def update_cluster_rating(cluster_id: int, data: PhotoRating):
    """Update rating for all photos in a cluster."""
    if not 0 <= data.rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be 0-5")

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE photos
        SET rating = ?, updated_at = CURRENT_TIMESTAMP
        WHERE cluster_id = ?
    """, (data.rating, cluster_id))

    affected = cursor.rowcount
    conn.commit()
    conn.close()

    return {"success": True, "cluster_id": cluster_id, "rating": data.rating, "affected_photos": affected}


def get_thumbnail_path(photo_id: int, width: int) -> Path:
    """Get path for cached thumbnail."""
    return THUMB_DIR / f"{width}" / f"{photo_id}.jpg"


def generate_thumbnail(source_path: Path, thumb_path: Path, width: int) -> Path:
    """Generate and cache a thumbnail with proper EXIF rotation."""
    thumb_path.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(source_path) as img:
        # Auto-rotate based on EXIF orientation (handles all orientation values)
        img = ImageOps.exif_transpose(img)

        # Convert to RGB if necessary (handles RGBA, P mode, etc.)
        if img.mode in ('RGBA', 'P', 'LA'):
            img = img.convert('RGB')

        # Calculate height maintaining aspect ratio
        ratio = width / img.width
        height = int(img.height * ratio)

        # Only resize if image is larger than target
        if img.width > width:
            img = img.resize((width, height), Image.Resampling.LANCZOS)

        # Save with good quality
        img.save(thumb_path, 'JPEG', quality=85, optimize=True)

    return thumb_path


@app.get("/api/image/{photo_id}")
def serve_image(
    photo_id: int,
    w: Optional[int] = Query(None, description="Width for thumbnail (400=grid, 1200=modal, none=full)")
):
    """Serve image file with optional resizing."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT filepath FROM photos WHERE id = ?", (photo_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Photo not found")

    filepath = Path(row['filepath'])
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Image file not found")

    # If width specified, serve thumbnail
    if w and w in [400, 1200]:
        thumb_path = get_thumbnail_path(photo_id, w)

        # Generate if doesn't exist
        if not thumb_path.exists():
            try:
                generate_thumbnail(filepath, thumb_path, w)
            except Exception as e:
                # Fall back to original if thumbnail generation fails
                print(f"Thumbnail generation failed for {photo_id}: {e}")
                return FileResponse(
                    filepath,
                    media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=86400"}
                )

        return FileResponse(
            thumb_path,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=604800"}  # 1 week cache for thumbs
        )

    # Serve original
    content_type, _ = mimetypes.guess_type(str(filepath))
    if not content_type:
        content_type = "image/jpeg"

    return FileResponse(
        filepath,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"}
    )


@app.get("/api/export/starred")
def export_starred_list():
    """Get list of starred photos for export."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT filepath, filename, folder, rating, is_starred
        FROM photos
        WHERE is_starred = 1
        ORDER BY folder, taken_at
    """)

    photos = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return {"photos": photos, "count": len(photos)}


@app.get("/api/export/rejected")
def export_rejected_list():
    """Get list of rejected photos for deletion."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT filepath, filename, folder
        FROM photos
        WHERE is_rejected = 1
        ORDER BY folder, taken_at
    """)

    photos = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return {"photos": photos, "count": len(photos)}


# ============== Static Files ==============

# Mount static files for the UI
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", response_class=HTMLResponse)
def serve_index():
    """Serve the main UI."""
    index_file = STATIC_DIR / "index.html"
    if not index_file.exists():
        return HTMLResponse("<h1>Run index_photos.py first, then place UI files in static/</h1>")
    return FileResponse(index_file)


# ============== Main ==============

if __name__ == "__main__":
    print("="*50)
    print("PicBest - SMART PHOTO CURATOR")
    print("="*50)
    print(f"Base directory: {BASE_DIR}")
    print(f"Static files: {STATIC_DIR}")
    print()

    # Create necessary directories
    print("Initializing directories...")
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    (THUMB_DIR / "400").mkdir(exist_ok=True)
    (THUMB_DIR / "1200").mkdir(exist_ok=True)
    print(f"  ✓ Thumbnails: {THUMB_DIR}")

    print()

    # List available databases (but don't exit if none exist)
    dbs = get_available_databases()
    if dbs:
        print(f"Found {len(dbs)} database(s):")
        for db in dbs:
            marker = "✓" if db['active'] else " "
            size_mb = db['size'] / (1024 * 1024)
            print(f"  [{marker}] {db['name']} ({size_mb:.1f} MB)")
    else:
        print("No photo databases found yet.")
        print("Use the web UI to browse and index photos.")
    print()

    print("Starting server at http://localhost:8000")
    print("Press Ctrl+C to stop")
    print()

    uvicorn.run(app, host="0.0.0.0", port=8000)

