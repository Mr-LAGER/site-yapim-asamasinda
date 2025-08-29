from flask import Flask, render_template, request, jsonify
from datetime import datetime
import threading

app = Flask(__name__)

# İstekleri saklamak için global liste
requests_data = []
total_requests = 0
lock = threading.Lock()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/requests')
def get_requests():
    with lock:
        return jsonify({
            'requests': requests_data,
            'total': total_requests
        })

@app.before_request
def log_request():
    if request.path == '/api/requests':
        return  # API endpoint'ini loglama
    
    global total_requests
    with lock:
        # İstek bilgilerini topla
        request_info = {
            'ip': request.remote_addr,
            'time': datetime.now().strftime('%H:%M:%S'),
            'date': datetime.now().strftime('%Y-%m-%d'),
            'method': request.method,
            'path': request.path
        }
        
        # Listeye ekle (en son 50 isteği tut)
        requests_data.insert(0, request_info)
        if len(requests_data) > 50:
            requests_data.pop()
        
        # Toplam istek sayısını güncelle
        total_requests += 1

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)