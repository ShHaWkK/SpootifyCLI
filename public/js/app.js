// Application Spootify Web - Version moderne
class SpootifyApp {
    constructor() {
        this.socket = null;
        this.currentTrack = null;
        this.isPlaying = false;
        this.currentPosition = 0;
        this.duration = 0;
        this.volume = 50;
        this.devices = [];
        this.activeDevice = null;
        this.localLibrary = [];
        this.searchResults = [];
        this.playlists = [];
        this.currentSection = 'home';
        this.isShuffled = false;
        this.repeatMode = 'off'; // 'off', 'context', 'track'
        
        // Nouvelles propriétés pour éviter les appels répétés
        this.isToggling = false;
        this.isPlayingTrack = false;
        this.currentPlayingUri = null;
        this.isPlayingSpotify = false;
        this.likedTracksData = [];
        this.webPlaybackPlayer = null;
        this.webPlaybackDeviceId = null;
        
        this.init();
    }

    init() {
        this.initializeSocket();
        this.setupEventListeners();
        this.loadLocalLibrary();
        
        // Vérifier l'authentification avant de charger les données Spotify
        this.checkAuthenticationStatus();
        
        this.loadLikedTracks(); // Charger les titres likés au démarrage
        this.updateUI();
        this.showSection('home');
        
        // Initialiser les contrôles
        this.setupProgressBar();
        this.setupVolumeControl();
        this.setupSearch();
        this.setupUpload();
        
        // Initialiser le lecteur web
        this.initWebPlayer();
        
        console.log('🎵 Spootify Web App initialized');
    }

    // Vérification de l'authentification
    async checkAuthenticationStatus() {
        try {
            const response = await fetch('/api/player/status');
            if (response.status === 401) {
                this.showNotification('⚠️ Vous n\'êtes pas connecté à Spotify. Certaines fonctionnalités seront limitées.', 'warning');
                console.log('❌ User not authenticated with Spotify');
                return false;
            } else if (response.ok) {
                this.showNotification('✅ Connecté à Spotify avec succès', 'success');
                console.log('✅ User authenticated with Spotify');
                return true;
            }
        } catch (error) {
            console.error('❌ Error checking authentication:', error);
            this.showNotification('⚠️ Impossible de vérifier la connexion Spotify', 'warning');
            return false;
        }
    }

    // Socket.IO Configuration
    initializeSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('✅ Connected to server');
            this.updateConnectionStatus(true);
        });
        
        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from server');
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('playback_update', (data) => {
            this.handlePlaybackUpdate(data);
        });
        
        this.socket.on('track_change', (data) => {
            this.handleTrackChange(data);
        });
        
        this.socket.on('devices_update', (data) => {
            this.handleDevicesUpdate(data);
        });
        
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showNotification('Erreur de connexion', 'error');
        });
    }

    // Event Listeners
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                if (section) {
                    this.showSection(section);
                }
            });
        });

        // Player controls
        const playBtn = document.getElementById('playBtn');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const shuffleBtn = document.getElementById('shuffleBtn');
        const repeatBtn = document.getElementById('repeatBtn');

        if (playBtn) playBtn.addEventListener('click', () => this.unifiedTogglePlayback());
        if (prevBtn) prevBtn.addEventListener('click', () => this.previousTrack());
        if (nextBtn) nextBtn.addEventListener('click', () => this.nextTrack());
        if (shuffleBtn) shuffleBtn.addEventListener('click', () => this.toggleShuffle());
        if (repeatBtn) repeatBtn.addEventListener('click', () => this.toggleRepeat());

        // Search tabs
        document.querySelectorAll('.search-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchSearchTab(tab.dataset.type);
            });
        });

        // Global search
        const globalSearch = document.getElementById('globalSearch');
        if (globalSearch) {
            globalSearch.addEventListener('input', (e) => {
                this.debounce(() => this.performGlobalSearch(e.target.value), 300)();
            });
        }

        // Upload modal
        const uploadBtn = document.getElementById('uploadBtn');
        const uploadModal = document.getElementById('uploadModal');
        const closeModal = document.querySelector('.modal-close-modern');
        
        if (uploadBtn) uploadBtn.addEventListener('click', () => this.showUploadModal());
        if (closeModal) closeModal.addEventListener('click', () => this.hideUploadModal());
        if (uploadModal) {
            uploadModal.addEventListener('click', (e) => {
                if (e.target === uploadModal) this.hideUploadModal();
            });
        }

        // Liked tracks buttons
        const playLikedBtn = document.getElementById('play-liked-btn');
        const quickPlayLikedBtn = document.getElementById('quick-play-liked-btn');
        const shuffleLikedBtn = document.getElementById('shuffle-liked-btn');
        const refreshRecentBtn = document.getElementById('refresh-recent-btn');

        if (playLikedBtn) {
            playLikedBtn.addEventListener('click', () => this.playLikedTracksWithWebPlayer());
        }
        
        if (quickPlayLikedBtn) {
            quickPlayLikedBtn.addEventListener('click', () => this.quickPlayLikedTracks());
        }
        
        if (shuffleLikedBtn) {
            shuffleLikedBtn.addEventListener('click', () => {
                // TODO: Implement shuffle liked tracks
                this.showNotification('Lecture aléatoire des titres likés...', 'info');
            });
        }
        
        if (refreshRecentBtn) {
            refreshRecentBtn.addEventListener('click', () => this.loadRecentlyPlayed());
        }
        
        // Quick access buttons
        document.querySelectorAll('.quick-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                switch(action) {
                    case 'liked':
                        this.showSection('liked');
                        break;
                    case 'recent':
                        this.showSection('recent');
                        break;
                    case 'local':
                        this.showSection('local');
                        break;
                }
            });
        });
        
        // Recherche dans les titres likés
        const likedSearchInput = document.getElementById('liked-search-input');
        const clearLikedSearch = document.getElementById('clear-liked-search');
        const loadMoreLikedBtn = document.getElementById('load-more-liked-btn');
        
        if (likedSearchInput) {
            likedSearchInput.addEventListener('input', (e) => {
                this.searchLikedTracks(e.target.value);
                const clearBtn = document.getElementById('clear-liked-search');
                if (clearBtn) {
                    clearBtn.style.display = e.target.value ? 'block' : 'none';
                }
            });
        }
        
        if (clearLikedSearch) {
            clearLikedSearch.addEventListener('click', () => {
                const searchInput = document.getElementById('liked-search-input');
                if (searchInput) {
                    searchInput.value = '';
                    this.searchLikedTracks('');
                    clearLikedSearch.style.display = 'none';
                }
            });
        }
        
        if (loadMoreLikedBtn) {
            loadMoreLikedBtn.addEventListener('click', () => {
                this.loadMoreLikedTracks();
            });
        }
        
        // Help button
        const helpBtn = document.getElementById('help-btn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                this.showSection('help');
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            
            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    this.togglePlayback();
                    break;
                case 'ArrowLeft':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.previousTrack();
                    }
                    break;
                case 'ArrowRight':
                    if (e.ctrlKey) {
                        e.preventDefault();
                        this.nextTrack();
                    }
                    break;
            }
        });
        
        // Event delegation for dynamic track buttons
        document.addEventListener('click', (e) => {
            // Cartes de titres et albums
            if (e.target.closest('.track-card') || e.target.closest('.album-card')) {
                e.preventDefault();
                const card = e.target.closest('.track-card') || e.target.closest('.album-card');
                const uri = card.dataset.trackUri;
                if (uri && !this.isPlayingTrack) {
                    this.debounce(() => this.playSpotifyTrack(uri), 500)();
                }
                return;
            }
            
            // Boutons de lecture des titres
            if (e.target.closest('.premium-action-btn.play')) {
                e.preventDefault();
                const button = e.target.closest('.premium-action-btn.play');
                const uri = button.dataset.trackUri;
                if (uri && !this.isPlayingTrack) {
                    this.debounce(() => this.playSpotifyTrack(uri), 500)();
                }
                return;
            }
            
            // Boutons de paroles
            if (e.target.closest('.premium-action-btn.lyrics')) {
                e.preventDefault();
                const button = e.target.closest('.premium-action-btn.lyrics');
                const trackName = button.dataset.trackName;
                const trackArtist = button.dataset.trackArtist;
                if (trackName && trackArtist) {
                    this.showLyrics(trackName, trackArtist);
                }
                return;
            }
            
            // Boutons d'ajout à la file
            if (e.target.closest('.premium-action-btn.queue')) {
                e.preventDefault();
                const button = e.target.closest('.premium-action-btn.queue');
                const uri = button.dataset.trackUri;
                if (uri) {
                    this.addToQueue(uri);
                }
                return;
            }
        });
    }

    // Progress Bar Setup
    setupProgressBar() {
        const progressSlider = document.getElementById('progressSlider');
        if (progressSlider) {
            progressSlider.addEventListener('input', (e) => {
                const position = (e.target.value / 100) * this.duration;
                this.seekToPosition(position);
            });
        }
    }

    // Volume Control Setup
    setupVolumeControl() {
        const volumeSlider = document.getElementById('volumeSlider');
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                this.setVolume(e.target.value);
            });
        }
    }

    // Search Setup
    setupSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.debounce(() => this.performSearch(e.target.value), 500)();
            });
            
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.performSearch(e.target.value);
                }
            });
        }
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                const query = searchInput?.value || '';
                this.performSearch(query);
            });
        }
    }

    // Upload Setup
    setupUpload() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        
        if (uploadArea && fileInput) {
            // Drag and drop
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });
            
            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('dragover');
            });
            
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                const files = Array.from(e.dataTransfer.files);
                this.handleFileUpload(files);
            });
            
            // Click to select
            uploadArea.addEventListener('click', () => {
                fileInput.click();
            });
            
            fileInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                this.handleFileUpload(files);
            });
        }
    }

    // Navigation
    showSection(sectionName) {
        // Hide all sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        
        // Show target section
        const targetSection = document.getElementById(`${sectionName}-section`);
        if (targetSection) {
            targetSection.classList.add('active');
        }
        
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeNavItem = document.querySelector(`[data-section="${sectionName}"]`)?.closest('.nav-item');
        if (activeNavItem) {
            activeNavItem.classList.add('active');
        }
        
        this.currentSection = sectionName;
        
        // Load section-specific data
        switch(sectionName) {
            case 'local':
                this.loadLocalLibrary();
                break;
            case 'playlists':
                this.loadPlaylists();
                break;
            case 'liked':
                this.loadLikedTracks();
                break;
            case 'recent':
                this.loadRecentlyPlayed();
                break;
        }
    }

    // Playback Controls
    async togglePlayback() {
        // Éviter les appels multiples simultanés
        if (this.isToggling) {
            return;
        }
        
        this.isToggling = true;
        
        try {
            const endpoint = this.isPlaying ? '/api/player/pause' : '/api/player/play';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                
                if (response.status === 404) {
                    this.showNotification('❌ Aucun appareil Spotify actif trouvé. Basculement vers le lecteur web...', 'warning');
                    // Basculer vers le lecteur web si disponible
                    if (this.likedTracksData && this.likedTracksData.length > 0) {
                        await this.playLikedTracksWithWebPlayer();
                    }
                    return;
                }
                
                if (response.status === 401) {
                    this.showNotification('❌ Session expirée. Reconnexion nécessaire.', 'error');
                    window.location.href = '/auth/spotify';
                    return;
                }
                
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            
            this.showNotification(this.isPlaying ? '⏸️ Pause' : '▶️ Lecture', 'success');
        } catch (error) {
            console.error('❌ Error toggling playback:', error);
            this.showNotification(`❌ Erreur: ${error.message}`, 'error');
        } finally {
            // Libérer le verrou après un délai pour éviter les clics rapides
            setTimeout(() => {
                this.isToggling = false;
            }, 1000);
        }
    }

    async previousTrack() {
        // Handle local playback
        if (this.currentTrack?.is_local && this.localLibrary.length > 0) {
            const library = this.isShuffled && this.shuffledLocalLibrary ? this.shuffledLocalLibrary : this.localLibrary;
            let prevTrack;
            
            if (this.isShuffled && this.shuffledLocalLibrary) {
                // Shuffle mode: get random track
                const availableTracks = library.filter(t => t.id !== this.currentTrack.id);
                if (availableTracks.length > 0) {
                    prevTrack = availableTracks[Math.floor(Math.random() * availableTracks.length)];
                }
            } else {
                // Normal mode: get previous track in order
                const currentIndex = library.findIndex(t => t.id === this.currentTrack.id);
                const prevIndex = currentIndex > 0 ? currentIndex - 1 : library.length - 1;
                prevTrack = library[prevIndex];
                
                // Handle repeat off mode - stop at beginning of playlist
                if (this.repeatMode === 'off' && currentIndex === 0) {
                    this.isPlaying = false;
                    this.updatePlayButton();
                    this.showNotification('🎵 Début de la playlist locale', 'info');
                    return;
                }
            }
            
            if (prevTrack) {
                await this.playLocalTrack(prevTrack.id);
                return;
            }
        }
        
        // Handle Spotify playback
        try {
            const response = await fetch('/api/player/previous', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                
                if (response.status === 404) {
                    this.showNotification('🔄 Spotify non disponible. Mode local activé.', 'warning');
                    // Play previous local track if available
                    if (this.localLibrary.length > 0) {
                        const lastTrack = this.localLibrary[this.localLibrary.length - 1];
                        await this.playLocalTrack(lastTrack.id);
                    }
                    return;
                }
                
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            
            this.showNotification('⏮️ Piste précédente', 'success');
        } catch (error) {
            console.error('❌ Error going to previous track:', error);
            this.showNotification('🔄 Erreur Spotify. Basculement vers le mode local.', 'warning');
            if (this.localLibrary.length > 0) {
                const lastTrack = this.localLibrary[this.localLibrary.length - 1];
                await this.playLocalTrack(lastTrack.id);
            }
        }
    }

    async nextTrack() {
        // Handle local playback
        if (this.currentTrack?.is_local && this.localLibrary.length > 0) {
            const library = this.isShuffled && this.shuffledLocalLibrary ? this.shuffledLocalLibrary : this.localLibrary;
            let nextTrack;
            
            if (this.isShuffled && this.shuffledLocalLibrary) {
                // Shuffle mode: get random track
                const availableTracks = library.filter(t => t.id !== this.currentTrack.id);
                if (availableTracks.length > 0) {
                    nextTrack = availableTracks[Math.floor(Math.random() * availableTracks.length)];
                }
            } else {
                // Normal mode: get next track in order
                const currentIndex = library.findIndex(t => t.id === this.currentTrack.id);
                const nextIndex = (currentIndex + 1) % library.length;
                nextTrack = library[nextIndex];
                
                // Handle repeat off mode - stop at end of playlist
                if (this.repeatMode === 'off' && currentIndex === library.length - 1) {
                    this.isPlaying = false;
                    this.updatePlayButton();
                    this.showNotification('🎵 Fin de la playlist locale', 'info');
                    return;
                }
            }
            
            if (nextTrack) {
                await this.playLocalTrack(nextTrack.id);
                return;
            }
        }
        
        // Handle Spotify playback
        try {
            const response = await fetch('/api/player/next', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                
                if (response.status === 404) {
                    this.showNotification('🔄 Spotify non disponible. Mode local activé.', 'warning');
                    // Play first local track if available
                    if (this.localLibrary.length > 0) {
                        const firstTrack = this.localLibrary[0];
                        await this.playLocalTrack(firstTrack.id);
                    }
                    return;
                }
                
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            
            this.showNotification('⏭️ Piste suivante', 'success');
        } catch (error) {
            console.error('❌ Error going to next track:', error);
            this.showNotification('🔄 Erreur Spotify. Basculement vers le mode local.', 'warning');
            if (this.localLibrary.length > 0) {
                const firstTrack = this.localLibrary[0];
                await this.playLocalTrack(firstTrack.id);
            }
        }
    }

    toggleShuffle() {
        this.isShuffled = !this.isShuffled;
        
        // Handle local shuffle
        if (this.currentTrack?.is_local && this.localLibrary.length > 0) {
            if (this.isShuffled) {
                // Create shuffled version of local library
                this.shuffledLocalLibrary = [...this.localLibrary].sort(() => Math.random() - 0.5);
                this.showNotification('🔀 Mode aléatoire activé (local)', 'success');
            } else {
                this.shuffledLocalLibrary = null;
                this.showNotification('🔀 Mode aléatoire désactivé (local)', 'success');
            }
        } else {
            // Handle Spotify shuffle
            if (this.socket) {
                this.socket.emit('toggle_shuffle', this.isShuffled);
            }
        }
        
        this.updateShuffleButton();
    }

    toggleRepeat() {
        const modes = ['off', 'context', 'track'];
        const currentIndex = modes.indexOf(this.repeatMode);
        this.repeatMode = modes[(currentIndex + 1) % modes.length];
        
        // Handle local repeat
        if (this.currentTrack?.is_local) {
            const modeNames = {
                'off': 'désactivé',
                'context': 'liste',
                'track': 'piste'
            };
            this.showNotification(`🔁 Mode répétition: ${modeNames[this.repeatMode]} (local)`, 'success');
        } else {
            // Handle Spotify repeat
            if (this.socket) {
                this.socket.emit('set_repeat', this.repeatMode);
            }
        }
        
        this.updateRepeatButton();
    }

    seekToPosition(position) {
        // Handle local audio seeking
        const localAudio = document.getElementById('local-audio-player') || document.getElementById('localAudio');
        if (localAudio && this.currentTrack?.is_local) {
            const seekTime = (position / 100) * localAudio.duration;
            localAudio.currentTime = seekTime;
            return;
        }
        
        // Handle Spotify seeking
        if (this.socket) {
            this.socket.emit('seek', position);
        }
    }

    setVolume(volume) {
        this.volume = volume;
        
        // Handle local audio volume
        const localAudio = document.getElementById('local-audio-player') || document.getElementById('localAudio');
        if (localAudio && this.currentTrack?.is_local) {
            localAudio.volume = volume / 100;
        }
        
        // Handle Spotify volume
        if (this.socket && (!this.currentTrack?.is_local)) {
            this.socket.emit('set_volume', volume);
        }
        
        this.updateVolumeDisplay();
    }

    // Search Functions
    performGlobalSearch(query) {
        if (!query.trim()) return;
        
        // Search both Spotify and local library
        this.performSearch(query);
        this.showSection('search');
    }

    async performSearch(query) {
        if (!query.trim()) {
            this.clearSearchResults();
            return;
        }
        
        const activeTab = document.querySelector('.search-tab.active')?.dataset.type || 'all';
        
        // Search Spotify via REST API
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=track,artist,album,playlist&limit=20`);
            if (response.ok) {
                const data = await response.json();
                this.displaySpotifySearchResults(data);
            } else {
                console.warn('Spotify search failed, showing only local results');
            }
        } catch (error) {
            console.error('❌ Spotify search error:', error);
            // Fallback to socket if available
            if (this.socket) {
                this.socket.emit('search', { query, type: activeTab });
            }
        }
        
        // Search local library
        this.searchLocalLibrary(query, activeTab);
    }

    searchLocalLibrary(query, type = 'all') {
        const results = this.localLibrary.filter(track => {
            const searchText = `${track.title} ${track.artist} ${track.album}`.toLowerCase();
            return searchText.includes(query.toLowerCase());
        });
        
        this.displayLocalSearchResults(results);
    }

    switchSearchTab(type) {
        document.querySelectorAll('.search-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        const activeTab = document.querySelector(`[data-type="${type}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }
        
        // Re-perform search with new filter
        const searchInput = document.getElementById('searchInput');
        if (searchInput && searchInput.value.trim()) {
            this.performSearch(searchInput.value);
        }
    }

    clearSearchResults() {
        const resultsContainer = document.getElementById('searchResults');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="search-placeholder-modern">
                    <i class="fas fa-search"></i>
                    <p>Recherchez de la musique, des artistes, des albums...</p>
                </div>
            `;
        }
    }

    displaySpotifySearchResults(data) {
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;

        let html = '<div class="search-results-container">';

        // Display tracks
        if (data.tracks && data.tracks.items && data.tracks.items.length > 0) {
            html += `
                <div class="search-section">
                    <h3><i class="fas fa-music"></i> Pistes</h3>
                    <div class="search-tracks-grid">
            `;
            data.tracks.items.slice(0, 6).forEach(track => {
                html += `
                    <div class="track-card" data-track-uri="${track.uri}">
                        <div class="track-image">
                            <img src="${track.album.images?.[2]?.url || '/images/default-track.png'}" 
                                 alt="${track.name}" 
                                 onerror="this.src='/images/default-track.png'">
                            <div class="track-overlay">
                                <i class="fas fa-play"></i>
                            </div>
                        </div>
                        <div class="track-info">
                            <h4 class="track-name">${track.name}</h4>
                            <p class="track-artist">${track.artists.map(a => a.name).join(', ')}</p>
                        </div>
                    </div>
                `;
            });
            html += '</div></div>';
        }

        // Display artists
        if (data.artists && data.artists.items && data.artists.items.length > 0) {
            html += `
                <div class="search-section">
                    <h3><i class="fas fa-user-music"></i> Artistes</h3>
                    <div class="search-artists-grid">
            `;
            data.artists.items.slice(0, 6).forEach(artist => {
                html += `
                    <div class="artist-card">
                        <div class="artist-image">
                            <img src="${artist.images?.[1]?.url || '/images/default-artist.png'}" 
                                 alt="${artist.name}" 
                                 onerror="this.src='/images/default-artist.png'">
                        </div>
                        <div class="artist-info">
                            <h4 class="artist-name">${artist.name}</h4>
                            <p class="artist-followers">${artist.followers.total.toLocaleString()} abonnés</p>
                        </div>
                    </div>
                `;
            });
            html += '</div></div>';
        }

        // Display albums
        if (data.albums && data.albums.items && data.albums.items.length > 0) {
            html += `
                <div class="search-section">
                    <h3><i class="fas fa-compact-disc"></i> Albums</h3>
                    <div class="search-albums-grid">
            `;
            data.albums.items.slice(0, 6).forEach(album => {
                html += `
                    <div class="album-card" data-track-uri="${album.uri}">
                        <div class="album-image">
                            <img src="${album.images?.[1]?.url || '/images/default-album.png'}" 
                                 alt="${album.name}" 
                                 onerror="this.src='/images/default-album.png'">
                            <div class="album-overlay">
                                <i class="fas fa-play"></i>
                            </div>
                        </div>
                        <div class="album-info">
                            <h4 class="album-name">${album.name}</h4>
                            <p class="album-artist">${album.artists.map(a => a.name).join(', ')}</p>
                        </div>
                    </div>
                `;
            });
            html += '</div></div>';
        }

        // Display playlists
        if (data.playlists && data.playlists.items && data.playlists.items.length > 0) {
            html += `
                <div class="search-section">
                    <h3><i class="fas fa-list-music"></i> Playlists</h3>
                    <div class="search-playlists-grid">
            `;
            data.playlists.items.slice(0, 6).forEach(playlist => {
                html += `
                    <div class="playlist-card" onclick="app.playPlaylist('${playlist.id}')">
                        <div class="playlist-image">
                            <img src="${playlist.images?.[0]?.url || '/images/default-playlist.png'}" 
                                 alt="${playlist.name}" 
                                 onerror="this.src='/images/default-playlist.png'">
                            <div class="playlist-overlay">
                                <i class="fas fa-play"></i>
                            </div>
                        </div>
                        <div class="playlist-info">
                            <h4 class="playlist-name">${playlist.name}</h4>
                            <p class="playlist-owner">Par ${playlist.owner.display_name}</p>
                        </div>
                    </div>
                `;
            });
            html += '</div></div>';
        }

        html += '</div>';
        resultsContainer.innerHTML = html;
    }

    displayLocalSearchResults(results) {
        const localResultsContainer = document.getElementById('localSearchResults');
        if (!localResultsContainer) return;
        
        if (results.length === 0) {
            localResultsContainer.innerHTML = '<p class="text-center text-muted">Aucun résultat local trouvé</p>';
            return;
        }
        
        const html = results.map(track => `
            <div class="result-item local-track" data-track-id="${track.id}">
                <div class="track-info">
                    <h4>${track.title}</h4>
                    <p>${track.artist} • ${track.album}</p>
                    <span class="badge">Local</span>
                </div>
                <div class="track-actions">
                    <button class="btn-icon play-local-track" data-track-id="${track.id}">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        localResultsContainer.innerHTML = html;
        
        // Add event listeners for local tracks
        localResultsContainer.querySelectorAll('.play-local-track').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = e.target.closest('.play-local-track').dataset.trackId;
                this.playLocalTrack(trackId);
            });
        });
    }

    // Local Library Functions
    async loadLocalLibrary() {
        try {
            const response = await fetch('/api/local/library');
            const data = await response.json();
            
            if (data.success) {
                this.localLibrary = data.tracks;
                this.displayLocalLibrary();
                this.updateLibraryStats();
            }
        } catch (error) {
            console.error('Error loading local library:', error);
        }
    }

    displayLocalLibrary() {
        const libraryContainer = document.getElementById('localLibraryTracks');
        if (!libraryContainer) return;
        
        if (this.localLibrary.length === 0) {
            libraryContainer.innerHTML = `
                <div class="text-center">
                    <i class="fas fa-music" style="font-size: 3rem; opacity: 0.3; margin-bottom: 1rem;"></i>
                    <p>Aucune musique locale trouvée</p>
                    <button class="btn-primary" onclick="app.showUploadModal()">
                        <i class="fas fa-upload"></i> Ajouter de la musique
                    </button>
                </div>
            `;
            return;
        }
        
        const html = this.localLibrary.map(track => `
            <div class="track-item" data-track-id="${track.id}">
                <div class="track-info">
                    <h4>${track.title}</h4>
                    <p>${track.artist} • ${track.album}</p>
                    <small>${this.formatDuration(track.duration)}</small>
                </div>
                <div class="track-actions">
                    <button class="btn-icon play-local-track" data-track-id="${track.id}">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn-icon delete-local-track" data-track-id="${track.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
        
        libraryContainer.innerHTML = html;
        
        // Add event listeners
        libraryContainer.querySelectorAll('.play-local-track').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = e.target.closest('.play-local-track').dataset.trackId;
                this.playLocalTrack(trackId);
            });
        });
        
        libraryContainer.querySelectorAll('.delete-local-track').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = e.target.closest('.delete-local-track').dataset.trackId;
                this.deleteLocalTrack(trackId);
            });
        });
    }

    async playLocalTrack(trackId) {
        // Utiliser le nouveau lecteur web intégré
        await this.playLocalTrackWithWebPlayer(trackId);
    }
    
    playNextLocalTrack() {
        if (!this.currentTrack?.is_local || !this.localLibrary.length) return;
        
        // Handle repeat track mode
        if (this.repeatMode === 'track') {
            setTimeout(() => this.playLocalTrack(this.currentTrack.id), 1000);
            return;
        }
        
        let nextTrack;
        const library = this.isShuffled && this.shuffledLocalLibrary ? this.shuffledLocalLibrary : this.localLibrary;
        
        if (this.isShuffled && this.shuffledLocalLibrary) {
            // Shuffle mode: get random track
            const availableTracks = library.filter(t => t.id !== this.currentTrack.id);
            if (availableTracks.length > 0) {
                nextTrack = availableTracks[Math.floor(Math.random() * availableTracks.length)];
            }
        } else {
            // Normal mode: get next track in order
            const currentIndex = library.findIndex(t => t.id === this.currentTrack.id);
            const nextIndex = (currentIndex + 1) % library.length;
            nextTrack = library[nextIndex];
            
            // Handle repeat off mode - stop at end of playlist
            if (this.repeatMode === 'off' && currentIndex === library.length - 1) {
                this.isPlaying = false;
                this.updatePlayButton();
                this.showNotification('🎵 Fin de la playlist locale', 'info');
                return;
            }
        }
        
        if (nextTrack) {
            setTimeout(() => this.playLocalTrack(nextTrack.id), 1000);
        }
    }

    async deleteLocalTrack(trackId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette piste ?')) return;
        
        try {
            const response = await fetch(`/api/local/tracks/${trackId}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.loadLocalLibrary();
                this.showNotification('Piste supprimée', 'success');
            } else {
                this.showNotification('Erreur lors de la suppression', 'error');
            }
        } catch (error) {
            console.error('Error deleting track:', error);
            this.showNotification('Erreur lors de la suppression', 'error');
        }
    }

    // File Upload Functions
    showUploadModal() {
        const modal = document.getElementById('uploadModal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    hideUploadModal() {
        const modal = document.getElementById('uploadModal');
        if (modal) {
            modal.classList.remove('active');
        }
        
        // Reset upload area
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        const progressContainer = document.getElementById('uploadProgress');
        
        if (uploadArea) uploadArea.classList.remove('dragover');
        if (fileInput) fileInput.value = '';
        if (progressContainer) progressContainer.style.display = 'none';
    }

    async handleFileUpload(files) {
        const audioFiles = files.filter(file => file.type.startsWith('audio/'));
        
        if (audioFiles.length === 0) {
            this.showNotification('Aucun fichier audio sélectionné', 'warning');
            return;
        }
        
        const progressContainer = document.getElementById('uploadProgress');
        const progressBar = document.getElementById('uploadProgressBar');
        const progressStatus = document.getElementById('uploadStatus');
        
        if (progressContainer) progressContainer.style.display = 'block';
        
        for (let i = 0; i < audioFiles.length; i++) {
            const file = audioFiles[i];
            
            try {
                if (progressStatus) {
                    progressStatus.textContent = `Upload de ${file.name} (${i + 1}/${audioFiles.length})`;
                }
                
                await this.uploadFile(file, (progress) => {
                    if (progressBar) {
                        progressBar.style.width = `${progress}%`;
                    }
                });
                
            } catch (error) {
                console.error('Upload error:', error);
                this.showNotification(`Erreur lors de l'upload de ${file.name}`, 'error');
            }
        }
        
        // Reload library and hide modal
        await this.loadLocalLibrary();
        this.hideUploadModal();
        this.showNotification(`${audioFiles.length} fichier(s) uploadé(s) avec succès`, 'success');
    }

    uploadFile(file, onProgress) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('audio', file);
            
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const progress = (e.loaded / e.total) * 100;
                    onProgress(progress);
                }
            });
            
            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(`Upload failed: ${xhr.status}`));
                }
            });
            
            xhr.addEventListener('error', () => {
                reject(new Error('Upload failed'));
            });
            
            xhr.open('POST', '/api/local/upload');
            xhr.send(formData);
        });
    }

    // Socket Event Handlers
    handlePlaybackUpdate(data) {
        this.isPlaying = data.is_playing;
        this.currentPosition = data.progress_ms || 0;
        this.volume = data.device?.volume_percent || 50;
        
        this.updatePlayButton();
        this.updateProgressBar();
        this.updateVolumeDisplay();
    }

    handleTrackChange(data) {
        this.currentTrack = data.item;
        this.duration = data.item?.duration_ms || 0;
        
        this.updateTrackDisplay();
        this.updateProgressBar();
    }

    handleDevicesUpdate(data) {
        this.devices = data.devices || [];
        this.activeDevice = data.devices?.find(d => d.is_active) || null;
        
        this.updateDevicesList();
    }

    // UI Update Functions
    updateTrackDisplay() {
        const trackName = document.getElementById('currentTrackName');
        const trackArtist = document.getElementById('currentTrackArtist');
        const trackImage = document.getElementById('currentTrackImage');
        const trackImagePlaceholder = document.getElementById('trackImagePlaceholder');
        
        if (this.currentTrack) {
            if (trackName) trackName.textContent = this.currentTrack.name || 'Titre inconnu';
            if (trackArtist) {
                const artists = this.currentTrack.artists?.map(a => a.name).join(', ') || 'Artiste inconnu';
                trackArtist.textContent = artists;
            }
            
            if (trackImage && trackImagePlaceholder) {
                const imageUrl = this.currentTrack.album?.images?.[0]?.url;
                if (imageUrl) {
                    trackImage.src = imageUrl;
                    trackImage.style.display = 'block';
                    trackImagePlaceholder.style.display = 'none';
                } else {
                    trackImage.style.display = 'none';
                    trackImagePlaceholder.style.display = 'flex';
                }
            }
        } else {
            if (trackName) trackName.textContent = 'Aucune piste';
            if (trackArtist) trackArtist.textContent = '';
            if (trackImage) trackImage.style.display = 'none';
            if (trackImagePlaceholder) trackImagePlaceholder.style.display = 'flex';
        }
    }

    updatePlayButton() {
        const playBtn = document.getElementById('playBtn');
        const playIcon = playBtn?.querySelector('i');
        
        if (playIcon) {
            playIcon.className = this.isPlaying ? 'fas fa-pause' : 'fas fa-play';
        }
    }

    updateProgressBar() {
        const progressFill = document.getElementById('progressFill');
        const currentTime = document.getElementById('currentTime');
        const totalTime = document.getElementById('totalTime');
        
        if (this.duration > 0) {
            const progress = (this.currentPosition / this.duration) * 100;
            if (progressFill) progressFill.style.width = `${progress}%`;
        }
        
        if (currentTime) currentTime.textContent = this.formatTime(this.currentPosition);
        if (totalTime) totalTime.textContent = this.formatTime(this.duration);
    }

    updateVolumeDisplay() {
        const volumeSlider = document.getElementById('volumeSlider');
        const volumeIcon = document.getElementById('volumeIcon');
        
        if (volumeSlider) volumeSlider.value = this.volume;
        
        if (volumeIcon) {
            if (this.volume === 0) {
                volumeIcon.className = 'fas fa-volume-mute';
            } else if (this.volume < 50) {
                volumeIcon.className = 'fas fa-volume-down';
            } else {
                volumeIcon.className = 'fas fa-volume-up';
            }
        }
    }

    updateShuffleButton() {
        const shuffleBtn = document.getElementById('shuffleBtn');
        if (shuffleBtn) {
            shuffleBtn.classList.toggle('active', this.isShuffled);
        }
    }

    updateRepeatButton() {
        const repeatBtn = document.getElementById('repeatBtn');
        const repeatIcon = repeatBtn?.querySelector('i');
        
        if (repeatBtn) {
            repeatBtn.classList.remove('active');
            if (this.repeatMode !== 'off') {
                repeatBtn.classList.add('active');
            }
        }
        
        if (repeatIcon) {
            switch(this.repeatMode) {
                case 'track':
                    repeatIcon.className = 'fas fa-redo-alt';
                    break;
                case 'context':
                    repeatIcon.className = 'fas fa-retweet';
                    break;
                default:
                    repeatIcon.className = 'fas fa-retweet';
            }
        }
    }

    updateDevicesList() {
        const devicesContainer = document.getElementById('devicesList');
        if (!devicesContainer) return;
        
        if (this.devices.length === 0) {
            devicesContainer.innerHTML = '<p class="loading-modern">Aucun appareil trouvé</p>';
            return;
        }
        
        const html = this.devices.map(device => `
            <div class="device-item ${device.is_active ? 'active' : ''}" data-device-id="${device.id}">
                <div class="device-info">
                    <i class="fas fa-${this.getDeviceIcon(device.type)}"></i>
                    <span>${device.name}</span>
                </div>
                <div class="device-status">
                    ${device.is_active ? '<i class="fas fa-check"></i>' : ''}
                </div>
            </div>
        `).join('');
        
        devicesContainer.innerHTML = html;
        
        // Add click listeners
        devicesContainer.querySelectorAll('.device-item').forEach(item => {
            item.addEventListener('click', () => {
                const deviceId = item.dataset.deviceId;
                this.switchDevice(deviceId);
            });
        });
    }

    updateConnectionStatus(connected) {
        const statusIndicator = document.getElementById('connectionStatus');
        if (statusIndicator) {
            statusIndicator.className = connected ? 'fas fa-wifi connected' : 'fas fa-wifi-slash disconnected';
        }
    }

    updateLibraryStats() {
        const totalTracks = document.getElementById('totalTracks');
        const totalDuration = document.getElementById('totalDuration');
        
        if (totalTracks) totalTracks.textContent = this.localLibrary.length;
        
        if (totalDuration) {
            const total = this.localLibrary.reduce((sum, track) => sum + (track.duration || 0), 0);
            totalDuration.textContent = this.formatDuration(total);
        }
    }

    updateUI() {
        this.updateTrackDisplay();
        this.updatePlayButton();
        this.updateProgressBar();
        this.updateVolumeDisplay();
        this.updateShuffleButton();
        this.updateRepeatButton();
        this.updateDevicesList();
        this.updateConnectionStatus(this.socket?.connected || false);
    }

    // Utility Functions
    formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'À l\'instant';
        if (diffMins < 60) return `Il y a ${diffMins} min`;
        if (diffHours < 24) return `Il y a ${diffHours}h`;
        if (diffDays < 7) return `Il y a ${diffDays}j`;
        return date.toLocaleDateString('fr-FR');
    }

    async showLyrics(trackName, artistName) {
        try {
            // Créer la modal de paroles
            const modal = document.createElement('div');
            modal.className = 'premium-lyrics-modal';
            modal.innerHTML = `
                <div class="premium-lyrics-content">
                    <div class="premium-lyrics-header">
                        <div class="premium-lyrics-title">
                            <h2>${trackName}</h2>
                            <p>par ${artistName}</p>
                        </div>
                        <button class="premium-close-btn" onclick="this.closest('.premium-lyrics-modal').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="premium-lyrics-body">
                        <div class="premium-loading">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Recherche des paroles...</p>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Rechercher les paroles
            const response = await fetch(`/api/lyrics?track=${encodeURIComponent(trackName)}&artist=${encodeURIComponent(artistName)}`);
            const data = await response.json();
            
            const lyricsBody = modal.querySelector('.premium-lyrics-body');
            
            if (data.success && data.lyrics) {
                lyricsBody.innerHTML = `
                    <div class="premium-lyrics-text">
                        ${data.lyrics.split('\n').map(line => `<p>${line || '&nbsp;'}</p>`).join('')}
                    </div>
                `;
            } else {
                lyricsBody.innerHTML = `
                    <div class="premium-lyrics-error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Paroles non disponibles</p>
                        <small>Impossible de trouver les paroles pour cette chanson</small>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Erreur lors de la récupération des paroles:', error);
        }
    }

    async addToQueue(uri) {
        try {
            const response = await fetch('/api/player/queue', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uri })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                
                if (response.status === 401) {
                    this.showNotification('🔐 Vous devez vous connecter à Spotify', 'error');
                    window.location.href = '/auth/login';
                    return;
                }
                
                if (response.status === 404) {
                    this.showNotification('📱 Aucun appareil Spotify actif. Ouvrez Spotify sur un appareil.', 'warning');
                    return;
                }
                
                if (response.status === 400) {
                    this.showNotification('⚠️ Spotify non disponible. Vérifiez qu\'un appareil est actif.', 'warning');
                    return;
                }
                
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            
            this.showNotification('✅ Ajouté à la file d\'attente', 'success');
        } catch (error) {
            console.error('❌ Error adding to queue:', error);
            this.showNotification(`❌ Erreur: ${error.message}`, 'error');
        }
    }

    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    getDeviceIcon(type) {
        switch(type?.toLowerCase()) {
            case 'computer': return 'desktop';
            case 'smartphone': return 'mobile-alt';
            case 'speaker': return 'volume-up';
            case 'tv': return 'tv';
            default: return 'music';
        }
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${this.getNotificationIcon(type)}"></i>
            <span>${message}</span>
        `;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Show with animation
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Remove after delay
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    getNotificationIcon(type) {
        switch(type) {
            case 'success': return 'check-circle';
            case 'error': return 'exclamation-circle';
            case 'warning': return 'exclamation-triangle';
            default: return 'info-circle';
        }
    }

    // Playlist Functions
    async loadPlaylists() {
        try {
            const response = await fetch('/api/playlists?limit=50&offset=0');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.displayPlaylists(data.items);
            console.log('✅ Playlists loaded:', data.items.length);
        } catch (error) {
            console.error('❌ Error loading playlists:', error);
            this.showNotification('Erreur lors du chargement des playlists', 'error');
        }
    }

    displayPlaylists(playlists) {
        const playlistsContainer = document.querySelector('.playlists-grid');
        if (!playlistsContainer) {
            console.warn('Playlists container not found');
            return;
        }

        playlistsContainer.innerHTML = '';

        playlists.forEach(playlist => {
            const playlistElement = document.createElement('div');
            playlistElement.className = 'playlist-card';
            playlistElement.innerHTML = `
                <div class="playlist-image">
                    <img src="${playlist.images?.[0]?.url || '/images/default-playlist.png'}" 
                         alt="${playlist.name}" 
                         onerror="this.src='/images/default-playlist.png'">
                    <div class="playlist-overlay">
                        <button class="play-btn" onclick="app.playPlaylist('${playlist.id}')">
                            <i class="fas fa-play"></i>
                        </button>
                    </div>
                </div>
                <div class="playlist-info">
                    <h3 class="playlist-name">${playlist.name}</h3>
                    <p class="playlist-description">${playlist.description || 'Aucune description'}</p>
                    <p class="playlist-owner">Par ${playlist.owner.display_name}</p>
                    <p class="playlist-tracks">${playlist.tracks.total} pistes</p>
                </div>
            `;
            playlistsContainer.appendChild(playlistElement);
        });
    }

    async playPlaylist(playlistId) {
        try {
            const response = await fetch(`/api/playlists/${playlistId}/play`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            this.showNotification('Playlist en cours de lecture', 'success');
        } catch (error) {
            console.error('❌ Error playing playlist:', error);
            this.showNotification('Erreur lors de la lecture de la playlist', 'error');
        }
    }

    // Liked Tracks Functions
    async loadLikedTracks() {
        try {
            this.showNotification('📥 Chargement des titres likés...', 'info');
            
            let allTracks = [];
            let offset = 0;
            const limit = 50;
            let hasMore = true;
            let isFirstLoad = true;
            
            while (hasMore) {
                const response = await fetch(`/api/player/liked-tracks?limit=${limit}&offset=${offset}`);
                if (!response.ok) {
                    if (response.status === 401) {
                        this.showNotification('🔐 Session expirée. Veuillez vous reconnecter à Spotify.', 'warning');
                        setTimeout(() => {
                            window.location.href = '/auth/login';
                        }, 2000);
                        return;
                    }
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                allTracks = allTracks.concat(data.items);
                
                // Afficher les premiers résultats immédiatement
                if (isFirstLoad) {
                    this.likedTracksData = allTracks;
                    this.displayLikedTracks(allTracks);
                    this.showNotification(`✅ ${allTracks.length} titres chargés (chargement en cours...)`, 'success');
                    isFirstLoad = false;
                }
                
                // Vérifier s'il y a plus de titres à charger
                hasMore = data.items.length === limit && allTracks.length < data.total;
                offset += limit;
                
                // Continuer le chargement en arrière-plan
                if (hasMore) {
                    // Petite pause pour ne pas surcharger l'API
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            // Mise à jour finale
            this.likedTracksData = allTracks;
            this.displayLikedTracks(allTracks);
            this.showNotification(`✅ ${allTracks.length} titres likés chargés !`, 'success');
            console.log('✅ All liked tracks loaded:', allTracks.length);
        } catch (error) {
            console.error('❌ Error loading liked tracks:', error);
            this.showNotification('Erreur lors du chargement des titres likés. Vérifiez votre connexion Spotify.', 'error');
        }
    }

    displayLikedTracks(tracks) {
        const container = document.getElementById('liked-tracks');
        if (!container) return;

        if (!tracks || tracks.length === 0) {
            container.innerHTML = `
                <div class="premium-empty-state">
                    <div class="premium-empty-icon">
                        <i class="fas fa-heart"></i>
                    </div>
                    <div class="premium-empty-title">Aucun titre liké</div>
                    <div class="premium-empty-text">Vos coups de cœur Spotify apparaîtront ici dans toute leur splendeur</div>
                    <button class="premium-btn" onclick="window.open('https://open.spotify.com', '_blank')">
                        <i class="fas fa-external-link-alt"></i>
                        Découvrir sur Spotify
                    </button>
                </div>
            `;
            return;
        }

        const tracksHTML = tracks.map((item, index) => {
            const track = item.track;
            const artists = track.artists.map(artist => artist.name).join(', ');
            const duration = this.formatTime(track.duration_ms);
            const addedDate = new Date(item.added_at).toLocaleDateString('fr-FR');
            const albumImage = track.album.images && track.album.images.length > 0 
                ? track.album.images[track.album.images.length - 1].url 
                : '';

            return `
                <div class="premium-track-item" data-track-id="${track.id}" data-track-uri="${track.uri}">
                    <div class="premium-album-cover">
                        ${albumImage ? `<img src="${albumImage}" alt="${track.album.name}" loading="lazy">` : '<i class="fas fa-music"></i>'}
                    </div>
                    <div class="premium-track-info">
                        <div class="premium-track-title">${track.name}</div>
                        <div class="premium-track-artist">${artists}</div>
                        <div class="premium-track-album">${track.album.name}</div>
                    </div>
                    <div class="premium-track-actions">
                        <button class="premium-action-btn play" data-track-uri="${track.uri}" title="Lire">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="premium-action-btn lyrics" data-track-name="${track.name}" data-track-artist="${artists}" title="Paroles">
                            <i class="fas fa-microphone-alt"></i>
                        </button>
                        <button class="premium-action-btn queue" data-track-uri="${track.uri}" title="Ajouter à la file">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <div class="premium-track-duration">${duration}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = tracksHTML;
    }

    // Recently Played Functions
    async loadRecentlyPlayed() {
        try {
            const response = await fetch('/api/player/recently-played?limit=50');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            this.displayRecentlyPlayed(data.items);
            console.log('✅ Recently played tracks loaded:', data.items.length);
        } catch (error) {
            console.error('❌ Error loading recently played tracks:', error);
            this.showNotification('Erreur lors du chargement des pistes récentes', 'error');
        }
    }

    displayRecentlyPlayed(tracks) {
        const container = document.getElementById('recent-tracks');
        if (!container) return;

        if (!tracks || tracks.length === 0) {
            container.innerHTML = `
                <div class="premium-empty-state">
                    <div class="premium-empty-icon">
                        <i class="fas fa-clock"></i>
                    </div>
                    <div class="premium-empty-title">Aucune piste récente</div>
                    <div class="premium-empty-text">Votre historique d'écoute Spotify apparaîtra ici avec style</div>
                    <button class="premium-btn" onclick="window.open('https://open.spotify.com', '_blank')">
                        <i class="fas fa-play"></i>
                        Commencer l'écoute
                    </button>
                </div>
            `;
            return;
        }

        const tracksHTML = tracks.map((item, index) => {
            const track = item.track;
            const artists = track.artists.map(artist => artist.name).join(', ');
            const duration = this.formatTime(track.duration_ms);
            const playedAt = new Date(item.played_at);
            const timeAgo = this.getTimeAgo(playedAt);
            const albumImage = track.album.images && track.album.images.length > 0 
                ? track.album.images[track.album.images.length - 1].url 
                : '';

            return `
                <div class="premium-track-item" data-track-id="${track.id}" data-track-uri="${track.uri}">
                    <div class="premium-album-cover">
                        ${albumImage ? `<img src="${albumImage}" alt="${track.album.name}" loading="lazy">` : '<i class="fas fa-music"></i>'}
                    </div>
                    <div class="premium-track-info">
                        <div class="premium-track-title">${track.name}</div>
                        <div class="premium-track-artist">${artists}</div>
                        <div class="premium-track-album">${track.album.name}</div>
                        <div class="premium-track-played-at">${timeAgo}</div>
                    </div>
                    <div class="premium-track-actions">
                        <button class="premium-action-btn play" data-track-uri="${track.uri}" title="Relire">
                            <i class="fas fa-redo"></i>
                        </button>
                        <button class="premium-action-btn lyrics" data-track-name="${track.name}" data-track-artist="${artists}" title="Paroles">
                            <i class="fas fa-microphone-alt"></i>
                        </button>
                        <button class="premium-action-btn" onclick="app.addToQueue('${track.uri}')" title="Ajouter à la file">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <div class="premium-track-duration">${duration}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = tracksHTML;
    }

    // Spotify Player Functions
    async initializeWebPlayback() {
        if (!window.spotifyToken) {
            return null;
        }

        return new Promise((resolve, reject) => {
            const setupPlayer = () => {
                if (!window.Spotify) {
                    setTimeout(setupPlayer, 300);
                    return;
                }

                if (this.webPlaybackPlayer) {
                    resolve(this.webPlaybackDeviceId);
                    return;
                }

                this.webPlaybackPlayer = new Spotify.Player({
                    name: 'Spootify Web Player',
                    getOAuthToken: cb => cb(window.spotifyToken)
                });

                this.webPlaybackPlayer.addListener('ready', ({ device_id }) => {
                    this.webPlaybackDeviceId = device_id;
                    fetch('/api/player/transfer', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ device_id, play: false })
                    }).finally(() => resolve(device_id));
                });

                this.webPlaybackPlayer.addListener('initialization_error', ({ message }) => reject(message));
                this.webPlaybackPlayer.addListener('authentication_error', ({ message }) => reject(message));
                this.webPlaybackPlayer.addListener('account_error', ({ message }) => reject(message));
                this.webPlaybackPlayer.addListener('playback_error', ({ message }) => console.error('Playback error:', message));

                this.webPlaybackPlayer.connect();
            };

            setupPlayer();
        });
    }

    async hasActiveSpotifyDevice() {
        try {
            const response = await fetch('/api/player/devices');
            if (!response.ok) return false;
            const data = await response.json();
            if (data.devices && data.devices.some(d => d.is_active)) {
                return true;
            }

            const deviceId = await this.initializeWebPlayback();
            return !!deviceId;
        } catch (error) {
            console.error('Erreur lors de la vérification des appareils:', error);
            return false;
        }
    }

    async playSpotifyTrack(uri) {
        // Éviter les appels multiples pour le même URI
        if (this.currentPlayingUri === uri && this.isPlayingSpotify) {
            return;
        }
        
        // Éviter les appels simultanés
        if (this.isPlayingTrack) {
            return;
        }
        
        this.isPlayingTrack = true;
        
        try {
            // Pour les titres likés, toujours utiliser le lecteur web directement
            if (uri.includes('spotify:track:') && this.likedTracksData && this.likedTracksData.length > 0) {
                const track = this.likedTracksData.find(item => item.track.uri === uri);
                if (track && track.track.preview_url) {
                    this.showNotification('🎵 Lecture avec le lecteur web intégré...', 'info');
                    await this.playLikedTracksWithWebPlayer();
                    // Trouver l'index du titre et le jouer
                    const trackIndex = this.likedTracksData.findIndex(item => item.track.uri === uri);
                    if (trackIndex !== -1) {
                        this.playLikedTrackByIndex(trackIndex);
                    }
                    return;
                } else {
                    // Proposer des alternatives pour les titres sans aperçu
                    await this.findAlternativeForTrack(track.track);
                    return;
                }
            }

            // Vérifier d'abord s'il y a un appareil Spotify actif
            if (!(await this.hasActiveSpotifyDevice())) {
                this.showNotification('🔄 Spotify non disponible. Recherche d\'une alternative locale...', 'warning');
                await this.tryPlayLocalAlternative(uri);
                return;
            }

            // Pour les autres titres, essayer Spotify d'abord
            const response = await fetch('/api/player/play', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uris: [uri] })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));

                if (response.status === 404) {
                    this.showNotification('🔄 Spotify non disponible. Recherche d\'une alternative locale...', 'warning');
                    await this.tryPlayLocalAlternative(uri);
                    return;
                }

                if (response.status === 401) {
                    this.showNotification('❌ Session expirée. Reconnexion nécessaire.', 'error');
                    window.location.href = '/auth/spotify';
                    return;
                }

                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            
            this.currentPlayingUri = uri;
            this.isPlayingSpotify = true;
            this.showNotification('🎵 Lecture Spotify en cours...', 'success');
        } catch (error) {
            console.error('❌ Error playing track:', error);
            this.showNotification('🔄 Erreur Spotify. Recherche d\'une alternative locale...', 'warning');
            await this.tryPlayLocalAlternative(uri);
        } finally {
            // Libérer le verrou après un délai
            setTimeout(() => {
                this.isPlayingTrack = false;
            }, 1000);
        }
    }

    async playLikedTracks() {
        try {
            if (!(await this.hasActiveSpotifyDevice())) {
                this.showNotification('🔄 Spotify non disponible. Basculement vers le lecteur web...', 'warning');
                await this.playLikedTracksWithWebPlayer();
                return;
            }

            const response = await fetch('/api/player/liked-tracks/play', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ offset: 0 })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                
                if (response.status === 401) {
                    this.showNotification('🔐 Vous devez vous connecter à Spotify pour accéder à vos titres likés', 'error');
                    window.location.href = '/auth/login';
                    return;
                }
                
                if (response.status === 404) {
                    this.showNotification('🔄 Spotify non disponible. Basculement vers le lecteur web...', 'warning');
                    await this.playLikedTracksWithWebPlayer();
                    return;
                }
                
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            
            this.showNotification('🎵 Lecture des titres likés...', 'success');
        } catch (error) {
            console.error('❌ Error playing liked tracks:', error);
            this.showNotification('🔄 Erreur Spotify. Basculement vers le lecteur web...', 'warning');
            await this.playLikedTracksWithWebPlayer();
        }
    }

    switchDevice(deviceId) {
        if (this.socket) {
            this.socket.emit('switch_device', deviceId);
        }
    }

    async checkAndShowDevices() {
        try {
            const response = await fetch('/api/player/devices');
            if (response.ok) {
                const devices = await response.json();
                if (devices.devices && devices.devices.length > 0) {
                    const activeDevices = devices.devices.filter(d => d.is_active);
                    if (activeDevices.length === 0) {
                        this.showNotification('💡 Astuce: Ouvrez Spotify sur un appareil et lancez une musique pour activer la lecture à distance.', 'info');
                    }
                } else {
                    this.showNotification('💡 Aucun appareil Spotify détecté. Assurez-vous que Spotify est ouvert sur au moins un appareil.', 'info');
                }
            }
        } catch (error) {
            console.error('Erreur lors de la vérification des appareils:', error);
        }
    }

    async tryPlayLocalAlternative(spotifyUri) {
        try {
            // Extract track info from Spotify URI or current track data
            let trackName = '';
            let artistName = '';
            
            // If we have current track info from Spotify search results
            const searchResults = document.querySelectorAll('.track-item');
            for (const item of searchResults) {
                if (item.dataset.uri === spotifyUri) {
                    trackName = item.querySelector('h4')?.textContent || '';
                    artistName = item.querySelector('p')?.textContent?.split(' • ')[0] || '';
                    break;
                }
            }
            
            // Search in local library for similar tracks
            if (trackName && artistName) {
                const localMatch = this.localLibrary.find(track => 
                    track.title.toLowerCase().includes(trackName.toLowerCase()) ||
                    track.artist.toLowerCase().includes(artistName.toLowerCase()) ||
                    trackName.toLowerCase().includes(track.title.toLowerCase())
                );
                
                if (localMatch) {
                    this.showNotification(`🎵 Lecture locale: ${localMatch.title} - ${localMatch.artist}`, 'success');
                    await this.playLocalTrack(localMatch.id);
                    return;
                }
            }
            
            // If no match found, play first available local track or show message
            if (this.localLibrary.length > 0) {
                const randomTrack = this.localLibrary[Math.floor(Math.random() * this.localLibrary.length)];
                this.showNotification(`🎵 Lecture aléatoire locale: ${randomTrack.title}`, 'info');
                await this.playLocalTrack(randomTrack.id);
            } else {
                this.showNotification('📁 Aucune musique locale disponible. Ajoutez des fichiers audio.', 'warning');
                this.showUploadModal();
            }
        } catch (error) {
            console.error('Error playing local alternative:', error);
            this.showNotification('❌ Erreur lors de la lecture locale', 'error');
        }
    }

    // Lecteur Audio Web Intégré
    initWebPlayer() {
        this.webPlayer = {
            audio: document.getElementById('local-audio-player'),
            container: document.getElementById('web-audio-player'),
            playBtn: document.getElementById('web-player-play'),
            prevBtn: document.getElementById('web-player-prev'),
            nextBtn: document.getElementById('web-player-next'),
            progressSlider: document.getElementById('web-player-progress-slider'),
            volumeSlider: document.getElementById('web-player-volume-slider'),
            volumeBtn: document.getElementById('web-player-volume-btn'),
            currentTime: document.getElementById('web-player-current-time'),
            duration: document.getElementById('web-player-duration'),
            title: document.getElementById('web-player-title'),
            artist: document.getElementById('web-player-artist'),
            cover: document.getElementById('web-player-cover'),
            currentTrack: null,
            playlist: [],
            currentIndex: 0,
            isPlaying: false
        };

        this.setupWebPlayerEvents();
    }

    setupWebPlayerEvents() {
        const wp = this.webPlayer;
        if (!wp.audio || !wp.playBtn) return;

        // Contrôles de lecture
        wp.playBtn.addEventListener('click', () => this.webPlayerTogglePlay());
        wp.prevBtn?.addEventListener('click', () => this.webPlayerPrevious());
        wp.nextBtn?.addEventListener('click', () => this.webPlayerNext());

        // Contrôle de progression
        wp.progressSlider?.addEventListener('input', (e) => {
            const time = (e.target.value / 100) * wp.audio.duration;
            wp.audio.currentTime = time;
        });

        // Contrôle de volume
        wp.volumeSlider?.addEventListener('input', (e) => {
            wp.audio.volume = e.target.value / 100;
            this.updateWebPlayerVolumeIcon(e.target.value);
        });

        wp.volumeBtn?.addEventListener('click', () => {
            wp.audio.muted = !wp.audio.muted;
            this.updateWebPlayerVolumeIcon(wp.audio.muted ? 0 : wp.volumeSlider.value);
        });

        // Événements audio
        wp.audio.addEventListener('loadedmetadata', () => this.updateWebPlayerDuration());
        wp.audio.addEventListener('timeupdate', () => this.updateWebPlayerProgress());
        wp.audio.addEventListener('play', () => this.updateWebPlayerPlayButton(true));
        wp.audio.addEventListener('pause', () => this.updateWebPlayerPlayButton(false));
        wp.audio.addEventListener('ended', () => this.webPlayerNext());
        wp.audio.addEventListener('error', (e) => {
            console.error('Erreur de lecture audio:', e);
            this.showNotification('Erreur lors de la lecture du fichier audio', 'error');
        });

        // Initialiser le volume
        wp.audio.volume = 0.7;
    }

    webPlayerLoadTrack(track) {
        const wp = this.webPlayer;
        wp.currentTrack = track;
        
        // Utiliser l'URL directe pour les aperçus Spotify ou l'API locale pour les fichiers locaux
        if (track.is_spotify_preview && track.url) {
            wp.audio.src = track.url;
        } else {
            wp.audio.src = `/api/local/stream/${track.id}`;
        }
        
        // Gérer les erreurs de chargement audio
        wp.audio.onerror = () => {
            console.warn('Erreur de chargement audio pour:', track.title);
            this.showNotification(`⏭️ Aperçu indisponible, passage au suivant...`, 'warning');
            // Passer automatiquement au titre suivant après 1 seconde
            setTimeout(() => {
                if (this.likedTracksPlaylist && this.likedTracksPlaylist.length > 1) {
                    this.playNextLikedTrack();
                }
            }, 1000);
        };
        
        // Mettre à jour l'interface
        if (wp.title) wp.title.textContent = track.title || 'Titre inconnu';
        if (wp.artist) wp.artist.textContent = track.artist || 'Artiste inconnu';
        
        // Charger la cover si disponible
        if (track.cover && wp.cover) {
            wp.cover.src = track.cover;
            wp.cover.onload = () => wp.cover.classList.add('loaded');
        } else if (wp.cover) {
            wp.cover.classList.remove('loaded');
        }
        
        // Afficher le lecteur
        this.showWebPlayer();
    }

    webPlayerTogglePlay() {
        const wp = this.webPlayer;
        if (wp.audio.paused) {
            wp.audio.play().catch(e => {
                console.error('Erreur de lecture:', e);
                this.showNotification('Impossible de lire le fichier audio', 'error');
            });
        } else {
            wp.audio.pause();
        }
    }

    webPlayerPrevious() {
        const wp = this.webPlayer;
        if (wp.playlist.length > 0) {
            wp.currentIndex = wp.currentIndex > 0 ? wp.currentIndex - 1 : wp.playlist.length - 1;
            this.webPlayerLoadTrack(wp.playlist[wp.currentIndex]);
            if (wp.isPlaying) {
                wp.audio.play();
            }
        } else if (wp.likedTracks && wp.likedTracks.length > 0) {
            // Navigation dans les titres likés
            this.playPreviousLikedTrack();
        }
    }

    webPlayerNext() {
        const wp = this.webPlayer;
        if (wp.playlist.length > 0) {
            wp.currentIndex = (wp.currentIndex + 1) % wp.playlist.length;
            this.webPlayerLoadTrack(wp.playlist[wp.currentIndex]);
            if (wp.isPlaying) {
                wp.audio.play();
            }
        } else if (wp.likedTracks && wp.likedTracks.length > 0) {
            // Navigation dans les titres likés
            this.playNextLikedTrack();
        }
    }

    updateWebPlayerProgress() {
        const wp = this.webPlayer;
        if (wp.audio.duration && wp.progressSlider && wp.currentTime) {
            const progress = (wp.audio.currentTime / wp.audio.duration) * 100;
            wp.progressSlider.value = progress;
            wp.currentTime.textContent = this.formatTime(wp.audio.currentTime * 1000);
        }
    }

    updateWebPlayerDuration() {
        const wp = this.webPlayer;
        if (wp.duration) {
            wp.duration.textContent = this.formatTime(wp.audio.duration * 1000);
        }
    }

    updateWebPlayerPlayButton(isPlaying) {
        const wp = this.webPlayer;
        wp.isPlaying = isPlaying;
        const icon = wp.playBtn?.querySelector('i');
        if (icon) {
            icon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play';
        }
    }

    updateWebPlayerVolumeIcon(volume) {
        const wp = this.webPlayer;
        const icon = wp.volumeBtn?.querySelector('i');
        if (icon) {
            if (volume == 0) {
                icon.className = 'fas fa-volume-mute';
            } else if (volume < 50) {
                icon.className = 'fas fa-volume-down';
            } else {
                icon.className = 'fas fa-volume-up';
            }
        }
    }

    showWebPlayer() {
        const wp = this.webPlayer;
        if (wp.container) {
            wp.container.style.display = 'block';
            wp.container.classList.add('show');
            
            // Ajouter du padding au body pour éviter que le contenu soit caché
            document.body.style.paddingBottom = '120px';
        }
    }

    hideWebPlayer() {
        const wp = this.webPlayer;
        if (wp.container) {
            wp.container.style.display = 'none';
            wp.container.classList.remove('show');
            document.body.style.paddingBottom = '0';
        }
    }

    // Modifier la fonction playLocalTrack pour utiliser le nouveau lecteur
    async playLocalTrackWithWebPlayer(trackId) {
        try {
            const response = await fetch(`/api/local/tracks/${trackId}`);
            if (!response.ok) throw new Error('Piste non trouvée');
            
            const track = await response.json();
            
            // Charger la playlist locale actuelle
            const libraryResponse = await fetch('/api/local/library');
            if (libraryResponse.ok) {
                const library = await libraryResponse.json();
                this.webPlayer.playlist = library.tracks || [];
                this.webPlayer.currentIndex = this.webPlayer.playlist.findIndex(t => t.id === trackId);
            }
            
            this.webPlayerLoadTrack(track);
            this.webPlayer.audio.play();
            
            this.showNotification(`🎵 Lecture: ${track.title}`, 'success');
        } catch (error) {
            console.error('Erreur lors de la lecture:', error);
            this.showNotification('Erreur lors de la lecture du fichier local', 'error');
        }
    }

    async playLikedTracksWithWebPlayer() {
        try {
            // Vérifier d'abord si l'utilisateur est connecté en testant une route simple
            const authCheck = await fetch('/api/player/status');
            if (authCheck.status === 401) {
                this.showNotification('🔐 Session expirée. Redirection vers la connexion...', 'warning');
                setTimeout(() => {
                    window.location.href = '/auth/login';
                }, 2000);
                return;
            }
            
            this.showNotification('🎵 Recherche des aperçus disponibles...', 'info');
            
            // Charger le premier lot d'aperçus rapidement
            let allTracksWithPreviews = [];
            let offset = 0;
            const limit = 50;
            let hasMore = true;
            let isFirstBatch = true;
            
            while (hasMore) {
                const response = await fetch(`/api/player/liked-tracks/previews?limit=${limit}&offset=${offset}`);
                if (!response.ok) {
                    if (response.status === 401) {
                        this.showNotification('🔐 Session expirée. Redirection vers la connexion...', 'warning');
                        setTimeout(() => {
                            window.location.href = '/auth/login';
                        }, 2000);
                        return;
                    }
                    throw new Error(`Erreur lors du chargement: ${response.status}`);
                }
                
                const data = await response.json();
                allTracksWithPreviews = allTracksWithPreviews.concat(data.tracks);
                
                // Commencer la lecture dès le premier lot d'aperçus trouvé
                if (isFirstBatch && allTracksWithPreviews.length > 0) {
                    this.likedTracksPlaylist = allTracksWithPreviews.map(track => ({
                        id: track.id,
                        title: track.name,
                        artist: track.artists,
                        album: track.album.name,
                        duration: Math.floor(track.duration_ms / 1000),
                        url: track.preview_url,
                        cover: track.album.images && track.album.images.length > 0 
                            ? track.album.images[0].url 
                            : '/images/default-cover.jpg',
                        is_spotify_preview: true,
                        uri: track.uri
                    }));
                    
                    this.currentLikedTrackIndex = 0;
                    
                    // Jouer la première piste immédiatement
                    const firstTrack = this.likedTracksPlaylist[0];
                    this.webPlayerLoadTrack(firstTrack);
                    this.showWebPlayer();
                    
                    this.showNotification(`🎵 Lecture démarrée ! (${allTracksWithPreviews.length} aperçus, chargement en cours...)`, 'success');
                    isFirstBatch = false;
                }
                
                // Vérifier s'il y a plus de titres à charger
                hasMore = data.tracks.length === limit;
                offset += limit;
                
                // Continuer le chargement en arrière-plan
                if (hasMore) {
                    // Petite pause pour ne pas surcharger l'API
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
            
            if (allTracksWithPreviews.length === 0) {
                this.showNotification('❌ Aucun aperçu disponible pour vos titres likés. Essayez de vous reconnecter à Spotify.', 'error');
                return;
            }
            
            // Mise à jour finale de la playlist
            this.likedTracksPlaylist = allTracksWithPreviews.map(track => ({
                id: track.id,
                title: track.name,
                artist: track.artists,
                album: track.album.name,
                duration: Math.floor(track.duration_ms / 1000),
                url: track.preview_url,
                cover: track.album.images && track.album.images.length > 0 
                    ? track.album.images[0].url 
                    : '/images/default-cover.jpg',
                is_spotify_preview: true,
                uri: track.uri
            }));
            
            this.showNotification(`🎵 ${allTracksWithPreviews.length} aperçus chargés et prêts !`, 'success');
            
        } catch (error) {
            console.error('❌ Error playing liked tracks with web player:', error);
            this.showNotification(`❌ Erreur: ${error.message}`, 'error');
        }
    }

    playLikedTrackByIndex(index) {
        if (!this.likedTracksPlaylist || index < 0 || index >= this.likedTracksPlaylist.length) {
            return;
        }
        
        this.currentLikedTrackIndex = index;
        const track = this.likedTracksPlaylist[index];
        this.webPlayerLoadTrack(track);
    }

    playNextLikedTrack() {
        if (!this.likedTracksPlaylist) return;
        
        const nextIndex = (this.currentLikedTrackIndex + 1) % this.likedTracksPlaylist.length;
        this.playLikedTrackByIndex(nextIndex);
    }

    playPreviousLikedTrack() {
        if (!this.likedTracksPlaylist) return;
        
        const prevIndex = this.currentLikedTrackIndex === 0 
            ? this.likedTracksPlaylist.length - 1 
            : this.currentLikedTrackIndex - 1;
        this.playLikedTrackByIndex(prevIndex);
    }

    // Unified playback control that works with both Spotify and local files
    async unifiedTogglePlayback() {
        // Check if we're playing a local track
        const localAudio = document.getElementById('localAudio');
        if (localAudio && this.currentTrack?.is_local) {
            if (this.isPlaying) {
                localAudio.pause();
                this.isPlaying = false;
            } else {
                await localAudio.play();
                this.isPlaying = true;
            }
            this.updatePlayButton();
            return;
        }
        
        // Otherwise use Spotify controls
        await this.togglePlayback();
    }

    // Recherche dans les titres likés
    searchLikedTracks(query) {
        const likedTracksContainer = document.getElementById('liked-tracks');
        if (!likedTracksContainer) return;

        const trackItems = likedTracksContainer.querySelectorAll('.premium-track-item');
        
        if (!query.trim()) {
            // Afficher tous les titres
            trackItems.forEach(item => {
                item.classList.remove('search-hidden', 'search-highlight');
                item.style.display = '';
            });
            return;
        }

        const searchTerm = query.toLowerCase().trim();
        let visibleCount = 0;

        trackItems.forEach(item => {
            const title = item.querySelector('.track-title')?.textContent?.toLowerCase() || '';
            const artist = item.querySelector('.track-artist')?.textContent?.toLowerCase() || '';
            const album = item.querySelector('.track-album')?.textContent?.toLowerCase() || '';
            
            const matches = title.includes(searchTerm) || 
                          artist.includes(searchTerm) || 
                          album.includes(searchTerm);
            
            if (matches) {
                item.classList.remove('search-hidden');
                item.classList.add('search-highlight');
                item.style.display = '';
                visibleCount++;
            } else {
                item.classList.add('search-hidden');
                item.classList.remove('search-highlight');
                item.style.display = 'none';
            }
        });

        // Afficher le nombre de résultats
        this.showNotification(`🔍 ${visibleCount} titre(s) trouvé(s)`, 'info');
    }

    // Charger plus de titres likés (fonction pour extension future)
    async loadMoreLikedTracks() {
        try {
            this.showNotification('🔄 Chargement de titres supplémentaires...', 'info');
            
            // Pour l'instant, on recharge tous les titres
            // Cette fonction peut être étendue pour implémenter un vrai "load more"
            await this.loadLikedTracks();
            
            this.showNotification('✅ Titres actualisés', 'success');
        } catch (error) {
            console.error('❌ Error loading more liked tracks:', error);
            this.showNotification('❌ Erreur lors du chargement', 'error');
        }
    }

    // Lecture rapide des titres likés
    async quickPlayLikedTracks() {
        try {
            this.showNotification('🚀 Démarrage rapide...', 'info');
            
            // Vérifier s'il y a déjà des titres chargés
            const likedTracksContainer = document.getElementById('liked-tracks');
            const existingTracks = likedTracksContainer.querySelectorAll('.track-item');
            
            if (existingTracks.length > 0) {
                // Utiliser les titres déjà affichés
                const tracks = Array.from(existingTracks).map(trackElement => {
                    const uri = trackElement.dataset.uri;
                    const name = trackElement.querySelector('.track-name').textContent;
                    const artist = trackElement.querySelector('.track-artist').textContent;
                    const previewUrl = trackElement.dataset.preview;
                    
                    return {
                        uri,
                        name,
                        artists: [{ name: artist }],
                        preview_url: previewUrl
                    };
                });
                
                // Filtrer les titres avec aperçu
                const tracksWithPreview = tracks.filter(track => track.preview_url);
                
                if (tracksWithPreview.length > 0) {
                    this.likedTracksWithPreviews = tracksWithPreview;
                    this.currentLikedTrackIndex = 0;
                    this.webPlayerLoadTrack(tracksWithPreview[0]);
                    this.showWebPlayer();
                    this.showNotification(`🎵 Lecture rapide démarrée ! ${tracksWithPreview.length} titres avec aperçu`, 'success');
                } else {
                    this.showNotification('🎵 Aucun aperçu dans les titres affichés. Chargement de recommandations...', 'info');
                    await this.loadRecommendations();
                }
            } else {
                // Charger rapidement les premiers titres
                const response = await fetch('/api/player/liked-tracks/previews?limit=20');
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const data = await response.json();
                if (data.tracks && data.tracks.length > 0) {
                    this.likedTracksWithPreviews = data.tracks;
                    this.currentLikedTrackIndex = 0;
                    this.webPlayerLoadTrack(data.tracks[0]);
                    this.showWebPlayer();
                    this.showNotification(`🎵 Lecture rapide démarrée ! ${data.tracks.length} titres disponibles`, 'success');
                } else {
                    this.showNotification('🎵 Aucun titre avec aperçu trouvé. Chargement de recommandations...', 'info');
                    await this.loadRecommendations();
                }
            }
        } catch (error) {
            console.error('Erreur lors du démarrage rapide:', error);
            if (error.message.includes('401')) {
                this.showNotification('🔐 Session expirée. Veuillez vous reconnecter.', 'error');
            } else {
                this.showNotification('❌ Erreur lors du démarrage rapide', 'error');
            }
        }
    }

    // Trouver des alternatives pour un titre sans aperçu
    async findAlternativeForTrack(track) {
        try {
            this.showNotification('🔍 Recherche d\'alternatives avec aperçu...', 'info');
            
            const trackName = track.name;
            const artistName = track.artists[0]?.name || '';
            
            // Rechercher des alternatives
            const response = await fetch(`/api/player/liked-tracks/alternatives?trackName=${encodeURIComponent(trackName)}&artistName=${encodeURIComponent(artistName)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.alternatives && data.alternatives.length > 0) {
                // Jouer la meilleure alternative
                const bestAlternative = data.alternatives[0];
                this.showNotification(`🎵 Alternative trouvée: ${bestAlternative.name} - ${bestAlternative.artists}`, 'success');
                
                // Créer une playlist temporaire avec l'alternative
                this.likedTracksPlaylist = [{
                    id: bestAlternative.id,
                    title: bestAlternative.name,
                    artist: bestAlternative.artists,
                    album: bestAlternative.album.name,
                    duration: Math.floor(bestAlternative.duration_ms / 1000),
                    url: bestAlternative.preview_url,
                    cover: bestAlternative.album.images && bestAlternative.album.images.length > 0 
                        ? bestAlternative.album.images[0].url 
                        : '/images/default-cover.jpg',
                    is_spotify_preview: true,
                    uri: bestAlternative.uri
                }];
                
                this.currentLikedTrackIndex = 0;
                this.webPlayerLoadTrack(this.likedTracksPlaylist[0]);
                this.showWebPlayer();
            } else {
                // Aucune alternative trouvée, proposer des recommandations
                this.showNotification('🎵 Aucune alternative trouvée. Chargement de recommandations...', 'info');
                await this.loadRecommendations();
            }
            
        } catch (error) {
            console.error('Erreur lors de la recherche d\'alternatives:', error);
            this.showNotification('❌ Impossible de trouver des alternatives. Essayez les recommandations.', 'warning');
            await this.loadRecommendations();
        }
    }

    // Charger des recommandations basées sur les titres likés
    async loadRecommendations() {
        try {
            const response = await fetch('/api/player/liked-tracks/recommendations?limit=10');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.tracks && data.tracks.length > 0) {
                this.showNotification(`🎵 ${data.tracks.length} recommandations trouvées !`, 'success');
                
                // Créer une playlist avec les recommandations
                this.likedTracksPlaylist = data.tracks.map(track => ({
                    id: track.id,
                    title: track.name,
                    artist: track.artists,
                    album: track.album.name,
                    duration: Math.floor(track.duration_ms / 1000),
                    url: track.preview_url,
                    cover: track.album.images && track.album.images.length > 0 
                        ? track.album.images[0].url 
                        : '/images/default-cover.jpg',
                    is_spotify_preview: true,
                    uri: track.uri
                }));
                
                this.currentLikedTrackIndex = 0;
                this.webPlayerLoadTrack(this.likedTracksPlaylist[0]);
                this.showWebPlayer();
            } else {
                this.showNotification('❌ Aucune recommandation disponible. Essayez de vous reconnecter.', 'error');
            }
            
        } catch (error) {
            console.error('Erreur lors du chargement des recommandations:', error);
            if (error.message.includes('401')) {
                this.showNotification('🔐 Session expirée. Veuillez vous reconnecter.', 'error');
            } else {
                this.showNotification('❌ Erreur lors du chargement des recommandations', 'error');
            }
        }
    }
}

// Initialize app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new SpootifyApp();
});

// Export for global access
window.SpootifyApp = SpootifyApp;