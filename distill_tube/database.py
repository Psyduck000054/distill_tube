import sqlite3
import os

# ---------------------------------------------------------
# DATABASE
# ---------------------------------------------------------

# config
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'distill_tube.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS tags (
                name TEXT PRIMARY KEY
            )
        ''')
        
        conn.execute('''
            CREATE TABLE IF NOT EXISTS channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                name TEXT NOT NULL, 
                channel_id TEXT UNIQUE NOT NULL
            )
        ''')
        
        conn.execute('''
            CREATE TABLE IF NOT EXISTS videos (
                video_id TEXT PRIMARY KEY, 
                title TEXT NOT NULL, 
                channel_id INTEGER, 
                published_at TEXT, 
                status TEXT DEFAULT 'new', 
                is_new INTEGER DEFAULT 0,
                thumbnail_url TEXT,
                duration TEXT,
                FOREIGN KEY(channel_id) REFERENCES channels(id)
            )
        ''')
        
        conn.execute('''
            CREATE TABLE IF NOT EXISTS channel_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                channel_id INTEGER, 
                tag TEXT, 
                FOREIGN KEY(channel_id) REFERENCES channels(id)
            )
        ''')
        
        conn.execute('''
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY, 
                value TEXT
            )
        ''')
        
        conn.commit()
    except Exception as e:
        print(f"DB Init Error: {e}")
    finally:
        conn.close()