from .database import get_db_connection

BLOCK_SHORTS = True

# Global Notification Queue
notification_queue = []

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