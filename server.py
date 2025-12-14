#!/usr/bin/env python3
"""
PicPick - Smart Photo Curator - Web Server
FastAPI backend for browsing and rating photos.
"""

import sqlite3
import hashlib
from pathlib import Path
from typing import Optional
import mimetypes

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, Response
from pydantic import BaseModel
from PIL import Image
import uvicorn

# Configuration
DB_PATH = Path(__file__).parent / "photos.db"
STATIC_DIR = Path(__file__).parent / "static"
THUMB_DIR = Path(__file__).parent / "thumbnails"

# Thumbnail sizes
THUMB_SIZES = {
    'grid': 400,    # For grid view
    'modal': 1200,  # For modal view
    'full': None    # Original size
}

app = FastAPI(title="PicPick")


def get_db():
    """Get database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ============== API Models ==============

class PhotoRating(BaseModel):
    rating: int  # 0-5

class PhotoStar(BaseModel):
    is_starred: bool

class PhotoNotes(BaseModel):
    notes: str


# ============== API Endpoints ==============

@app.get("/api/stats")
def get_stats():
    """Get overall statistics."""
    conn = get_db()
    cursor = conn.cursor()

    stats = {}

    cursor.execute("SELECT COUNT(*) as cnt FROM photos")
    stats['total_photos'] = cursor.fetchone()['cnt']

    cursor.execute("SELECT COUNT(*) as cnt FROM clusters")
    stats['total_clusters'] = cursor.fetchone()['cnt']

    cursor.execute("SELECT COUNT(*) as cnt FROM photos WHERE rating > 0")
    stats['rated_photos'] = cursor.fetchone()['cnt']

    cursor.execute("SELECT COUNT(*) as cnt FROM photos WHERE is_starred = 1")
    stats['starred_photos'] = cursor.fetchone()['cnt']

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

    # Persons (for face filtering)
    cursor.execute("""
        SELECT id, name, photo_count, thumbnail_face_id
        FROM persons
        WHERE photo_count > 0
        ORDER BY photo_count DESC
    """)
    stats['persons'] = [
        {'id': row['id'], 'name': row['name'], 'count': row['photo_count'], 'thumbnail_face_id': row['thumbnail_face_id']}
        for row in cursor.fetchall()
    ]

    cursor.execute("SELECT COUNT(*) as cnt FROM persons")
    stats['total_persons'] = cursor.fetchone()['cnt']

    conn.close()
    return stats


@app.get("/api/clusters")
def get_clusters(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    folder: Optional[str] = None,
    min_rating: Optional[int] = None,
    starred_only: bool = False,
    unrated_only: bool = False,
    person_id: Optional[int] = None
):
    """Get clusters with their representative photos."""
    conn = get_db()
    cursor = conn.cursor()

    # Build query
    conditions = []
    params = []
    joins = []

    if folder:
        conditions.append("p.folder = ?")
        params.append(folder)

    if person_id:
        joins.append("JOIN faces f ON p.id = f.photo_id")
        conditions.append("f.person_id = ?")
        params.append(person_id)

    if min_rating is not None:
        conditions.append("p.rating >= ?")
        params.append(min_rating)

    if starred_only:
        conditions.append("p.is_starred = 1")

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
    total = cursor.fetchone()['cnt']

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


@app.get("/api/clusters/{cluster_id}/photos")
def get_cluster_photos(cluster_id: int):
    """Get all photos in a cluster."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            id, filepath, filename, folder, rating, is_starred,
            taken_at, width, height, is_cluster_representative, notes
        FROM photos
        WHERE cluster_id = ?
        ORDER BY taken_at ASC, id ASC
    """, (cluster_id,))

    photos = []
    for row in cursor.fetchall():
        photos.append({
            'id': row['id'],
            'filepath': row['filepath'],
            'filename': row['filename'],
            'folder': row['folder'],
            'rating': row['rating'],
            'is_starred': bool(row['is_starred']),
            'taken_at': row['taken_at'],
            'width': row['width'],
            'height': row['height'],
            'is_representative': bool(row['is_cluster_representative']),
            'notes': row['notes']
        })

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
    photo['is_cluster_representative'] = bool(photo['is_cluster_representative'])

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
    """Generate and cache a thumbnail."""
    thumb_path.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(source_path) as img:
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


@app.get("/api/persons")
def get_persons():
    """Get all detected persons with photo counts."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT p.id, p.name, p.photo_count, p.thumbnail_face_id,
               f.photo_id as thumb_photo_id, f.bbox_top, f.bbox_right, f.bbox_bottom, f.bbox_left
        FROM persons p
        LEFT JOIN faces f ON p.thumbnail_face_id = f.id
        WHERE p.photo_count > 0
        ORDER BY p.photo_count DESC
    """)

    persons = []
    for row in cursor.fetchall():
        persons.append({
            'id': row['id'],
            'name': row['name'],
            'photo_count': row['photo_count'],
            'thumbnail_face_id': row['thumbnail_face_id'],
            'thumb_photo_id': row['thumb_photo_id'],
            'bbox': {
                'top': row['bbox_top'],
                'right': row['bbox_right'],
                'bottom': row['bbox_bottom'],
                'left': row['bbox_left']
            } if row['bbox_top'] else None
        })

    conn.close()
    return {'persons': persons, 'count': len(persons)}


@app.put("/api/persons/{person_id}/name")
def update_person_name(person_id: int, name: str = Query(...)):
    """Update person's name."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("UPDATE persons SET name = ? WHERE id = ?", (name, person_id))

    if cursor.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="Person not found")

    conn.commit()
    conn.close()
    return {"success": True, "person_id": person_id, "name": name}


@app.get("/api/face/{face_id}")
def get_face_thumbnail(face_id: int, size: int = Query(100, ge=50, le=300)):
    """Get cropped face thumbnail."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT f.*, p.filepath
        FROM faces f
        JOIN photos p ON f.photo_id = p.id
        WHERE f.id = ?
    """, (face_id,))

    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Face not found")

    filepath = Path(row['filepath'])
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Image file not found")

    # Crop and resize face
    try:
        with Image.open(filepath) as img:
            # Add some padding around the face
            padding = int((row['bbox_bottom'] - row['bbox_top']) * 0.3)
            left = max(0, row['bbox_left'] - padding)
            top = max(0, row['bbox_top'] - padding)
            right = min(img.width, row['bbox_right'] + padding)
            bottom = min(img.height, row['bbox_bottom'] + padding)

            face_img = img.crop((left, top, right, bottom))
            face_img = face_img.resize((size, size), Image.Resampling.LANCZOS)

            # Convert to bytes
            import io
            buffer = io.BytesIO()
            face_img.save(buffer, format='JPEG', quality=85)
            buffer.seek(0)

            return Response(
                content=buffer.getvalue(),
                media_type="image/jpeg",
                headers={"Cache-Control": "public, max-age=604800"}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing face: {e}")


@app.get("/api/export/starred")
def export_starred_list(min_rating: int = 3):
    """Get list of starred/high-rated photos for export."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT filepath, filename, folder, rating, is_starred
        FROM photos
        WHERE rating >= ? OR is_starred = 1
        ORDER BY folder, taken_at
    """, (min_rating,))

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
    print("PICPICK - SMART PHOTO CURATOR")
    print("="*50)
    print(f"Database: {DB_PATH}")
    print(f"Static files: {STATIC_DIR}")
    print()

    if not DB_PATH.exists():
        print("⚠ Database not found! Run 'python index_photos.py' first.")
        exit(1)

    print("Starting server at http://localhost:8000")
    print("Press Ctrl+C to stop")
    print()

    uvicorn.run(app, host="0.0.0.0", port=8000)

