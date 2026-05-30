function updateTagUI() { 
    renderTagPills(); 
}

function openDropdown() { 
    document.getElementById('suggested-tags-container').classList.remove('hidden'); 
    document.getElementById('tag-input-container').classList.add('border-b-0'); 
}

function closeDropdown() { 
    document.getElementById('suggested-tags-container').classList.add('hidden'); 
    document.getElementById('tag-input-container').classList.remove('border-b-0'); 
}

function renderTagPills() { 
    const c = document.getElementById('tag-pills-container'); 
    c.innerHTML=''; 
    tagState.tags.forEach(t => { 
        const p = document.createElement('div'); p.className = 'tag-pill text-xl font-bold px-5 py-2 flex items-center gap-3'; p.setAttribute('data-tag', t); 
        p.innerHTML = `${t} <button onclick="event.stopPropagation(); removeTag('${t}')" class="text-gray-400 hover:text-red-500 font-bold px-1 text-2xl leading-none">×</button>`; 
        c.appendChild(p); 
    }); 
    const i = document.getElementById('tag-input-field'); 
    i.placeholder = tagState.tags.length>=3?"Max 3 tags":"Tags [Max 3]"; 
    i.disabled = tagState.tags.length>=3; TagManager.applyColors(); 
}

function renderSuggestedTags() { 
    const c = document.getElementById('suggested-tags-container'); 
    const v = document.getElementById('tag-input-field').value.trim().toLowerCase(); 
    const s = allSystemTags.filter(t => !tagState.tags.includes(t) && t.toLowerCase().includes(v)); c.innerHTML=''; 

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

    b.onmousedown = (e) => {
        e.preventDefault();
        addTag(t);
        document.getElementById('tag-input-field').focus();
    };

    c.appendChild(b);
    });
}

function addTag(t) { 
  if (tagState.tags.length >= 3 || tagState.tags.includes(t)) return; 

  tagState.tags.push(t); 
  document.getElementById('tag-input-field').value = ''; 
  updateTagUI(); 
  openDropdown(); 
}

function removeTag(t) { 
  tagState.tags = tagState.tags.filter(x => x !== t); 
  updateTagUI(); 
  openDropdown(); 
  document.getElementById('tag-input-field').focus(); 
}

document.addEventListener('DOMContentLoaded', () => {
  const tif = document.getElementById('tag-input-field');

  if (tif) {
    tif.addEventListener('focus', () => { 
      renderSuggestedTags(); 
      document.getElementById('suggested-tags-container').classList.remove('hidden'); 
    });

    tif.addEventListener('input', () => { 
      renderSuggestedTags(); 
      document.getElementById('suggested-tags-container').classList.remove('hidden'); 
    });

    tif.addEventListener('keydown', (e) => { 
      const v = e.target.value.trim(); 

      if (e.key === 'Backspace' && v === '' && tagState.tags.length > 0) { 
        tagState.tags.pop(); 
        updateTagUI(); 
      } 

      if (e.key === 'Enter' && v !== '') { 
        const x = allSystemTags.find(t => t.toLowerCase() === v.toLowerCase()); 

        addTag(x || v); 
      } 
    });
  }

  document.addEventListener('click', (e) => { 
    const p = document.getElementById('tag-picker-modal'); 
    const c = document.getElementById('tag-input-container'); 
    const d = document.getElementById('suggested-tags-container'); 

    if (p && !p.classList.contains('hidden') && c && d && !c.contains(e.target) && !d.contains(e.target)) closeDropdown(); 
  });
});