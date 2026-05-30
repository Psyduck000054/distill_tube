function renderSettingsTagList() {
  const container = document.getElementById('tags-settings-list');

  if (!container) return;

  container.innerHTML = '';

  if (allSystemTags.length === 0) {
    container.innerHTML = '<div class="p-8 text-gray-400 italic">No tags found.</div>';
    return;
  }

  allSystemTags.forEach(tag => {
    const row = document.createElement('div');
    row.className = 'flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors';

    const pill = document.createElement('span');
    pill.className = 'tag-pill px-6 py-2 text-xl font-bold shadow-sm';
    pill.innerText = tag;
    pill.setAttribute('data-tag', tag);

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn font-bold px-6 py-3';
    editBtn.innerText = 'Edit';
    editBtn.onclick = () => openTagEditModal(tag);

    row.appendChild(pill);
    row.appendChild(editBtn);
    container.appendChild(row);
  });

  TagManager.applyColors();
}

function openTagEditModal(tagName) {
  editingTagName = tagName;
  document.getElementById('tag-edit-modal-title').innerText = tagName ? "Edit Tag" : "Add Tag";

  const deleteBtn = document.getElementById('modal-delete-tag-btn');
  if (tagName) { 
    deleteBtn.classList.remove('hidden'); 
  } else { 
    deleteBtn.classList.add('hidden'); 
  }

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

  if (allSystemTags.includes(newName) && newName !== editingTagName) { 
    return spawnToast(`Tag '${newName}' already exists!`, "remove"); 
  }

  if (!editingTagName) {
    fetch('/create_tag', { 
      method: 'POST', 
      headers: {'Content-Type': 'application/json'}, 
      body: JSON.stringify({tag_name: newName}) 
    })
    .then(r => r.json())
    .then(d => { 
      if(d.success) { 
        allSystemTags.push(newName);
        allSystemTags.sort();
        TagManager.colors[newName] = { base: newBase, highlight: newHighlight };
        TagManager.saveColors();
        closeModal('tag-edit-modal');
        renderSettingsTagList();
        spawnToast(`Tag '${newName}' created.`, "add");
      } else { 
        spawnToast(d.error, "remove");
      } 
    });

    return;
  }

  if (newName !== editingTagName) {
    fetch('/rename_tag', { 
      method: 'POST', 
      headers: {'Content-Type':'application/json'}, 
      body: JSON.stringify({ old_name: editingTagName, new_name: newName }) 
    })
    .then(r => r.json())
    .then(d => { 
      if (d.success) { 
        const index = allSystemTags.indexOf(editingTagName);

        if (index !== -1) allSystemTags[index] = newName;

        allSystemTags.sort();
        TagManager.colors[newName] = { base: newBase, highlight: newHighlight };
        delete TagManager.colors[editingTagName];
        TagManager.saveColors();
        closeModal('tag-edit-modal');
        renderSettingsTagList();
        spawnToast("Tag renamed successfully.", "add");
      } else { 
        spawnToast(d.error, "remove");
      } 
    });
  } else {
    TagManager.colors[editingTagName] = { base: newBase, highlight: newHighlight };
    TagManager.saveColors();
    closeModal('tag-edit-modal');
    renderSettingsTagList();
    TagManager.applyColors();
    spawnToast("Colors updated.", "add");
  }
}

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
}