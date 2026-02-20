import sqlite3
import os
import feedparser
import atexit
import json 
from flask import Flask, render_template, request, jsonify, make_response, redirect, url_for, session
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler

app = Flask(__name__)
app.secret_key = 'distill_tube_secret_key_change_this_in_prod' 

# ---------------------------------------------------------
# CONFIG
# ---------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'distill_tube.db')
BLOCK_SHORTS = True 

# Global Notification Queue
notification_queue = []

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS tags (name TEXT PRIMARY KEY)")
        conn.execute("CREATE TABLE IF NOT EXISTS channels (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, channel_id TEXT UNIQUE NOT NULL)")
        conn.execute("CREATE TABLE IF NOT EXISTS videos (video_id TEXT PRIMARY KEY, title TEXT NOT NULL, channel_id INTEGER, published_at TEXT, status TEXT DEFAULT 'new', is_new INTEGER DEFAULT 0, FOREIGN KEY(channel_id) REFERENCES channels(id))")        
        conn.execute("CREATE TABLE IF NOT EXISTS channel_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id INTEGER, tag TEXT, FOREIGN KEY(channel_id) REFERENCES channels(id))")
        conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
        conn.commit()
    except Exception as e:
        print(f"DB Init Error: {e}")
    finally:
        conn.close()

# ---------------------------------------------------------
# HELPER FUNCTIONS
# ---------------------------------------------------------
def is_short(entry):
    if not BLOCK_SHORTS: return False
    if "/shorts/" in entry.link: return True
    search_text = (entry.title + " " + entry.get('description', '')).lower()
    if "#shorts" in search_text: return True
    try:
        if hasattr(entry, 'yt_duration'):
            if int(entry.yt_duration) <= 60: return True
    except: pass 
    return False

def get_setting(key, default=None):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row['value'] if row else default
    except:
        return default
    finally:
        conn.close()

def set_setting(key, value):
    conn = get_db_connection()
    try:
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(value)))
        conn.commit()
    finally:
        conn.close()

def get_existing_tags(only_used=False):
    conn = get_db_connection()
    try:
        if only_used:
            query = "SELECT DISTINCT tag FROM channel_tags WHERE tag IS NOT NULL AND tag != '' ORDER BY tag ASC"
        else:
            query = """
                SELECT name as tag FROM tags 
                UNION 
                SELECT DISTINCT tag FROM channel_tags WHERE tag IS NOT NULL AND tag != ''
                ORDER BY tag ASC
            """
        tags_raw = conn.execute(query).fetchall()
        return [row['tag'] for row in tags_raw]
    finally:
        conn.close()

def get_sidebar_channels():
    conn = get_db_connection()
    try:
        return conn.execute("""
            SELECT c.*, 
                   SUM(CASE WHEN v.status = 'new' THEN 1 ELSE 0 END) as active_count,
                   SUM(CASE WHEN v.status = 'archived' THEN 1 ELSE 0 END) as archived_count,
                   (SELECT GROUP_CONCAT(tag, ', ') FROM channel_tags WHERE channel_id = c.id) as tags_string
            FROM channels c
            LEFT JOIN videos v ON c.id = v.channel_id
            GROUP BY c.id
            ORDER BY c.name ASC
        """).fetchall()
    finally:
        conn.close()

# ---------------------------------------------------------
# CORE LOGIC
# ---------------------------------------------------------
def perform_update(backdate_ts=None):
    """
    backdate_ts (datetime): If provided, saves THIS time as 'last_update_ts' 
    instead of now(). This preserves the schedule grid.
    """
    conn = get_db_connection()
    channels = conn.execute("SELECT id, name, channel_id FROM channels").fetchall()
    updates = []
    total_new = 0
    shorts_blocked = 0
    
    print(f"[{datetime.now()}] Starting Scheduled Update...")
    
    try:
        # 1. RESET 'is_new' STATUS
        conn.execute("UPDATE videos SET is_new = 0")
        conn.commit()

        for channel in channels:
            rss_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel['channel_id']}"
            feed = feedparser.parse(rss_url)
            if feed.bozo == 0 and hasattr(feed, 'entries'):
                channel_new_count = 0
                for entry in feed.entries:
                    if is_short(entry):
                        shorts_blocked += 1
                        continue
                    video_id = entry.yt_videoid
                    exists = conn.execute("SELECT 1 FROM videos WHERE video_id = ?", (video_id,)).fetchone()
                    if not exists:
                        # 2. INSERT WITH is_new = 1
                        conn.execute("INSERT INTO videos (video_id, title, channel_id, published_at, status, is_new) VALUES (?, ?, ?, ?, 'new', 1)", 
                                     (video_id, entry.title, channel['id'], entry.published))
                        channel_new_count += 1
                if channel_new_count > 0:
                    updates.append({'name': channel['name'], 'count': channel_new_count})
                    total_new += channel_new_count
        
        ts_to_save = backdate_ts if backdate_ts else datetime.now()
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", 
                     ('last_update_ts', ts_to_save.isoformat()))
        conn.commit()
        
        return {
            'success': True,
            'updates': updates,
            'total_new': total_new,
            'shorts_blocked': shorts_blocked,
            'channel_count': len(channels)
        }
    except Exception as e:
        print(f"Update Error: {e}")
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()

def scheduled_job():    
    try:
        anchor = datetime.fromisoformat(get_setting('last_update_ts'))
        current_mins = int(get_setting('distill_interval_mins', 60))
        
        if anchor:
            anchor += timedelta(minutes=current_mins)
    except:
        anchor = datetime.now()
    
    result = perform_update(anchor) 
    if result['success']:
        
        # 1. SILENCE IF EMPTY DB
        if result.get('channel_count', 0) == 0:
            print("Auto-Update: No channels found. Silencing notification.")
            return 

        # 2. PROCESS UPDATES
        if result['updates']:
            # Loop through each channel that had updates
            for update in result['updates']:
                # Format: "3 new videos from Veritasium"
                msg = f"{update['count']} new videos from {update['name']}"
                print(msg)
                
                # We queue a toast for each channel.
                # should_reload is False so the user can read the toasts without the page 
                # instantly reloading and making them disappear.
                notification_queue.append({'msg': msg, 'type': 'add', 'should_reload': False})
                
        else:
            print("Auto-Update: No new videos found.")
            notification_queue.append({'msg': "Auto-Update: No new videos.", 'type': 'update', 'should_reload': False})
    else:
        print(f"Auto-Update Failed: {result.get('error')}")
        notification_queue.append({'msg': f"Auto-Update Failed: {result.get('error')}", 'type': 'remove', 'should_reload': False})

def execute_config_switch():
    """Transitions from old schedule to new schedule at the target time."""
    print("Executing Config Switch...")
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = 'pending_switch'").fetchone()
        if not row: return
        
        pending = json.loads(row['value'])
        new_mins = int(pending['interval'])
        
        # 1. Apply Settings (Make the new interval official)
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ('distill_interval_mins', str(new_mins)))
        conn.execute("DELETE FROM settings WHERE key = 'pending_switch'")
        conn.commit()
        
        # 2. Run the update (The 'Start Time' trigger reset)
        perform_update() 
        
        # 3. Start the permanent interval job
        if scheduler.get_job('feed_update_job'):
            scheduler.remove_job('feed_update_job')
            
        scheduler.add_job(
            func=scheduled_job,
            trigger="interval",
            minutes=new_mins,
            id='feed_update_job',
            replace_existing=True
        )
        print(f"Switch Complete. New Interval: {new_mins}m")
        notification_queue.append({'msg': f"Interval switched to {new_mins}m", 'type': 'update', 'should_reload': False})
        
    except Exception as e:
        print(f"Switch Error: {e}")
    finally:
        conn.close()

# ---------------------------------------------------------
# SCHEDULER SETUP (Handover Logic)
# ---------------------------------------------------------
scheduler = BackgroundScheduler()

def update_scheduler_interval():
    # 1. Check for Pending Switch in DB
    pending_str = get_setting('pending_switch')
    current_mins = int(get_setting('distill_interval_mins', 60))
    
    # --- RESTORED ANCHOR LOGIC ---
    last_update_str = get_setting('last_update_ts')
    now = datetime.now()
    next_run = now + timedelta(minutes=current_mins)
    start_anchor = now
    
    if last_update_str:
        try:
            last_update = datetime.fromisoformat(last_update_str)
            start_anchor = last_update
            
            # Calculate exactly how many intervals we missed while offline
            elapsed = now - last_update
            if elapsed.total_seconds() > 0:
                intervals_passed = int(elapsed.total_seconds() // (current_mins * 60))
                # Lock the next run to the exact grid schedule
                next_run = last_update + timedelta(minutes=current_mins * (intervals_passed + 1))
            else:
                next_run = last_update + timedelta(minutes=current_mins)
        except Exception as e:
            print(f"Anchor calculation error: {e}")
    
    if pending_str:
        # FUTURE MODE: Schedule handover
        pending = json.loads(pending_str)
        start_ts = datetime.fromisoformat(pending['start_ts'])
        
        if start_ts <= now:
            # We missed the window (offline), switch immediately
            execute_config_switch()
        else:
            print(f"Scheduling Handover. Current: {current_mins}m until {start_ts}. Then: {pending['interval']}m.")
            
            # A. Current Job: Runs until 'start_ts', anchored to previous grid
            scheduler.add_job(
                func=scheduled_job,
                trigger="interval",
                minutes=current_mins,
                start_date=start_anchor,
                next_run_time=next_run if next_run < start_ts else start_ts, # Ensure we don't overshoot
                id='feed_update_job',
                end_date=start_ts, # Die exactly at switch time
                replace_existing=True
            )
            
            # B. Switch Job: Runs once at 'start_ts'
            scheduler.add_job(
                func=execute_config_switch,
                trigger="date",
                run_date=start_ts,
                id='switch_job',
                replace_existing=True
            )
    else:
        # STANDARD MODE: No pending switches
        if scheduler.get_job('switch_job'): 
            scheduler.remove_job('switch_job')
        
        scheduler.add_job(
            func=scheduled_job, 
            trigger="interval", 
            minutes=current_mins, 
            start_date=start_anchor,
            next_run_time=next_run, # Immediately corrects the UI countdown
            id='feed_update_job', 
            replace_existing=True
        )
        print(f"Scheduler Running: Every {current_mins}m. Anchored at: {next_run.strftime('%H:%M:%S')}")

def start_scheduler():
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        if not scheduler.running:
            scheduler.start()
            update_scheduler_interval()
            atexit.register(lambda: scheduler.shutdown())

# ---------------------------------------------------------
# ROUTES
# ---------------------------------------------------------

@app.route('/')
def feed():
    conn = get_db_connection()
    all_tags = get_existing_tags(only_used=False)
    gatekeeper_tags = get_existing_tags(only_used=True)

    # Check if DB is empty (Tutorial Mode) 
    try:
        channel_count = conn.execute("SELECT COUNT(*) FROM channels").fetchone()[0]
        show_tutorial = (channel_count == 0)
    except:
        show_tutorial = False 

    selected_cats_str = request.args.get('cats')
    change_focus_req = request.args.get('change_focus')
    explicit_nav = request.args.get('nav')
    referrer = request.referrer or ""
    internal_nav = 'archive' in referrer or 'channels' in referrer or 'settings' in referrer or 'nav=1' in referrer or 'channel_view' in referrer
    has_session = 'distill_focus' in session

    if change_focus_req:
        current = session.get('distill_focus', '').split(',') if 'distill_focus' in session else []
        session.pop('distill_focus', None)
        session.pop('active_channel', None)
        next_dest = request.args.get('next')
        conn.close()
        return render_template('feed.html', page='gatekeeper', categories=all_tags, gatekeeper_tags=gatekeeper_tags, active_channel=None, preselected_tags=current, show_tutorial=show_tutorial, next_dest=next_dest)

    if selected_cats_str:
        selected_tags = selected_cats_str.split(',')
        session['distill_focus'] = selected_cats_str
        
        next_page = request.args.get('next')
        if next_page == 'archive':
            return redirect(url_for('archive_feed'))
        elif next_page == 'channels':
            return redirect(url_for('channels_list'))
        
    elif has_session and (explicit_nav or internal_nav):
        selected_tags = session['distill_focus'].split(',')
    else:
        session.pop('active_channel', None) 
        conn.close()
        # Pass show_tutorial here
        return render_template('feed.html', page='gatekeeper', categories=all_tags, gatekeeper_tags=gatekeeper_tags, active_channel=None, preselected_tags=[], show_tutorial=show_tutorial)

    placeholders = ','.join(['?'] * len(selected_tags))
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
    
    # Calculate Fresh Count
    inbox_fresh_count = sum(1 for v in videos if v['is_new'] == 1)
    
    current_interval = get_setting('distill_interval_mins', 60)
    conn.close()

    return render_template('feed.html', videos=videos, page='inbox', categories=all_tags, current_cats=selected_tags, channels=get_sidebar_channels(), active_channel=session.get('active_channel'), current_interval=current_interval, inbox_fresh_count=inbox_fresh_count)

@app.route('/archive')
def archive_feed():
    if 'distill_focus' not in session:
        return redirect(url_for('feed'))
    
    conn = get_db_connection()
    selected_tags = session['distill_focus'].split(',')
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
    
    current_interval = get_setting('distill_interval_mins', 60)
    conn.close()
    
    return render_template(
        'feed.html',
        videos=videos,
        page='archive',
        current_cats=selected_tags,
        categories=get_existing_tags(),
        channels=get_sidebar_channels(),
        active_channel=session.get('active_channel'),
        current_interval=current_interval
    )

@app.route('/reset')
def reset_focus():
    session.pop('distill_focus', None)
    return redirect(url_for('feed'))

@app.route('/channels')
def channels_list():
    conn = get_db_connection()
    
    # 1. Check if DB is empty
    channel_count = conn.execute("SELECT COUNT(*) FROM channels").fetchone()[0]
    
    # 2. STRICT GATEKEEPER: Only kick user out if DB is NOT empty AND no session exists.
    # If DB is empty, let them in so they can add their first channel.
    if 'distill_focus' not in session and channel_count > 0:
        conn.close()
        return redirect(url_for('feed'))

    current_interval = get_setting('distill_interval_mins', 60)
    
    # 3. Render
    channels_data = get_sidebar_channels()
    conn.close()
    
    return render_template('feed.html', channels=channels_data, page='channels', categories=get_existing_tags(), active_channel=session.get('active_channel'), current_interval=current_interval)

@app.route('/settings')
def settings_page():
    if 'distill_focus' not in session: return redirect(url_for('feed'))
    current_interval = get_setting('distill_interval_mins', 60)
    return render_template('feed.html', page='settings', categories=get_existing_tags(), channels=get_sidebar_channels(), active_channel=session.get('active_channel'), current_interval=current_interval)

@app.route('/channel_view/<int:channel_id>')
def channel_view(channel_id):
    if 'distill_focus' not in session: return redirect(url_for('feed'))
    conn = get_db_connection()
    channel = conn.execute('SELECT name FROM channels WHERE id = ?', (channel_id,)).fetchone()
    if not channel:
        conn.close()
        return redirect(url_for('channels_list')) 
    session['active_channel'] = {'id': channel_id, 'name': channel['name']}
    videos = conn.execute('''
        SELECT v.*, c.name as channel_name,
               (SELECT GROUP_CONCAT(tag, ', ') FROM channel_tags WHERE channel_id = c.id) as tags_string
        FROM videos v 
        JOIN channels c ON v.channel_id = c.id 
        WHERE c.id = ? AND v.status IN ('active', 'archived', 'new')
        ORDER BY v.published_at DESC
    ''', (channel_id,)).fetchall()
    unwatched_count = sum(1 for v in videos if v['status'] == 'new')
    archived_count = sum(1 for v in videos if v['status'] == 'archived')
    
    # Calculate Fresh Count
    channel_fresh_count = sum(1 for v in videos if v['status'] == 'new' and v['is_new'] == 1)
    
    current_interval = get_setting('distill_interval_mins', 60)
    conn.close()
    return render_template('feed.html', page='channel_view', videos=videos, channels=get_sidebar_channels(), selected_channel_name=channel['name'], categories=get_existing_tags(), active_channel=session.get('active_channel'), unwatched_count=unwatched_count, archived_count=archived_count, current_interval=current_interval, channel_fresh_count=channel_fresh_count)

@app.route('/exit_channel')
def exit_channel():
    session.pop('active_channel', None)
    return redirect(url_for('channels_list'))

# ---------------------------------------------------------
# ACTIONS
# ---------------------------------------------------------

@app.route('/save_interval', methods=['POST'])
def save_interval():
    data = request.json
    try:
        mins = int(data.get('minutes', 60))
        if mins < 1: mins = 1
        
        mode = data.get('mode', 'now') # 'now' or 'custom'
        start_time_str = data.get('start_time')
        
        if mode == 'custom' and start_time_str:
            # FUTURE SWITCH
            # 1. Clear any existing pending switch? Or just overwrite.
            pending_data = json.dumps({'interval': mins, 'start_ts': start_time_str})
            set_setting('pending_switch', pending_data)
            
            # 2. Update Scheduler to reflect the waiting period
            update_scheduler_interval()
            
            return jsonify({'success': True, 'minutes': mins, 'mode': 'future'})
        else:
            # IMMEDIATE SWITCH
            set_setting('distill_interval_mins', mins)
            # Clear pending switch if we are overriding it with "Now"
            conn = get_db_connection()
            conn.execute("DELETE FROM settings WHERE key = 'pending_switch'")
            conn.commit()
            conn.close()
            
            # Update Scheduler immediately
            update_scheduler_interval()
            
            return jsonify({'success': True, 'minutes': mins, 'mode': 'now'})
            
    except Exception as e:
        print(e)
        return jsonify({'success': False, 'error': str(e)})

@app.route('/poll_notifications')
def poll_notifications():
    response = {'notifications': [], 'next_run': None}
    
    if notification_queue:
        response['notifications'] = list(notification_queue)
        notification_queue.clear()
        
    job = scheduler.get_job('feed_update_job')
    # If feed_update_job is dead (waiting for switch), show switch time?
    # Actually, we kept feed_update_job running until switch, so this works.
    if job and job.next_run_time:
        response['next_run'] = job.next_run_time.isoformat()
    elif scheduler.get_job('switch_job'):
        # If we are in the split second where one died and switch is about to run
        job = scheduler.get_job('switch_job')
        if job and job.next_run_time:
            response['next_run'] = job.next_run_time.isoformat()
        
    return jsonify(response)

@app.route('/api/refresh_view')
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
        else:
            videos = []

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
        'feed.html',
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

@app.route('/create_tag', methods=['POST'])
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

@app.route('/delete_tag', methods=['POST'])
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

@app.route('/trigger_update', methods=['POST'])
def trigger_update():
    result = perform_update()
    if result['success']: return jsonify(result)
    else: return jsonify({'success': False, 'error': result['error']})

@app.route('/purge_videos', methods=['POST'])
def purge_videos():
    conn = get_db_connection()
    try:
        conn.execute("DELETE FROM videos")
        conn.commit()
        return jsonify({'success': True})
    except Exception as e: return jsonify({'success': False, 'error': str(e)})
    finally: conn.close()

@app.route('/update_tags/<int:channel_id>', methods=['POST'])
def update_tags(channel_id):
    data = request.json
    raw_tags = data.get('tags', '').strip()
    
    # 1. Parse and Validate
    new_tags = [t.strip() for t in raw_tags.split(',') if t.strip()]
    
    if not new_tags:
        return jsonify({'success': False, 'error': 'At least 1 tag is required.'})
        
    if len(new_tags) > 3: 
        return jsonify({'success': False, 'error': 'Max 3 tags allowed.'})
        
    # 2. Update Database
    conn = get_db_connection()
    try:
        # Wipe old tags for this channel
        conn.execute("DELETE FROM channel_tags WHERE channel_id = ?", (channel_id,))
        
        # Add new tags
        for tag in new_tags: 
            conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (tag,))
            conn.execute("INSERT INTO channel_tags (channel_id, tag) VALUES (?, ?)", (channel_id, tag))
            
        conn.commit()
        return jsonify({'success': True})
    except Exception as e: 
        return jsonify({'success': False, 'error': str(e)})
    finally: 
        conn.close()

@app.route('/add_channel', methods=['POST'])
def add_channel():
    data = request.json
    raw_id = data.get('channel_id', '').strip()
    raw_tags = data.get('category', '').strip()
    
    # 1. Validate Channel ID
    if 'youtube.com/channel/' in raw_id: 
        clean_id = raw_id.split('youtube.com/channel/')[1].split('/')[0]
    elif 'youtube.com/@' in raw_id: 
        return jsonify({'success': False, 'error': 'Use Channel ID (UC...), not Handle.'})
    else: 
        clean_id = raw_id
        
    if not clean_id.startswith('UC') and not clean_id.startswith('@'): 
        clean_id = 'UC' + clean_id
        
    # 2. Validate Tags (Must have at least 1)
    tags_list = [t.strip() for t in raw_tags.split(',') if t.strip()]
    
    if not tags_list:
        return jsonify({'success': False, 'error': 'At least 1 tag is required.'})
        
    if len(tags_list) > 3: 
        tags_list = tags_list[:3]
        
    # 3. Fetch Feed to Verify ID
    rss_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={clean_id}"
    feed = feedparser.parse(rss_url)
    
    if feed.bozo != 0 or not hasattr(feed.feed, 'title'): 
        return jsonify({'success': False, 'error': 'Invalid Channel ID.'})
        
    channel_name = feed.feed.title
    
    # 4. Save to Database
    conn = get_db_connection()
    try:
        cur = conn.execute("INSERT INTO channels (name, channel_id) VALUES (?, ?)", (channel_name, clean_id))
        new_id = cur.lastrowid
        
        for tag in tags_list: 
            conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (tag,))
            conn.execute("INSERT INTO channel_tags (channel_id, tag) VALUES (?, ?)", (new_id, tag))
            
        conn.commit()

        # 1st Channel = Instant Update
        count = conn.execute("SELECT COUNT(*) FROM channels").fetchone()[0]
        if count == 1:
            print("First channel added – triggering initial update...")
            perform_update()

        return jsonify({'success': True, 'name': channel_name})
    except sqlite3.IntegrityError: 
        return jsonify({'success': False, 'error': 'Channel already exists!'})
    except Exception as e: 
        return jsonify({'success': False, 'error': str(e)})
    finally: 
        conn.close()

@app.route('/delete_channel/<int:db_id>', methods=['POST'])
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

@app.route('/move/<video_id>/<action>', methods=['POST'])
def move_video(video_id, action):
    if action not in ['archived', 'dumped', 'new']:
        return jsonify({'success': False, 'error': 'Invalid action'}), 400

    conn = get_db_connection()
    try:
        # Update status and, if moving to archived or dumped, also clear the 'is_new' flag
        if action in ['archived', 'dumped']:
            conn.execute("""
                UPDATE videos 
                SET status = ?, is_new = 0 
                WHERE video_id = ?
            """, (action, video_id))
        else:
            # For 'new' (should not happen often, but keep consistency)
            conn.execute("UPDATE videos SET status = ? WHERE video_id = ?", (action, video_id))

        conn.commit()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        conn.close()

@app.route('/rename_tag', methods=['POST'])
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
    
@app.route('/purge_everything', methods=['POST'])
def purge_everything():
    conn = get_db_connection()
    try:
        # Delete dependent tables first
        conn.execute("DELETE FROM videos")
        conn.execute("DELETE FROM channel_tags")
        # Delete main table
        conn.execute("DELETE FROM channels")
        
        # Reset settings that might be channel-dependent? 
        
        conn.commit()
        
        # Clear session data since active channel is gone
        session.pop('active_channel', None)
        session.pop('distill_focus', None)
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})
    finally:
        conn.close()

if __name__ == '__main__':
    init_db()
    start_scheduler()
    app.run(debug=True)