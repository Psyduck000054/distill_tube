from distill_tube import database, scheduler, app

if __name__ == '__main__':
    database.init_db()
    scheduler.start_scheduler()
    app.run(debug=True)