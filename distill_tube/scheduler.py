import os
import json
import atexit
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler

from .database import get_db_connection
from .helper import get_setting, set_setting, notification_queue
from .feed_updater import perform_update

scheduler = BackgroundScheduler()

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
        if result.get('channel_count', 0) == 0:
            print("Auto-Update: No channels found. Silencing notification.")
            return 

        if result['updates']:
            for update in result['updates']:
                msg = f"{update['count']} new videos from {update['name']}"
                print(msg)
                notification_queue.append({'msg': msg, 'type': 'add', 'should_reload': False})
        else:
            print("Auto-Update: No new videos found.")
            notification_queue.append({'msg': "Auto-Update: No new videos.", 'type': 'update', 'should_reload': False})
    else:
        print(f"Auto-Update Failed: {result.get('error')}")
        notification_queue.append({'msg': f"Auto-Update Failed: {result.get('error')}", 'type': 'remove', 'should_reload': False})

def execute_config_switch():
    print("Executing Config Switch...")
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = 'pending_switch'").fetchone()
        if not row: return
        
        pending = json.loads(row['value'])
        new_mins = int(pending['interval'])
        
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ('distill_interval_mins', str(new_mins)))
        conn.execute("DELETE FROM settings WHERE key = 'pending_switch'")
        conn.commit()
        
        perform_update() 
        
        if scheduler.get_job('feed_update_job'):
            scheduler.remove_job('feed_update_job')
            
        scheduler.add_job(
            func=scheduled_job, trigger="interval", minutes=new_mins,
            id='feed_update_job', replace_existing=True
        )
        print(f"Switch Complete. New Interval: {new_mins}m")
        notification_queue.append({'msg': f"Interval switched to {new_mins}m", 'type': 'update', 'should_reload': False})
    except Exception as e:
        print(f"Switch Error: {e}")
    finally:
        conn.close()

def update_scheduler_interval():
    pending_str = get_setting('pending_switch')
    current_mins = int(get_setting('distill_interval_mins', 60))
    last_update_str = get_setting('last_update_ts')
    now = datetime.now()
    next_run = now + timedelta(minutes=current_mins)
    start_anchor = now
    
    if last_update_str:
        try:
            last_update = datetime.fromisoformat(last_update_str)
            start_anchor = last_update
            elapsed = now - last_update
            if elapsed.total_seconds() > 0:
                intervals_passed = int(elapsed.total_seconds() // (current_mins * 60))
                next_run = last_update + timedelta(minutes=current_mins * (intervals_passed + 1))
            else:
                next_run = last_update + timedelta(minutes=current_mins)
        except Exception as e:
            print(f"Anchor calculation error: {e}")
    
    if pending_str:
        pending = json.loads(pending_str)
        start_ts = datetime.fromisoformat(pending['start_ts'])
        
        if start_ts <= now:
            execute_config_switch()
        else:
            print(f"Scheduling Handover. Current: {current_mins}m until {start_ts}. Then: {pending['interval']}m.")
            scheduler.add_job(
                func=scheduled_job, trigger="interval", minutes=current_mins,
                start_date=start_anchor, next_run_time=next_run if next_run < start_ts else start_ts, 
                id='feed_update_job', end_date=start_ts, replace_existing=True
            )
            scheduler.add_job(
                func=execute_config_switch, trigger="date", run_date=start_ts,
                id='switch_job', replace_existing=True
            )
    else:
        if scheduler.get_job('switch_job'): 
            scheduler.remove_job('switch_job')
        
        scheduler.add_job(
            func=scheduled_job, trigger="interval", minutes=current_mins, 
            start_date=start_anchor, next_run_time=next_run, 
            id='feed_update_job', replace_existing=True
        )
        print(f"Scheduler Running: Every {current_mins}m. Anchored at: {next_run.strftime('%H:%M:%S')}")

def start_scheduler():
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        if not scheduler.running:
            scheduler.start()
            update_scheduler_interval()
            atexit.register(lambda: scheduler.shutdown())