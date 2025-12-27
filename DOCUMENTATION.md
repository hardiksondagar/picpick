# PicBest - Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [The Problem It Solves](#the-problem-it-solves)
3. [Use Cases](#use-cases)
4. [How It Works](#how-it-works)
5. [Architecture](#architecture)
6. [Key Features](#key-features)
7. [Installation & Setup](#installation--setup)
8. [Usage Guide](#usage-guide)
9. [Technical Details](#technical-details)
10. [API Reference](#api-reference)

---

## Overview

**PicBest** is an AI-powered photo curation tool that helps you intelligently filter thousands of photos down to your best shots. It uses machine learning (CLIP embeddings) to automatically group similar photos together, making it easy to review and select the keepers from large photo collections.

### What Makes It Unique

- **AI-Powered Smart Clustering**: Uses OpenAI's CLIP model to understand photo content and group visually similar images
- **Live Indexing**: Photos appear in the UI as they're being indexed - no waiting for completion
- **Timeline Organization**: Automatically organizes photos by date and time with visual separators
- **Fast Review Workflow**: Keyboard-driven interface for rapid photo selection
- **Multiple Export Options**: Copy files, generate filename lists, or create XMP sidecars for professional workflows

---

## The Problem It Solves

### The Challenge

After any major event (wedding, vacation, conference, family gathering), you're drowning in photos:

- **Thousands of similar shots**: 10 photos of the same moment - which one is best?
- **Finding specific people**: Where are all the photos with grandma?
- **Timeline confusion**: Which day/event was this from?
- **Time-consuming review**: Manually reviewing 5000+ photos takes days
- **Decision fatigue**: Too many choices lead to poor selections

### The Solution

PicBest solves this by:

1. **Automatic Grouping**: AI clusters visually similar photos (burst shots, same scene from different angles)
2. **One Representative Per Cluster**: Review just one photo from each group, dramatically reducing review time
3. **Timeline Organization**: Photos automatically organized by date/time with clear separators
4. **Quick Selection**: Keyboard shortcuts for rapid starring/rejecting
5. **Smart Filtering**: Filter by folder, starred, or rejected status
6. **Professional Export**: Multiple export formats for different workflows

**Result**: Review 5000 photos in 2-3 hours instead of 2-3 days, and end up with better selections.

---

## Use Cases

### 1. Wedding Photography
**Scenario**: 5000+ photos from a wedding day
**Challenge**: Need to deliver 300-400 best shots to the couple
**Solution**:
- Index all photos
- AI groups similar shots (10 photos of cake cutting → 1 cluster)
- Review cluster representatives
- Star the best from each moment
- Export starred photos

**Time Saved**: 80% reduction in review time

### 2. Vacation Photos
**Scenario**: 2000 photos from a 2-week trip
**Challenge**: Want 200 highlights for a photo book
**Solution**:
- Timeline view shows photos by day
- Clusters group similar scenes (20 sunset photos → 1 cluster)
- Quick review with keyboard shortcuts
- Export with folder structure preserved

**Benefit**: Maintain chronological story while eliminating redundancy

### 3. Event Coverage
**Scenario**: Conference with 1000+ photos
**Challenge**: Need to select 100 key shots for marketing
**Solution**:
- Filter by folder (keynote, panels, networking)
- Review clustered similar shots
- Star best moments
- Export filename list to share with photographer

**Workflow**: Professional export options (XMP sidecars, filename lists)

### 4. Family Photo Organization
**Scenario**: Years of accumulated photos (10,000+)
**Challenge**: Create a curated family album
**Solution**:
- Index entire collection
- Timeline view reveals chronological story
- Reject duplicates and bad shots
- Star keepers
- Export organized by date

**Result**: Transform chaos into curated memories

### 5. Professional Photography Culling
**Scenario**: Photographer needs to cull client shoots
**Challenge**: Deliver only the best shots, fast turnaround
**Solution**:
- Quick indexing of RAW+JPEG
- Cluster similar compositions
- Keyboard-driven rapid review
- Export XMP sidecars for Lightroom import

**Speed**: 3-5x faster than traditional culling

---

## How It Works

### The Complete Workflow

```
┌─────────────────┐
│  Photo Folder   │
│   (5000 JPGs)   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  1. SCANNING & INDEXING                 │
│  • Scan directory recursively           │
│  • Extract EXIF metadata (date, camera) │
│  • Compute perceptual hash (dhash)      │
│  • Store in SQLite database             │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  2. AI EMBEDDING GENERATION             │
│  • Load CLIP model (ViT-B/32)           │
│  • Generate 512-dim embeddings          │
│  • Batch processing (32 images/batch)   │
│  • Embeddings capture semantic content  │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  3. INTELLIGENT CLUSTERING              │
│  • Stage 1: Near-duplicate detection    │
│    (dhash similarity < 12 bits)         │
│  • Stage 2: Semantic clustering         │
│    (HDBSCAN on CLIP embeddings)         │
│  • Temporal weighting (photos close     │
│    in time get bonus similarity)        │
│  • Select representative per cluster    │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  4. WEB UI REVIEW                       │
│  • Grid view: cluster representatives   │
│  • Timeline separators (date/time)      │
│  • Modal view: all photos in cluster    │
│  • Keyboard shortcuts for speed         │
│  • Real-time stats tracking             │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  5. EXPORT & DELIVERY                   │
│  • Copy starred photos to folder        │
│  • Generate filename lists              │
│  • Create XMP sidecars                  │
│  • Preserve folder structure            │
└─────────────────────────────────────────┘
```

### Technical Process Details

#### 1. Photo Scanning
- Recursively walks directory tree
- Filters by extension (`.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`)
- Extracts EXIF metadata:
  - Date taken
  - Camera make/model
  - Lens, aperture, shutter speed, ISO
  - GPS coordinates (if available)
  - Image dimensions
- Computes perceptual hash (dhash) for duplicate detection

#### 2. AI Embedding Generation
- Uses CLIP (Contrastive Language-Image Pre-training)
- Model: `clip-ViT-B-32` (512-dimensional embeddings)
- Why CLIP?
  - Understands semantic content (not just pixels)
  - Groups photos by meaning (all "sunset" photos cluster together)
  - Works across different angles, lighting, crops
- Batch processing for GPU efficiency
- Progress tracking with live updates

#### 3. Clustering Algorithm
**Two-Stage Approach:**

**Stage 1: Near-Duplicate Detection**
- Compares perceptual hashes (dhash)
- Hamming distance < 12 = near-duplicate
- Groups identical/nearly-identical shots
- Fast (no AI needed)

**Stage 2: Semantic Clustering**
- Uses HDBSCAN (Hierarchical DBSCAN)
- Clusters based on CLIP embedding similarity
- Automatically determines number of clusters
- Temporal weighting: photos close in time get similarity boost
- Parameters:
  - `min_cluster_size = 2` (minimum photos per cluster)
  - `min_samples = 1` (permissive clustering)
  - Cosine distance metric

**Representative Selection:**
- Chooses photo closest to cluster centroid
- Ensures representative is typical of the group
- Can be changed in UI if needed

#### 4. Web Interface
**Backend (FastAPI):**
- RESTful API for all operations
- SQLite for data persistence
- On-demand thumbnail generation (400px, 1200px)
- Background job processing for exports
- Real-time progress tracking

**Frontend (Vanilla JS):**
- Infinite scroll grid
- Modal view for detailed review
- Keyboard-driven navigation
- Real-time stats updates
- URL-based filter sharing

#### 5. Export Options
1. **Copy to Folder**: Physical file copies with deduplication
2. **Filename List**: Text file for photographer sharing
3. **XMP Sidecars**: For Lightroom/Adobe Bridge import
4. **Manifest JSON**: Complete metadata export

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────┐
│                   USER INTERFACE                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │   Browser    │  │  Grid View   │  │Modal View │ │
│  │  (Chrome)    │  │  Timeline    │  │  Cluster  │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
│         │                 │                 │        │
└─────────┼─────────────────┼─────────────────┼────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────┐
│              WEB SERVER (FastAPI)                    │
│  ┌────────────────────────────────────────────────┐ │
│  │  API Endpoints                                  │ │
│  │  • /api/clusters (paginated grid data)         │ │
│  │  • /api/photos/{id} (photo details)            │ │
│  │  • /api/image/{id}?w=400 (thumbnails)          │ │
│  │  • /api/export/* (export operations)           │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │  Background Jobs                                │ │
│  │  • Thumbnail generation                         │ │
│  │  • Export file copying                          │ │
│  │  • Progress tracking                            │ │
│  └────────────────────────────────────────────────┘ │
└─────────┬───────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│              DATABASE (SQLite)                       │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │   photos   │  │  clusters  │  │indexing_jobs │  │
│  │            │  │            │  │              │  │
│  │ • filepath │  │ • rep_id   │  │ • status     │  │
│  │ • metadata │  │ • count    │  │ • progress   │  │
│  │ • rating   │  │            │  │              │  │
│  │ • starred  │  │            │  │              │  │
│  │ • embedding│  │            │  │              │  │
│  └────────────┘  └────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│           FILE SYSTEM                                │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │ Original     │  │ Thumbnails   │                 │
│  │ Photos       │  │ (cached)     │                 │
│  │ /photos/     │  │ /thumbnails/ │                 │
│  │   ├─ day1/   │  │   ├─ 400/    │                 │
│  │   ├─ day2/   │  │   └─ 1200/   │                 │
│  └──────────────┘  └──────────────┘                 │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│           AI MODELS (Indexing)                       │
│  ┌────────────────────────────────────────────────┐ │
│  │  CLIP Model (clip-ViT-B-32)                    │ │
│  │  • 512-dim embeddings                          │ │
│  │  • Semantic understanding                      │ │
│  │  • ~350MB model size                           │ │
│  └────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐ │
│  │  HDBSCAN Clustering                            │ │
│  │  • Adaptive density-based clustering           │ │
│  │  • No manual parameter tuning                  │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Data Flow

**Indexing Flow:**
```
Photos → Scan → Extract EXIF → Compute Hash → Store DB
                                                   ↓
                                            Generate Embeddings
                                                   ↓
                                            Cluster Similar
                                                   ↓
                                            Select Representatives
```

**Review Flow:**
```
User Request → API → Query DB → Generate Thumbnails → Return JSON
                                                          ↓
                                                    Render UI
                                                          ↓
                                                    User Action
                                                          ↓
                                                    Update DB
```

### Database Schema

**photos table:**
- `id`: Primary key
- `filepath`: Absolute path to photo
- `filename`: File name
- `folder`: Relative folder path
- `file_hash`: SHA256 of file
- `dhash`: Perceptual hash (for duplicates)
- `width`, `height`: Dimensions
- `taken_at`: DateTime from EXIF
- `exif_data`: JSON blob of EXIF
- `embedding`: 512-dim CLIP vector (BLOB)
- `cluster_id`: Foreign key to clusters
- `is_cluster_representative`: Boolean
- `rating`: 0-5 stars
- `is_starred`: Boolean (selected)
- `is_rejected`: Boolean (rejected)
- `notes`: Text field
- `created_at`, `updated_at`: Timestamps

**clusters table:**
- `id`: Primary key
- `representative_photo_id`: Foreign key to photos
- `photo_count`: Number of photos in cluster
- `created_at`: Timestamp

**indexing_jobs table:**
- `id`: Primary key
- `directory`: Path being indexed
- `status`: running/complete/error
- `phase`: scanning/embedding/clustering
- `current`, `total`: Progress counters
- `message`: Status message
- `created_at`, `completed_at`: Timestamps

---

## Key Features

### 1. Smart Clustering
**What it does**: Groups visually similar photos automatically

**How it works**:
- Near-duplicate detection catches identical shots
- Semantic clustering groups similar scenes/subjects
- Temporal weighting keeps chronologically close photos together

**Benefits**:
- Reduces 5000 photos to 500-800 clusters
- Review 90% fewer images
- Never miss important moments

### 2. Live Indexing
**What it does**: Photos appear in UI as they're being indexed

**How it works**:
- Background indexing process
- Real-time progress updates via database
- Photos become available immediately after embedding

**Benefits**:
- Start reviewing while indexing continues
- No waiting for completion
- Visual feedback on progress

### 3. Timeline Organization
**What it does**: Automatically organizes photos by date/time

**How it works**:
- Date separators for each day
- Time separators for >30 min gaps
- Chronological ordering within clusters

**Benefits**:
- Understand event flow
- Find specific moments quickly
- Maintain story continuity

### 4. Keyboard-Driven Workflow
**What it does**: Fast navigation and selection without mouse

**Shortcuts**:
- `←` `→`: Navigate between clusters
- `↑` `↓`: Navigate photos within cluster
- `S` or `Space`: Star/unstar photo
- `Delete`: Reject photo
- `Esc`: Close modal
- `Enter`: Open cluster

**Benefits**:
- 3-5x faster review
- Reduced hand movement
- Professional culling speed

### 5. Flexible Filtering
**What it does**: View subsets of photos

**Filters**:
- By folder (day1, day2, ceremony, reception)
- Starred only (review selections)
- Rejected only (verify deletions)
- Combined filters

**Benefits**:
- Focus on specific events
- Review decisions
- Share filtered views via URL

### 6. Multiple Export Options

**Copy to Folder**:
- Physical file copies
- Deduplication (skips existing)
- Preserves folder structure
- Includes manifest.json

**Filename List**:
- Text file of filenames
- Share with photographer
- Import to other tools

**XMP Sidecars**:
- Lightroom-compatible
- Sets rating and label
- Professional workflow integration

**Benefits**:
- Flexible delivery options
- Professional compatibility
- Metadata preservation

### 7. Real-Time Stats
**What it shows**:
- Total photos indexed
- Number of clusters
- Starred count
- Rejected count
- Review progress %

**Benefits**:
- Track progress
- Set goals
- Understand collection

### 8. Responsive Thumbnails
**What it does**: Generates optimized thumbnails on-demand

**Sizes**:
- 400px: Grid view
- 1200px: Modal view
- Original: Full resolution

**Benefits**:
- Fast loading
- Bandwidth efficient
- Cached for speed

---

## Installation & Setup

### Prerequisites

- **macOS (Apple Silicon M1/M2/M3)** or Linux/Windows
- **Python 3.11+**
- **~8GB RAM** (for AI models)
- **~500MB disk** (for models + dependencies)

### Quick Install (macOS Apple Silicon)

```bash
# Clone repository
git clone https://github.com/yourusername/pickbest-web.git
cd pickbest-web

# Run automated installer
./install_m1.sh
```

The installer will:
- ✅ Check/install Python 3.11
- ✅ Install Xcode Command Line Tools
- ✅ Install Homebrew dependencies (cmake)
- ✅ Create virtual environment
- ✅ Install all Python packages
- ✅ Test installation

**Time**: ~5-10 minutes

### Manual Install (All Platforms)

```bash
# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install system dependencies (Ubuntu/Debian)
sudo apt-get install cmake build-essential

# Install Python packages
pip install -r requirements.txt
```

### Verify Installation

```bash
# Activate environment
source venv/bin/activate

# Test server
python server.py
```

Open http://localhost:8000 - you should see the PicBest UI.

---

## Usage Guide

### Basic Workflow

#### Step 1: Index Your Photos

**Option A: Command Line (Recommended)**
```bash
# Activate environment
source venv/bin/activate

# Index a directory
python index_photos.py --base-dir /path/to/your/photos

# Options:
#   --base-dir PATH    Directory to scan
#   --recluster        Re-cluster without re-embedding
#   --batch-size N     Batch size for embeddings (default: 32)
```

**What happens**:
1. Scans directory recursively
2. Extracts EXIF metadata
3. Generates CLIP embeddings (progress bar shown)
4. Clusters similar photos
5. Creates SQLite database

**Time**: ~1-2 seconds per photo (5000 photos ≈ 2-3 hours)

#### Step 2: Start Web Server

```bash
python server.py
```

Open **http://localhost:8000**

#### Step 3: Review Photos

**Grid View**:
- Scroll through cluster representatives
- Date/time separators show event flow
- Cluster badge shows number of similar photos
- Click any photo to open modal

**Modal View**:
- Large preview of current photo
- Cluster thumbnails at bottom
- Photo metadata (filename, date, camera)
- EXIF details (expandable)
- Star/Reject buttons

**Navigation**:
- `←` `→`: Next/previous cluster
- `↑` `↓`: Next/previous photo in cluster
- `S` or `Space`: Star current photo
- `Delete`: Reject current photo
- `Esc`: Close modal

#### Step 4: Filter & Refine

**Folder Filter**:
- Dropdown in header
- Shows photo count per folder
- URL updates automatically

**Status Filters**:
- Click thumbs-up icon: Show starred only
- Click thumbs-down icon: Show rejected only
- Click again to clear filter

**URL Sharing**:
```
http://localhost:8000?folder=day1&selected=true
```
Share this URL to show specific filtered view.

#### Step 5: Export Selections

**Click "Export" button in header**

**Copy to Folder**:
1. Enter destination path
2. Check "Include manifest.json" if desired
3. Click "Start Export"
4. Watch progress bar
5. Photos copied with deduplication

**Filename List**:
- Click "Filename List" button
- Downloads `.txt` file
- Share with photographer

**XMP Sidecars**:
- Click "XMP Sidecars" button
- Downloads `.zip` of XMP files
- Import to Lightroom/Bridge

### Advanced Usage

#### Re-clustering Without Re-indexing

If you want to adjust clustering parameters:

```bash
python index_photos.py --recluster
```

This skips embedding generation (fast) and only re-runs clustering.

**Edit clustering parameters in `index_photos.py`**:
```python
# Tighter clusters (more groups)
HDBSCAN_MIN_CLUSTER_SIZE = 3
DBSCAN_EPS = 0.10

# Looser clusters (fewer groups)
HDBSCAN_MIN_CLUSTER_SIZE = 2
DBSCAN_EPS = 0.20
```

#### Multiple Photo Collections

PicBest supports multiple databases:

```bash
# Index different collections
python index_photos.py --base-dir /photos/wedding
# Creates wedding.db

python index_photos.py --base-dir /photos/vacation
# Creates vacation.db
```

Switch between them in the web UI (database dropdown).

#### Batch Processing

For very large collections:

```bash
# Reduce batch size to save memory
python index_photos.py --base-dir /photos --batch-size 16

# Or increase for faster processing (needs more RAM)
python index_photos.py --base-dir /photos --batch-size 64
```

#### Export with Folder Structure

```bash
# Command-line export (alternative to web UI)
python export_starred.py --output /path/to/album

# Options:
#   --starred          Export only starred photos
#   --min-rating N     Export photos rated N+ stars
#   --symlink          Create symlinks instead of copying
#   --flat             Flat structure (no folders)
#   --list txt|json    Export as file list
```

---

## Technical Details

### Performance Characteristics

**Indexing Speed**:
- Scanning: ~1000 photos/second
- EXIF extraction: ~500 photos/second
- Embedding generation: ~1-2 photos/second (GPU) or ~0.5 photos/second (CPU)
- Clustering: ~5000 photos/second

**Bottleneck**: Embedding generation (GPU highly recommended)

**Memory Usage**:
- Base: ~500MB (Python + libraries)
- CLIP model: ~350MB
- Per photo: ~2KB (embedding)
- Peak: ~2-3GB during indexing

**Disk Usage**:
- Database: ~1MB per 1000 photos
- Thumbnails: ~50KB per photo (400px) + ~200KB per photo (1200px)
- Total: ~250KB per photo

**Web UI Performance**:
- Grid rendering: 60fps
- Thumbnail loading: Lazy (only visible images)
- Infinite scroll: Loads 50 clusters at a time
- Modal switching: <100ms

### AI Model Details

**CLIP (Contrastive Language-Image Pre-training)**:
- Model: `clip-ViT-B-32`
- Architecture: Vision Transformer (ViT)
- Embedding size: 512 dimensions
- Training: 400M image-text pairs
- Capabilities:
  - Semantic understanding (not just pixels)
  - Zero-shot classification
  - Cross-modal (image ↔ text)

**Why CLIP?**:
- Best-in-class image understanding
- Groups photos by meaning, not just appearance
- Handles different angles, lighting, crops
- Pre-trained (no training needed)

**Alternatives Considered**:
- ResNet: Good for duplicates, poor for semantic similarity
- ImageNet features: Limited to 1000 categories
- Custom CNN: Requires training data

### Clustering Algorithm

**HDBSCAN (Hierarchical DBSCAN)**:
- Density-based clustering
- Automatically determines number of clusters
- Handles varying cluster densities
- Robust to outliers

**Parameters**:
- `min_cluster_size`: Minimum photos to form cluster
- `min_samples`: Core point threshold
- `metric`: Cosine distance (for embeddings)

**Why HDBSCAN?**:
- No need to specify number of clusters (K-means requires this)
- Handles varying cluster sizes (K-means assumes equal sizes)
- Robust to noise (outliers become singletons)
- Hierarchical (can explore different granularities)

**Fallback to DBSCAN**:
- If HDBSCAN not installed
- Requires manual `eps` parameter
- Less adaptive but still effective

### Temporal Weighting

Photos close in time get similarity boost:

```python
time_diff = abs(photo1.taken_at - photo2.taken_at)
if time_diff < TIME_WINDOW_MINS:
    similarity += TIME_WEIGHT
```

**Why?**:
- Burst shots should cluster together
- Same scene from different angles
- Prevents mixing unrelated similar scenes

### Security Considerations

**Directory Browsing**:
- Restricted to allowed base paths (home, /Volumes, /mnt)
- Path traversal attacks prevented
- Symlink resolution checked

**File Access**:
- Read-only access to photos
- No file deletion from UI
- Export creates copies (doesn't move)

**Database**:
- SQLite (local, no network exposure)
- No SQL injection (parameterized queries)
- No sensitive data stored

**Web Server**:
- Runs on localhost by default
- No authentication (local tool)
- CORS disabled

---

## API Reference

### Base URL
```
http://localhost:8000
```

### Endpoints

#### GET `/api/stats`
Get overall statistics.

**Response**:
```json
{
  "total_photos": 5234,
  "total_clusters": 847,
  "rated_photos": 423,
  "starred_photos": 287,
  "rejected_photos": 136,
  "keeper_photos": 423,
  "rating_distribution": {
    "0": 4811,
    "3": 156,
    "4": 189,
    "5": 78
  },
  "folders": [
    {"name": "day1", "count": 2341},
    {"name": "day2", "count": 2893}
  ]
}
```

#### GET `/api/clusters`
Get paginated list of clusters.

**Query Parameters**:
- `page` (int): Page number (default: 1)
- `per_page` (int): Items per page (default: 50, max: 200)
- `folder` (string): Filter by folder name
- `starred_only` (bool): Show only starred photos
- `rejected_only` (bool): Show only rejected photos

**Response**:
```json
{
  "clusters": [
    {
      "cluster_id": 42,
      "photo_count": 7,
      "representative": {
        "id": 123,
        "filepath": "/photos/day1/IMG_1234.jpg",
        "filename": "IMG_1234.jpg",
        "folder": "day1",
        "rating": 0,
        "is_starred": false,
        "is_rejected": false,
        "taken_at": "2024-06-15T14:32:18",
        "width": 4000,
        "height": 3000
      }
    }
  ],
  "total": 847,
  "page": 1,
  "per_page": 50,
  "total_pages": 17
}
```

#### GET `/api/clusters/{cluster_id}/photos`
Get all photos in a cluster.

**Response**:
```json
{
  "photos": [
    {
      "id": 123,
      "filepath": "/photos/day1/IMG_1234.jpg",
      "filename": "IMG_1234.jpg",
      "folder": "day1",
      "rating": 0,
      "is_starred": false,
      "is_rejected": false,
      "taken_at": "2024-06-15T14:32:18",
      "width": 4000,
      "height": 3000,
      "is_representative": true,
      "notes": "",
      "exif_data": {
        "Make": "Canon",
        "Model": "EOS R5",
        "FNumber": 2.8,
        "ExposureTime": 0.004,
        "ISO": 400
      }
    }
  ],
  "count": 7
}
```

#### GET `/api/photos/{photo_id}`
Get single photo details.

**Response**: Same as photo object above, plus:
```json
{
  "cluster_size": 7
}
```

#### PUT `/api/photos/{photo_id}/star`
Toggle photo starred status.

**Request Body**:
```json
{
  "is_starred": true
}
```

**Response**:
```json
{
  "success": true,
  "photo_id": 123,
  "is_starred": true
}
```

#### PUT `/api/photos/{photo_id}/reject`
Toggle photo rejected status.

**Request Body**:
```json
{
  "is_rejected": true
}
```

#### PUT `/api/photos/{photo_id}/rating`
Update photo rating.

**Request Body**:
```json
{
  "rating": 5
}
```

#### GET `/api/image/{photo_id}`
Serve image file.

**Query Parameters**:
- `w` (int): Width for thumbnail (400, 1200, or omit for original)

**Response**: Image file (JPEG)

#### POST `/api/export/copy`
Start async export job.

**Request Body**:
```json
{
  "destination": "/path/to/export",
  "include_manifest": true
}
```

**Response**:
```json
{
  "job_id": "uuid-here",
  "total": 287
}
```

#### GET `/api/export/status/{job_id}`
Get export job status.

**Response**:
```json
{
  "status": "running",
  "progress": 143,
  "total": 287,
  "skipped": 12,
  "copied": 131,
  "error": null
}
```

#### GET `/api/export/filenames`
Download filename list.

**Response**: Text file

#### GET `/api/export/xmp`
Download XMP sidecars.

**Response**: ZIP file

#### POST `/api/reset-selections`
Reset all starred/rejected flags.

**Response**:
```json
{
  "success": true,
  "affected": 423
}
```

---

## Troubleshooting

### Out of Memory During Indexing

**Symptom**: Process killed or crashes during embedding generation

**Solution**: Reduce batch size
```bash
python index_photos.py --base-dir /photos --batch-size 16
```

### Slow Indexing

**Symptom**: Embedding generation very slow

**Solutions**:
1. Use GPU (10x faster)
2. Reduce image resolution (edit `index_photos.py`)
3. Use smaller CLIP model (less accurate)

### Too Many/Too Few Clusters

**Symptom**: Clusters too granular or too broad

**Solution**: Adjust clustering parameters in `index_photos.py`:

```python
# More clusters (tighter grouping)
HDBSCAN_MIN_CLUSTER_SIZE = 3
DBSCAN_EPS = 0.10

# Fewer clusters (looser grouping)
HDBSCAN_MIN_CLUSTER_SIZE = 2
DBSCAN_EPS = 0.20
```

Then re-cluster:
```bash
python index_photos.py --recluster
```

### Thumbnails Not Loading

**Symptom**: Gray boxes instead of photos

**Solutions**:
1. Check file permissions
2. Verify photos still exist at original paths
3. Clear thumbnail cache: `rm -rf thumbnails/`

### Database Locked Error

**Symptom**: "database is locked" error

**Solutions**:
1. Close other connections to database
2. Restart server
3. Check for zombie processes: `ps aux | grep python`

---

## FAQ

**Q: Can I use this with RAW files?**
A: Not directly. Convert RAW to JPEG first, or use RAW+JPEG workflow and index JPEGs.

**Q: Does it modify my original photos?**
A: No. All operations are read-only. Exports create copies.

**Q: Can multiple people review the same collection?**
A: Not simultaneously. Database doesn't support concurrent writes. Use separate databases or take turns.

**Q: How accurate is the clustering?**
A: Very good for similar shots (burst mode, same scene). Less perfect for semantically similar but visually different photos.

**Q: Can I undo selections?**
A: Yes. Click "Reset All Selections" in export modal, or manually unstar photos.

**Q: Does it work offline?**
A: Yes, completely offline. No internet required after initial model download.

**Q: Can I run this on a server?**
A: Yes, but add authentication. Change `host` in `server.py`:
```python
uvicorn.run(app, host="0.0.0.0", port=8000)
```

**Q: How do I backup my selections?**
A: Copy `photos.db` file. It contains all ratings and selections.

---

## Contributing

Contributions welcome! Areas for improvement:

- [ ] Mobile-responsive UI
- [ ] Video clip support
- [ ] Face detection/recognition
- [ ] Cloud storage integration (Google Photos, iCloud)
- [ ] Collaborative review (multi-user)
- [ ] Album layout preview
- [ ] Drag-and-drop reordering
- [ ] Batch operations (star all in cluster)
- [ ] Custom keyboard shortcuts
- [ ] Dark/light theme toggle

---

## License

MIT License - Free for personal and commercial use.

---

## Credits

- **CLIP**: OpenAI's Contrastive Language-Image Pre-training
- **HDBSCAN**: Leland McInnes et al.
- **FastAPI**: Sebastián Ramírez
- **Sentence Transformers**: UKPLab

---

**Made with ❤️ for anyone drowning in photos**

