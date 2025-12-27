# PicBest Feature Roadmap

## Target Niche
**Professional wedding/event photographers** who shoot 2000-5000+ images per job and need to deliver 300-500 curated photos quickly.

---

## Key Assumptions
- Photos are technically good (pro cameras don't produce blurry shots)
- Photographers know what they shot (no need for "find sunset" search)
- The problem is picking THE BEST from clusters of similar shots
- Expression/moment quality matters more than technical quality
- Client proofing needs to be infrastructure-light

---

## Feature Roadmap

### P0 - Core Improvements

#### 1. Compare Mode
**Status:** ✅ Complete
**Effort:** 1 week
**Value:** Core UX improvement for final selection decisions

Side-by-side or 2x2 grid to pick winner from similar shots.

```
┌──────────────────┬──────────────────┐
│                  │                  │
│    Photo A       │    Photo B       │
│                  │                  │
│  [Press 1]       │  [Press 2]       │
│                  │                  │
└──────────────────┴──────────────────┘
```

**Features:**
- 2-up and 4-up view modes
- Sync-zoom (compare faces at 100%)
- Keyboard driven: `1`/`2` to pick winner, `X` to reject both, `→` for next pair
- Works within a cluster (compare similar shots)
- Optional: tournament mode (bracket-style elimination)

**Implementation:**
- New modal view triggered from cluster
- Load 2-4 photos from same cluster
- Zoom state synced across panels
- Pan state synced (move one, all move)

---

#### 2. Batch Cluster Actions
**Status:** 🔴 Not Started
**Effort:** 3 days
**Value:** 10x speed boost for review workflow

Since clusters are the unit of work, add bulk operations:

| Shortcut | Action | Description |
|----------|--------|-------------|
| `B` | Star best | Auto-star top-ranked photo in cluster |
| `R` | Reject rest | Keep starred, reject all others |
| `Shift+R` | Reject cluster | Reject entire cluster |
| `Tab` | Skip cluster | Mark reviewed, no picks, next |
| `Shift+S` | Star all | Star every photo in cluster |

**Implementation:**
- Add keyboard handlers in modal view
- Add "best" ranking logic (initially: representative photo)
- Later: integrate with expression scoring for smarter "best" pick

---

### P1 - Smart Selection

#### 3. Expression Quality Scoring
**Status:** 🔴 Not Started
**Effort:** 2 weeks
**Value:** Auto-suggest best photo from each cluster

Within a cluster, rank photos by expression quality:

| Factor | Detection Method |
|--------|------------------|
| Eyes open | Face landmark detection (dlib/mediapipe) |
| Smiling | Facial expression classifier |
| Looking at camera | Eye gaze estimation |
| Group completeness | All faces visible, no one cut off |

**Output:**
- Each photo gets expression score 0-100
- Cluster shows "suggested best" badge
- One-click "accept all suggestions" for speed

**Implementation:**
- Use MediaPipe Face Mesh (lightweight, runs locally)
- Compute during indexing (add to embedding phase)
- Store scores in photos table
- Update representative selection to prefer high scores

**Models to evaluate:**
- MediaPipe Face Mesh (free, fast, good landmarks)
- dlib (free, reliable, slightly slower)
- InsightFace (more accurate, heavier)

---

### P2 - Client Delivery

#### 4. Static Gallery Export
**Status:** 🔴 Not Started
**Effort:** 1 week
**Value:** Client proofing with zero infrastructure cost

Generate a self-contained client gallery:

```
/export/client-gallery/
  ├── index.html          (standalone viewer app)
  ├── photos/
  │   ├── 001.jpg         (800px, ~100KB each)
  │   ├── 002.jpg
  │   └── ...
  ├── data.json           (photo metadata)
  └── selections.json     (client picks - editable)
```

**Features:**
- Standalone HTML viewer (no server needed)
- Web-quality images (~500MB for 5000 photos vs 100GB originals)
- Client can star/favorite photos
- Export selections.json
- Photographer imports picks back into PicBest

**Delivery options:**
- Upload to Dropbox/Google Drive/WeTransfer
- Self-host on photographer's website
- Share via USB drive

**Implementation:**
- New export endpoint `/api/export/gallery`
- Generate optimized JPEGs (800-1200px)
- Bundle minimal JS viewer (vanilla, no deps)
- Import endpoint to read selections.json

---

#### 5. Local Network Proofing
**Status:** 🔴 Not Started
**Effort:** 3 days
**Value:** Real-time client collaboration

```bash
python server.py --proofing --port 8080
# Share http://192.168.1.x:8080 with client
```

**Features:**
- Read-only mode for clients
- Client can star (stored separately from photographer picks)
- See client selections in real-time
- Optional: password protection

**Implementation:**
- Add `--proofing` flag to server
- Separate `client_starred` column or table
- Simple auth middleware (optional password)

---

### P3 - Polish Features

#### 6. Coverage Analysis
**Status:** 🔴 Not Started
**Effort:** 1 week
**Value:** Ensure complete story before delivery

Visual timeline showing photo distribution:

```
┌─────────────────────────────────────────┐
│  COVERAGE TIMELINE                      │
│                                         │
│  ██████████░░██████████████░░░██████   │
│  10am    12pm    2pm    4pm    6pm     │
│                                         │
│  ⚠️ Gap: 2:30pm - 3:15pm (45 min)      │
│  ℹ️ Heavy: 234 photos during ceremony   │
└─────────────────────────────────────────┘
```

**Features:**
- Timeline histogram of photos by hour
- Gap detection (>30 min with no photos)
- Heavy segment warnings
- Filter by clicking timeline segments

**Implementation:**
- Aggregate photos by `taken_at` hour
- Render as SVG/canvas histogram
- Click segment to filter grid

---

#### 7. Delivery Presets
**Status:** 🔴 Not Started
**Effort:** 1 week
**Value:** Guided selection for common deliverables

```
┌─────────────────────────────────────────┐
│  DELIVERY PRESETS                       │
│                                         │
│  📷 Full Gallery     (500 photos)       │
│  📱 Social Highlights (50 photos)       │
│  📖 Album Picks      (100 photos)       │
│  ⭐ Client Favorites  (varies)          │
│                                         │
│  [Auto-Select] based on:                │
│  - Coverage across timeline             │
│  - One per cluster minimum              │
│  - Expression scores                    │
└─────────────────────────────────────────┘
```

---

## Killed Ideas ❌

| Idea | Reason |
|------|--------|
| Sharpness/blur detection | Pro cameras don't produce blurry photos |
| Face tagging/identity | Requires whole identity system, unclear value |
| Natural language search | Photographers know what they shot |
| Cloud-hosted proofing | 100GB+ storage/bandwidth costs |

---

## Implementation Order

```
Week 1-2:   Compare Mode
Week 2:     Batch Cluster Actions
Week 3-4:   Expression Scoring (eyes/smile detection)
Week 5:     Static Gallery Export
Week 6:     Coverage Analysis
```

---

## Technical Notes

### Compare Mode Implementation
- Reuse existing modal component
- Add split-view layout option
- Sync zoom: store `{x, y, scale}` state, apply to all panels
- WebGL for smooth synchronized panning (optional optimization)

### Expression Scoring Implementation
- MediaPipe Face Mesh in Python
- Run during indexing (batch with embeddings)
- New columns: `face_count`, `eyes_open_score`, `smile_score`, `expression_score`
- Update clustering to weight expression scores

### Static Gallery Implementation
- Pillow for image resizing
- Jinja2 template for HTML viewer
- Single-file JS (~500 lines) for viewer functionality
- Progressive loading for large galleries

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Review speed (photos/hour) | ~500 | ~2000 |
| Time to deliver 5000→300 | 3-4 hours | 1 hour |
| Client revision rounds | 2-3 | 1 |

---

*Last updated: December 2024*

