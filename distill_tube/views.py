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
        ORDER BY RANDOM()
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