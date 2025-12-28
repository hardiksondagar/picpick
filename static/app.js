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
    clusterViewMode: 'grid', // 'grid' or 'vertical'

    // Selection (for keyboard nav)
    selectedIndex: -1,

    // Stats
    stats: {},

    // Directory browser
    currentDirectory: null
};

// ============================================
// API Functions
// ============================================

const api = {
    async getBaseDirectory() {
        const res = await fetch('/api/base-directory');
        return res.json();
    },

    async getBaseDirectory() {
        const res = await fetch('/api/base-directory');
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

    async getPhotoAsCluster(photoId) {
        const res = await fetch(`/api/photos/${photoId}/as-cluster`);
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
    logo: document.getElementById('logo'),
    helpBtn: document.getElementById('help-btn'),
    helpTooltip: document.getElementById('help-tooltip'),

    // Export
    exportBtn: document.getElementById('export-btn'),
    exportModal: document.getElementById('export-modal'),
    exportModalClose: document.getElementById('export-modal-close'),
    exportDestination: document.getElementById('export-destination'),
    exportPhotoCount: document.getElementById('export-photo-count'),
    exportSizeEstimate: document.getElementById('export-size-estimate'),
    exportIncludeManifest: document.getElementById('export-include-manifest'),
    exportProgressSection: document.getElementById('export-progress-section'),
    exportProgressText: document.getElementById('export-progress-text'),
    exportSkippedText: document.getElementById('export-skipped-text'),
    exportProgressBar: document.getElementById('export-progress-bar'),
    exportCancelBtn: document.getElementById('export-cancel-btn'),
    exportStartBtn: document.getElementById('export-start-btn'),
    exportResult: document.getElementById('export-result'),
    exportResultMessage: document.getElementById('export-result-message'),
    exportFilenamesBtn: document.getElementById('export-filenames-btn'),
    exportXmpBtn: document.getElementById('export-xmp-btn'),
    exportResetBtn: document.getElementById('export-reset-btn'),

    // Modal
    modal: document.getElementById('photo-modal'),
    modalImage: document.getElementById('modal-image'),
    modalFilename: document.getElementById('modal-filename'),
    modalDatetime: document.getElementById('modal-datetime'),
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
    modalPhotoCounter: document.getElementById('modal-photo-counter'),
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

    // Load cluster photos based on whether it's a real cluster or a single photo
    let data;
    if (cluster.cluster_id) {
        // Real cluster - load all photos in the cluster
        data = await api.getClusterPhotos(cluster.cluster_id);
    } else {
        // Single unclustered photo - load just that photo
        data = await api.getPhotoAsCluster(cluster.representative.id);
    }
    state.clusterPhotos = data.photos;

    // Find the photo that's shown in the grid (the representative)
    const representativePhotoId = cluster.representative.id;
    let startIndex = state.clusterPhotos.findIndex(p => p.id === representativePhotoId);

    // If representative not found (shouldn't happen), fallback to first matching filter
    if (startIndex === -1) {
        if (state.starredOnly) {
            startIndex = state.clusterPhotos.findIndex(p => p.is_starred);
        } else if (state.rejectedOnly) {
            startIndex = state.clusterPhotos.findIndex(p => p.is_rejected);
        } else {
            startIndex = state.clusterPhotos.findIndex(p => p.is_representative);
        }
        if (startIndex === -1) startIndex = 0; // Final fallback
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
    elements.modalDatetime.textContent = photo.taken_at
        ? `📅 ${new Date(photo.taken_at).toLocaleString()}`
        : '📅 Unknown date';
    elements.modalCluster.textContent = `📷 Photo ${state.currentPhotoIndex + 1} of ${state.clusterPhotos.length} in cluster`;

    // Update cluster position counter (global cluster number out of total clusters)
    const globalClusterNumber = (state.currentPage - 1) * state.perPage + state.currentClusterIndex + 1;
    const totalClusters = state.stats.total_clusters || state.clusters.length;
    elements.modalPhotoCounter.textContent = `${globalClusterNumber} / ${totalClusters}`;

    // Photo information (folder, dimensions, and camera data)
    renderExifData(photo);

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

function renderExifData(photo) {
    const parts = [];

    // General photo information
    parts.push(`<div>📁 Folder: <span class="text-slate-300">${photo.folder}</span></div>`);
    parts.push(`<div>📐 Dimensions: <span class="text-slate-300">${photo.width} × ${photo.height}</span></div>`);

    // Camera-specific information
    if (photo.exif_data && Object.keys(photo.exif_data).length > 0) {
        const exif = photo.exif_data;
        const cameraFields = {
            'Make': '📷 Camera',
            'Model': '📷 Model',
            'LensModel': '🔍 Lens',
            'FNumber': '⚪ Aperture',
            'ExposureTime': '⏱️ Shutter',
            'ISO': '🎞️ ISO',
            'ISOSpeedRatings': '🎞️ ISO',
            'FocalLength': '📏 Focal Length',
            'Flash': '⚡ Flash',
            'Orientation': '🔄 Orientation'
        };

        const cameraInfo = Object.entries(cameraFields)
            .filter(([key]) => exif[key] !== undefined)
            .map(([key, label]) => {
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

                return `<div>${label}: <span class="text-slate-300">${value}</span></div>`;
            })
            .join('');

        if (cameraInfo) {
            parts.push(cameraInfo);
        }
    }

    elements.modalExifDetails.innerHTML = parts.join('');
}

function renderClusterThumbnails() {
    elements.clusterCount.textContent = state.clusterPhotos.length;
    elements.clusterGrid.innerHTML = '';

    if (state.clusterViewMode === 'vertical') {
        // Vertical view - show all photos in a single column with large previews
        state.clusterPhotos.forEach((photo, i) => {
            const item = document.createElement('div');
            const isCurrentClasses = i === state.currentPhotoIndex ? 'ring-4 ring-primary' : 'ring-2 ring-transparent';
            item.className = `relative rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:ring-4 hover:ring-primary/70 hover:scale-[1.01] ${isCurrentClasses}`;
            item.dataset.index = i;
            item.dataset.photoId = photo.id;

            // Show selected badge (green thumb up) or rejected badge (red thumb down)
            let badge = '';
            if (photo.is_starred) {
                badge = `
                    <div class="absolute top-3 right-3 bg-black/70 rounded-full w-8 h-8 flex items-center justify-center">
                        <i class="fa-solid fa-thumbs-up text-emerald-500 text-lg"></i>
                    </div>
                `;
            } else if (photo.is_rejected) {
                badge = `
                    <div class="absolute top-3 right-3 bg-black/70 rounded-full w-8 h-8 flex items-center justify-center">
                        <i class="fa-solid fa-thumbs-down text-rose-500 text-lg"></i>
                    </div>
                `;
            }

            item.innerHTML = `
                <img src="/api/image/${photo.id}?w=1200" alt="" loading="lazy" class="w-full h-auto object-contain">
                ${badge}
                <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3">
                    <div class="text-xs text-white/90 font-mono">${photo.filename}</div>
                    <div class="text-xs text-white/70 mt-1">${photo.width} × ${photo.height}</div>
                </div>
            `;

            // Click image to select
            item.addEventListener('click', (e) => {
                const clickedIndex = parseInt(item.dataset.index);
                const photoId = parseInt(item.dataset.photoId);

                let targetIndex = clickedIndex;
                if (clickedIndex < 0 || clickedIndex >= state.clusterPhotos.length ||
                    state.clusterPhotos[clickedIndex]?.id !== photoId) {
                    targetIndex = state.clusterPhotos.findIndex(p => p.id === photoId);
                }

                if (targetIndex >= 0 && targetIndex < state.clusterPhotos.length) {
                    state.currentPhotoIndex = targetIndex;
                    renderModalContent();
                }
            });

            elements.clusterGrid.appendChild(item);
        });
    } else {
        // Grid view - original compact grid
        elements.clusterGrid.className = 'grid grid-cols-3 gap-2.5';

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

            // Click image to select
            thumb.addEventListener('click', (e) => {
                const clickedIndex = parseInt(thumb.dataset.index);
                const photoId = parseInt(thumb.dataset.photoId);

                let targetIndex = clickedIndex;
                if (clickedIndex < 0 || clickedIndex >= state.clusterPhotos.length ||
                    state.clusterPhotos[clickedIndex]?.id !== photoId) {
                    targetIndex = state.clusterPhotos.findIndex(p => p.id === photoId);
                }

                if (targetIndex >= 0 && targetIndex < state.clusterPhotos.length) {
                    state.currentPhotoIndex = targetIndex;
                    renderModalContent();
                }
            });

            elements.clusterGrid.appendChild(thumb);
        });
    }

    // Scroll selected into view
    scrollToSelectedThumb();
}

function updateClusterThumbnailSelection() {
    const items = elements.clusterGrid.querySelectorAll('[data-index]');
    items.forEach((item, i) => {
        // Update ring state
        if (i === state.currentPhotoIndex) {
            if (state.clusterViewMode === 'vertical') {
                item.classList.add('ring-4', 'ring-primary');
                item.classList.remove('ring-2', 'ring-transparent');
            } else {
                item.classList.add('ring-2', 'ring-primary');
            }
        } else {
            if (state.clusterViewMode === 'vertical') {
                item.classList.remove('ring-4', 'ring-primary');
                item.classList.add('ring-2', 'ring-transparent');
            } else {
                item.classList.remove('ring-2', 'ring-primary');
            }
        }
    });
    scrollToSelectedThumb();
}

function scrollToSelectedThumb() {
    const selected = state.clusterViewMode === 'vertical'
        ? elements.clusterGrid.querySelector('.ring-primary')
        : elements.clusterGrid.querySelector('.ring-primary');
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

    // Logo click to reset filters
    elements.logo.addEventListener('click', () => {
        // Reset filter state
        state.folder = '';
        state.starredOnly = false;
        state.rejectedOnly = false;

        // Update UI
        elements.filterFolder.value = '';
        elements.filterStarred.classList.remove('text-green-400');
        elements.filterStarred.classList.add('text-slate-400');
        elements.filterRejected.classList.remove('text-red-400');
        elements.filterRejected.classList.add('text-slate-400');

        // Reload data
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
    elements.exportBtn.addEventListener('click', async () => {
        elements.exportModal.classList.remove('hidden');
        elements.exportModal.classList.add('flex');
        await updateExportModal();
    });

    elements.exportModalClose.addEventListener('click', () => {
        closeExportModal();
    });

    elements.exportModal.querySelector('.modal-backdrop').addEventListener('click', () => {
        closeExportModal();
    });

    // Export state
    let currentExportJobId = null;
    let exportPollInterval = null;

    async function updateExportModal() {
        const count = state.stats.starred_photos || 0;
        elements.exportPhotoCount.textContent = count.toLocaleString();

        // Estimate size (rough: 5MB per photo average)
        const estimatedGB = ((count * 5) / 1024).toFixed(1);
        elements.exportSizeEstimate.textContent = `~${estimatedGB} GB`;

        // Get base directory and set as default destination
        try {
            const baseDirData = await api.getBaseDirectory();
            console.log('Base directory response:', baseDirData);
            if (baseDirData && baseDirData.base_directory) {
                const basePath = baseDirData.base_directory;
                // Set default to base_directory/selected
                const destination = `${basePath}/selected`;
                console.log('Setting destination to:', destination);
                elements.exportDestination.value = destination;
            } else {
                // Fallback to Desktop if no base directory found
                console.log('No base directory found, using fallback');
                elements.exportDestination.value = '~/Desktop/PicBest_Selected';
            }
        } catch (err) {
            console.error('Failed to get base directory:', err);
            elements.exportDestination.value = '~/Desktop/PicBest_Selected';
        }

        // Reset UI state
        elements.exportProgressSection.classList.add('hidden');
        elements.exportCancelBtn.classList.add('hidden');
        elements.exportStartBtn.textContent = 'Start Export';
        elements.exportResult.classList.add('hidden');
        currentExportJobId = null;
    }

    function closeExportModal() {
        elements.exportModal.classList.add('hidden');
        elements.exportModal.classList.remove('flex');

        // Cancel any ongoing export
        if (currentExportJobId) {
            cancelExport();
        }
    }

    // Start export copy
    elements.exportStartBtn.addEventListener('click', async () => {
        if (currentExportJobId) {
            // Already running, cancel it
            cancelExport();
            return;
        }

        const destination = elements.exportDestination.value.trim();
        if (!destination) {
            showExportError('Please enter a destination folder');
            return;
        }

        const includeManifest = elements.exportIncludeManifest.checked;

        try {
            const response = await fetch('/api/export/copy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    destination: destination,
                    include_manifest: includeManifest
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Export failed');
            }

            const data = await response.json();
            currentExportJobId = data.job_id;

            // Show progress UI
            elements.exportProgressSection.classList.remove('hidden');
            elements.exportCancelBtn.classList.remove('hidden');
            elements.exportStartBtn.textContent = 'Exporting...';
            elements.exportResult.classList.add('hidden');

            // Start polling
            startExportPolling();
        } catch (err) {
            console.error('Export failed:', err);
            showExportError(err.message);
        }
    });

    // Cancel export
    elements.exportCancelBtn.addEventListener('click', () => {
        cancelExport();
    });

    function cancelExport() {
        if (currentExportJobId) {
            fetch(`/api/export/cancel/${currentExportJobId}`, { method: 'POST' });
        }
        stopExportPolling();
        elements.exportProgressSection.classList.add('hidden');
        elements.exportCancelBtn.classList.add('hidden');
        elements.exportStartBtn.textContent = 'Start Export';
        currentExportJobId = null;
    }

    function startExportPolling() {
        if (exportPollInterval) return;

        exportPollInterval = setInterval(async () => {
            if (!currentExportJobId) {
                stopExportPolling();
                return;
            }

            try {
                const response = await fetch(`/api/export/status/${currentExportJobId}`);
                const status = await response.json();

                // Update progress
                const percent = status.total > 0 ? (status.progress / status.total) * 100 : 0;
                elements.exportProgressBar.style.width = `${percent}%`;
                elements.exportProgressText.textContent = `${status.progress} / ${status.total}`;

                if (status.skipped > 0) {
                    elements.exportSkippedText.textContent = `(${status.skipped} skipped)`;
                } else {
                    elements.exportSkippedText.textContent = '';
                }

                // Check if complete
                if (status.status === 'complete') {
                    stopExportPolling();
                    elements.exportProgressSection.classList.add('hidden');
                    elements.exportCancelBtn.classList.add('hidden');
                    elements.exportStartBtn.textContent = 'Start Export';

                    showExportSuccess(status.copied, status.skipped, status.total);
                    currentExportJobId = null;
                } else if (status.status === 'cancelled' || status.status === 'error') {
                    stopExportPolling();
                    elements.exportProgressSection.classList.add('hidden');
                    elements.exportCancelBtn.classList.add('hidden');
                    elements.exportStartBtn.textContent = 'Start Export';

                    if (status.status === 'error') {
                        showExportError(status.error || 'Export failed');
                    } else {
                        showExportError('Export cancelled');
                    }
                    currentExportJobId = null;
                }
            } catch (err) {
                console.error('Polling error:', err);
                stopExportPolling();
            }
        }, 1000); // Poll every second
    }

    function stopExportPolling() {
        if (exportPollInterval) {
            clearInterval(exportPollInterval);
            exportPollInterval = null;
        }
    }

    function showExportSuccess(copied, skipped, total) {
        elements.exportResult.classList.remove('hidden');
        elements.exportResultMessage.innerHTML = `
            <div class="flex items-start gap-3">
                <i class="fa-solid fa-circle-check text-green-400 text-xl flex-shrink-0 mt-0.5"></i>
                <div>
                    <p class="font-semibold text-slate-100 mb-1">Export Complete!</p>
                    <p class="text-xs text-slate-400">Copied ${copied} photos${skipped > 0 ? `, skipped ${skipped} duplicates` : ''} out of ${total} selected.</p>
                </div>
            </div>
        `;
    }

    function showExportError(message) {
        elements.exportResult.classList.remove('hidden');
        elements.exportResultMessage.innerHTML = `
            <div class="flex items-start gap-3">
                <i class="fa-solid fa-circle-exclamation text-red-400 text-xl flex-shrink-0 mt-0.5"></i>
                <div>
                    <p class="font-semibold text-slate-100 mb-1">Export Failed</p>
                    <p class="text-xs text-slate-400">${message}</p>
                </div>
            </div>
        `;
    }

    // Export filenames
    elements.exportFilenamesBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/export/filenames');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `selected-photos-${new Date().toISOString().split('T')[0]}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export filenames failed:', err);
            alert('Failed to export filename list');
        }
    });

    // Export XMP
    elements.exportXmpBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/export/xmp');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `selected-photos-xmp-${new Date().toISOString().split('T')[0]}.zip`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export XMP failed:', err);
            alert('Failed to export XMP sidecars');
        }
    });

    // Reset selections
    elements.exportResetBtn.addEventListener('click', async () => {
        const confirmed = confirm('Are you sure you want to reset all selections? This will clear all starred and rejected markers.');
        if (!confirmed) return;

        try {
            const response = await fetch('/api/reset-selections', { method: 'POST' });
            const data = await response.json();

            if (data.success) {
                alert(`Reset complete! Cleared ${data.affected} photos.`);
                await refreshStats();
                await resetAndLoad();
                closeExportModal();
            }
        } catch (err) {
            console.error('Reset failed:', err);
            alert('Failed to reset selections');
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

    // Only load clusters if we have photos
    if (state.stats.total_photos > 0) {
        await loadClusters();
    }
}

// Start the app
init();

