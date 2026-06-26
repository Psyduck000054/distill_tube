let nextRunTime = null;
let pendingVideoId = null;

function refreshGridState() {
    if (!window.APP_DATA) return;

    const context = window.APP_DATA.pageContext;
    const channelId = window.APP_DATA.activeChannelId || '';

    if (['inbox', 'archive', 'channel_view', 'channels'].includes(context)) {
        fetch(`/api/refresh_view?context=${context}&channel_id=${channelId}`)
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    console.log("Live Update: Grid refreshed.");
                    const gridContainer = document.getElementById('video-grid-container');

                    if (gridContainer) {
                        gridContainer.innerHTML = data.html;
                        if (typeof TagManager !== 'undefined') TagManager.applyColors();
                        if (typeof updateFilterUI === 'function') updateFilterUI();
                    }

                    updateCountDisplay('nav-count-inbox', data.counts.inbox, data.counts.inbox_fresh);
                    updateCountDisplay('nav-count-archive', data.counts.archive, null);

                    if (context === 'channel_view') {
                        updateCountDisplay('channel-count-new', data.counts.channel_new, data.counts.channel_new_fresh);
                        updateCountDisplay('channel-count-archived', data.counts.channel_archived, null);
                    }
                }
            })
            .catch(err => console.error("Live Update Failed:", err));
    }
}

function checkNotifications() {
    fetch('/poll_notifications')
        .then(r => r.json())
        .then(data => {
            if (data.next_run) {
                nextRunTime = new Date(data.next_run);
            }

            if (data.notifications && data.notifications.length > 0) {
                let shouldRefresh = false;
                let shouldReload = false;

                data.notifications.forEach(n => {
                    spawnToast(n.msg, n.type);
                    if (n.type === 'add' || n.type === 'update') {
                        shouldRefresh = true;
                    }
                    if (n.should_reload) shouldReload = true;
                });

                if (shouldRefresh) refreshGridState();
                if (shouldReload) setTimeout(() => window.location.reload(), 2000);
            }
        })
        .catch(e => console.error("Polling error:", e));
}

function triggerUpdate() {
    const btn = document.getElementById('update-btn');
    const originalText = btn.innerText;

    btn.innerText = "Updating...";
    btn.disabled = true;
    btn.classList.add('opacity-50');

    fetch('/trigger_update', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
            btn.innerText = originalText;
            btn.disabled = false;
            btn.classList.remove('opacity-50');

            if (data.success) {
                spawnToast("Update Completed!", "update");
                if (data.total_new > 0) {
                    data.updates.forEach(upd => spawnToast(`Added ${upd.count} new videos to ${upd.name}`, "add"));
                } else if (data.shorts_blocked === 0) {
                    spawnToast("No new videos found.", "update");
                }
            } else {
                spawnToast(`Update failed: ${data.error}`, "remove");
            }
        })
        .catch(err => {
            btn.innerText = originalText;
            btn.disabled = false;
            spawnToast("Network error.", "remove");
        });
}

function resetUIAfterPurge() {
    updateCountDisplay('nav-count-inbox', 0, 0);
    updateCountDisplay('nav-count-archive', 0, 0);

    const grid = document.getElementById('video-grid-container');
    if (grid) grid.innerHTML = `<div class="col-span-full text-center py-20 text-gray-500 text-2xl font-bold dark:text-gray-400"><p>No videos match your current intention.</p></div>`;

    document.querySelectorAll('.channel-stored-count').forEach(el => el.innerText = '0 Stored');
    document.querySelectorAll('.channel-archived-count').forEach(el => el.innerText = '0 Archived');

    spawnToast("All videos purged.", "remove");
}

function purgeVideos() {
    showConfirmationModal("Are you sure? This deletes ALL videos.", () => {
        fetch('/purge_videos', { method: 'POST' })
            .then(r => r.json())
            .then(d => {
                if (d.success) resetUIAfterPurge();
                else spawnToast("Purge failed.", "remove");
            });
    });
}

function deleteChannel(id, name) {
    showConfirmationModal(`Unsubscribe from ${name}?`, () => {
        fetch(`/delete_channel/${id}`, { method: 'POST' })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    spawnToast(`Unsubscribed from ${name}`, "remove");
                    setTimeout(() => location.reload(), 1500);
                }
            });
    });
}

function openVideoActionModal(videoId) {
    pendingVideoId = videoId;
    document.getElementById('video-action-modal').classList.remove('hidden');
}

function triggerVideoAction(action) {
    if (!pendingVideoId) return;

    if (action === 'dumped') {
        closeModal('video-action-modal');
        showConfirmationModal("Are you sure you want to dump this video?", () => moveVideo(pendingVideoId, 'dumped'));
    } else {
        moveVideo(pendingVideoId, action);
        closeModal('video-action-modal');
    }
}

function confirmArchiveRemoval(videoId) {
    showConfirmationModal("Permanently remove this video?", () => {
        moveVideo(videoId, 'dumped');
    });
}

function moveVideo(id, act) {
  const card = document.getElementById(`card-${id}`);
  const currentStatus = card ? card.getAttribute('data-status') : null;
  let isFresh = false;

  if (card) {
    const badges = card.querySelectorAll('.status-pill.status-amber');
    for (let b of badges) {
      if (b.innerText.trim() === 'Unwatched') {
        isFresh = true;
        break;
      }
    }
  }

  fetch(`/move/${id}/${act}`, { method: 'POST' })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        
        if (window.APP_DATA && window.APP_DATA.pageContext === 'video_screen') {
            window.location.href = '/exit_video';
            return;
        }

        const isChannelView = window.APP_DATA.pageContext === 'channel_view';

        if (isChannelView && act === 'archived') {
          if (card) card.setAttribute('data-status', 'archived');
          
          const badgeContainer = card ? card.querySelector('.status-pill')?.parentElement : null;
          if (badgeContainer) {
            card.querySelectorAll('.status-pill').forEach(el => el.remove());
            const newBadge = document.createElement('span');
            newBadge.className = 'status-pill status-blue mt-1 inline-block';
            newBadge.innerText = 'Archived';
            badgeContainer.appendChild(newBadge);
          }
          
          const btnContainer = card ? card.querySelector('.pt-4') : null;
          if (btnContainer) {
            btnContainer.innerHTML = `<button onclick="confirmArchiveRemoval('${id}')" class="action-btn destructive-hover w-full bg-red-50 hover:bg-red-100 text-red-600 text-lg font-bold py-3 px-4 transition-colors dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40">Remove</button>`;
          }
          
          if (typeof filterState !== 'undefined' && !filterState.archived && card) card.classList.add('hidden');
        } else {
          card?.remove();
        }

        if (currentStatus === 'new') {
          decrementCounter('nav-count-inbox');
          if (isFresh) decrementFreshCounter('nav-count-inbox');
        }

        if (act === 'archived') {
          spawnToast("Video Archived", "archive");
          incrementCounter('nav-count-archive');
        } else if (act === 'dumped') {
          spawnToast("Video Dumped", "remove");
          if (currentStatus === 'archived') decrementCounter('nav-count-archive');
        }

        if (isChannelView) {
          if (currentStatus === 'new') {
            decrementCounter('channel-count-new');
            if (isFresh) decrementFreshCounter('channel-count-new');
            if (act === 'archived') incrementCounter('channel-count-archived');
          } else if (currentStatus === 'archived' && act === 'dumped') {
            decrementCounter('channel-count-archived');
          }
        }
      }
    });
}

function shuffleRecommendations(videoId, ref) {
    const container = document.getElementById('recommendation-container');
    if (!container) return;

    container.style.opacity = '0.5';

    fetch(`/api/shuffle/${videoId}?ref=${ref}`)
        .then(response => response.text())
        .then(html => {
            container.innerHTML = html;
            container.style.opacity = '1';
            if (typeof TagManager !== 'undefined') {
                TagManager.applyColors();
            }
        })
        .catch(err => {
            console.error("Failed to shuffle recommendations:", err);
            container.style.opacity = '1';
            if (typeof spawnToast === 'function') {
                spawnToast("Failed to load new videos", "remove");
            }
        });
}