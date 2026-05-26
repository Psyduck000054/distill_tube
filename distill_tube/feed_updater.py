import feedparser
from datetime import datetime
from .database import get_db_connection
from .helper import is_short

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