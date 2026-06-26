// --- CORE FEED STATE ---
let selectedCategories = new Set();
let filterState = {
    new: sessionStorage.getItem('distill_filter_new') !== 'false',
    archived: sessionStorage.getItem('distill_filter_archived') !== 'false'
};

// --- APP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Tag Selection from Preselected Data
    if (window.APP_DATA && window.APP_DATA.preselectedTags && window.APP_DATA.preselectedTags.length > 0) {
        window.APP_DATA.preselectedTags.forEach(tag => selectedCategories.add(tag));
    }

    // 2. Initial UI Scaling & Theming

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
        const sq = document.getElementById('theme-toggle-square');
        if (sq) sq.style.left = 'calc(100% - 2.5rem - 0.25rem)';
    }

    const savedColor = localStorage.getItem('distill_interact_color');
    if (typeof setInteractColor === 'function') setInteractColor(savedColor || '#FFF01F');
    if (typeof TagManager !== 'undefined') TagManager.applyColors();
    if (typeof updateFilterUI === 'function') updateFilterUI();

    // 3. Restore Active Settings Tab
    if (window.APP_DATA && window.APP_DATA.pageContext === 'settings') {
        const savedTab = sessionStorage.getItem('distill_active_settings_tab');
        if (savedTab && ['visual', 'tags', 'distill'].includes(savedTab)) {
            if (typeof switchSettingsTab === 'function') switchSettingsTab(savedTab);
        } else {
            if (typeof switchSettingsTab === 'function') switchSettingsTab('visual');
        }
    }

    // 4. Start Background Workers
    if (typeof checkNotifications === 'function') setInterval(checkNotifications, 5000);
    if (typeof updateTimer === 'function') setInterval(updateTimer, 1000);

    // 5. Handle URL Actions (Auto-open Add Channel Modal)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'add') {
        window.history.replaceState({}, document.title, window.location.pathname);
        setTimeout(() => {
            if (typeof openAddChannelModal === 'function') openAddChannelModal();
        }, 100);
    }

    // 6. Initialize Settings Interval Inputs
    const rawTotalInput = document.getElementById('raw-interval-total');
    if (rawTotalInput) {
        const totalMins = parseInt(rawTotalInput.value) || 60;
        const hInput = document.getElementById('interval-hours');
        const mInput = document.getElementById('interval-minutes');

        if (hInput) hInput.value = Math.floor(totalMins / 60);
        if (mInput) mInput.value = totalMins % 60;
    }

    const mInput = document.getElementById('interval-minutes');
    const hInput = document.getElementById('interval-hours');
    if (mInput && hInput) {
        mInput.addEventListener('blur', () => {
            let mins = parseInt(mInput.value) || 0;
            let hours = parseInt(hInput.value) || 0;
            if (mins >= 60) {
                hInput.value = hours + Math.floor(mins / 60);
                mInput.value = mins % 60;
            }
        });
    }
});

// --- GATEKEEPER LOGIC ---
function toggleCategory(btn, catName) {
    if (selectedCategories.has(catName)) {
        selectedCategories.delete(catName);
        btn.classList.remove('selected');
    } else {
        selectedCategories.add(catName);
        btn.classList.add('selected');
    }
}

function enterFeed() {
    if (selectedCategories.size === 0) {
        if (typeof spawnToast === 'function') spawnToast("Please select at least one intention.", "remove");
        return;
    }
    let url = `/?cats=${encodeURIComponent(Array.from(selectedCategories).join(','))}`;
    if (window.APP_DATA && window.APP_DATA.nextDest) {
        url += `&next=${encodeURIComponent(window.APP_DATA.nextDest)}`;
    }
    window.location.href = url;
}

// --- CHANNEL NAVIGATION & FILTERS ---
function tryOpenChannel(channelId, tagsString) {
    const channelTags = tagsString.split(',');
    const userTags = window.APP_DATA.currentIntention || [];
    const hasOverlap = channelTags.some(tag => userTags.includes(tag));

    if (hasOverlap || userTags.length === 0) {
        window.location.href = `/channel_view/${channelId}`;
    } else {
        if (typeof spawnToast === 'function') {
            spawnToast("This channel does not match your current focus!", "remove");
        }
    }
}

function exitChannel() {
    sessionStorage.removeItem('distill_filter_new');
    sessionStorage.removeItem('distill_filter_archived');
    window.location.href = "/exit_channel";
}

function toggleChannelFilter(type) {
    if (filterState[type] && !filterState[type === 'new' ? 'archived' : 'new']) {
        if (typeof spawnToast === 'function') spawnToast("At least one filter must be active.", "remove");
        return;
    }
    filterState[type] = !filterState[type];
    sessionStorage.setItem(`distill_filter_${type}`, filterState[type]);
    updateFilterUI();
}

function updateFilterUI() {
    const btnNew = document.getElementById('filter-btn-new');
    const btnArc = document.getElementById('filter-btn-archived');
    if (!btnNew || !btnArc) return;

    if (filterState.new) {
        btnNew.classList.remove('filter-off');
        btnNew.classList.add('filter-on-amber');
    } else {
        btnNew.classList.add('filter-off');
        btnNew.classList.remove('filter-on-amber');
    }

    if (filterState.archived) {
        btnArc.classList.remove('filter-off');
        btnArc.classList.add('filter-on-blue');
    } else {
        btnArc.classList.add('filter-off');
        btnArc.classList.remove('filter-on-blue');
    }

    document.querySelectorAll('.video-card').forEach(card => {
        const status = card.getAttribute('data-status');
        if (status === 'new' && !filterState.new) card.classList.add('hidden');
        else if (status === 'archived' && !filterState.archived) card.classList.add('hidden');
        else card.classList.remove('hidden');
    });
}

// --- CHANNEL MENU DROPDOWN LOGIC ---
function toggleChannelMenu(event, menuId) {
    event.stopPropagation();
    const menu = document.getElementById(menuId);
    document.querySelectorAll('[id^="menu-"]').forEach(m => {
        if (m.id !== menuId) m.classList.add('hidden');
    });
    if (menu) menu.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
    document.querySelectorAll('[id^="menu-"]').forEach(menu => {
        if (!menu.classList.contains('hidden') && !menu.contains(e.target)) {
            menu.classList.add('hidden');
        }
    });
});