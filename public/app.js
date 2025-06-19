class FilmAgeApp {
    constructor() {
        this.currentAge = 30;
        this.currentGender = 'both';
        this.results = [];
        this.captions = new Map();
        this.currentResultIndex = 0;
        this.expandedCard = null;
        
        this.initializeElements();
        this.attachEventListeners();
        this.loadFromLocalStorage();
        this.setupCharacterClickHandlers();
    }

    initializeElements() {
        this.ageInput = document.getElementById('age');
        this.searchBtn = document.getElementById('searchBtn');
        this.resultsContainer = document.getElementById('results');
        this.genderPills = document.querySelectorAll('.filter-pill');
    }

    attachEventListeners() {
        // Age input
        this.ageInput.addEventListener('input', (e) => {
            this.currentAge = parseInt(e.target.value) || 30;
            this.saveToLocalStorage();
        });

        // Gender filter pills
        this.genderPills.forEach(pill => {
            pill.addEventListener('click', (e) => {
                this.genderPills.forEach(p => p.classList.remove('active'));
                e.target.classList.add('active');
                this.currentGender = e.target.dataset.gender;
                this.saveToLocalStorage();
            });
        });

        // Search button
        this.searchBtn.addEventListener('click', () => {
            this.performSearch();
        });

        // Enter key on age input
        this.ageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.performSearch();
            }
        });
    }

    loadFromLocalStorage() {
        const saved = localStorage.getItem('filmage-preferences');
        if (saved) {
            try {
                const prefs = JSON.parse(saved);
                if (prefs.age) {
                    this.currentAge = prefs.age;
                    this.ageInput.value = prefs.age;
                }
                if (prefs.gender) {
                    this.currentGender = prefs.gender;
                    this.genderPills.forEach(pill => {
                        pill.classList.toggle('active', pill.dataset.gender === prefs.gender);
                    });
                }
            } catch (error) {
                console.error('Error loading preferences:', error);
            }
        }
    }

    saveToLocalStorage() {
        const prefs = {
            age: this.currentAge,
            gender: this.currentGender
        };
        localStorage.setItem('filmage-preferences', JSON.stringify(prefs));
    }

    setupCharacterClickHandlers() {
        // Use event delegation for character links
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('character-link')) {
                const characterName = e.target.getAttribute('data-character');
                const movieTitle = e.target.getAttribute('data-movie');
                const actorName = e.target.getAttribute('data-actor');
                this.searchCharacterImages(characterName, movieTitle, actorName);
            }
        });
    }

    async performSearch() {
        if (!this.currentAge || this.currentAge < 1 || this.currentAge > 100) {
            this.showError('Please enter a valid age between 1 and 100');
            return;
        }

        // Hide input, show results
        document.querySelector('.controls').classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => {
            document.querySelector('.controls').classList.add('hidden');
        }, 250);

        this.showLoading();
        this.searchBtn.disabled = true;

        try {
            const response = await fetch(`/api/search?age=${this.currentAge}&gender=${this.currentGender}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.results = data.results || [];
            
            if (this.results.length === 0) {
                this.showNoResults();
            } else {
                this.displayResults();
            }
        } catch (error) {
            console.error('Search error:', error);
            this.showError('Failed to search. Please try again.');
        } finally {
            this.searchBtn.disabled = false;
        }
    }

    showLoading() {
        this.resultsContainer.innerHTML = `
            <div class="animate-pulse flex flex-col items-center gap-6 py-12">
                <div class="w-24 h-24 rounded-full bg-white/10 mb-4"></div>
                <div class="h-6 w-2/3 rounded bg-white/10"></div>
                <div class="h-4 w-1/2 rounded bg-white/10"></div>
                <div class="h-4 w-1/3 rounded bg-white/10"></div>
            </div>
        `;
    }

    showError(message) {
        this.resultsContainer.innerHTML = `
            <div class="error">
                ${message}
            </div>
        `;
    }

    showNoResults() {
        let message;
        if (this.currentGender === 'actresses') {
            message = `We can't find any actresses who were your age. Remember: Hollywood is a sexist, ageist cesspool.`;
        } else {
            message = `No matches found for age ${this.currentAge}. Try a different age or check back later as we add more movies!`;
        }
        this.resultsContainer.innerHTML = `
            <div class="error">
                ${message}
            </div>
        `;
    }

    displayResults() {
        if (this.results.length === 0) return;
        
        this.currentResultIndex = 0;
        this.showSingleResult();
    }

    showSingleResult() {
        const result = this.results[0];
        if (!result) return;

        let pronoun = 'they';
        if (result.actor.gender === 1) pronoun = 'she';
        if (result.actor.gender === 2) pronoun = 'he';
        
        const resultHtml = `
            <div class="result-container flex flex-col items-center justify-center animate-fade-in">
                <div class="bg-white/10 backdrop-blur-md rounded-2xl shadow-xl p-8 w-full max-w-md flex flex-col items-center mb-8">
                    <div class="result-text text-center text-lg font-medium text-white mb-6">
                        You're the same age as <span class="actor-highlight font-bold">${result.actor.name}</span> was when ${pronoun} played <span class="character-highlight character-link underline cursor-pointer" data-character="${result.role.character_name}" data-movie="${result.movie.title}" data-actor="${result.actor.name}">${result.role.character_name || 'their character'}</span> in <span class="movie-highlight italic font-bold">${result.movie.title}</span> back in <span class="year-highlight text-gray-400">${result.movie.release_year}</span>.
                    </div>
                    <button class="nav-button bg-white text-black rounded-lg font-bold uppercase tracking-widest transition hover:bg-gray-200 px-8 py-3 mt-2 w-full" id="next-btn" onclick="filmAge.showAllResults()">
                        See ${this.results.length > 1 ? `all ${this.results.length} matches` : 'more info'} →
                    </button>
                </div>
            </div>
        `;

        this.resultsContainer.innerHTML = resultHtml;
    }

    showAllResults() {
        if (this.results.length === 0) return;
        
        const resultsHtml = this.results.map((result, index) => {
            let pronoun = 'they';
            if (result.actor.gender === 1) pronoun = 'she';
            if (result.actor.gender === 2) pronoun = 'he';
            
            return `
                <div class="result-item bg-white/5 rounded-2xl p-6 mb-6 shadow-sm hover:bg-white/10 transition flex flex-col gap-2" data-index="${index}">
                    <div class="result-text text-base text-white mb-2">
                        <span class="actor-highlight font-bold">${result.actor.name}</span> was ${result.role.age_at_filming} when ${pronoun} played 
                        <span class="character-highlight character-link underline cursor-pointer" data-character="${result.role.character_name}" data-movie="${result.movie.title}" data-actor="${result.actor.name}">${result.role.character_name || 'their character'}</span> in <span class="movie-highlight italic font-bold">${result.movie.title}</span> <span class="year-highlight text-gray-400">(${result.movie.release_year})</span>
                    </div>
                    <button class="share-btn bg-white/20 text-white rounded-full px-4 py-1 text-xs font-semibold flex items-center gap-2 hover:bg-white/30 transition self-start mt-1" data-index="${index}">
                        <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M15 8a3 3 0 11-6 0 3 3 0 016 0zm6 8a6 6 0 00-12 0h12z' /></svg>
                        Share
                    </button>
                </div>
            `;
        }).join('');
        
        const containerHtml = `
            <div class="results-list max-h-[70vh] overflow-y-auto px-1">
                <div class="results-header flex items-center justify-between mb-8 pb-3 border-b border-white/10">
                    <h3 class="text-lg font-semibold text-white">All ${this.results.length} actors who were ${this.currentAge}:</h3>
                    <button class="nav-button back-btn bg-white text-black rounded-lg font-bold uppercase tracking-widest transition hover:bg-gray-200 px-4 py-2" onclick="filmAge.showSingleResult()">
                        ← Back
                    </button>
                </div>
                ${resultsHtml}
            </div>
            <div id="toast" class="fixed left-1/2 bottom-8 -translate-x-1/2 z-50 hidden px-4 py-2 rounded-lg bg-white text-black font-semibold shadow-lg"></div>
        `;

        this.resultsContainer.innerHTML = containerHtml;

        // Attach share button listeners
        this.resultsContainer.querySelectorAll('.share-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = e.currentTarget.getAttribute('data-index');
                this.handleShare(idx);
            });
        });
    }

    async handleShare(index) {
        const result = this.results[index];
        const shareUrl = `${window.location.origin}/share/${result.movie.tmdb_id}/${result.actor.tmdb_id}`;
        const shareText = `You're the same age as ${result.actor.name} was when they played ${result.role.character_name} in ${result.movie.title} (${result.movie.release_year})`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'OldAFmdb',
                    text: shareText,
                    url: shareUrl
                });
            } catch (err) {
                // User cancelled or error
            }
        } else {
            try {
                await navigator.clipboard.writeText(shareUrl);
                this.showToast('Link copied!');
            } catch (err) {
                alert('Could not copy link');
            }
        }
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.remove('hidden');
        toast.classList.add('opacity-100');
        setTimeout(() => {
            toast.classList.add('hidden');
            toast.classList.remove('opacity-100');
        }, 1800);
    }

    searchCharacterImages(characterName, movieTitle, actorName) {
        if (!characterName || characterName === 'their character') {
            return;
        }
        const searchQuery = encodeURIComponent(`${movieTitle} ${actorName} ${characterName}`);
        const googleImagesUrl = `https://www.google.com/search?tbm=isch&q=${searchQuery}`;
        window.open(googleImagesUrl, '_blank');
    }

    async shareResult(movieId, actorId) {
        try {
            const response = await fetch(`/api/share/${movieId}/${actorId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            const shareUrl = `${window.location.origin}/share/${movieId}/${actorId}`;
            
            if (navigator.share) {
                // Use native sharing if available
                await navigator.share({
                    title: data.ogTitle,
                    text: data.ogDescription,
                    url: shareUrl
                });
            } else {
                // Fallback to copying URL
                await navigator.clipboard.writeText(shareUrl);
                
                // Show temporary feedback
                const button = event.target;
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                setTimeout(() => {
                    button.textContent = originalText;
                }, 2000);
            }
        } catch (error) {
            console.error('Error sharing:', error);
            alert('Sharing failed. Please try again.');
        }
    }
}

// Initialize the app
const filmAge = new FilmAgeApp();

// Add some touch animations for mobile
document.addEventListener('touchstart', function() {}, { passive: true });

// Prevent zoom on double tap for better mobile UX
let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, false);