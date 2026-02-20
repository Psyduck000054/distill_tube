import sqlite3
import os
from datetime import datetime

# CONFIG
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'distill_tube.db')

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def populate_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    print("--- STARTING POPULATION ---")

    # 1. Define Sample Channels (Name, Channel ID, List of Tags)
    sample_channels = [
        ("Veritasium", "UCHnyfMqiRRG1u-2MsSQLbXA", ["Science", "Education"]),
        ("Marques Brownlee", "UCBJycsmduvYEL83R_U4JriQ", ["Tech", "Reviews"]),
        ("Kurzgesagt – In a Nutshell", "UCsXVk37bltHxD1rDPwtNM8Q", ["Science", "Animation", "Education"]),
        ("MrBeast", "UCX6OQ3DkcsbYNE6H8uQQuVA", ["Entertainment", "Challenges"]),
        ("3Blue1Brown", "UCYO_jab_esuFRV4b17AJtAw", ["Music", "Education"])
    ]

    # 2. Insert Channels & Tags
    for name, yt_id, tags in sample_channels:
        try:
            # Insert Channel
            print(f"Adding Channel: {name}...")
            cursor.execute("INSERT OR IGNORE INTO channels (name, channel_id) VALUES (?, ?)", (name, yt_id))
            
            # Get the ID of the channel we just inserted/found
            cursor.execute("SELECT id FROM channels WHERE channel_id = ?", (yt_id,))
            channel_row = cursor.fetchone()
            if channel_row:
                channel_db_id = channel_row['id']

                # Insert Tags
                for tag in tags:
                    # Add to master tags table
                    cursor.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (tag,))
                    # Link to channel
                    cursor.execute("INSERT OR IGNORE INTO channel_tags (channel_id, tag) VALUES (?, ?)", (channel_db_id, tag))
                    
                # 3. Add Dummy Videos (So Inbox isn't empty)
                print(f"  -> Adding sample videos for {name}...")
                for i in range(1, 4): # 3 videos per channel
                    vid_id = f"{yt_id}_demo_{i}"
                    title = f"Sample Video {i} from {name}"
                    # Use current date for sorting
                    date = datetime.now().strftime("%Y-%m-%dT%H:%M:%S+00:00")
                    
                    cursor.execute("""
                        INSERT OR IGNORE INTO videos (video_id, title, channel_id, published_at, status) 
                        VALUES (?, ?, ?, ?, 'new')
                    """, (vid_id, title, channel_db_id, date))

        except Exception as e:
            print(f"Error adding {name}: {e}")

    conn.commit()
    conn.close()
    print("--- DATABASE POPULATED SUCCESSFULLY ---")
    print("Run 'python app.py' now!")

def temp ():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("ALTER TABLE videos ADD COLUMN is_new INTEGER DEFAULT 0")

if __name__ == '__main__':
    # Ensure tables exist first just in case
    if not os.path.exists(DB_PATH):
        print("Database not found. Run app.py first to initialize tables, or rely on this script if schema matches.")
    
    populate_db()