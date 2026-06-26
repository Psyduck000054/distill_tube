from flask import Blueprint, render_template, request, redirect, url_for, session
from .database import get_db_connection
from .helper import get_existing_tags, get_sidebar_channels, get_setting

# Initialize the Blueprint
views = Blueprint('views', __name__)

# ---------------------------------------------------------
# ROUTES
# ---------------------------------------------------------

@views.route('/')
def feed():
    conn = get_db_connection()
    all_tags = get_existing_tags(only_used=False)
    gatekeeper_tags = get_existing_tags(only_used=True)

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
        return render_template('pages/gatekeeper.html', page='gatekeeper', categories=all_tags, gatekeeper_tags=gatekeeper_tags, active_channel=None, preselected_tags=current, show_tutorial=show_tutorial, next_dest=next_dest)

    if selected_cats_str:
        selected_tags = selected_cats_str.split(',')
        session['distill_focus'] = selected_cats_str
        
        next_page = request.args.get('next')
        if next_page == 'archive':
            return redirect(url_for('views.archive_feed'))
        elif next_page == 'channels':
            return redirect(url_for('views.channels_list'))
        
    elif has_session and (explicit_nav or internal_nav):
        selected_tags = session['distill_focus'].split(',')
    else:
        session.pop('active_channel', None) 
        conn.close()
        return render_template('pages/gatekeeper.html', page='gatekeeper', categories=all_tags, gatekeeper_tags=gatekeeper_tags, active_channel=None, preselected_tags=[], show_tutorial=show_tutorial)

    placeholders = ','.join(['?'] * len(selected_tags))
    query = f"""
        SELECT DISTINCT v.*, c.name as channel_name,
               (SELECT GROUP_CONCAT(tag, ', ') FROM channel_tags WHERE channel_id = c.id) as tags_string
        FROM videos v 
        JOIN channels c ON v.channel_id = c.id 
        JOIN channel_tags ct ON c.id = ct.channel_id
        WHERE v.status = 'new' 
        AND ct.tag IN ({placeholders})
        ORDER BY v.published_at DESC
    """
    videos = conn.execute(query, selected_tags).fetchall()
    
    inbox_fresh_count = sum(1 for v in videos if v['is_new'] == 1)
    current_interval = get_setting('distill_interval_mins', 60)
    conn.close()

    return render_template('pages/inbox.html', videos=videos, page='inbox', categories=all_tags, current_cats=selected_tags, channels=get_sidebar_channels(), active_channel=session.get('active_channel'), current_interval=current_interval, inbox_fresh_count=inbox_fresh_count)

@views.route('/archive')
def archive_feed():
    if 'distill_focus' not in session:
        return redirect(url_for('views.feed'))
    
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
        'pages/archive.html',
        videos=videos,
        page='archive',
        current_cats=selected_tags,
        categories=get_existing_tags(),
        channels=get_sidebar_channels(),
        active_channel=session.get('active_channel'),
        current_interval=current_interval
    )

@views.route('/reset')
def reset_focus():
    session.pop('distill_focus', None)
    return redirect(url_for('views.feed'))

@views.route('/channels')
def channels_list():
    conn = get_db_connection()
    channel_count = conn.execute("SELECT COUNT(*) FROM channels").fetchone()[0]
    
    if 'distill_focus' not in session and channel_count > 0:
        conn.close()
        return redirect(url_for('views.feed'))

    selected_tags = session['distill_focus'].split(',')
    channels_data = get_sidebar_channels()
    conn.close()
    
    return render_template(
        'pages/channels.html', 
        channels=channels_data,
        current_cats=selected_tags,
        page='channels', 
        categories=get_existing_tags(), 
        active_channel=session.get('active_channel')
    )

@views.route('/settings')
def settings_page():
    if 'distill_focus' not in session: return redirect(url_for('views.feed'))
    current_interval = get_setting('distill_interval_mins', 60)
    return render_template('pages/settings.html', page='settings', categories=get_existing_tags(), channels=get_sidebar_channels(), active_channel=session.get('active_channel'), current_interval=current_interval)

@views.route('/channel_view/<int:channel_id>')
def channel_view(channel_id):
    if 'distill_focus' not in session: return redirect(url_for('views.feed'))
    conn = get_db_connection()
    channel = conn.execute('SELECT name FROM channels WHERE id = ?', (channel_id,)).fetchone()
    if not channel:
        conn.close()
        return redirect(url_for('views.channels_list')) 
    session['active_channel'] = {'id': channel_id, 'name': channel['name']}
    videos = conn.execute('''
        SELECT v.*, c.name as channel_name,
               (SELECT GROUP_CONCAT(tag, ', ') FROM channel_tags WHERE channel_id = c.id) as tags_string
        FROM videos v 
        JOIN channels c ON v.channel_id = c.id 
        WHERE c.id = ? AND v.status IN ('active', 'archived', 'new')
        ORDER BY v.published_at DESC
    ''', (channel_id,)).fetchall()
    
    tags_row = conn.execute("SELECT GROUP_CONCAT(tag, ',') as tags_string FROM channel_tags WHERE channel_id = ?", (channel_id,)).fetchone()
    channel_tags_str = tags_row['tags_string'] if tags_row and tags_row['tags_string'] else ""
    channel_tags = [t.strip() for t in channel_tags_str.split(',')] if channel_tags_str else []
    
    selected_tags = session['distill_focus'].split(',')
    if not (set(channel_tags) & set(selected_tags)):
        return redirect(url_for('views.channel'))
    
    unwatched_count = sum(1 for v in videos if v['status'] == 'new')
    archived_count = sum(1 for v in videos if v['status'] == 'archived')
    channel_fresh_count = sum(1 for v in videos if v['status'] == 'new' and v['is_new'] == 1)
    
    current_interval = get_setting('distill_interval_mins', 60)
    conn.close()
    return render_template('pages/channel_view.html', page='channel_view', videos=videos, channels=get_sidebar_channels(), selected_channel_name=channel['name'], categories=get_existing_tags(), active_channel=session.get('active_channel'), unwatched_count=unwatched_count, archived_count=archived_count, current_interval=current_interval, channel_fresh_count=channel_fresh_count)

@views.route('/exit_channel')
def exit_channel():
    session.pop('active_channel', None)
    return redirect(url_for('views.channels_list'))

@views.route('/video/<video_id>')
def video_screen(video_id):
    if 'distill_focus' not in session: 
        return redirect(url_for('views.feed'))
    
    conn = get_db_connection()
    
    video = conn.execute('''
        SELECT v.*, c.name as channel_name, c.id as db_channel_id,
               (SELECT GROUP_CONCAT(tag, ', ') FROM channel_tags WHERE channel_id = c.id) as tags_string
        FROM videos v 
        JOIN channels c ON v.channel_id = c.id 
        WHERE v.video_id = ?
    ''', (video_id,)).fetchone()
    
    if not video:
        conn.close()
        return redirect(url_for('views.feed'))
        
    ref = request.args.get('ref', 'inbox')
    
    session['active_video'] = {
        'id': video_id,
        'title': video['title'],
        'ref': ref,
        'db_channel_id': video['db_channel_id']
    }

    gatekeeper_tags = session.get('distill_focus', [])
    current_tags = [t.strip() for t in (video['tags_string'] or '').split(',') if t.strip()]
    valid_shared_tags = [t for t in current_tags if t in gatekeeper_tags]
    
    query = '''
        SELECT v.*, c.name as channel_name, c.id as db_channel_id,
               (SELECT GROUP_CONCAT(tag, ', ') FROM channel_tags WHERE channel_id = c.id) as tags_string
        FROM videos v
        JOIN channels c ON v.channel_id = c.id
        WHERE v.status != 'dumped' AND v.video_id != ?
        AND (
            v.channel_id = ? 
    '''
    params = [video_id, video['db_channel_id']]
    
    if valid_shared_tags:
        placeholders = ','.join(['?'] * len(valid_shared_tags))
        query += f'''
            OR c.id IN (
                SELECT channel_id FROM channel_tags WHERE tag IN ({placeholders})
            )
        '''
        params.extend(valid_shared_tags)
        
    query += ') ORDER BY RANDOM() LIMIT 3'
    
    recommended_videos = [dict(row) for row in conn.execute(query, params).fetchall()]
            
    conn.close()
    
    if ref == 'archive':
        return_url = url_for('views.archive_feed')
    elif ref == 'channel_view':
        return_url = url_for('views.channel_view', channel_id=video['db_channel_id'])
    elif ref == 'channels':
        return_url = url_for('views.channels_list')
    elif ref.startswith('video_'):
        parts = ref.replace('video_', '').split('-', 1)
        prev_id = parts[0]
        prev_ref = parts[1] if len(parts) > 1 else 'inbox'
        return_url = url_for('views.video_screen', video_id=prev_id, ref=prev_ref)
    else:
        return_url = url_for('views.feed', nav=1)
        
    return render_template(
        'pages/video_screen.html', 
        page='video_screen', 
        video=video, 
        return_url=return_url,
        ref=ref,
        active_channel=session.get('active_channel'),
        recommended_videos=recommended_videos,
        parent_channel_id=video['db_channel_id'],
        valid_shared_tags=valid_shared_tags       
    )
    
@views.route('/exit_video')
def exit_video():
    vid_data = session.pop('active_video', None)
    
    if not vid_data:
        return redirect(url_for('views.feed'))
        
    ref = vid_data.get('ref')
    
    if ref == 'archive':
        return redirect(url_for('views.archive_feed'))
    elif ref == 'channel_view':
        return redirect(url_for('views.channel_view', channel_id=int(vid_data.get('db_channel_id'))))
    elif ref == 'channels':
        return redirect(url_for('views.channels_list'))
    elif ref and ref.startswith('video_'):
        parts = ref.replace('video_', '').split('-', 1)
        prev_id = parts[0]
        prev_ref = parts[1] if len(parts) > 1 else 'inbox'
        return redirect(url_for('views.video_screen', video_id=prev_id, ref=prev_ref))
    else:
        return redirect(url_for('views.feed', nav=1))
    
@views.route('/api/shuffle/<video_id>')
def shuffle_recommendations(video_id):
    if 'distill_focus' not in session:
        return "<div class='text-red-500'>Session expired.</div>", 403
        
    conn = get_db_connection()
    
    parent_video = conn.execute('''
        SELECT v.channel_id as db_channel_id,
               (SELECT GROUP_CONCAT(tag, ', ') FROM channel_tags WHERE channel_id = v.channel_id) as tags_string
        FROM videos v WHERE v.video_id = ?
    ''', (video_id,)).fetchone()
    
    if not parent_video:
        conn.close()
        return "", 404

    gatekeeper_tags = session.get('distill_focus', [])
    current_tags = [t.strip() for t in (parent_video['tags_string'] or '').split(',') if t.strip()]
    valid_shared_tags = [t for t in current_tags if t in gatekeeper_tags]
    
    query = '''
        SELECT v.*, c.name as channel_name, c.id as db_channel_id,
               (SELECT GROUP_CONCAT(tag, ', ') FROM channel_tags WHERE channel_id = c.id) as tags_string
        FROM videos v
        JOIN channels c ON v.channel_id = c.id
        WHERE v.status != 'dumped' AND v.video_id != ?
        AND (v.channel_id = ? 
    '''
    params = [video_id, parent_video['db_channel_id']]
    
    if valid_shared_tags:
        placeholders = ','.join(['?'] * len(valid_shared_tags))
        query += f" OR c.id IN (SELECT channel_id FROM channel_tags WHERE tag IN ({placeholders}))"
        params.extend(valid_shared_tags)
        
    query += ') ORDER BY RANDOM() LIMIT 3'
    
    recommended_videos = [dict(row) for row in conn.execute(query, params).fetchall()]
    conn.close()
    
    return render_template(
        'components/recommendation_list.html', 
        recommended_videos=recommended_videos,
        parent_channel_id=parent_video['db_channel_id'],
        valid_shared_tags=valid_shared_tags,
        ref=request.args.get('ref', 'inbox')
    )