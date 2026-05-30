function openAddChannelModal() {
    const modal = document.getElementById('tag-picker-modal');
    const title = document.getElementById('tag-modal-title');
    const addFields = document.getElementById('add-channel-fields');
    const saveBtn = document.getElementById('modal-save-tags-btn');
    
    tagState = { mode: 'add', dbId: null, tags: [] };
    
    if (title) title.innerText = "Add New Channel";
    if (addFields) addFields.classList.remove('hidden'); 
    
    const idInput = document.getElementById('new-channel-id-input');
    if (idInput) {
        idInput.value = '';
        setTimeout(() => idInput.focus(), 100); 
    }
    
    if (saveBtn) saveBtn.onclick = saveNewChannel; 
    if (modal) modal.classList.remove('hidden');
    
    updateTagUI();
}

function saveNewChannel() {
    const idInput = document.getElementById('new-channel-id-input');
    const rawId = idInput ? idInput.value.trim() : '';
    const btn = document.getElementById('modal-save-tags-btn');

    if (!rawId) {
        if (typeof spawnToast === 'function') spawnToast("Please enter a Channel ID or URL.", "remove");
        return;
    }
    
    const tags = tagState.tags;
    if (tags.length === 0) {
        if (typeof spawnToast === 'function') spawnToast("Please add at least one tag.", "remove");
        return;
    }
    
    if (btn) {
        btn.innerText = "Adding...";
        btn.disabled = true;
    }

    fetch('/add_channel', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ channel_id: rawId, category: tags.join(',') })
    })
    .then(r => r.json())
    .then(d => {
        if (d.success) {
            if (typeof spawnToast === 'function') spawnToast(`Added: ${d.name}`, "add");
            window.location.reload(); 
        } else {
            if (typeof spawnToast === 'function') spawnToast(d.error, "remove");
            if (btn) { btn.innerText = "Save"; btn.disabled = false; }
        }
    })
    .catch(e => {
        if (typeof spawnToast === 'function') spawnToast("Network error.", "remove");
        if (btn) { btn.innerText = "Save"; btn.disabled = false; }
    });
}

function openEditTagsModal(dbId, tags) {
    tagState.mode = 'edit';
    tagState.dbId = dbId;
    tagState.tags = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];

    const title = document.getElementById('tag-modal-title');
    if (title) title.innerText = "Edit Channel Tags";

    const addFields = document.getElementById('add-channel-fields');
    if (addFields) addFields.classList.add('hidden');

    const saveBtn = document.getElementById('modal-save-tags-btn');
    if (saveBtn) {
        saveBtn.onclick = saveEditedTags;
    }

    if (typeof updateTagUI === 'function') updateTagUI();
    
    const modal = document.getElementById('tag-picker-modal');
    if (modal) modal.classList.remove('hidden');
}

function saveEditedTags() {
    const tags = tagState.tags.join(',');
    const btn = document.getElementById('modal-save-tags-btn');

    if (btn) {
        btn.innerText = "Saving...";
        btn.disabled = true;
    }

    fetch(`/update_tags/${tagState.dbId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: tags })
    })
    .then(r => r.json())
    .then(d => {
        if (d.success) {
            if (typeof spawnToast === 'function') spawnToast("Tags updated successfully.", "update");
            window.location.reload();
        } else {
            if (typeof spawnToast === 'function') spawnToast(d.error, "remove");
            if (btn) { btn.innerText = "Save"; btn.disabled = false; }
        }
    })
    .catch(e => {
        if (typeof spawnToast === 'function') spawnToast("Network error.", "remove");
        if (btn) { btn.innerText = "Save"; btn.disabled = false; }
    });
}