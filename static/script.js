let timerMode = 'countdown';
let allSystemTags = window.APP_DATA.tags || []; 
const activeChannelId = window.APP_DATA.activeChannelId;
const pageContext = window.APP_DATA.pageContext;

let selectedCategories = new Set();
let pendingAction = null;
let pendingVideoId = null; 
let tagState = { mode: 'edit', dbId: null, tags: [] };
let nextRunTime = null;
let currentEditingChannelId = null;
let currentStartMode = 'now';

let filterState = { 
    new: sessionStorage.getItem('distill_filter_new') !== 'false', 
    archived: sessionStorage.getItem('distill_filter_archived') !== 'false' 
};

const PAIRS = [
    { name: 'Red',    base: '#FFB3BA', highlight: '#FF073A' },
    { name: 'Orange', base: '#FFDFBA', highlight: '#FF5F1F' },
    { name: 'Yellow', base: '#FFF9B1', highlight: '#FFF01F' },
    { name: 'Green',  base: '#BAFFC9', highlight: '#39FF14' },
    { name: 'Cyan',   base: '#67E8F9', highlight: '#00FFFF' },
    { name: 'Blue',   base: '#C2D4FF', highlight: '#1F51FF' },
    { name: 'Violet', base: '#D8B4FE', highlight: '#BC13FE' },
    { name: 'Pink',   base: '#FFC0CB', highlight: '#FF00FF' } 
];
let editingTagName = null; 

// Auto-Resize Script for Channel Cards
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Tag Selection from Preselected Data
    if (window.APP_DATA.preselectedTags && window.APP_DATA.preselectedTags.length > 0) {
        window.APP_DATA.preselectedTags.forEach(tag => selectedCategories.add(tag));
    }

    fitTextInCards();
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') { 
        document.documentElement.classList.add('dark'); 
        const sq = document.getElementById('theme-toggle-square'); 
        if(sq) sq.style.left = 'calc(100% - 2.5rem - 0.25rem)'; 
    }
    const savedColor = localStorage.getItem('distill_interact_color');
    setInteractColor(savedColor || '#FFF01F');
    TagManager.applyColors();
    if (document.getElementById('tags-settings-list')) renderSettingsTagList();
    updateFilterUI();

    // 2. Restore Active Settings Tab (Fix for Purge Reload)
    if (pageContext === 'settings') {
        const savedTab = sessionStorage.getItem('distill_active_settings_tab');
        /*
        if (savedTab) {
            switchSettingsTab(savedTab);
        }*/
        
        
        if (savedTab && ['visual', 'tags', 'distill'].includes(savedTab)) {
            switchSettingsTab(savedTab);
        } else {
            switchSettingsTab('visual');
        }
    }

    // Start Polling for Notifications
    setInterval(checkNotifications, 5000);
    // Start Timer Update
    setInterval(updateTimer, 1000);

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'add') {
        // Clean the URL so a refresh doesn't pop it again
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Small delay to ensure transitions play smoothly
        setTimeout(() => {
            if (typeof openAddChannelModal === 'function') {
                openAddChannelModal();
            }
        }, 100);
    }

    // Initialize Hours/Minutes inputs from total
    const rawTotalInput = document.getElementById('raw-interval-total');
    if (rawTotalInput) {
        // Default to 60 if empty
        const totalMins = parseInt(rawTotalInput.value) || 60;
        
        // Calculate Hours and Minutes
        const h = Math.floor(totalMins / 60);
        const m = totalMins % 60;
        
        const hInput = document.getElementById('interval-hours');
        const mInput = document.getElementById('interval-minutes');
        
        if (hInput) hInput.value = h;
        if (mInput) mInput.value = m;
    }

    // Auto-format Minutes > 59 on blur
    const mInput = document.getElementById('interval-minutes');
    const hInput = document.getElementById('interval-hours');

    if (mInput && hInput) {
        mInput.addEventListener('blur', () => {
            let mins = parseInt(mInput.value) || 0;
            let hours = parseInt(hInput.value) || 0;

            if (mins >= 60) {
                // Calculate extra hours
                const extraHours = Math.floor(mins / 60);
                const remainingMins = mins % 60;

                // Update inputs
                hInput.value = hours + extraHours;
                mInput.value = remainingMins;
            }
        });
    }
});

// --- LIVE UPDATES: REFRESH GRID WITHOUT RELOAD ---

function refreshGridState() {
    // 1. Get current context from the global data we set in HTML
    if (!window.APP_DATA) return;
    
    const context = window.APP_DATA.pageContext;
    const channelId = window.APP_DATA.activeChannelId || '';

    // Only refresh if we are viewing a video grid (Inbox, Archive, or Channel)
    if (['inbox', 'archive', 'channel_view', 'channels'].includes(context)) {
        
        // 2. Fetch new grid and counts
        fetch(`/api/refresh_view?context=${context}&channel_id=${channelId}`)
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    console.log("Live Update: Grid refreshed.");

                    // A. Swap the Video Grid HTML
                    const gridContainer = document.getElementById('video-grid-container');
                    if (gridContainer) {
                        gridContainer.innerHTML = data.html;
                        fitTextInCards(); 
                        TagManager.applyColors();
                        updateFilterUI(); 
                    }

                    // B. Update Sidebar/Navbar Counts
                    updateCountDisplay('nav-count-inbox', data.counts.inbox, data.counts.inbox_fresh);
                    updateCountDisplay('nav-count-archive', data.counts.archive, null);

                    // C. Update Channel Specific Counts (if we are in Channel View)
                    if (context === 'channel_view') {
                        updateCountDisplay('channel-count-new', data.counts.channel_new, data.counts.channel_new_fresh);
                        updateCountDisplay('channel-count-archived', data.counts.channel_archived, null);
                    }
                }
            })
            .catch(err => console.error("Live Update Failed:", err));
    }
}

// Helper to update "10 [2]" style counts in Navbar
function updateCountDisplay(elementId, total, fresh) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    let html = `${total}`;
    if (fresh && fresh > 0) {
        html += `<span class="text-deep-green ml-2 dark:text-green-400">[${fresh}]</span>`;
    }
    el.innerHTML = html;
}

// --- POLLING: CHECK FOR UPDATES ---

function checkNotifications() {
    fetch('/poll_notifications')
        .then(r => r.json())
        .then(data => {
            // 1. Update Next Run Time
            if (data.next_run) {
                nextRunTime = new Date(data.next_run);
            }

            // 2. Handle Notifications
            if (data.notifications && data.notifications.length > 0) {
                let shouldRefresh = false; // Renamed for clarity
                let shouldReload = false;
                
                data.notifications.forEach(n => {
                    spawnToast(n.msg, n.type);
                    
                    // CRITICAL FIX: Refresh on 'add' (New Content) OR 'update' (Maintenance Run)
                    // This ensures that even if 0 videos are found, we still refresh the grid
                    // to clear the "New" badges from the previous batch.
                    if (n.type === 'add' || n.type === 'update') {
                        shouldRefresh = true;
                    }
                    
                    if (n.should_reload) shouldReload = true;
                });

                // 3. TRIGGER LIVE REFRESH
                if (shouldRefresh) {
                    refreshGridState();
                }

                // 4. Handle Full Page Reload
                if (shouldReload) {
                    setTimeout(() => window.location.reload(), 2000);
                }
            }
        })
        .catch(e => console.error("Polling error:", e));
}

function updateTimer() {
    const timerEl = document.getElementById('distill-timer');
    if (!timerEl || !nextRunTime) return;

    if (timerMode === 'absolute') {
        const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        const dayStr = days[nextRunTime.getDay()];
        const h = String(nextRunTime.getHours()).padStart(2, '0');
        const m = String(nextRunTime.getMinutes()).padStart(2, '0');
        const s = String(nextRunTime.getSeconds()).padStart(2, '0');
        
        timerEl.innerText = `${dayStr}:${h}:${m}:${s}`;
        return;
    }

    const now = new Date();
    const diff = nextRunTime - now;

    if (diff <= 0) {
        timerEl.innerText = "00:00:00:00";
        return;
    }

    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);

    timerEl.innerText = 
        `${String(d).padStart(2, '0')}:${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// --- HELPER TO RENDER COUNTERS WITH BADGES (Legacy, kept for manual UI updates if needed) ---
function updateCounterUI(elementId, totalCount, freshCount = 0) {
    const el = document.getElementById(elementId);
    if (!el) return;
    let html = `${totalCount}`;
    if (freshCount > 0) {
        html += `<span class="text-deep-green ml-2">[${freshCount}]</span>`;
    }
    el.innerHTML = html;
}

function toggleStartMode(mode) {
    currentStartMode = mode;
    const btnNow = document.getElementById('btn-mode-now');
    const btnCustom = document.getElementById('btn-mode-custom');
    const dateWrapper = document.getElementById('custom-date-wrapper');
    const dateInput = document.getElementById('start-time-input');
    
    if (mode === 'now') {
        // Now is Active
        btnNow.className = "flex-1 py-3 font-bold text-lg bg-black text-white dark:bg-white dark:text-black transition-colors";
        btnCustom.className = "flex-1 py-3 font-bold text-lg bg-white text-gray-400 hover:text-[var(--interact-color)] dark:bg-black dark:text-gray-600 dark:hover:text-[var(--interact-color)] transition-colors";
        dateWrapper.classList.add('hidden');
    } else {
        // Custom is Active
        btnCustom.className = "flex-1 py-3 font-bold text-lg bg-black text-white dark:bg-white dark:text-black transition-colors";
        btnNow.className = "flex-1 py-3 font-bold text-lg bg-white text-gray-400 hover:text-[var(--interact-color)] dark:bg-black dark:text-gray-600 dark:hover:text-[var(--interact-color)] transition-colors";
        dateWrapper.classList.remove('hidden');
        
        // Native Date Logic (Unchanged)
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        const max = new Date(now);
        max.setDate(max.getDate() + 7);
        
        dateInput.min = now.toISOString().slice(0, 16);
        dateInput.max = max.toISOString().slice(0, 16);
        
        if (!dateInput.value) {
            const def = new Date(now);
            def.setHours(def.getHours() + 1);
            dateInput.value = def.toISOString().slice(0, 16);
        }
    }
}

function saveInterval() {
    const hInput = document.getElementById('interval-hours');
    const mInput = document.getElementById('interval-minutes');
    const btn = document.getElementById('save-interval-btn');
    
    // 1. Calculate Total Minutes
    const hours = parseInt(hInput.value) || 0;
    const mins = parseInt(mInput.value) || 0;
    const totalMinutes = (hours * 60) + mins;

    if (totalMinutes < 60) {
        spawnToast("Minimum interval is 1 hour.", "remove");
        return;
    }
    
    // 2. Validate Start Time (if Custom mode is active)
    let startTime = null;
    if (currentStartMode === 'custom') {
        const dateInput = document.getElementById('start-time-input');
        if (!dateInput.value) {
            spawnToast("Please select a start time.", "remove");
            return;
        }
        startTime = dateInput.value;
    }

    // 3. Send to Server
    btn.innerText = "Saving...";
    btn.disabled = true;
    
    fetch('/save_interval', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
            minutes: totalMinutes, 
            mode: currentStartMode,
            start_time: startTime
        })
    })
    .then(r => r.json())
    .then(d => {
        btn.disabled = false;
        btn.innerText = "Save configuration";
        if (d.success) {
            spawnToast(`Interval updated: ${hours}h ${mins}m`, "update");
            checkNotifications(); 
            toggleDistillConfig(); 
        } else {
            spawnToast("Error saving.", "remove");
        }
    })
    .catch(e => {
        btn.disabled = false;
        btn.innerText = "Save configuration";
        spawnToast("Network error.", "remove");
    });
}

function toggleDistillConfig() {
    const left = document.getElementById('distill-focus-area');
    const right = document.getElementById('distill-config-panel');
    const btnOpen = document.getElementById('btn-config-open');
    const rightContent = document.getElementById('distill-config-content');
    const rightBody = document.getElementById('distill-config-body');
    
    if (right.classList.contains('w-0')) {
        left.classList.remove('flex-1');
        left.classList.add('flex-[4]'); 
        right.classList.remove('w-0', 'opacity-0', 'border-l-0');
        right.classList.add('flex-[3]', 'opacity-100', 'border-l-2');
        btnOpen.classList.add('opacity-0', 'pointer-events-none');
        rightContent.classList.remove('opacity-0');
        rightBody.classList.remove('opacity-0');
    } else {
        left.classList.add('flex-1');
        left.classList.remove('flex-[4]');
        right.classList.add('w-0', 'opacity-0', 'border-l-0');
        right.classList.remove('flex-[3]', 'opacity-100', 'border-l-2');
        btnOpen.classList.remove('opacity-0', 'pointer-events-none');
        rightContent.classList.add('opacity-0');
        rightBody.classList.add('opacity-0');
    }
}

function fitTextInCards() {
    const elements = document.querySelectorAll('.fit-text-target');
    elements.forEach(el => {
        let size = 24; 
        const minSize = 14; 
        el.style.fontSize = size + 'px';
        while (el.scrollWidth > el.parentElement.clientWidth && size > minSize) {
            size--;
            el.style.fontSize = size + 'px';
        }
    });
}

function tryOpenChannel(channelId) { if (activeChannelId && activeChannelId !== channelId) { spawnToast("You cannot open two channels at once.", "remove"); } else { window.location.href = `/channel_view/${channelId}`; } }
function exitChannel() { sessionStorage.removeItem('distill_filter_new'); sessionStorage.removeItem('distill_filter_archived'); window.location.href = "/exit_channel"; }
function toggleChannelFilter(type) { if (filterState[type] && !filterState[type === 'new' ? 'archived' : 'new']) { spawnToast("At least one filter must be active.", "remove"); return; } filterState[type] = !filterState[type]; sessionStorage.setItem(`distill_filter_${type}`, filterState[type]); updateFilterUI(); }
function updateFilterUI() { const btnNew = document.getElementById('filter-btn-new'); const btnArc = document.getElementById('filter-btn-archived'); if (!btnNew || !btnArc) return; if (filterState.new) { btnNew.classList.remove('filter-off'); btnNew.classList.add('filter-on-green'); } else { btnNew.classList.add('filter-off'); btnNew.classList.remove('filter-on-green'); } if (filterState.archived) { btnArc.classList.remove('filter-off'); btnArc.classList.add('filter-on-blue'); } else { btnArc.classList.add('filter-off'); btnArc.classList.remove('filter-on-blue'); } const cards = document.querySelectorAll('.video-card'); cards.forEach(card => { const status = card.getAttribute('data-status'); if (status === 'new' && !filterState.new) card.classList.add('hidden'); else if (status === 'archived' && !filterState.archived) card.classList.add('hidden'); else card.classList.remove('hidden'); }); }
function toggleChannelMenu(event, menuId) { event.stopPropagation(); const menu = document.getElementById(menuId); document.querySelectorAll('[id^="menu-"]').forEach(m => { if (m.id !== menuId) m.classList.add('hidden'); }); menu.classList.toggle('hidden'); }
document.addEventListener('click', (e) => { document.querySelectorAll('[id^="menu-"]').forEach(menu => { if (!menu.classList.contains('hidden') && !menu.contains(e.target)) { menu.classList.add('hidden'); } }); });
function toggleCategory(btn, catName) { if (selectedCategories.has(catName)) { selectedCategories.delete(catName); btn.classList.remove('selected'); } else { selectedCategories.add(catName); btn.classList.add('selected'); } }
function enterFeed() { if (selectedCategories.size === 0) { spawnToast("Please select at least one intention.", "remove"); return; } window.location.href = `/?cats=${encodeURIComponent(Array.from(selectedCategories).join(','))}`; }
const TagManager = { colors: JSON.parse(localStorage.getItem('distill_tag_colors') || '{}'), saveColors: function() { localStorage.setItem('distill_tag_colors', JSON.stringify(this.colors)); this.applyColors(); }, getRandomPair: function() { return PAIRS[Math.floor(Math.random() * PAIRS.length)]; }, getColorPair: function(tag) { let data = this.colors[tag]; if (!data || typeof data === 'string') { const pair = this.getRandomPair(); data = { base: pair.base, highlight: pair.highlight }; this.colors[tag] = data; this.saveColors(); } return data; }, applyColors: function() { document.querySelectorAll('[data-tag]').forEach(el => { const tag = el.getAttribute('data-tag'); if (tag) { const pair = this.getColorPair(tag); el.style.setProperty('--tag-base', pair.base); el.style.setProperty('--tag-highlight', pair.highlight); } }); } };
function hexToRgb(hex) { let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null; }
function rgbToHsl(r, g, b) { r /= 255, g /= 255, b /= 255; let max = Math.max(r, g, b), min = Math.min(r, g, b); let h, s, l = (max + min) / 2; if (max == min) { h = s = 0; } else { let d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min); switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; case b: h = (r - g) / d + 4; break; } h /= 6; } return { h: h * 360, s: s * 100, l: l * 100 }; }

function setInteractColor(hex) { 
    const forbidden = ['#000000', '#ffffff', '#000', '#fff', 'black', 'white']; 
    if (forbidden.includes(hex.toLowerCase())) { return spawnToast("Black and White are reserved.", "remove"); } 
    const rgb = hexToRgb(hex); 
    if(rgb) { 
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b); 
        const compH = (hsl.h + 180) % 360; 
        document.documentElement.style.setProperty('--interact-color', hex); 
        document.documentElement.style.setProperty('--pointer-color', `hsl(${compH}, 80%, 50%)`); 
        document.documentElement.style.setProperty('--pointer-bg', `hsl(${compH}, 80%, 96%)`); 
        document.documentElement.style.setProperty('--pointer-bg-dark', `hsl(${compH}, 70%, 15%)`); 
        localStorage.setItem('distill_interact_color', hex); 
        const input = document.getElementById('interact-color-input'); 
        if(input) input.value = hex; 
        document.documentElement.style.setProperty('--comp-h', compH); 
    } 
}
function saveCustomInteractColor() { const hex = document.getElementById('interact-color-input').value; if (hex) setInteractColor(hex); }

function toggleTheme() { 
    const html = document.documentElement; 
    const square = document.getElementById('theme-toggle-square'); 
    if (html.classList.contains('dark')) { 
        html.classList.remove('dark'); 
        localStorage.setItem('theme', 'light'); 
        square.style.left = '0.25rem'; 
    } else { 
        html.classList.add('dark'); 
        localStorage.setItem('theme', 'dark'); 
        square.style.left = 'calc(100% - 2.5rem - 0.25rem)'; 
    } 
}

function openHelpModal() { document.getElementById('help-modal').classList.remove('hidden'); }
function closeHelpModal() { document.getElementById('help-modal').classList.add('hidden'); }

function openEditTagsModal(dbId, tags) { tagState.mode='edit'; tagState.dbId=dbId; tagState.tags=tags?tags.split(',').map(t=>t.trim()).filter(t=>t):[]; document.getElementById('tag-modal-title').innerText="Edit Channel Tags"; document.getElementById('add-channel-fields').classList.add('hidden'); updateTagUI(); document.getElementById('tag-picker-modal').classList.remove('hidden'); }
function updateDemoTag() { const demo = document.getElementById('demo-tag-btn'); const name = document.getElementById('edit-tag-name-input').value; const base = document.getElementById('edit-base-input').value; const highlight = document.getElementById('edit-highlight-input').value; demo.innerText = name || 'Tag Name'; demo.style.setProperty('--tag-base', base); demo.style.setProperty('--tag-highlight', highlight); }
function saveTagChanges() { const newName = document.getElementById('edit-tag-name-input').value.trim(); const newBase = document.getElementById('edit-base-input').value.trim(); const newHighlight = document.getElementById('edit-highlight-input').value.trim(); if (!newName || !newBase || !newHighlight) return spawnToast("All fields required.", "remove"); if (newName.length > 16) return spawnToast("Tag cannot exceed 16 chars.", "remove"); if (allSystemTags.includes(newName) && newName !== editingTagName) { return spawnToast(`Tag '${newName}' already exists!`, "remove"); } if (!editingTagName) { fetch('/create_tag', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({tag_name: newName}) }).then(r => r.json()).then(d => { if(d.success) { allSystemTags.push(newName); allSystemTags.sort(); TagManager.colors[newName] = { base: newBase, highlight: newHighlight }; TagManager.saveColors(); closeModal('tag-edit-modal'); renderSettingsTagList(); spawnToast(`Tag '${newName}' created.`, "add"); } else { spawnToast(d.error, "remove"); } }); return; } if (newName !== editingTagName) { fetch('/rename_tag', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ old_name: editingTagName, new_name: newName }) }).then(r => r.json()).then(d => { if (d.success) { const index = allSystemTags.indexOf(editingTagName); if (index !== -1) allSystemTags[index] = newName; allSystemTags.sort(); TagManager.colors[newName] = { base: newBase, highlight: newHighlight }; delete TagManager.colors[editingTagName]; TagManager.saveColors(); closeModal('tag-edit-modal'); renderSettingsTagList(); spawnToast("Tag renamed successfully.", "add"); } else { spawnToast(d.error, "remove"); } }); } else { TagManager.colors[editingTagName] = { base: newBase, highlight: newHighlight }; TagManager.saveColors(); closeModal('tag-edit-modal'); renderSettingsTagList(); TagManager.applyColors(); spawnToast("Colors updated.", "add"); } }

function deleteTag() {
    if (!editingTagName) return;
    showConfirmationModal(`Delete tag '${editingTagName}'?`, () => {
        fetch('/delete_tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag_name: editingTagName })
        })
        .then(r => r.json())
        .then(d => {
            if (d.success) {
                allSystemTags = allSystemTags.filter(t => t !== editingTagName);
                delete TagManager.colors[editingTagName];
                TagManager.saveColors();
                renderSettingsTagList();
                spawnToast("Tag deleted.", "remove");
            } else {
                spawnToast(d.error, "remove");
            }
        });
    });
    closeModal('tag-edit-modal');

}function renderSettingsTagList() { const container = document.getElementById('tags-settings-list'); if (!container) return; container.innerHTML = ''; if (allSystemTags.length === 0) { container.innerHTML = '<div class="p-8 text-gray-400 italic">No tags found.</div>'; return; } allSystemTags.forEach(tag => { const row = document.createElement('div'); row.className = 'flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors'; const pill = document.createElement('span'); pill.className = 'tag-pill px-6 py-2 text-xl font-bold shadow-sm'; pill.innerText = tag; pill.setAttribute('data-tag', tag); const editBtn = document.createElement('button'); editBtn.className = 'edit-btn font-bold px-6 py-3'; editBtn.innerText = 'Edit'; editBtn.onclick = () => openTagEditModal(tag); row.appendChild(pill); row.appendChild(editBtn); container.appendChild(row); }); TagManager.applyColors(); }
function showAlert(msg) { document.getElementById('alert-desc').innerText = msg; document.getElementById('alert-modal').classList.remove('hidden'); }
function showConfirmationModal(message, actionCallback) { document.getElementById('modal-desc').innerText = message; pendingAction = actionCallback; document.getElementById('confirmation-modal').classList.remove('hidden'); }
function closeModal(modalId) { document.getElementById(modalId).classList.add('hidden'); if(modalId==='tag-picker-modal') closeDropdown(); }

function switchSettingsTab(tabName) { 
    ['visual', 'tags', 'distill', 'data'].forEach(t => { 
        document.getElementById(`settings-content-${t}`)?.classList.add('hidden'); 
        document.getElementById(`tab-btn-${t}`)?.classList.remove('active'); 
    }); 
    document.getElementById(`settings-content-${tabName}`).classList.remove('hidden'); 
    document.getElementById(`tab-btn-${tabName}`).classList.add('active'); 
    if (tabName === 'tags') renderSettingsTagList();
    sessionStorage.setItem('distill_active_settings_tab', tabName);
}

function spawnToast(message, type) { const container = document.getElementById('toast-container'); const toast = document.createElement('div'); let borderClass = 'border-gray-300'; let textClass = 'text-gray-700'; if (type === 'update') { borderClass = 'border-yellow-500'; textClass = 'text-yellow-700 dark:text-yellow-400'; } else if (type === 'add') { borderClass = 'border-green-500'; textClass = 'text-green-700 dark:text-green-400'; } else if (type === 'remove') { borderClass = 'border-red-500'; textClass = 'text-red-700 dark:text-red-400'; } else if (type === 'archive') { borderClass = 'border-blue-500'; textClass = 'text-blue-700 dark:text-blue-400'; } toast.className = `bg-white border-l-8 ${borderClass} shadow-xl p-6 min-w-[350px] toast-enter pointer-events-auto dark:bg-gray-800`; toast.innerHTML = `<p class="font-bold text-lg ${textClass}">${message}</p>`; container.appendChild(toast); setTimeout(() => { toast.classList.remove('toast-enter'); toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 500); }, 5000); }
function triggerUpdate() { const btn = document.getElementById('update-btn'); const originalText = btn.innerText; btn.innerText = "Updating..."; btn.disabled = true; btn.classList.add('opacity-50'); fetch('/trigger_update', { method: 'POST' }).then(r => r.json()).then(data => { btn.innerText = originalText; btn.disabled = false; btn.classList.remove('opacity-50'); if (data.success) { spawnToast("Update Completed!", "update"); if (data.total_new > 0) data.updates.forEach(upd => spawnToast(`Added ${upd.count} new videos to ${upd.name}`, "add")); else if (data.shorts_blocked === 0) spawnToast("No new videos found.", "update"); } else spawnToast(`Update failed: ${data.error}`, "remove"); }).catch(err => { btn.innerText = originalText; btn.disabled = false; spawnToast("Network error.", "remove"); }); }

function resetUIAfterPurge() {
    updateCounterUI('nav-count-inbox', 0, 0);
    updateCounterUI('nav-count-archive', 0, 0);
    const grid = document.getElementById('video-grid-container');
    if (grid) grid.innerHTML = `<div class="col-span-full text-center py-20 text-gray-500 text-2xl font-bold dark:text-gray-400"><p>No videos match your current intention.</p></div>`;
    document.querySelectorAll('.channel-stored-count').forEach(el => el.innerText = '0 Stored');
    document.querySelectorAll('.channel-archived-count').forEach(el => el.innerText = '0 Archived');
    spawnToast("All videos purged.", "remove");
}

function purgeVideos() { showConfirmationModal("Are you sure? This deletes ALL videos.", () => { fetch('/purge_videos', { method: 'POST' }).then(r => r.json()).then(d => { if(d.success) { resetUIAfterPurge(); } else { spawnToast("Purge failed.", "remove"); } }); }); }
function deleteChannel(id, name) { showConfirmationModal(`Unsubscribe from ${name}?`, () => { fetch(`/delete_channel/${id}`, { method: 'POST' }).then(r=>r.json()).then(d=> { if(d.success) { spawnToast(`Unsubscribed from ${name}`, "remove"); setTimeout(() => location.reload(), 1500); } }); }); }
function openVideoActionModal(videoId) { pendingVideoId = videoId; document.getElementById('video-action-modal').classList.remove('hidden'); }
function triggerVideoAction(action) { if (!pendingVideoId) return; if (action === 'dumped') { closeModal('video-action-modal'); showConfirmationModal("Are you sure you want to dump this video?", () => moveVideo(pendingVideoId, 'dumped')); } else { moveVideo(pendingVideoId, action); closeModal('video-action-modal'); } }
function confirmArchiveRemoval(videoId) { showConfirmationModal("Permanently remove this video?", () => { moveVideo(videoId, 'dumped'); }); }

function decrementCounter(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE) {
        let val = parseInt(el.firstChild.textContent);
        if (!isNaN(val) && val > 0) {
            el.firstChild.textContent = val - 1;
            return;
        }
    }
    let val = parseInt(el.innerText);
    if (!isNaN(val) && val > 0) el.innerText = val - 1; 
}

function decrementFreshCounter(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const badge = el.querySelector('.text-deep-green');
    if (!badge) return;
    const text = badge.innerText; 
    const match = text.match(/\[(\d+)\]/);
    if (match) {
        let count = parseInt(match[1]);
        count--;
        if (count <= 0) {
            badge.remove(); 
        } else {
            badge.innerText = `[${count}]`;
        }
    }
}

function moveVideo(id, act) { 
    const card = document.getElementById(`card-${id}`);
    
    // 1. Capture State BEFORE modification
    const currentStatus = card ? card.getAttribute('data-status') : null;
    
    // Check if it is a "Fresh" video (Has the "New" badge)
    // We trim() to ensure we don't fail on "New " vs "New"
    let isFresh = false;
    if (card) {
        const badges = card.querySelectorAll('.status-pill.status-green');
        for (let b of badges) { 
            if (b.innerText.trim() === 'New') { 
                isFresh = true; 
                break; 
            } 
        }
    }

    // 2. Perform Action
    fetch(`/move/${id}/${act}`, { method: 'POST' })
    .then(r => r.json())
    .then(d => { 
        if(d.success) { 
            const isChannelView = pageContext === 'channel_view';
            
            // --- VISUAL CARD UPDATE ---
            if (isChannelView && act === 'archived') {
                // In Channel View: Transition to "Archived" state
                if(card) card.setAttribute('data-status', 'archived');
                
                // Remove OLD badges (Both "New" and "Unwatched")
                const badgeContainer = card ? card.querySelector('.status-pill')?.parentElement : null;
                if(badgeContainer) {
                    card.querySelectorAll('.status-pill').forEach(el => el.remove());
                    
                    // Add NEW "Archived" badge
                    const newBadge = document.createElement('span');
                    newBadge.className = 'status-pill status-blue mt-1 inline-block';
                    newBadge.innerText = 'Archived';
                    badgeContainer.appendChild(newBadge);
                }

                // Update Action Button
                const btnContainer = card ? card.querySelector('.pt-4') : null;
                if(btnContainer) {
                    btnContainer.innerHTML = `<button onclick="confirmArchiveRemoval('${id}')" class="action-btn destructive-hover w-full bg-red-50 hover:bg-red-100 text-red-600 text-lg font-bold py-3 px-4 transition-colors dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40">Remove</button>`;
                }

                // Hide if filter is active
                if (!filterState.archived && card) card.classList.add('hidden');

            } else {
                // In Inbox or if Dumping: Remove card entirely
                card?.remove(); 
            }

            // --- GLOBAL COUNTER UPDATES (Always Run) ---
            // If the video was "New" (Unwatched) and we moved it (Archived/Dumped), Inbox count goes down.
            if (currentStatus === 'new') {
                decrementCounter('nav-count-inbox');
                if (isFresh) decrementFreshCounter('nav-count-inbox');
            }

            // If we Archived it, Archive count goes up.
            if (act === 'archived') {
                spawnToast("Video Archived", "archive");
                incrementCounter('nav-count-archive');
            } else if (act === 'dumped') {
                spawnToast("Video Dumped", "remove");
                // If we dumped from Archive, decrease Archive count
                if (currentStatus === 'archived') {
                    decrementCounter('nav-count-archive');
                }
            }

            // --- CHANNEL SPECIFIC COUNTER UPDATES (If visible) ---
            if (isChannelView) {
                if (currentStatus === 'new') {
                    decrementCounter('channel-count-new');
                    if (isFresh) decrementFreshCounter('channel-count-new');
                    
                    // If moved New -> Archived, increment channel archive count
                    if (act === 'archived') {
                        incrementCounter('channel-count-archived');
                    }
                } else if (currentStatus === 'archived' && act === 'dumped') {
                    decrementCounter('channel-count-archived');
                }
            }
        } 
    }); 
}

// Add this Helper Helper (since we didn't have an incrementer before)
function incrementCounter(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    let val = parseInt(el.innerText);
    if (!isNaN(val)) el.innerText = val + 1;
}

// MODAL: OPEN "ADD CHANNEL"
function openAddChannelModal() {
    const modal = document.getElementById('tag-picker-modal');
    const title = document.getElementById('tag-modal-title');
    const addFields = document.getElementById('add-channel-fields');
    const saveBtn = document.getElementById('modal-save-tags-btn');
    
    // reset tagState to a fresh state for adding a new channel
    tagState = { mode: 'add', dbId: null, tags: [] };
    
    title.innerText = "Add New Channel";
    addFields.classList.remove('hidden'); 
    document.getElementById('new-channel-id-input').value = '';
    saveBtn.onclick = saveNewChannel; 
    modal.classList.remove('hidden');
    document.getElementById('new-channel-id-input').focus();
    
    // sync the UI with the empty tagState
    updateTagUI();
}

// --- ACTION: SAVE NEW CHANNEL ---
function saveNewChannel() {
    const idInput = document.getElementById('new-channel-id-input');
    const rawId = idInput.value.trim();
    const btn = document.getElementById('modal-save-tags-btn');

    if (!rawId) {
        spawnToast("Please enter a Channel ID or URL.", "remove");
        return;
    }
    
    const tags = tagState.tags;
    if (tags.length === 0) {
        spawnToast("Please add at least one tag.", "remove");
        return;
    }
    
    btn.innerText = "Adding...";
    btn.disabled = true;

    fetch('/add_channel', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ channel_id: rawId, category: tags.join(',') })
    })
    .then(r => r.json())
    .then(d => {
        if (d.success) {
            spawnToast(`Added: ${d.name}`, "add");
            window.location.reload(); 
        } else {
            spawnToast(d.error, "remove");
            btn.innerText = "Save";
            btn.disabled = false;
        }
    })
    .catch(e => {
        spawnToast("Network error.", "remove");
        btn.innerText = "Save";
        btn.disabled = false;
    });
}
    
function updateTagUI() { renderTagPills(); } 
function openDropdown() { document.getElementById('suggested-tags-container').classList.remove('hidden'); document.getElementById('tag-input-container').classList.add('border-b-0'); }
function closeDropdown() { document.getElementById('suggested-tags-container').classList.add('hidden'); document.getElementById('tag-input-container').classList.remove('border-b-0'); }
function renderTagPills() { const c = document.getElementById('tag-pills-container'); c.innerHTML=''; tagState.tags.forEach(t => { const p = document.createElement('div'); p.className = 'tag-pill text-xl font-bold px-5 py-2 flex items-center gap-3'; p.setAttribute('data-tag', t); p.innerHTML = `${t} <button onclick="event.stopPropagation(); removeTag('${t}')" class="text-gray-400 hover:text-red-500 font-bold px-1 text-2xl leading-none">×</button>`; c.appendChild(p); }); const i = document.getElementById('tag-input-field'); i.placeholder = tagState.tags.length>=3?"Max 3 tags":"Tags [Max 3]"; i.disabled = tagState.tags.length>=3; TagManager.applyColors(); }
function renderSuggestedTags() { 
    const c = document.getElementById('suggested-tags-container'); 
    const v = document.getElementById('tag-input-field').value.trim().toLowerCase(); 
    const s = allSystemTags.filter(t => !tagState.tags.includes(t) && t.toLowerCase().includes(v)); 
    c.innerHTML=''; 
    if(s.length===0 && !v) { 
        if(allSystemTags.length===0) c.innerHTML='<div class="p-6 text-gray-400 italic text-xl">No tags found.</div>'; 
        else c.innerHTML='<div class="p-6 text-gray-400 italic text-xl">All selected.</div>'; 
        return; 
    } 
    if(s.length===0 && v) { 
        c.innerHTML='<div class="p-6 text-gray-400 italic text-xl">No match. Press Enter to create.</div>'; 
        return; 
    } 
    s.forEach(t => { 
        const pair = TagManager.getColorPair(t); 
        const b = document.createElement('button'); 
        b.className = 'w-full text-left px-6 py-4 bg-white hover:bg-blue-50 border-b-2 border-gray-100 last:border-0 transition-colors block dark:bg-black dark:border-gray-800 dark:hover:bg-gray-900'; 
        const pill = document.createElement('span');
        pill.className = 'tag-pill'; 
        pill.innerText = t;
        pill.style.setProperty('--tag-base', pair.base);
        pill.style.setProperty('--tag-highlight', pair.highlight);
        b.appendChild(pill);
        b.onmousedown = (e) => { e.preventDefault(); addTag(t); document.getElementById('tag-input-field').focus(); }; 
        c.appendChild(b); 
    }); 
}
function addTag(t) { if(tagState.tags.length>=3 || tagState.tags.includes(t)) return; tagState.tags.push(t); document.getElementById('tag-input-field').value=''; updateTagUI(); openDropdown(); }
function removeTag(t) { tagState.tags = tagState.tags.filter(x => x !== t); updateTagUI(); openDropdown(); document.getElementById('tag-input-field').focus(); }
const tif = document.getElementById('tag-input-field'); tif.addEventListener('focus', () => { renderSuggestedTags(); document.getElementById('suggested-tags-container').classList.remove('hidden'); }); tif.addEventListener('input', () => { renderSuggestedTags(); document.getElementById('suggested-tags-container').classList.remove('hidden'); }); tif.addEventListener('keydown', (e) => { const v = e.target.value.trim(); if(e.key === 'Backspace' && v === '' && tagState.tags.length > 0) { tagState.tags.pop(); updateTagUI(); } if(e.key === 'Enter' && v !== '') { const x = allSystemTags.find(t => t.toLowerCase() === v.toLowerCase()); addTag(x || v); } }); document.addEventListener('click', (e) => { const p = document.getElementById('tag-picker-modal'); const c = document.getElementById('tag-input-container'); const d = document.getElementById('suggested-tags-container'); if(!p.classList.contains('hidden') && !c.contains(e.target) && !d.contains(e.target)) closeDropdown(); });
document.getElementById('modal-save-tags-btn').addEventListener('click', () => { const tags = tagState.tags.join(','); const btn = document.getElementById('modal-save-tags-btn'); btn.innerText = "Saving..."; btn.disabled = true; const url = tagState.mode==='edit' ? `/update_tags/${tagState.dbId}` : '/add_channel'; const payload = tagState.mode==='edit' ? {tags:tags} : {channel_id:document.getElementById('new-channel-id-input').value, category:tags}; fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) }).then(r=>r.json()).then(d => { if(d.success) { if(tagState.mode==='add') spawnToast(`Added ${d.name}`, "add"); location.reload(); } else { spawnToast(d.error, "remove"); btn.innerText="Save"; btn.disabled=false; } }); });
document.getElementById('modal-confirm-btn').addEventListener('click', () => { if (pendingAction) pendingAction(); closeModal('confirmation-modal'); });

// SETTINGS TAG EDITOR LOGIC
function openTagEditModal(tagName) {
    editingTagName = tagName;
    document.getElementById('tag-edit-modal-title').innerText = tagName ? "Edit Tag" : "Add Tag";
    const deleteBtn = document.getElementById('modal-delete-tag-btn');
    if (tagName) { deleteBtn.classList.remove('hidden'); } else { deleteBtn.classList.add('hidden'); }
    const pair = tagName ? TagManager.getColorPair(tagName) : TagManager.getRandomPair();
    document.getElementById('edit-tag-name-input').value = tagName || '';
    document.getElementById('edit-base-input').value = pair.base;
    document.getElementById('edit-highlight-input').value = pair.highlight;
    const grid = document.getElementById('edit-color-grid');
    grid.innerHTML = '';
    PAIRS.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'w-12 h-12 border-4 shadow-sm transition-all';
        btn.style.backgroundColor = p.base;
        btn.style.borderColor = p.highlight;
        btn.onclick = () => {
            document.getElementById('edit-base-input').value = p.base;
            document.getElementById('edit-highlight-input').value = p.highlight;
            updateDemoTag();
        };
        grid.appendChild(btn);
    });
    document.getElementById('edit-tag-name-input').oninput = updateDemoTag;
    document.getElementById('edit-base-input').oninput = updateDemoTag;
    document.getElementById('edit-highlight-input').oninput = updateDemoTag;
    updateDemoTag();
    document.getElementById('tag-edit-modal').classList.remove('hidden');
}

function updateDemoTag() {
    const demo = document.getElementById('demo-tag-btn');
    const name = document.getElementById('edit-tag-name-input').value;
    const base = document.getElementById('edit-base-input').value;
    const highlight = document.getElementById('edit-highlight-input').value;
    demo.innerText = name || 'Tag Name';
    demo.style.setProperty('--tag-base', base);
    demo.style.setProperty('--tag-highlight', highlight);
}

function saveTagChanges() {
    const newName = document.getElementById('edit-tag-name-input').value.trim();
    const newBase = document.getElementById('edit-base-input').value.trim();
    const newHighlight = document.getElementById('edit-highlight-input').value.trim();
    if (!newName || !newBase || !newHighlight) return spawnToast("All fields required.", "remove");
    if (newName.length > 16) return spawnToast("Tag cannot exceed 16 chars.", "remove");
    if (allSystemTags.includes(newName) && newName !== editingTagName) { return spawnToast(`Tag '${newName}' already exists!`, "remove"); }

    if (!editingTagName) {
        fetch('/create_tag', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({tag_name: newName}) }).then(r => r.json()).then(d => { if(d.success) { allSystemTags.push(newName); allSystemTags.sort(); TagManager.colors[newName] = { base: newBase, highlight: newHighlight }; TagManager.saveColors(); closeModal('tag-edit-modal'); renderSettingsTagList(); spawnToast(`Tag '${newName}' created.`, "add"); } else { spawnToast(d.error, "remove"); } });
        return;
    }
    if (newName !== editingTagName) {
        fetch('/rename_tag', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ old_name: editingTagName, new_name: newName }) }).then(r => r.json()).then(d => { if (d.success) { const index = allSystemTags.indexOf(editingTagName); if (index !== -1) allSystemTags[index] = newName; allSystemTags.sort(); TagManager.colors[newName] = { base: newBase, highlight: newHighlight }; delete TagManager.colors[editingTagName]; TagManager.saveColors(); closeModal('tag-edit-modal'); renderSettingsTagList(); spawnToast("Tag renamed successfully.", "add"); } else { spawnToast(d.error, "remove"); } });
    } else {
        TagManager.colors[editingTagName] = { base: newBase, highlight: newHighlight };
        TagManager.saveColors();
        closeModal('tag-edit-modal');
        renderSettingsTagList();
        TagManager.applyColors(); 
        spawnToast("Colors updated.", "add");
    }
}
function toggleTimerMode() {
    timerMode = timerMode === 'countdown' ? 'absolute' : 'countdown';
    const label = document.getElementById('timer-label');
    if(label) label.innerText = timerMode === 'countdown' ? "Next Distill In" : "Next Distill At";
    updateTimer();
}
function purgeEverything() {
    if (!confirm("ARE YOU SURE? This will wipe your entire database (Channels, Videos, Tags).")) return;
    fetch('/purge_everything', { method: 'POST' }).then(r => r.json()).then(d => { if (d.success) { alert("Database wiped."); window.location.reload(); } else { alert("Error: " + d.error); } });
}

function enterFeed() {
    if (selectedCategories.size === 0) {
        spawnToast("Please select at least one intention.", "remove");
        return;
    }
    let url = `/?cats=${encodeURIComponent(Array.from(selectedCategories).join(','))}`;
    // append the original destination if we came from somewhere else
    if (window.APP_DATA.nextDest) {
        url += `&next=${encodeURIComponent(window.APP_DATA.nextDest)}`;
    }
    window.location.href = url;
}