# 🖼️ PicBest

**Intelligently filter thousands of photos down to your best shots.**

> **Want something simpler?** Try [PicBest Lite](#-PicBest-lite) - a single HTML file, no installation required!

---

## The Problem

After any big event – a wedding, vacation, or family gathering – you're left with **thousands of photos**. The task of selecting the best 200-300 for an album becomes overwhelming:

- 🔄 **Similar shots everywhere** – 10 photos of the same moment, which one is best?
- 👥 **Finding specific people** – Where are all the photos with grandma?
- 📅 **Timeline confusion** – Which day/event was this from?
- ⏰ **Time-consuming** – Manually reviewing 5000+ photos takes days

## The Solution

PicBest uses **AI-powered clustering** to organize your photos intelligently:

### ✨ Key Features

| Feature | Description |
|---------|-------------|
| 📁 **Directory Browser** | Browse your filesystem and select photo directories from the web UI |
| ⚡ **Live Indexing** | Photos appear immediately as they're indexed - no waiting for completion |
| 📊 **Real-time Progress** | Watch indexing progress with live updates on scanning, embedding, clustering |
| 🎯 **Smart Clustering** | Groups visually similar photos using CLIP embeddings, so you only review one from each "burst" |
| 📅 **Timeline View** | Photos organized by date and time, with visual separators for different events |
| ⭐ **Quick Starring** | Keyboard shortcuts for rapid photo selection (S to star, arrows to navigate) |
| 🔗 **Shareable Filters** | URL-based filters – share links like `?folder=day1&min_rating=3` |
| 🗄️ **Multi-Database** | Switch between different photo collections from a dropdown |
| 📤 **Easy Export** | Export starred photos to a folder, ready for your album |

### 🎬 How It Works

```
Start server → Browse directories → Select folder → Auto-index in background → Star favorites → Export
```

1. **Start Server** – Launch the web UI
2. **Browse** – Navigate your filesystem from the browser
3. **Select Directory** – Choose a folder with photos
4. **Auto-Index** – Background process scans, embeds, and clusters photos
5. **Review Live** – Photos appear immediately as indexing progresses
6. **Star Favorites** – Mark your best shots with keyboard shortcuts
7. **Export** – Copy starred photos to your album folder

---

## 🚀 Quick Start

### Prerequisites

- **macOS (Apple Silicon M1/M2/M3)** - See [Other Platforms](#other-platforms) below
- Python 3.11
- ~8GB RAM (for AI models)
- Your photos in a folder

### Installation (macOS Apple Silicon)

```bash
# Clone the repository
git clone https://github.com/yourusername/PicBest.git
cd PicBest

# Run the automated installer
./install_m1.sh
```

The script will:
- ✅ Check and install Python 3.11
- ✅ Install Xcode Command Line Tools (if needed)
- ✅ Install Homebrew dependencies (cmake)
- ✅ Create virtual environment
- ✅ Install all Python packages
- ✅ Test everything works

**Time:** ~5-10 minutes

### Other Platforms

<details>
<summary>Linux / Intel Mac / Windows</summary>

```bash
# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install system dependencies (Ubuntu/Debian)
sudo apt-get install cmake build-essential

# Install Python packages
pip install -r requirements.txt
```

</details>

### Usage

The new PicBest workflow is entirely web-based - no need to run command-line indexing first!

#### Quick Start Workflow

**Step 1: Start the Server**

```bash
source venv/bin/activate
python server.py
```

Open **http://localhost:8000** in your browser.

**Step 2: Browse & Select Photo Directory**

1. Click **"Browse & Index Photos"** button
2. Navigate through your filesystem to find your photos
3. See estimated photo counts for each folder
4. Click **"Index This Directory"** when you've found the right folder

**Step 3: Watch Live Progress**

- Indexing starts immediately in the background
- Progress banner shows real-time updates:
  - 📸 Scanning photos
  - 🧠 Computing embeddings
  - 🔗 Clustering similar photos
- Photos appear in the grid **as they're being indexed** - no need to wait!

**Step 4: Review & Star Photos**

| Action | Keyboard | Mouse |
|--------|----------|-------|
| Navigate clusters | `←` `→` | Click photo |
| Navigate in cluster | `↑` `↓` | Click thumbnail |
| Star/unstar | `S` or `Space` | Click ★ button |
| Close modal | `Esc` | Click × |

**Step 5: Export Starred Photos**

```bash
python export_starred.py --output /path/to/album/folder

# Options:
#   --copy          Copy files (default)
#   --move          Move files instead
#   --organize      Organize by date folders
```

#### Advanced: Command-Line Indexing

If you prefer the old workflow, you can still index from command line:

```bash
# Index a specific directory
python index_photos.py --base-dir /path/to/your/photos

# Then start the server
python server.py
```

---

## 🔧 Troubleshooting

### Out of Memory

Reduce batch size in `index_photos.py`:

```python
BATCH_SIZE = 32  # Reduce to 16 or 8 if needed
```

---

## 🖼️ Use Cases

| Event | Photos | After PicBest |
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
```

### Re-clustering

If you want to adjust clustering without re-indexing:

```bash
python index_photos.py --recluster
```

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | Python, FastAPI, SQLite |
| **AI/ML** | CLIP (OpenAI), scikit-learn |
| **Frontend** | Vanilla JS, CSS Grid |
| **Image Processing** | Pillow, imagehash |

### Why These Choices?

- **CLIP** – State-of-the-art image understanding, groups photos by semantic content
- **SQLite** – Zero-config database, perfect for local tool
- **Vanilla JS** – No build step, easy to modify

---

## 📁 Project Structure

```
PicBest/
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
- [FastAPI](https://fastapi.tiangolo.com/) – For the excellent web framework

---

## 🪶 PicBest Lite

Don't need AI clustering? Just want to quickly star and export photos?

**PicBest Lite** is a single HTML file – no installation, no server, no dependencies.

### Features
- 📁 Select any folder from your computer
- ⭐ Star/unstar photos with click or keyboard
- 🔍 Search by filename
- 📤 Export starred photos to a new folder
- 💾 Starred selections saved in browser

### Usage

1. Open `PicBest-lite.html` in **Chrome or Edge**
2. Click "Select Photo Folder"
3. Star your favorites (`S` or `Space`)
4. Click "Export Starred" to copy them

### Browser Support

| Browser | Supported |
|---------|-----------|
| Chrome | ✅ |
| Edge | ✅ |
| Firefox | ❌ |
| Safari | ❌ |

> Uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) which is only available in Chromium browsers.

---

**Made with ❤️ for anyone drowning in photos**
