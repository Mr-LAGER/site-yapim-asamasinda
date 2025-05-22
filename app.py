from flask import Flask, request, render_template_string
from flask_socketio import SocketIO
import time
import json
from datetime import datetime
import threading
import queue

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Store requests in a thread-safe queue
request_queue = queue.Queue()
requests_data = []

# HTML template with Tailwind CSS for a modern, responsive UI
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Live Request Monitor</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js"></script>
    <script src="https://cdn.socket.io/4.5.0/socket.io.min.js"></script>
    <style>
        body { 
            background-color: #f3f4f6; 
            font-family: 'Inter', sans-serif; 
        }
        .table-row { transition: background-color 0.2s; }
        .table-row:hover { background-color: #e5e7eb; }
    </style>
</head>
<body class="min-h-screen p-6">
    <div class="max-w-6xl mx-auto">
        <h1 class="text-3xl font-bold text-gray-800 mb-6">Live Request Monitor</h1>
        <div class="bg-white shadow-lg rounded-lg p-6 mb-6">
            <h2 class="text-xl font-semibold text-gray-700 mb-4">Request Latency Graph</h2>
            <canvas id="latencyChart" height="100"></canvas>
        </div>
        <div class="bg-white shadow-lg rounded-lg p-6">
            <h2 class="text-xl font-semibold text-gray-700 mb-4">Recent Requests</h2>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-gray-600">
                    <thead>
                        <tr class="bg-gray-100">
                            <th class="p-3">Time</th>
                            <th class="p-3">Method</th>
                            <th class="p-3">Path</th>
                            <th class="p-3">Latency (ms)</th>
                        </tr>
                    </thead>
                    <tbody id="requestTable">
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        const socket = io();
        const ctx = document.getElementById('latencyChart').getContext('2d');
        const latencyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Latency (ms)',
                    data: [],
                    borderColor: '#3b82f6',
                    fill: false,
                    tension: 0.1
                }]
            },
            options: {
                scales: {
                    x: { title: { display: true, text: 'Time' } },
                    y: { title: { display: true, text: 'Latency (ms)' }, beginAtZero: true }
                }
            }
        });

        socket.on('new_request', function(data) {
            const table = document.getElementById('requestTable');
            const row = table.insertRow(0);
            row.className = 'table-row';
            row.innerHTML = `
                <td class="p-3">${data.time}</td>
                <td class="p-3">${data.method}</td>
                <td class="p-3">${data.path}</td>
                <td class="p-3">${data.latency}</td>
            `;
            if (table.rows.length > 50) table.deleteRow(-1);

            latencyChart.data.labels.push(data.time);
            latencyChart.data.datasets[0].data.push(data.latency);
            if (latencyChart.data.labels.length > 50) {
                latencyChart.data.labels.shift();
                latencyChart.data.datasets[0].data.shift();
            }
            latencyChart.update();
        });
    </script>
</body>
</html>
"""

# Middleware to capture request metadata and latency
@app.before_request
def before_request():
    request.start_time = time.time()

@app.after_request
def after_request(response):
    latency = (time.time() - request.start_time) * 1000  # Convert to milliseconds
    request_info = {
        'time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'method': request.method,
        'path': request.path,
        'latency': round(latency, 2)
    }
    request_queue.put(request_info)
    return response

# Route to serve the dashboard
@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

# Route to simulate different endpoints
@app.route('/api/test')
def test_endpoint():
    return {"message": "Test endpoint reached"}

# Background thread to process requests and emit via WebSocket
def process_requests():
    while True:
        request_info = request_queue.get()
        requests_data.append(request_info)
        if len(requests_data) > 50:  # Keep only last 50 requests
            requests_data.pop(0)
        socketio.emit('new_request', request_info)
        socketio.sleep(0.1)

if __name__ == '__main__':
    # Start the background thread for processing requests
    threading.Thread(target=process_requests, daemon=True).start()
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)