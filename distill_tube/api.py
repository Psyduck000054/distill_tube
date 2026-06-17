from flask import Blueprint, request, jsonify, session, render_template
import json
import feedparser

import sqlite3

from .database import get_db_connection
from .helper import set_setting, notification_queue, get_sidebar_channels
from .feed_updater import perform_update
from .scheduler import scheduler, update_scheduler_interval

api = Blueprint('api', __name__)

@api.route('/save_interval', methods=['POST'])
def save_interval():
    data = request.json
    try:
        mins = int(data.get('minutes', 60))
        if mins < 1: mins = 1
        
        mode = data.get('mode', 'now')
        start_time_str = data.get('start_time')
        
        if mode == 'custom' and start_time_str:
            pending_data = json.dumps({'interval': mins, 'start_ts': start_time_str})
            set_setting('pending_switch', pending_data)
            update_scheduler_interval()
            return jsonify({'success': True, 'minutes': mins, 'mode': 'future'})
        else:
            set_setting('distill_interval_mins', mins)
            conn = get_db_connection()
            conn.execute("DELETE FROM settings WHERE key = 'pending_switch'")
            conn.commit()
            conn.close()
            
            update_scheduler_interval()
            return jsonify({'success': True, 'minutes': mins, 'mode': 'now'})
            
    except Exception as e:
        print(e)
        return jsonify({'success': False, 'error': str(e)})

@api.route('/poll_notifications')
def poll_notifications():
    response = {'notifications': [], 'next_run': None}
    
    if notification_queue:
        response['notifications'] = list(notification_queue)
        notification_queue.clear()
        
    job = scheduler.get_job('feed_update_job')
    if job and job.next_run_time:
        response['next_run'] = job.next_run_time.isoformat()
    elif scheduler.get_job('switch_job'):
        job = scheduler.get_job('switch_job')
        if job and job.next_run_time:
            response['next_run'] = job.next_run_time.isoformat()
        
    return jsonify(response)

@api.route('/api/refresh_view')
def api_refresh_view():
    page_context = request.args.get('context')
    channel_id = request.args.get('channel_id')
    
    if 'distill_focus' not in session:
        return jsonify({'success': False, 'error': 'No session'})

    conn = get_db_connection()
    selected_tags = session.get('distill_focus', '').split(',')
    placeholders = ','.join(['?'] * len(selected_tags))

    stats_query = f"""
        SELECT 
            COUNT(DISTINCT v.video_id) as total,
            COUNT(DISTINCT CASE WHEN v.is_new = 1 THEN v.video_id END) as fresh
        FROM videos v 
        JOIN channels c ON v.channel_id = c.id 
        JOIN channel_tags ct ON c.id = ct.channel_id
        WHERE v.status = 'new' 
        AND ct.tag IN ({placeholders})
    """
    row = conn.execute(stats_query, selected_tags).fetchone()
    filtered_inbox_count = row['total'] if row else 0
    filtered_inbox_fresh = row['fresh'] if row else 0

    total_archive = conn.execute("SELECT COUNT(*) FROM videos WHERE status = 'archived'").fetchone()[0]

    videos = []            
    channels_data = None

    if page_context == 'inbox':
        query = f"""
            SELECT DISTINCT v.*, c.name as channel_name,
                   (SELECT GROUP_CONCAT(tag, ', ') FROM channel_tags WHERE channel_id = c.id) as tags_string
            FROM videos v 
            JOIN channels c ON v.channel_id = c.id 
            JOIN channel_tags ct ON c.id = ct.channel_id
            WHERE v.status = 'new' 
            AND ct.tag IN ({placeholders})
            ORDER BY RANDOM()
        """
        videos = conn.execute(query, selected_tags).fetchall()

    elif page_context == 'archive':
        if selected_tags:
            placeholders = ','.join(['?'] * len(selected_tags))
            videos = conn.execute(f"""
                SELECT DISTINCT v.*, c.name as channel_name,
                       (SELECT GROUP_CONCAT(tag, ', ') FROM channel_tags WHERE channel_id = c.id) as tags_string
                FROM videos v 
                JOIN channels c ON v.channel_id = c.id 
                JOIN channel_tags ct ON c.id = ct.channel_id
                WHERE v.status = 'archived' 
                AND ct.tag IN ({placeholders})
                ORDER BY RANDOM()
            """, selected_tags).fetchall()

    elif page_context == 'channel_view' and channel_id:
        videos = conn.execute('''
            SELECT v.*, c.name as channel_name,
                   (SELECT GROUP_CONCAT(tag, ', ') FROM channel_tags WHERE channel_id = c.id) as tags_string
            FROM videos v 
            JOIN channels c ON v.channel_id = c.id 
            WHERE c.id = ? AND v.status IN ('active', 'archived', 'new')
            ORDER BY v.published_at DESC
        ''', (channel_id,)).fetchall()

    elif page_context == 'channels':
        channels_data = get_sidebar_channels()

    conn.close()

    channel_new_count = 0
    channel_new_fresh = 0
    channel_archived_count = 0
    if page_context == 'channel_view':
        channel_new_count = sum(1 for v in videos if v['status'] == 'new')
        channel_new_fresh = sum(1 for v in videos if v['status'] == 'new' and v['is_new'] == 1)
        channel_archived_count = sum(1 for v in videos if v['status'] == 'archived')

    grid_html = render_template(
        'components/video_grid.html',
        videos=videos,
        channels=channels_data,
        page=page_context,
        partial_mode=True
    )

    return jsonify({
        'success': True,
        'html': grid_html,
        'counts': {
            'inbox': filtered_inbox_count,
            'inbox_fresh': filtered_inbox_fresh,
            'archive': total_archive,
            'channel_new': channel_new_count,
            'channel_new_fresh': channel_new_fresh,
            'channel_archived': channel_archived_count
        }
    })

@api.route('/create_tag', methods=['POST'])
def create_tag():
    data = request.json
    tag_name = data.get('tag_name', '').strip()
    if not tag_name: return jsonify({'success': False, 'error': 'Empty tag'})
    conn = get_db_connection()
    try:
        conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (tag_name,))
        conn.commit()
        return jsonify({'success': True})
    except Exception as e: return jsonify({'success': False, 'error': str(e)})
    finally: conn.close()

@api.route('/delete_tag', methods=['POST'])
def delete_tag():
    data = request.json
    tag_name = data.get('tag_name', '').strip()
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM tags WHERE name = ?", (tag_name,))
        conn.execute("DELETE FROM channel_tags WHERE tag = ?", (tag_name,))
        conn.commit()
        return jsonify({'success': True})
    except Exception as e: return jsonify({'success': False, 'error': str(e)})
    finally: conn.close()

@api.route('/trigger_update', methods=['POST'])
def trigger_update():
    result = perform_update()
    if result['success']: return jsonify(result)
    else: return jsonify({'success': False, 'error': result['error']})

@api.route('/purge_videos', methods=['POST'])
def purge_videos():
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM videos")
        conn.commit()
        return jsonify({'success': True})
    except Exception as e: return jsonify({'success': False, 'error': str(e)})
    finally: conn.close()

@api.route('/update_tags/<int:channel_id>', methods=['POST'])
def update_tags(channel_id):
    data = request.json
    raw_tags = data.get('tags', '').strip()
    
    new_tags = [t.strip() for t in raw_tags.split(',') if t.strip()]
    if not new_tags: return jsonify({'success': False, 'error': 'At least 1 tag is required.'})
    if len(new_tags) > 3: return jsonify({'success': False, 'error': 'Max 3 tags allowed.'})
        
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM channel_tags WHERE channel_id = ?", (channel_id,))
        for tag in new_tags: 
            conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (tag,))
            conn.execute("INSERT INTO channel_tags (channel_id, tag) VALUES (?, ?)", (channel_id, tag))
        conn.commit()
        return jsonify({'success': True})
    except Exception as e: return jsonify({'success': False, 'error': str(e)})
    finally: conn.close()

@api.route('/add_channel', methods=['POST'])
def add_channel():
    data = request.json
    raw_id = data.get('channel_id', '').strip()
    raw_tags = data.get('category', '').strip()
    
    if 'youtube.com/channel/' in raw_id: 
        clean_id = raw_id.split('youtube.com/channel/')[1].split('/')[0]
    elif 'youtube.com/@' in raw_id: 
        return jsonify({'success': False, 'error': 'Use Channel ID (UC...), not Handle.'})
    else: 
        clean_id = raw_id
        
    if not clean_id.startswith('UC') and not clean_id.startswith('@'): 
        clean_id = 'UC' + clean_id
        
    tags_list = [t.strip() for t in raw_tags.split(',') if t.strip()]
    if not tags_list: return jsonify({'success': False, 'error': 'At least 1 tag is required.'})
    if len(tags_list) > 3: tags_list = tags_list[:3]
        
    rss_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={clean_id}"
    feed = feedparser.parse(rss_url)
    if feed.bozo != 0 or not hasattr(feed.feed, 'title'): 
        return jsonify({'success': False, 'error': 'Invalid Channel ID.'})
        
    channel_name = feed.feed.title
    conn = get_db_connection()
    try:
        cur = conn.execute("INSERT INTO channels (name, channel_id) VALUES (?, ?)", (channel_name, clean_id))
        new_id = cur.lastrowid
        for tag in tags_list: 
            conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (tag,))
            conn.execute("INSERT INTO channel_tags (channel_id, tag) VALUES (?, ?)", (new_id, tag))
        conn.commit()

        count = conn.execute("SELECT COUNT(*) FROM channels").fetchone()[0]
        if count == 1: perform_update()

        return jsonify({'success': True, 'name': channel_name})
    except sqlite3.IntegrityError: return jsonify({'success': False, 'error': 'Channel already exists!'})
    except Exception as e: return jsonify({'success': False, 'error': str(e)})
    finally: conn.close()

@api.route('/delete_channel/<int:db_id>', methods=['POST'])
def delete_channel(db_id):
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM videos WHERE channel_id = ?", (db_id,))
        conn.execute("DELETE FROM channel_tags WHERE channel_id = ?", (db_id,))
        conn.execute("DELETE FROM channels WHERE id = ?", (db_id,))
        conn.commit()
        return jsonify({'success': True})
    except Exception as e: return jsonify({'success': False, 'error': str(e)})
    finally: conn.close()

@api.route('/move/<video_id>/<action>', methods=['POST'])
def move_video(video_id, action):
    if action not in ['archived', 'dumped', 'new']:
        return jsonify({'success': False, 'error': 'Invalid action'}), 400

    conn = get_db_connection()
    try:
        if action in ['archived', 'dumped']:
            conn.execute("UPDATE videos SET status = ?, is_new = 0 WHERE video_id = ?", (action, video_id))
        else:
            conn.execute("UPDATE videos SET status = ? WHERE video_id = ?", (action, video_id))
        conn.commit()
        return jsonify({'success': True})
    except Exception as e: return jsonify({'success': False, 'error': str(e)})
    finally: conn.close()

@api.route('/rename_tag', methods=['POST'])
def rename_tag():
    data = request.json
    old_name = data.get('old_name')
    new_name = data.get('new_name')
    if not old_name or not new_name: return jsonify({'success': False, 'error': 'Missing names'})
    conn = get_db_connection()
    try:
        exists = conn.execute("SELECT 1 FROM tags WHERE name = ?", (new_name,)).fetchone()
        if exists: return jsonify({'success': False, 'error': f"Tag '{new_name}' already exists!"})
        conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (new_name,))
        conn.execute("UPDATE channel_tags SET tag = ? WHERE tag = ?", (new_name, old_name))
        conn.execute("DELETE FROM tags WHERE name = ?", (old_name,))
        conn.commit()
        return jsonify({'success': True})
    except Exception as e: return jsonify({'success': False, 'error': str(e)})
    finally: conn.close()
    
@api.route('/purge_everything', methods=['POST'])
def purge_everything():
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM videos")
        conn.execute("DELETE FROM channel_tags")
        conn.execute("DELETE FROM channels")
        conn.commit()
        session.pop('active_channel', None)
        session.pop('distill_focus', None)
        return jsonify({'success': True})
    except Exception as e: return jsonify({'success': False, 'error': str(e)})
    finally: conn.close()