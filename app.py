from flask import Flask, render_template, request
from flask_socketio import SocketIO
import threading
import time
import random

app = Flask(__name__)
app.config['SECRET_KEY'] = '12345'
socketio = SocketIO(app)

# In-memory request counter
request_count = 0
lock = threading.Lock()

# Simulate request count updates (for demo purposes)
def background_task():
    global request_count
    while True:
        time.sleep(5)  # Simulate periodic updates
        with lock:
            request_count += random.randint(1, 5)  # Simulate new requests
            socketio.emit('update_count', {'count': request_count})

@app.route('/')
def index():
    global request_count
    with lock:
        return render_template('index.html', initial_count=request_count)

# Track all incoming requests
@app.before_request
def count_request():
    global request_count
    with lock:
        request_count += 1
        socketio.emit('update_count', {'count': request_count})

if __name__ == '__main__':
    # Start background task for simulated updates
    threading.Thread(target=background_task, daemon=True).start()
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)