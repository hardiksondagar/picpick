# 🖼️ PicPick

**Intelligently filter thousands of photos down to your best shots.**

---

## The Problem

After any big event – a wedding, vacation, or family gathering – you're left with **thousands of photos**. The task of selecting the best 200-300 for an album becomes overwhelming:

- 🔄 **Similar shots everywhere** – 10 photos of the same moment, which one is best?
- 👥 **Finding specific people** – Where are all the photos with grandma?
- 📅 **Timeline confusion** – Which day/event was this from?
- ⏰ **Time-consuming** – Manually reviewing 5000+ photos takes days

## The Solution

PicPick uses **AI-powered clustering** and **face recognition** to organize your photos intelligently:

### ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🎯 **Smart Clustering** | Groups visually similar photos using CLIP embeddings, so you only review one from each "burst" |
| 👤 **Face Recognition** | Automatically identifies people across all photos – filter by person instantly |
| 📅 **Timeline View** | Photos organized by date and time, with visual separators for different events |
| ⭐ **Quick Starring** | Keyboard shortcuts for rapid photo selection (S to star, arrows to navigate) |
| 🔗 **Shareable Filters** | URL-based filters – share links like `?person=123&folder=day1` |
| 📤 **Easy Export** | Export starred photos to a folder, ready for your album |

### 🎬 How It Works

```
5000 photos → AI Clustering → ~1000 unique moments → Star your favorites → Export 250-300
```

1. **Index** – Scans all photos, extracts metadata and generates AI embeddings
2. **Cluster** – Groups similar photos by visual content + timestamp + faces
3. **Review** – Web UI shows one photo per cluster, organized by date/time
4. **Star** – Quickly mark your favorites with keyboard shortcuts
5. **Export** – Copy starred photos to your album folder

---

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- ~8GB RAM (for AI models)
- Your photos in a folder

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/picpick.git
cd picpick

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# For face recognition (optional, requires cmake)
brew install cmake  # macOS
pip install face_recognition
```

### Usage

#### Step 1: Add Your Photos

```bash
# Option A: Copy/symlink photos to the default folder
mkdir photos
cp -r /path/to/your/photos/* ./photos/
# or symlink:
ln -s /path/to/your/photos ./photos
```

#### Step 2: Index Your Photos

```bash
# Run indexer (uses ./photos by default)
python index_photos.py

# Or specify a custom directory:
python index_photos.py --base-dir /path/to/your/photos

# This will:
# - Scan all JPG/JPEG/PNG files
# - Extract EXIF metadata (dates, dimensions)
# - Generate AI embeddings using CLIP
# - Cluster similar photos together
# - Detect faces and identify unique people
```

**First run takes ~30-60 minutes** for 5000 photos (subsequent runs are faster).

#### Step 3: Launch the Web UI

```bash
python server.py
```

Open **http://localhost:8000** in your browser.

#### Step 4: Review & Star Photos

| Action | Keyboard | Mouse |
|--------|----------|-------|
| Navigate clusters | `←` `→` | Click photo |
| Navigate in cluster | `↑` `↓` | Click thumbnail |
| Star/unstar | `S` or `Space` | Click ★ button |
| Close modal | `Esc` | Click × |

#### Step 5: Export Starred Photos

```bash
python export_starred.py --output /path/to/album/folder

# Options:
#   --copy          Copy files (default)
#   --move          Move files instead
#   --organize      Organize by date folders
```

---

## 🖼️ Use Cases

| Event | Photos | After PicPick |
|-------|--------|---------------|
| Wedding | 5,000+ | ~300 for album |
| Vacation | 2,000+ | ~200 highlights |
| Birthday Party | 500+ | ~50 best moments |
| Conference | 1,000+ | ~100 key shots |

---

## ⚙️ Configuration

### Clustering Parameters

Edit `index_photos.py` to adjust:

```python
DBSCAN_EPS = 0.08           # Lower = tighter clusters (more groups)
DBSCAN_MIN_SAMPLES = 1      # Minimum photos per cluster
MIN_FACE_SIZE = 50          # Ignore faces smaller than this (pixels)
```

### Re-clustering

If you want to adjust clustering without re-indexing:

```bash
python index_photos.py --recluster
```

### Face Detection Only

To run just face detection (after initial indexing):

```bash
python index_photos.py --faces
```

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | Python, FastAPI, SQLite |
| **AI/ML** | CLIP (OpenAI), face_recognition, scikit-learn |
| **Frontend** | Vanilla JS, CSS Grid |
| **Image Processing** | Pillow, imagehash |

### Why These Choices?

- **CLIP** – State-of-the-art image understanding, groups photos by semantic content
- **face_recognition** – Accurate face detection using dlib's CNN model
- **SQLite** – Zero-config database, perfect for local tool
- **Vanilla JS** – No build step, easy to modify

---

## 📁 Project Structure

```
picpick/
├── index_photos.py      # Photo indexing and clustering
├── server.py            # FastAPI web server
├── export_starred.py    # Export starred photos
├── requirements.txt     # Python dependencies
├── photos.db           # SQLite database (generated)
├── thumbnails/         # Cached thumbnails (generated)
└── static/
    ├── index.html      # Web UI
    ├── app.js          # Frontend logic
    └── style.css       # Styles
```

---

## 🤝 Contributing

Contributions are welcome! Some ideas:

- [ ] Drag-and-drop photo reordering
- [ ] Album layout preview
- [ ] Cloud storage integration (Google Photos, iCloud)
- [ ] Batch face naming
- [ ] Mobile-responsive UI
- [ ] Video clip support

### Development

```bash
# Run with auto-reload
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

---

## 📄 License

MIT License – Use it for personal projects, weddings, vacations, or commercially.

---

## 🙏 Acknowledgments

- [OpenAI CLIP](https://github.com/openai/CLIP) – For incredible image embeddings
- [face_recognition](https://github.com/ageitgey/face_recognition) – For simple face detection API
- [FastAPI](https://fastapi.tiangolo.com/) – For the excellent web framework

---

**Made with ❤️ for anyone drowning in photos**
