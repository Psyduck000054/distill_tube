let pendingAction = null;

// --- TOAST NOTIFICATIONS ---
function spawnToast(message, type) { 
    const container = document.getElementById('toast-container'); 
    const toast = document.createElement('div'); 
    let borderClass = 'border-gray-300'; 
    let textClass = 'text-gray-700'; 
    
    if (type === 'update') { 
        borderClass = 'border-yellow-500'; textClass = 'text-yellow-700 dark:text-yellow-400'; 
    } else if (type === 'add') { 
        borderClass = 'border-green-500'; textClass = 'text-green-700 dark:text-green-400'; 
    } else if (type === 'remove') { 
        borderClass = 'border-red-500'; textClass = 'text-red-700 dark:text-red-400'; 
    } else if (type === 'archive')
        { borderClass = 'border-blue-500'; textClass = 'text-blue-700 dark:text-blue-400'; 
    } 
    
    toast.className = `bg-white border-l-8 ${borderClass} shadow-xl p-6 min-w-[350px] toast-enter pointer-events-auto dark:bg-gray-800`; 
    toast.innerHTML = `<p class="font-bold text-lg ${textClass}">${message}</p>`; 
    container.appendChild(toast); 
    
    setTimeout(() => { 
        toast.classList.remove('toast-enter'); 
        toast.classList.add('toast-exit'); 
        setTimeout(() => toast.remove(), 500); 
    }, 5000); 
}

// --- MODAL CONTROLS ---
function showAlert(msg) { 
    document.getElementById('alert-desc').innerText = msg; 
    document.getElementById('alert-modal').classList.remove('hidden'); 
}

function showConfirmationModal(message, actionCallback) { 
    document.getElementById('modal-desc').innerText = message; 
    pendingAction = actionCallback; 
    document.getElementById('confirmation-modal').classList.remove('hidden'); 
}

function closeModal(modalId) { 
    document.getElementById(modalId).classList.add('hidden'); 
    if (modalId === 'tag-picker-modal' && typeof closeDropdown === 'function') closeDropdown(); 
}

function openHelpModal() {
    document.getElementById('help-modal').classList.remove('hidden'); 
}

function closeHelpModal() { 
    document.getElementById('help-modal').classList.add('hidden');
}

// --- THEME CONTROLS ---
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

// --- UI TEXT & COUNTER HELPERS ---
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

function updateCountDisplay(elementId, total, fresh) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    let html = `${total}`;
    if (fresh && fresh > 0) {
        html += `<span class="text-deep-green ml-2 dark:text-green-400">[${fresh}]</span>`;
    }
    el.innerHTML = html;
}

function updateCounterUI(elementId, totalCount, freshCount = 0) {
    const el = document.getElementById(elementId);
    if (!el) return;
    let html = `${totalCount}`;
    if (freshCount > 0) {
        html += `<span class="text-deep-green ml-2">[${freshCount}]</span>`;
    }
    el.innerHTML = html;
}

function incrementCounter(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    let val = parseInt(el.innerText);
    if (!isNaN(val)) el.innerText = val + 1;
}

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

document.addEventListener('DOMContentLoaded', () => {
    const confirmBtn = document.getElementById('modal-confirm-btn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            if (pendingAction) pendingAction();
            closeModal('confirmation-modal');
        });
    }
});