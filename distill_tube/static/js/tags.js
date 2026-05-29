// --- TAG SYSTEM STATE ---
let allSystemTags = window.APP_DATA.tags || []; 
let tagState = { mode: 'edit', dbId: null, tags: [] };
let editingTagName = null; 

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

// --- COLOR MATH & INTERACT COLOR ---
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

// --- TAG MANAGER ---
const TagManager = { 
    colors: JSON.parse(localStorage.getItem('distill_tag_colors') || '{}'), 
    saveColors: function() { localStorage.setItem('distill_tag_colors', JSON.stringify(this.colors)); this.applyColors(); }, 
    getRandomPair: function() { return PAIRS[Math.floor(Math.random() * PAIRS.length)]; }, 
    getColorPair: function(tag) { let data = this.colors[tag]; if (!data || typeof data === 'string') { const pair = this.getRandomPair(); data = { base: pair.base, highlight: pair.highlight }; this.colors[tag] = data; this.saveColors(); } return data; }, 
    applyColors: function() { document.querySelectorAll('[data-tag]').forEach(el => { const tag = el.getAttribute('data-tag'); if (tag) { const pair = this.getColorPair(tag); el.style.setProperty('--tag-base', pair.base); el.style.setProperty('--tag-highlight', pair.highlight); } }); } 
};

// --- TAG MODAL CONTROLS & DROPDOWN ---
function updateTagUI() { renderTagPills(); } 
function openDropdown() { document.getElementById('suggested-tags-container').classList.remove('hidden'); document.getElementById('tag-input-container').classList.add('border-b-0'); }
function closeDropdown() { document.getElementById('suggested-tags-container').classList.add('hidden'); document.getElementById('tag-input-container').classList.remove('border-b-0'); }

function renderTagPills() { 
    const c = document.getElementById('tag-pills-container'); c.innerHTML=''; 
    tagState.tags.forEach(t => { 
        const p = document.createElement('div'); p.className = 'tag-pill text-xl font-bold px-5 py-2 flex items-center gap-3'; p.setAttribute('data-tag', t); 
        p.innerHTML = `${t} <button onclick="event.stopPropagation(); removeTag('${t}')" class="text-gray-400 hover:text-red-500 font-bold px-1 text-2xl leading-none">×</button>`; 
        c.appendChild(p); 
    }); 
    const i = document.getElementById('tag-input-field'); i.placeholder = tagState.tags.length>=3?"Max 3 tags":"Tags [Max 3]"; i.disabled = tagState.tags.length>=3; TagManager.applyColors(); 
}

function renderSuggestedTags() { 
    const c = document.getElementById('suggested-tags-container'); const v = document.getElementById('tag-input-field').value.trim().toLowerCase(); const s = allSystemTags.filter(t => !tagState.tags.includes(t) && t.toLowerCase().includes(v)); c.innerHTML=''; 
    if(s.length===0 && !v) { if(allSystemTags.length===0) c.innerHTML='<div class="p-6 text-gray-400 italic text-xl">No tags found.</div>'; else c.innerHTML='<div class="p-6 text-gray-400 italic text-xl">All selected.</div>'; return; } 
    if(s.length===0 && v) { c.innerHTML='<div class="p-6 text-gray-400 italic text-xl">No match. Press Enter to create.</div>'; return; } 
    s.forEach(t => { const pair = TagManager.getColorPair(t); const b = document.createElement('button'); b.className = 'w-full text-left px-6 py-4 bg-white hover:bg-blue-50 border-b-2 border-gray-100 last:border-0 transition-colors block dark:bg-black dark:border-gray-800 dark:hover:bg-gray-900'; const pill = document.createElement('span'); pill.className = 'tag-pill'; pill.innerText = t; pill.style.setProperty('--tag-base', pair.base); pill.style.setProperty('--tag-highlight', pair.highlight); b.appendChild(pill); b.onmousedown = (e) => { e.preventDefault(); addTag(t); document.getElementById('tag-input-field').focus(); }; c.appendChild(b); }); 
}

function addTag(t) { if(tagState.tags.length>=3 || tagState.tags.includes(t)) return; tagState.tags.push(t); document.getElementById('tag-input-field').value=''; updateTagUI(); openDropdown(); }
function removeTag(t) { tagState.tags = tagState.tags.filter(x => x !== t); updateTagUI(); openDropdown(); document.getElementById('tag-input-field').focus(); }

// --- TAG EDITOR (SETTINGS PAGE) ---
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
        btn.onclick = () => { document.getElementById('edit-base-input').value = p.base; document.getElementById('edit-highlight-input').value = p.highlight; updateDemoTag(); };
        grid.appendChild(btn);
    });
    document.getElementById('edit-tag-name-input').oninput = updateDemoTag;
    document.getElementById('edit-base-input').oninput = updateDemoTag;
    document.getElementById('edit-highlight-input').oninput = updateDemoTag;
    updateDemoTag();
    document.getElementById('tag-edit-modal').classList.remove('hidden');
}

function updateDemoTag() {
    const demo = document.getElementById('demo-tag-btn'); const name = document.getElementById('edit-tag-name-input').value; const base = document.getElementById('edit-base-input').value; const highlight = document.getElementById('edit-highlight-input').value;
    demo.innerText = name || 'Tag Name'; demo.style.setProperty('--tag-base', base); demo.style.setProperty('--tag-highlight', highlight);
}

function saveTagChanges() {
    const newName = document.getElementById('edit-tag-name-input').value.trim(); const newBase = document.getElementById('edit-base-input').value.trim(); const newHighlight = document.getElementById('edit-highlight-input').value.trim();
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
        TagManager.colors[editingTagName] = { base: newBase, highlight: newHighlight }; TagManager.saveColors(); closeModal('tag-edit-modal'); renderSettingsTagList(); TagManager.applyColors(); spawnToast("Colors updated.", "add");
    }
}

function deleteTag() {
    if (!editingTagName) return;
    showConfirmationModal(`Delete tag '${editingTagName}'?`, () => {
        fetch('/delete_tag', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_name: editingTagName }) })
        .then(r => r.json())
        .then(d => {
            if (d.success) { allSystemTags = allSystemTags.filter(t => t !== editingTagName); delete TagManager.colors[editingTagName]; TagManager.saveColors(); renderSettingsTagList(); spawnToast("Tag deleted.", "remove"); } 
            else { spawnToast(d.error, "remove"); }
        });
    });
    closeModal('tag-edit-modal');
}

function renderSettingsTagList() { 
    const container = document.getElementById('tags-settings-list'); if (!container) return; container.innerHTML = ''; 
    if (allSystemTags.length === 0) { container.innerHTML = '<div class="p-8 text-gray-400 italic">No tags found.</div>'; return; } 
    allSystemTags.forEach(tag => { 
        const row = document.createElement('div'); row.className = 'flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors'; 
        const pill = document.createElement('span'); pill.className = 'tag-pill px-6 py-2 text-xl font-bold shadow-sm'; pill.innerText = tag; pill.setAttribute('data-tag', tag); 
        const editBtn = document.createElement('button'); editBtn.className = 'edit-btn font-bold px-6 py-3'; editBtn.innerText = 'Edit'; editBtn.onclick = () => openTagEditModal(tag); 
        row.appendChild(pill); row.appendChild(editBtn); container.appendChild(row); 
    }); 
    TagManager.applyColors(); 
}

function openEditTagsModal(dbId, tags) { 
    tagState.mode='edit'; 
    tagState.dbId=dbId; 
    tagState.tags=tags?tags.split(',').map(t=>t.trim()).filter(t=>t):[]; 
    document.getElementById('tag-modal-title').innerText="Edit Channel Tags"; 
    document.getElementById('add-channel-fields').classList.add('hidden'); 
    updateTagUI(); document.getElementById('tag-picker-modal').classList.remove('hidden'); 
}


// --- EVENT LISTENERS FOR TAG INPUT ---
document.addEventListener('DOMContentLoaded', () => {
    const tif = document.getElementById('tag-input-field'); 
    if(tif) {
        tif.addEventListener('focus', () => { renderSuggestedTags(); document.getElementById('suggested-tags-container').classList.remove('hidden'); }); 
        tif.addEventListener('input', () => { renderSuggestedTags(); document.getElementById('suggested-tags-container').classList.remove('hidden'); }); 
        tif.addEventListener('keydown', (e) => { 
            const v = e.target.value.trim(); 
            if(e.key === 'Backspace' && v === '' && tagState.tags.length > 0) { tagState.tags.pop(); updateTagUI(); } 
            if(e.key === 'Enter' && v !== '') { const x = allSystemTags.find(t => t.toLowerCase() === v.toLowerCase()); addTag(x || v); } 
        });
    }

    document.addEventListener('click', (e) => { 
        const p = document.getElementById('tag-picker-modal'); const c = document.getElementById('tag-input-container'); const d = document.getElementById('suggested-tags-container'); 
        if(p && !p.classList.contains('hidden') && c && d && !c.contains(e.target) && !d.contains(e.target)) closeDropdown(); 
    });
});