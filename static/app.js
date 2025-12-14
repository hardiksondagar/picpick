/**
 * PicPick - Smart Photo Curator - Frontend Application
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
    personId: null,
    starredOnly: false,

    // Modal
    modalOpen: false,
    currentClusterIndex: -1,
    currentPhotoIndex: 0,
    clusterPhotos: [],

    // Selection (for keyboard nav)
    selectedIndex: -1,

    // Stats
    stats: {}
};

// ============================================
// API Functions
// ============================================

const api = {
    async getStats() {
        const res = await fetch('/api/stats');
        return res.json();
    },

    async getClusters(page = 1) {
        const params = new URLSearchParams({ page, per_page: state.perPage });

        if (state.folder) params.set('folder', state.folder);
        if (state.personId) params.set('person_id', state.personId.toString());
        if (state.starredOnly) params.set('starred_only', 'true');

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

    // Stats
    statTotal: document.getElementById('stat-total'),
    statClusters: document.getElementById('stat-clusters'),
    statStarred: document.getElementById('stat-starred'),
    progressBar: document.getElementById('progress-bar'),
    progressText: document.getElementById('progress-text'),

    // Filters
    filterFolder: document.getElementById('filter-folder'),
    personPicker: document.getElementById('person-picker'),
    personPickerBtn: document.getElementById('person-picker-btn'),
    personPickerDropdown: document.getElementById('person-picker-dropdown'),
    filterStarred: document.getElementById('filter-starred'),

    // Modal
    modal: document.getElementById('photo-modal'),
    modalImage: document.getElementById('modal-image'),
    modalFilename: document.getElementById('modal-filename'),
    modalFolder: document.getElementById('modal-folder'),
    modalDatetime: document.getElementById('modal-datetime'),
    modalDimensions: document.getElementById('modal-dimensions'),
    modalCluster: document.getElementById('modal-cluster'),
    modalStarToggle: document.getElementById('modal-star-toggle'),
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

    // Progress bar
    const progress = stats.total_photos > 0
        ? (stats.rated_photos / stats.total_photos * 100)
        : 0;
    elements.progressBar.style.width = `${progress}%`;
    elements.progressText.textContent = `${Math.round(progress)}% rated`;

    // Populate folder filter
    if (stats.folders && elements.filterFolder.options.length <= 1) {
        stats.folders.forEach(f => {
            const option = document.createElement('option');
            option.value = f.name;
            option.textContent = `${f.name} (${f.count})`;
            elements.filterFolder.appendChild(option);
        });
    }

    // Populate person picker - limit to top 100 and use lazy loading
    if (stats.persons && elements.personPickerDropdown.children.length <= 1) {
        const topPersons = stats.persons.slice(0, 100); // Limit to top 100 by photo count
        topPersons.forEach(p => {
            const opt = document.createElement('div');
            opt.className = 'person-option';
            opt.dataset.personId = p.id;
            opt.dataset.faceId = p.thumbnail_face_id || '';
            opt.dataset.name = p.name;
            // Use data-src for lazy loading - load when dropdown opens
            const faceImg = p.thumbnail_face_id
                ? `<img class="person-face" data-src="/api/face/${p.thumbnail_face_id}?size=72" alt="" loading="lazy">`
                : '<span class="person-face" style="background:var(--bg-tertiary);display:flex;align-items:center;justify-content:center;">👤</span>';
            opt.innerHTML = `${faceImg}<span class="person-name">${p.name}</span><span class="person-count">${p.count}</span>`;
            elements.personPickerDropdown.appendChild(opt);
        });
    }
}

function createPhotoCard(cluster, index) {
    const photo = cluster.representative;
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.dataset.index = index;
    card.dataset.clusterId = cluster.cluster_id;
    card.dataset.photoId = photo.id;

    card.innerHTML = `
        <img src="/api/image/${photo.id}?w=400" alt="${photo.filename}" loading="lazy">
        <div class="photo-card-overlay"></div>
        <div class="photo-card-cluster ${cluster.photo_count === 1 ? 'single' : ''}">${cluster.photo_count}</div>
        ${photo.is_starred ? '<div class="photo-card-star">★</div>' : ''}
        <div class="photo-card-info">
            <div class="photo-card-name">${photo.filename}</div>
            <div class="photo-card-meta">${photo.folder}</div>
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
            dateSeparator.className = 'date-separator';
            dateSeparator.innerHTML = `<span class="date-separator-text">${photoDate}</span>`;
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
                timeSeparator.className = 'time-separator';
                timeSeparator.innerHTML = `<span class="time-separator-text">⏱ ${timeStr}</span>`;
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
    // Remove previous selection
    document.querySelectorAll('.photo-card.selected').forEach(el => {
        el.classList.remove('selected');
    });

    // Add new selection
    if (state.selectedIndex >= 0 && state.selectedIndex < elements.grid.children.length) {
        const card = elements.grid.children[state.selectedIndex];
        card.classList.add('selected');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    state.currentPhotoIndex = 0;

    state.modalOpen = true;
    elements.modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    renderModalContent();
    renderClusterThumbnails();
}

function closeModal() {
    state.modalOpen = false;
    elements.modal.classList.remove('open');
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

    // Star toggle
    elements.modalStarToggle.classList.toggle('active', photo.is_starred);
    elements.modalStarToggle.textContent = photo.is_starred ? '★ Starred' : '☆ Star';

    // Update cluster thumbnail selection
    updateClusterThumbnailSelection();
}

function renderClusterThumbnails() {
    elements.clusterCount.textContent = state.clusterPhotos.length;
    elements.clusterGrid.innerHTML = '';

    state.clusterPhotos.forEach((photo, i) => {
        const thumb = document.createElement('div');
        thumb.className = `cluster-thumb ${i === state.currentPhotoIndex ? 'current' : ''}`;
        thumb.dataset.index = i;

        thumb.innerHTML = `
            <img src="/api/image/${photo.id}?w=400" alt="" loading="lazy">
            <button class="thumb-star-btn ${photo.is_starred ? 'starred' : ''}" data-photo-index="${i}">★</button>
        `;

        // Click image to select
        thumb.addEventListener('click', (e) => {
            if (!e.target.classList.contains('thumb-star-btn')) {
                state.currentPhotoIndex = i;
                renderModalContent();
            }
        });

        // Click star to toggle
        thumb.querySelector('.thumb-star-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            await toggleClusterPhotoStar(i);
        });

        elements.clusterGrid.appendChild(thumb);
    });

    // Scroll selected into view
    scrollToSelectedThumb();
}

function updateClusterThumbnailSelection() {
    const thumbs = elements.clusterGrid.querySelectorAll('.cluster-thumb');
    thumbs.forEach((thumb, i) => {
        thumb.classList.toggle('current', i === state.currentPhotoIndex);
        // Update star state
        const photo = state.clusterPhotos[i];
        const btn = thumb.querySelector('.thumb-star-btn');
        if (btn && photo) {
            btn.classList.toggle('starred', photo.is_starred);
        }
    });
    scrollToSelectedThumb();
}

function scrollToSelectedThumb() {
    const selected = elements.clusterGrid.querySelector('.cluster-thumb.current');
    if (selected) {
        selected.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

async function toggleClusterPhotoStar(photoIndex) {
    const photo = state.clusterPhotos[photoIndex];
    if (!photo) return;

    const newValue = !photo.is_starred;
    await api.updateStar(photo.id, newValue);
    photo.is_starred = newValue;

    // Update the cluster representative if needed
    const cluster = state.clusters[state.currentClusterIndex];
    if (cluster && cluster.representative.id === photo.id) {
        cluster.representative.is_starred = newValue;
        updateCardInGrid(state.currentClusterIndex);
    }

    // Update the star button in this thumb
    const thumb = elements.clusterGrid.querySelector(`[data-index="${photoIndex}"]`);
    if (thumb) {
        const btn = thumb.querySelector('.thumb-star-btn');
        btn.classList.toggle('starred', newValue);
    }

    // Update main star toggle if this is selected photo
    if (photoIndex === state.currentPhotoIndex) {
        elements.modalStarToggle.classList.toggle('active', newValue);
        elements.modalStarToggle.textContent = newValue ? '★ Starred' : '☆ Star';
    }

    refreshStats();
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

    // Update cluster representative if this is the rep
    const cluster = state.clusters[state.currentClusterIndex];
    if (cluster && cluster.representative.id === photo.id) {
        cluster.representative.is_starred = newValue;
        updateCardInGrid(state.currentClusterIndex);
    }

    renderModalContent();
    refreshStats();
}

async function refreshStats() {
    state.stats = await api.getStats();
    renderStats();
}

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
    // Filter changes
    elements.filterFolder.addEventListener('change', (e) => {
        state.folder = e.target.value;
        resetAndLoad();
    });

    // Person picker toggle
    elements.personPickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpening = !elements.personPicker.classList.contains('open');
        elements.personPicker.classList.toggle('open');

        // Lazy load face images when dropdown opens for the first time
        if (isOpening) {
            elements.personPickerDropdown.querySelectorAll('img[data-src]').forEach(img => {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            });
        }
    });

    // Person picker selection (delegated)
    elements.personPickerDropdown.addEventListener('click', (e) => {
        const opt = e.target.closest('.person-option');
        if (!opt) return;

        const personId = opt.dataset.personId;
        const personName = opt.dataset.name || 'All People';
        const faceId = opt.dataset.faceId;

        state.personId = personId ? parseInt(personId) : null;

        // Update button with face thumbnail
        const displayName = personName || 'All People';
        const faceHtml = (personId && faceId && faceId !== '')
            ? `<img class="person-face" src="/api/face/${faceId}?size=50" alt="${displayName}">`
            : '';

        elements.personPickerBtn.innerHTML = `
            ${faceHtml}
            <span class="person-picker-label">${displayName}</span>
            <span class="person-picker-arrow">▼</span>
        `;

        // Update selected state
        elements.personPickerDropdown.querySelectorAll('.person-option').forEach(o => {
            o.classList.toggle('selected', o.dataset.personId === personId);
        });

        elements.personPicker.classList.remove('open');
        resetAndLoad();
    });

    // Close picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!elements.personPicker.contains(e.target)) {
            elements.personPicker.classList.remove('open');
        }
    });

    elements.filterStarred.addEventListener('click', () => {
        state.starredOnly = !state.starredOnly;
        elements.filterStarred.classList.toggle('active', state.starredOnly);
        resetAndLoad();
    });

    // Modal controls
    elements.modalClose.addEventListener('click', closeModal);
    elements.modalPrev.addEventListener('click', () => navigateModal('prev-cluster'));
    elements.modalNext.addEventListener('click', () => navigateModal('next-cluster'));

    elements.modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

    // Star toggle
    elements.modalStarToggle.addEventListener('click', toggleStar);

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
    state.personId = params.get('person') ? parseInt(params.get('person')) : null;
    state.starredOnly = params.get('starred') === 'true';

    // Update UI to match state
    elements.filterFolder.value = state.folder;
    elements.filterStarred.classList.toggle('active', state.starredOnly);
}

function updateURL() {
    const params = new URLSearchParams();

    if (state.folder) params.set('folder', state.folder);
    if (state.personId) params.set('person', state.personId);
    if (state.starredOnly) params.set('starred', 'true');

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

    // Update person picker button if person is selected from URL
    if (state.personId && state.stats.persons) {
        const person = state.stats.persons.find(p => p.id === state.personId);
        if (person) {
            const faceHtml = person.thumbnail_face_id
                ? `<img class="person-face" src="/api/face/${person.thumbnail_face_id}?size=50" alt="${person.name}">`
                : '';
            elements.personPickerBtn.innerHTML = `
                ${faceHtml}
                <span class="person-picker-label">${person.name}</span>
                <span class="person-picker-arrow">▼</span>
            `;
        }
    }

    await loadClusters();
}

// Start the app
init();

