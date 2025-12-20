/**
 * PicBest - Smart Photo Curator - Frontend Application
 */

// ============================================
// State Management
// ============================================

const state = {
    clusters: [],
    currentPage: 1,
    totalPages: 1,
    perPage: 50,
    loading: false,
    hasMore: true,
    lastRenderedDate: null,
    lastRenderedTime: null,

    // Filters
    folder: '',
    starredOnly: false,
    rejectedOnly: false,

    // Modal
    modalOpen: false,
    currentClusterIndex: -1,
    currentPhotoIndex: 0,
    clusterPhotos: [],

    // Selection (for keyboard nav)
    selectedIndex: -1,

    // Stats
    stats: {},

    // Directory browser
    currentDirectory: null,

    // Indexing
    indexingActive: false,
    indexingPollInterval: null,
    lastSeenPhotoCount: 0
};

// ============================================
// API Functions
// ============================================

const api = {
    async getIndexingStatus() {
        const res = await fetch('/api/index/status');
        return res.json();
    },

    async getStats() {
        const res = await fetch('/api/stats');
        return res.json();
    },

    async getClusters(page = 1) {
        const params = new URLSearchParams({ page, per_page: state.perPage });

        if (state.folder) params.set('folder', state.folder);
        if (state.starredOnly) params.set('starred_only', 'true');
        if (state.rejectedOnly) params.set('rejected_only', 'true');

        const res = await fetch(`/api/clusters?${params}`);
        return res.json();
    },

    async getClusterPhotos(clusterId) {
        const res = await fetch(`/api/clusters/${clusterId}/photos`);
        return res.json();
    },

    async updateRating(photoId, rating) {
        const res = await fetch(`/api/photos/${photoId}/rating`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating })
        });
        return res.json();
    },

    async updateStar(photoId, isStarred) {
        const res = await fetch(`/api/photos/${photoId}/star`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_starred: isStarred })
        });
        return res.json();
    },

    async updateReject(photoId, isRejected) {
        const res = await fetch(`/api/photos/${photoId}/reject`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_rejected: isRejected })
        });
        return res.json();
    },

    async updateClusterRating(clusterId, rating) {
        const res = await fetch(`/api/clusters/${clusterId}/rating`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating })
        });
        return res.json();
    }
};

// ============================================
// DOM Elements
// ============================================

const elements = {
    grid: document.getElementById('photo-grid'),
    loading: document.getElementById('loading'),
    loadMoreTrigger: document.getElementById('load-more-trigger'),

    // Empty state
    emptyState: document.getElementById('empty-state'),
    browsePhotosBtn: document.getElementById('browse-photos-btn'),

    // Indexing banner
    indexingBanner: document.getElementById('indexing-banner'),
    indexingPhase: document.getElementById('indexing-phase'),
    indexingProgress: document.getElementById('indexing-progress'),
    indexingMessage: document.getElementById('indexing-message'),
    indexingProgressBar: document.getElementById('indexing-progress-bar'),

    // Directory browser
    directoryModal: document.getElementById('directory-browser-modal'),
    dirModalClose: document.getElementById('dir-modal-close'),
    dirBreadcrumb: document.getElementById('dir-breadcrumb'),
    directoryList: document.getElementById('directory-list'),
    selectDirectoryBtn: document.getElementById('select-directory-btn'),
    dirCancelBtn: document.getElementById('dir-cancel-btn'),

    // Stats
    statTotal: document.getElementById('stat-total'),
    statClusters: document.getElementById('stat-clusters'),
    statStarred: document.getElementById('stat-starred'),
    statRejected: document.getElementById('stat-rejected'),
    statProgress: document.getElementById('stat-progress'),
    progressBar: document.getElementById('progress-bar'),
    progressText: document.getElementById('progress-text'),

    // Filters
    filterFolder: document.getElementById('filter-folder'),
    filterStarred: document.getElementById('filter-starred'),
    filterRejected: document.getElementById('filter-rejected'),
    helpBtn: document.getElementById('help-btn'),
    helpTooltip: document.getElementById('help-tooltip'),

    // Export
    exportBtn: document.getElementById('export-btn'),
    exportModal: document.getElementById('export-modal'),
    exportModalClose: document.getElementById('export-modal-close'),
    exportStarredBtn: document.getElementById('export-starred-btn'),
    exportRejectedBtn: document.getElementById('export-rejected-btn'),
    exportResults: document.getElementById('export-results'),
    exportMessage: document.getElementById('export-message'),
    starredCount: document.getElementById('starred-count'),
    rejectedCount: document.getElementById('rejected-count'),

    // Modal
    modal: document.getElementById('photo-modal'),
    modalImage: document.getElementById('modal-image'),
    modalFilename: document.getElementById('modal-filename'),
    modalFolder: document.getElementById('modal-folder'),
    modalDatetime: document.getElementById('modal-datetime'),
    modalDimensions: document.getElementById('modal-dimensions'),
    modalCluster: document.getElementById('modal-cluster'),
    modalExif: document.getElementById('modal-exif'),
    modalExifToggle: document.getElementById('modal-exif-toggle'),
    modalExifDetails: document.getElementById('modal-exif-details'),
    modalExifArrow: document.getElementById('modal-exif-arrow'),
    modalStarToggle: document.getElementById('modal-star-toggle'),
    modalRejectToggle: document.getElementById('modal-reject-toggle'),
    modalClose: document.getElementById('modal-close'),
    modalPrev: document.getElementById('modal-prev'),
    modalNext: document.getElementById('modal-next'),
    clusterCount: document.getElementById('cluster-count'),
    clusterGrid: document.getElementById('cluster-grid')
};

// ============================================
// Rendering Functions
// ============================================

function renderStats() {
    const { stats } = state;

    elements.statTotal.textContent = stats.total_photos?.toLocaleString() || 0;
    elements.statClusters.textContent = stats.total_clusters?.toLocaleString() || 0;
    elements.statStarred.textContent = stats.starred_photos?.toLocaleString() || 0;
    elements.statRejected.textContent = stats.rejected_photos?.toLocaleString() || 0;

    // Progress percentage in top bar
    const progress = stats.total_photos > 0
        ? Math.round((stats.starred_photos + stats.rejected_photos) / stats.total_photos * 100)
        : 0;
    elements.statProgress.textContent = `${progress}%`;

    // Progress bar (keep for visual indicator)
    elements.progressBar.style.width = `${progress}%`;
    elements.progressText.textContent = `${progress}% reviewed`;

    // Populate folder filter
    if (stats.folders && elements.filterFolder.options.length <= 1) {
        stats.folders.forEach(f => {
            const option = document.createElement('option');
            option.value = f.name;
            option.textContent = `${f.name} (${f.count})`;
            elements.filterFolder.appendChild(option);
        });
    }

}

function createPhotoCard(cluster, index) {
    const photo = cluster.representative;
    const card = document.createElement('div');
    card.className = 'photo-card relative aspect-square rounded-xl overflow-hidden cursor-pointer transition-all duration-200 bg-slate-800 shadow-lg hover:shadow-2xl hover:shadow-primary/20 hover:-translate-y-1 hover:scale-[1.02]';
    card.dataset.index = index;
    card.dataset.clusterId = cluster.cluster_id;
    card.dataset.photoId = photo.id;

    const clusterBadge = cluster.photo_count > 1
        ? `<div class="absolute bottom-3 right-3 px-2 py-1 bg-slate-900/80 backdrop-blur-sm border border-slate-700 rounded-full flex items-center gap-1 text-xs font-semibold text-white">
            <i class="fa-solid fa-layer-group text-sm"></i>
            <span>${cluster.photo_count}</span>
        </div>`
        : '';

    card.innerHTML = `
        <img src="/api/image/${photo.id}?w=400" alt="${photo.filename}" loading="lazy" class="w-full h-full object-cover">
        <div class="photo-card-overlay absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent opacity-0 transition-opacity duration-200"></div>
        ${clusterBadge}
        <div class="photo-card-info absolute bottom-0 left-0 right-0 p-4 transform translate-y-full transition-transform duration-200">
            <div class="text-sm font-semibold text-white mb-1 truncate">${photo.filename}</div>
            <div class="text-xs text-slate-400">${photo.folder}</div>
        </div>
    `;

    card.addEventListener('click', () => openModal(index));

    return card;
}

function renderGrid(append = false) {
    if (!append) {
        elements.grid.innerHTML = '';
        state.lastRenderedDate = null;
        state.lastRenderedTime = null;
    }

    let cardIndex = elements.grid.querySelectorAll('.photo-card').length;

    state.clusters.slice(cardIndex).forEach((cluster) => {
        const photo = cluster.representative;
        const photoTimestamp = photo.taken_at ? new Date(photo.taken_at) : null;

        const photoDate = photoTimestamp ? photoTimestamp.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }) : 'Unknown Date';

        // Insert date separator if date changed
        if (photoDate !== state.lastRenderedDate) {
            const dateSeparator = document.createElement('div');
            dateSeparator.className = 'col-span-full text-center my-4';
            dateSeparator.innerHTML = `<span class="inline-block px-6 py-2 bg-gradient-primary text-white font-semibold text-sm rounded-full !border-0 !outline-none !ring-0 shadow-lg">${photoDate}</span>`;
            elements.grid.appendChild(dateSeparator);
            state.lastRenderedDate = photoDate;
            state.lastRenderedTime = photoTimestamp; // Reset time tracking for new date
        }
        // Insert time separator if >30 min gap within same day
        else if (photoTimestamp && state.lastRenderedTime) {
            const timeDiff = (photoTimestamp - state.lastRenderedTime) / (1000 * 60); // minutes
            if (timeDiff > 30) {
                const timeStr = photoTimestamp.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
                const timeSeparator = document.createElement('div');
                timeSeparator.className = 'col-span-full text-center my-4';
                timeSeparator.innerHTML = `<span class="inline-block px-6 py-2 bg-slate-800 border border-slate-700 text-slate-400 font-semibold text-xs rounded-full">⏱ ${timeStr}</span>`;
                elements.grid.appendChild(timeSeparator);
            }
        }

        if (photoTimestamp) {
            state.lastRenderedTime = photoTimestamp;
        }

        const card = createPhotoCard(cluster, cardIndex);
        elements.grid.appendChild(card);
        cardIndex++;
    });

    // Only update selection on initial load, not when appending
    if (!append) {
        updateSelection();
    }
}

function updateCardInGrid(clusterIndex) {
    const cluster = state.clusters[clusterIndex];
    if (!cluster) return;

    const card = elements.grid.children[clusterIndex];
    if (!card) return;

    const photo = cluster.representative;

    // Update star
    let starEl = card.querySelector('.photo-card-star');
    if (photo.is_starred && !starEl) {
        starEl = document.createElement('div');
        starEl.className = 'photo-card-star';
        starEl.textContent = '★';
        card.appendChild(starEl);
    } else if (!photo.is_starred && starEl) {
        starEl.remove();
    }
}

function updateSelection() {
    // Get all photo cards (excluding date separators)
    const photoCards = Array.from(elements.grid.querySelectorAll('.photo-card'));

    // Remove previous selection
    photoCards.forEach(el => {
        el.classList.remove('ring-4', 'ring-primary');
    });

    // Add new selection - only target photo cards, not date separators
    if (state.selectedIndex >= 0 && state.selectedIndex < photoCards.length) {
        const card = photoCards[state.selectedIndex];
        if (card && card.classList.contains('photo-card')) {
            card.classList.add('ring-4', 'ring-primary');
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

// ============================================
// Modal Functions
// ============================================

async function openModal(clusterIndex) {
    state.currentClusterIndex = clusterIndex;
    state.selectedIndex = clusterIndex;
    updateSelection();

    const cluster = state.clusters[clusterIndex];
    if (!cluster) return;

    // Load cluster photos
    const data = await api.getClusterPhotos(cluster.cluster_id);
    state.clusterPhotos = data.photos;

    // Find the photo index that matches the current filter
    let startIndex = 0;

    if (state.starredOnly) {
        // Find first starred photo in cluster
        startIndex = state.clusterPhotos.findIndex(p => p.is_starred);
        if (startIndex === -1) startIndex = 0; // Fallback if none found
    } else if (state.rejectedOnly) {
        // Find first rejected photo in cluster
        startIndex = state.clusterPhotos.findIndex(p => p.is_rejected);
        if (startIndex === -1) startIndex = 0; // Fallback if none found
    } else {
        // No filter - open to representative photo if possible
        startIndex = state.clusterPhotos.findIndex(p => p.is_representative);
        if (startIndex === -1) startIndex = 0; // Fallback to first photo
    }

    state.currentPhotoIndex = startIndex;

    state.modalOpen = true;
    elements.modal.classList.remove('hidden');
    elements.modal.classList.add('flex');
    document.body.style.overflow = 'hidden';

    renderModalContent();
    renderClusterThumbnails();
}

function closeModal() {
    state.modalOpen = false;
    elements.modal.classList.add('hidden');
    elements.modal.classList.remove('flex');
    document.body.style.overflow = '';
}

function renderModalContent() {
    const photo = state.clusterPhotos[state.currentPhotoIndex];
    if (!photo) return;

    // Image (1200px for modal view)
    elements.modalImage.src = `/api/image/${photo.id}?w=1200`;

    // Info
    elements.modalFilename.textContent = photo.filename;
    elements.modalFolder.textContent = `📁 ${photo.folder}`;
    elements.modalDatetime.textContent = photo.taken_at
        ? `📅 ${new Date(photo.taken_at).toLocaleString()}`
        : '📅 Unknown date';
    elements.modalDimensions.textContent = `📐 ${photo.width} × ${photo.height}`;
    elements.modalCluster.textContent = `📷 Photo ${state.currentPhotoIndex + 1} of ${state.clusterPhotos.length} in cluster`;

    // EXIF data
    if (photo.exif_data && Object.keys(photo.exif_data).length > 0) {
        elements.modalExif.classList.remove('hidden');
        renderExifData(photo.exif_data);
    } else {
        elements.modalExif.classList.add('hidden');
    }

    // Star toggle (Select)
    if (photo.is_starred) {
        elements.modalStarToggle.className = 'flex-1 px-5 py-3.5 bg-green-600 border-2 border-green-500 rounded-xl text-white font-bold transition-all flex items-center justify-center gap-2';
        elements.modalStarToggle.innerHTML = `
            <i class="fa-solid fa-thumbs-up text-lg"></i>
            <span>Selected</span>
        `;
    } else {
        elements.modalStarToggle.className = 'flex-1 px-5 py-3.5 bg-slate-700/50 border-2 border-slate-600/50 rounded-xl text-slate-100 font-bold hover:border-green-400 hover:bg-green-600 hover:shadow-glow transition-all flex items-center justify-center gap-2';
        elements.modalStarToggle.innerHTML = `
            <i class="fa-solid fa-thumbs-up text-lg"></i>
            <span>Select</span>
        `;
    }

    // Reject toggle
    if (photo.is_rejected) {
        elements.modalRejectToggle.className = 'flex-1 px-5 py-3.5 bg-red-600 border-2 border-red-500 rounded-xl text-white font-bold transition-all flex items-center justify-center gap-2';
        elements.modalRejectToggle.innerHTML = `
            <i class="fa-solid fa-thumbs-down text-lg"></i>
            <span>Rejected</span>
        `;
    } else {
        elements.modalRejectToggle.className = 'flex-1 px-5 py-3.5 bg-slate-700/50 border-2 border-slate-600/50 rounded-xl text-slate-100 font-bold hover:border-red-400 hover:bg-red-600 hover:shadow-glow transition-all flex items-center justify-center gap-2';
        elements.modalRejectToggle.innerHTML = `
            <i class="fa-solid fa-thumbs-down text-lg"></i>
            <span>Reject</span>
        `;
    }

    // Update cluster thumbnail selection
    updateClusterThumbnailSelection();
}

function renderExifData(exif) {
    const interesting = {
        'Make': '📷',
        'Model': '📷',
        'LensModel': '🔍',
        'FNumber': '⚪',
        'ExposureTime': '⏱️',
        'ISO': '🎞️',
        'ISOSpeedRatings': '🎞️',
        'FocalLength': '📏',
        'Flash': '⚡',
        'Orientation': '🔄'
    };

    const html = Object.entries(interesting)
        .filter(([key]) => exif[key] !== undefined)
        .map(([key, icon]) => {
            let value = exif[key];

            // Format specific values
            if (key === 'ExposureTime' && typeof value === 'number') {
                value = value < 1 ? `1/${Math.round(1/value)}s` : `${value}s`;
            } else if (key === 'FNumber' && typeof value === 'number') {
                value = `f/${value}`;
            } else if (key === 'FocalLength' && typeof value === 'number') {
                value = `${value}mm`;
            } else if ((key === 'ISO' || key === 'ISOSpeedRatings') && Array.isArray(value)) {
                value = `ISO ${value[0]}`;
            } else if (key === 'Flash') {
                value = value === 0 ? 'Off' : 'On';
            }

            return `<div>${icon} ${key}: <span class="text-slate-300">${value}</span></div>`;
        })
        .join('');

    elements.modalExifDetails.innerHTML = html || '<div class="text-slate-500">No camera data available</div>';
}

function renderClusterThumbnails() {
    elements.clusterCount.textContent = state.clusterPhotos.length;
    elements.clusterGrid.innerHTML = '';

    state.clusterPhotos.forEach((photo, i) => {
        const thumb = document.createElement('div');
        const isCurrentClasses = i === state.currentPhotoIndex ? 'ring-2 ring-primary' : '';
        thumb.className = `relative aspect-square rounded-lg overflow-hidden cursor-pointer transition-all duration-200 border-2 border-transparent hover:border-primary hover:scale-105 ${isCurrentClasses}`;
        thumb.dataset.index = i;
        thumb.dataset.photoId = photo.id;

        // Show selected badge (green thumb up) or rejected badge (red thumb down)
        let badge = '';
        if (photo.is_starred) {
            badge = `
                <div class="absolute top-1 right-1 bg-black/70 rounded-full w-6 h-6 flex items-center justify-center">
                    <i class="fa-solid fa-thumbs-up text-emerald-500 text-sm"></i>
                </div>
            `;
        } else if (photo.is_rejected) {
            badge = `
                <div class="absolute top-1 right-1 bg-black/70 rounded-full w-6 h-6 flex items-center justify-center">
                    <i class="fa-solid fa-thumbs-down text-rose-500 text-sm"></i>
                </div>
            `;
        }

        thumb.innerHTML = `
            <img src="/api/image/${photo.id}?w=400" alt="" loading="lazy" class="w-full h-full object-cover">
            ${badge}
        `;

        // Click image to select - use dataset.index or photo ID to ensure correct photo
        thumb.addEventListener('click', (e) => {
            const clickedIndex = parseInt(thumb.dataset.index);
            const photoId = parseInt(thumb.dataset.photoId);

            // Verify index is valid, or find by photo ID as fallback
            let targetIndex = clickedIndex;
            if (clickedIndex < 0 || clickedIndex >= state.clusterPhotos.length ||
                state.clusterPhotos[clickedIndex]?.id !== photoId) {
                // Index mismatch, find by photo ID
                targetIndex = state.clusterPhotos.findIndex(p => p.id === photoId);
            }

            if (targetIndex >= 0 && targetIndex < state.clusterPhotos.length) {
                state.currentPhotoIndex = targetIndex;
                renderModalContent();
            }
        });

        elements.clusterGrid.appendChild(thumb);
    });

    // Scroll selected into view
    scrollToSelectedThumb();
}

function updateClusterThumbnailSelection() {
    const thumbs = elements.clusterGrid.querySelectorAll('[data-index]');
    thumbs.forEach((thumb, i) => {
        // Update ring state
        if (i === state.currentPhotoIndex) {
            thumb.classList.add('ring-2', 'ring-primary');
        } else {
            thumb.classList.remove('ring-2', 'ring-primary');
        }
    });
    scrollToSelectedThumb();
}

function scrollToSelectedThumb() {
    const selected = elements.clusterGrid.querySelector('.ring-primary');
    if (selected) {
        selected.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function navigateModal(direction) {
    if (!state.modalOpen) return;

    if (direction === 'next-photo') {
        // Next photo in cluster
        if (state.currentPhotoIndex < state.clusterPhotos.length - 1) {
            state.currentPhotoIndex++;
            renderModalContent();
        }
    } else if (direction === 'prev-photo') {
        // Previous photo in cluster
        if (state.currentPhotoIndex > 0) {
            state.currentPhotoIndex--;
            renderModalContent();
        }
    } else if (direction === 'next-cluster') {
        // Next cluster
        if (state.currentClusterIndex < state.clusters.length - 1) {
            openModal(state.currentClusterIndex + 1);
        }
    } else if (direction === 'prev-cluster') {
        // Previous cluster
        if (state.currentClusterIndex > 0) {
            openModal(state.currentClusterIndex - 1);
        }
    }
}

// ============================================
// Rating Functions
// ============================================

async function toggleStar() {
    const photo = state.clusterPhotos[state.currentPhotoIndex];
    if (!photo) return;

    const newValue = !photo.is_starred;
    await api.updateStar(photo.id, newValue);
    photo.is_starred = newValue;

    // If starring, un-reject
    if (newValue && photo.is_rejected) {
        await api.updateReject(photo.id, false);
        photo.is_rejected = false;
    }

    // Update cluster representative if this is the rep
    const cluster = state.clusters[state.currentClusterIndex];
    if (cluster && cluster.representative.id === photo.id) {
        cluster.representative.is_starred = newValue;
        cluster.representative.is_rejected = photo.is_rejected;
        updateCardInGrid(state.currentClusterIndex);
    }

    renderModalContent();
    renderClusterThumbnails(); // Update thumbnail badges
    refreshStats();
}

async function toggleReject() {
    const photo = state.clusterPhotos[state.currentPhotoIndex];
    if (!photo) return;

    const newValue = !photo.is_rejected;
    await api.updateReject(photo.id, newValue);
    photo.is_rejected = newValue;

    // If rejecting, un-star
    if (newValue && photo.is_starred) {
        await api.updateStar(photo.id, false);
        photo.is_starred = false;
    }

    // Update cluster representative if this is the rep
    const cluster = state.clusters[state.currentClusterIndex];
    if (cluster && cluster.representative.id === photo.id) {
        cluster.representative.is_rejected = newValue;
        cluster.representative.is_starred = photo.is_starred;
        updateCardInGrid(state.currentClusterIndex);
    }

    renderModalContent();
    renderClusterThumbnails(); // Update thumbnail badges
    refreshStats();
}

async function refreshStats() {
    state.stats = await api.getStats();
    renderStats();
}

// Directory browser removed - run indexing manually via CLI

// ============================================
// Indexing Progress Functions
// ============================================

function startIndexingProgressPoll() {
    state.indexingActive = true;
    elements.indexingBanner.classList.remove('hidden');
    elements.emptyState.classList.add('hidden');

    pollIndexingStatus();
}

async function pollIndexingStatus() {
    if (!state.indexingActive) return;

    try {
        const status = await api.getIndexingStatus();

        if (status.active) {
            updateIndexingUI(status.progress);

            // Check if new photos have been added
            const currentStats = await api.getStats();
            if (currentStats.total_photos > state.lastSeenPhotoCount) {
                state.lastSeenPhotoCount = currentStats.total_photos;
                // Reload grid to show new photos
                await loadClusters(true);
            }

            // Continue polling
            state.indexingPollInterval = setTimeout(pollIndexingStatus, 2000);
        } else {
            // Indexing complete
            stopIndexingProgressPoll();
            await loadClusters(); // Full reload
            await refreshStats();
        }
    } catch (err) {
        console.error('Failed to poll indexing status:', err);
        stopIndexingProgressPoll();
    }
}

function updateIndexingUI(progress) {
    const phaseNames = {
        'starting': '🔄 Starting...',
        'scanning': '📸 Scanning photos',
        'embedding': '🧠 Computing embeddings',
        'clustering': '🔗 Clustering similar photos',
        'complete': '✅ Complete'
    };

    elements.indexingPhase.textContent = phaseNames[progress.phase] || progress.phase;
    elements.indexingProgress.textContent = `${progress.current} / ${progress.total} (${progress.percent}%)`;
    elements.indexingMessage.textContent = progress.message || '';
    elements.indexingProgressBar.style.width = `${progress.percent}%`;
}

function stopIndexingProgressPoll() {
    state.indexingActive = false;
    elements.indexingBanner.classList.add('hidden');

    if (state.indexingPollInterval) {
        clearTimeout(state.indexingPollInterval);
        state.indexingPollInterval = null;
    }
}

// Cancel indexing removed - run indexing manually via CLI

// ============================================
// Data Loading
// ============================================

async function loadClusters(append = false) {
    if (state.loading) return;

    state.loading = true;
    elements.loading.classList.remove('hidden');

    try {
        const page = append ? state.currentPage + 1 : 1;
        const data = await api.getClusters(page);

        if (append) {
            state.clusters = [...state.clusters, ...data.clusters];
        } else {
            state.clusters = data.clusters;
            state.selectedIndex = data.clusters.length > 0 ? 0 : -1;
        }

        state.currentPage = data.page;
        state.totalPages = data.total_pages;
        state.hasMore = data.page < data.total_pages;

        renderGrid(append);
    } catch (err) {
        console.error('Failed to load clusters:', err);
    } finally {
        state.loading = false;
        elements.loading.classList.add('hidden');
    }
}

async function resetAndLoad() {
    state.currentPage = 1;
    state.clusters = [];
    state.hasMore = true;
    updateURL();
    await loadClusters();
}

// ============================================
// Event Handlers
// ============================================

function setupEventListeners() {
    // Indexing controls removed - run indexing manually via CLI

    // Filter changes
    elements.filterFolder.addEventListener('change', (e) => {
        state.folder = e.target.value;
        resetAndLoad();
    });

    elements.filterStarred.addEventListener('click', () => {
        state.starredOnly = !state.starredOnly;
        if (state.starredOnly) {
            state.rejectedOnly = false; // Can't show both
            elements.filterRejected.classList.remove('text-red-400');
            elements.filterRejected.classList.add('text-slate-400');

            elements.filterStarred.classList.remove('text-slate-400');
            elements.filterStarred.classList.add('text-green-400');
        } else {
            elements.filterStarred.classList.remove('text-green-400');
            elements.filterStarred.classList.add('text-slate-400');
        }
        resetAndLoad();
    });

    elements.filterRejected.addEventListener('click', () => {
        state.rejectedOnly = !state.rejectedOnly;
        if (state.rejectedOnly) {
            state.starredOnly = false; // Can't show both
            elements.filterStarred.classList.remove('text-green-400');
            elements.filterStarred.classList.add('text-slate-400');

            elements.filterRejected.classList.remove('text-slate-400');
            elements.filterRejected.classList.add('text-red-400');
        } else {
            elements.filterRejected.classList.remove('text-red-400');
            elements.filterRejected.classList.add('text-slate-400');
        }
        resetAndLoad();
    });

    // Help button toggle
    if (elements.helpBtn && elements.helpTooltip) {
        const helpContainer = elements.helpBtn.closest('.relative');

        elements.helpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.helpTooltip.classList.toggle('hidden');
        });

        // Close help tooltip when clicking outside
        document.addEventListener('click', (e) => {
            if (!helpContainer.contains(e.target)) {
                elements.helpTooltip.classList.add('hidden');
            }
        });
    }

    // Export button
    elements.exportBtn.addEventListener('click', () => {
        elements.exportModal.classList.remove('hidden');
        elements.exportModal.classList.add('flex');
        elements.starredCount.textContent = state.stats.starred_photos || 0;
        elements.rejectedCount.textContent = state.stats.rejected_photos || 0;
        elements.exportResults.classList.add('hidden');
    });

    elements.exportModalClose.addEventListener('click', () => {
        elements.exportModal.classList.add('hidden');
        elements.exportModal.classList.remove('flex');
    });

    elements.exportModal.querySelector('.modal-backdrop').addEventListener('click', () => {
        elements.exportModal.classList.add('hidden');
        elements.exportModal.classList.remove('flex');
    });

    // Export starred photos
    elements.exportStarredBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/export/starred');
            const data = await response.json();

            if (data.photos && data.photos.length > 0) {
                // Create a text file with the list
                const content = data.photos.map(p => p.filepath).join('\n');
                const blob = new Blob([content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `starred-photos-${new Date().toISOString().split('T')[0]}.txt`;
                a.click();
                URL.revokeObjectURL(url);

                elements.exportResults.classList.remove('hidden');
                elements.exportMessage.innerHTML = `
                    <div class="flex items-start gap-3">
                        <i class="fa-solid fa-circle-check text-green-400 text-xl flex-shrink-0 mt-0.5"></i>
                        <div>
                            <p class="font-semibold text-slate-100 mb-1">Export Successful!</p>
                            <p class="text-xs text-slate-400">Downloaded list of ${data.count} starred photos.</p>
                            <p class="text-xs text-slate-500 mt-2">Use this file to copy photos with: <code class="bg-slate-800 px-1.5 py-0.5 rounded">rsync --files-from=starred-photos.txt</code></p>
                        </div>
                    </div>
                `;
            } else {
                elements.exportResults.classList.remove('hidden');
                elements.exportMessage.innerHTML = '<p class="text-slate-400">No starred photos to export.</p>';
            }
        } catch (err) {
            console.error('Export failed:', err);
            elements.exportResults.classList.remove('hidden');
            elements.exportMessage.innerHTML = '<p class="text-red-400">Export failed. Please try again.</p>';
        }
    });

    // Export rejected photos (show script to delete)
    elements.exportRejectedBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/export/rejected');
            const data = await response.json();

            if (data.photos && data.photos.length > 0) {
                // Create a shell script to delete rejected photos
                const content = '#!/bin/bash\n# Delete rejected photos\n\n' +
                    data.photos.map(p => `rm "${p.filepath}"`).join('\n');
                const blob = new Blob([content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `delete-rejected-${new Date().toISOString().split('T')[0]}.sh`;
                a.click();
                URL.revokeObjectURL(url);

                elements.exportResults.classList.remove('hidden');
                elements.exportMessage.innerHTML = `
                    <div class="flex items-start gap-3">
                        <i class="fa-solid fa-triangle-exclamation text-yellow-400 text-xl flex-shrink-0 mt-0.5"></i>
                        <div>
                            <p class="font-semibold text-slate-100 mb-1">Script Downloaded</p>
                            <p class="text-xs text-slate-400">Downloaded script to delete ${data.count} rejected photos.</p>
                            <p class="text-xs text-slate-500 mt-2"><strong>⚠️ Review before running:</strong> <code class="bg-slate-800 px-1.5 py-0.5 rounded">chmod +x delete-rejected.sh && ./delete-rejected.sh</code></p>
                        </div>
                    </div>
                `;
            } else {
                elements.exportResults.classList.remove('hidden');
                elements.exportMessage.innerHTML = '<p class="text-slate-400">No rejected photos to delete.</p>';
            }
        } catch (err) {
            console.error('Export failed:', err);
            elements.exportResults.classList.remove('hidden');
            elements.exportMessage.innerHTML = '<p class="text-red-400">Export failed. Please try again.</p>';
        }
    });

    // Modal controls
    elements.modalClose.addEventListener('click', closeModal);
    elements.modalPrev.addEventListener('click', () => navigateModal('prev-cluster'));
    elements.modalNext.addEventListener('click', () => navigateModal('next-cluster'));

    elements.modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

    // EXIF toggle
    elements.modalExifToggle.addEventListener('click', () => {
        const isHidden = elements.modalExifDetails.classList.contains('hidden');
        elements.modalExifDetails.classList.toggle('hidden');
        elements.modalExifArrow.textContent = isHidden ? '▼' : '▶';
    });

    // Star toggle
    elements.modalStarToggle.addEventListener('click', toggleStar);

    // Reject toggle
    elements.modalRejectToggle.addEventListener('click', toggleReject);

    // Infinite scroll - only trigger if initial load has completed
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && state.hasMore && !state.loading && state.clusters.length > 0) {
            loadClusters(true);
        }
    }, { rootMargin: '200px' });

    observer.observe(elements.loadMoreTrigger);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);
}

function handleKeyboard(e) {
    // Don't handle if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (state.modalOpen) {
        // Modal keyboard shortcuts
        // ←→ = cluster navigation, ↑↓ = photo navigation in cluster
        switch (e.key) {
            case 'Escape':
                closeModal();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                navigateModal('prev-cluster');
                break;
            case 'ArrowRight':
                e.preventDefault();
                navigateModal('next-cluster');
                break;
            case 'ArrowUp':
                e.preventDefault();
                navigateModal('prev-photo');
                break;
            case 'ArrowDown':
                e.preventDefault();
                navigateModal('next-photo');
                break;
            case 's':
            case 'S':
            case ' ':  // Spacebar also toggles star
                e.preventDefault();
                toggleStar();
                break;
            case 'Delete':
            case 'Backspace':
                e.preventDefault();
                toggleReject();
                break;
        }
    } else {
        // Grid keyboard shortcuts
        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                if (state.selectedIndex > 0) {
                    state.selectedIndex--;
                    updateSelection();
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (state.selectedIndex < state.clusters.length - 1) {
                    state.selectedIndex++;
                    updateSelection();
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                // Move up one row (estimate columns based on grid width)
                const gridWidth = elements.grid.offsetWidth;
                const cardWidth = elements.grid.children[0]?.offsetWidth || 200;
                const cols = Math.floor(gridWidth / (cardWidth + 12)); // 12 = gap
                if (state.selectedIndex >= cols) {
                    state.selectedIndex -= cols;
                    updateSelection();
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                const gw = elements.grid.offsetWidth;
                const cw = elements.grid.children[0]?.offsetWidth || 200;
                const c = Math.floor(gw / (cw + 12));
                if (state.selectedIndex + c < state.clusters.length) {
                    state.selectedIndex += c;
                    updateSelection();
                }
                break;
            case 'Enter':
                if (state.selectedIndex >= 0) {
                    openModal(state.selectedIndex);
                }
                break;
        }
    }
}

// ============================================
// Initialization
// ============================================

function readURLParams() {
    const params = new URLSearchParams(window.location.search);

    state.folder = params.get('folder') || '';
    state.starredOnly = params.get('selected') === 'true';
    state.rejectedOnly = params.get('rejected') === 'true';

    // Update UI to match state
    elements.filterFolder.value = state.folder;
    if (state.starredOnly) {
        elements.filterStarred.classList.remove('text-slate-400');
        elements.filterStarred.classList.add('text-green-400');
    } else {
        elements.filterStarred.classList.remove('text-green-400');
        elements.filterStarred.classList.add('text-slate-400');
    }
    if (state.rejectedOnly) {
        elements.filterRejected.classList.remove('text-slate-400');
        elements.filterRejected.classList.add('text-red-400');
    } else {
        elements.filterRejected.classList.remove('text-red-400');
        elements.filterRejected.classList.add('text-slate-400');
    }
}

function updateURL() {
    const params = new URLSearchParams();

    if (state.folder) params.set('folder', state.folder);
    if (state.starredOnly) params.set('selected', 'true');
    if (state.rejectedOnly) params.set('rejected', 'true');

    const newURL = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;

    window.history.replaceState({}, '', newURL);
}

async function init() {
    setupEventListeners();

    // Read filters from URL
    readURLParams();

    // Load initial data
    state.stats = await api.getStats();
    renderStats();

    // Check if we have any photos - show empty state if not
    if (state.stats.total_photos === 0) {
        elements.emptyState.classList.remove('hidden');
        elements.grid.style.display = 'none';
    } else {
        elements.emptyState.classList.add('hidden');
        elements.grid.style.display = '';
    }

    // Check if indexing is in progress
    const indexingStatus = await api.getIndexingStatus();
    if (indexingStatus.active) {
        startIndexingProgressPoll();
    }


    // Only load clusters if we have photos
    if (state.stats.total_photos > 0) {
        await loadClusters();
    }
}

// Start the app
init();

