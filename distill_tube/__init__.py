from flask import Flask

app = Flask(__name__)
app.secret_key = 'distill_tube_secret_key_change_this_in_prod' 

from .views import views
app.register_blueprint(views, url_prefix='/')

from .api import api
app.register_blueprint(api, url_prefix='/')