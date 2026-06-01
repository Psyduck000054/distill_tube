// --- SETTINGS STATE ---
let timerMode = 'countdown';
let currentStartMode = 'now';

// --- SETTINGS TABS ---
function switchSettingsTab(tabName) { 
    ['visual', 'tags', 'distill', 'data'].forEach(t => { 
        document.getElementById(`settings-content-${t}`)?.classList.add('hidden'); 
        document.getElementById(`tab-btn-${t}`)?.classList.remove('active'); 
    }); 
    document.getElementById(`settings-content-${tabName}`).classList.remove('hidden'); 
    document.getElementById(`tab-btn-${tabName}`).classList.add('active'); 
    
    // Safety check in case tags.js hasn't loaded yet
    if (tabName === 'tags' && typeof renderSettingsTagList === 'function') renderSettingsTagList();
    sessionStorage.setItem('distill_active_settings_tab', tabName);
}

// --- DISTILL INTERVAL CONFIGURATION ---
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

function toggleStartMode(mode) {
    currentStartMode = mode;
    const btnNow = document.getElementById('btn-mode-now');
    const btnCustom = document.getElementById('btn-mode-custom');
    const dateWrapper = document.getElementById('custom-date-wrapper');
    const dateInput = document.getElementById('start-time-input');
    
    if (mode === 'now') {
        btnNow.className = "flex-1 py-3 font-bold text-lg bg-black text-white dark:bg-white dark:text-black transition-colors";
        btnCustom.className = "flex-1 py-3 font-bold text-lg bg-white text-gray-400 hover:text-[var(--interact-color)] dark:bg-black dark:text-gray-600 dark:hover:text-[var(--interact-color)] transition-colors";
        dateWrapper.classList.add('hidden');
    } else {
        btnCustom.className = "flex-1 py-3 font-bold text-lg bg-black text-white dark:bg-white dark:text-black transition-colors";
        btnNow.className = "flex-1 py-3 font-bold text-lg bg-white text-gray-400 hover:text-[var(--interact-color)] dark:bg-black dark:text-gray-600 dark:hover:text-[var(--interact-color)] transition-colors";
        dateWrapper.classList.remove('hidden');
        
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
    
    const hours = parseInt(hInput.value) || 0;
    const mins = parseInt(mInput.value) || 0;
    const totalMinutes = (hours * 60) + mins;

    if (totalMinutes < 5) {
        if (typeof spawnToast === 'function') spawnToast("Minimum interval is 5 minutes.", "remove");
        return;
    }
    
    let startTime = null;
    if (currentStartMode === 'custom') {
        const dateInput = document.getElementById('start-time-input');
        if (!dateInput.value) {
            if (typeof spawnToast === 'function') spawnToast("Please select a start time.", "remove");
            return;
        }
        startTime = dateInput.value;
    }

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
            if (typeof spawnToast === 'function') spawnToast(`Interval updated: ${hours}h ${mins}m`, "update");
            if (typeof checkNotifications === 'function') checkNotifications(); 
            toggleDistillConfig(); 
        } else {
            if (typeof spawnToast === 'function') spawnToast("Error saving.", "remove");
        }
    })
    .catch(e => {
        btn.disabled = false;
        btn.innerText = "Save configuration";
        if (typeof spawnToast === 'function') spawnToast("Network error.", "remove");
    });
}

// --- TIMER DISPLAY ---
function toggleTimerMode() {
    timerMode = timerMode === 'countdown' ? 'absolute' : 'countdown';
    const label = document.getElementById('timer-label');
    if(label) label.innerText = timerMode === 'countdown' ? "Next Distill In" : "Next Distill At";
    updateTimer();
}

function updateTimer() {
    const timerEl = document.getElementById('distill-timer');
    if (!timerEl || typeof nextRunTime === 'undefined' || !nextRunTime) return;

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

// --- DANGER ZONE ---
function purgeEverything() {
    if (!confirm("ARE YOU SURE? This will wipe your entire database (Channels, Videos, Tags).")) return;
    fetch('/purge_everything', { method: 'POST' }).then(r => r.json()).then(d => { 
        if (d.success) { 
            alert("Database wiped."); 
            window.location.reload(); 
        } else { 
            alert("Error: " + d.error); 
        } 
    });
}