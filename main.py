from flask import Flask, request, render_template_string
import datetime

app = Flask(__name__)

# Verilerin tutulacağı geçici hafıza (Gerçek projede veritabanı kullanılır)
last_data = {
    "lat": 0.0,
    "lng": 0.0,
    "pressure": 0,
    "isWorn": False,
    "fall": False,
    "time": "Veri bekleniyor..."
}

# HTML Arayüzü
HTML_TEMPLATE = '''
<!DOCTYPE html>
<html>
<head>
    <title>Akıllı Ayakkabı Takip</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="5">
    <style>
        body { font-family: sans-serif; text-align: center; background: #f4f4f4; }
        .card { background: white; padding: 20px; margin: 20px auto; width: 80%; border-radius: 15px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
        .status { font-size: 24px; font-weight: bold; }
        .danger { color: red; animation: blink 1s infinite; }
        @keyframes blink { 50% { opacity: 0; } }
        button { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>👟 Akıllı Ayakkabı Takip Sistemi</h1>
    <div class="card">
        <h3>Durum</h3>
        <p class="status">{{ "GİYİLDİ ✅" if data.isWorn else "ÇIKARILDI ❌" }}</p>
        <p>Basınç: {{ data.pressure }}</p>
    </div>
    <div class="card">
        <h3>Güvenlik</h3>
        <p class="status {{ 'danger' if data.fall else '' }}">
            {{ "⚠️ DÜŞME ALGILANDI!" if data.fall else "Normal" }}
        </p>
    </div>
    <div class="card">
        <h3>Konum</h3>
        <p>Enlem: {{ data.lat }} | Boylam: {{ data.lng }}</p>
        <a href="https://www.google.com/maps?q={{data.lat}},{{data.lng}}" target="_blank">
            <button>Haritada Gör 📍</button>
        </a>
    </div>
    <p>Son Güncelleme: {{ data.time }}</p>
</body>
</html>
'''

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE, data=last_data)

@app.route('/api/data', methods=['POST'])
def receive_data():
    global last_data
    content = request.json
    last_data = {
        "lat": content.get("lat", 0),
        "lng": content.get("lng", 0),
        "pressure": content.get("pressure", 0),
        "isWorn": bool(content.get("isWorn", 0)),
        "fall": bool(content.get("fall", 0)),
        "time": datetime.datetime.now().strftime("%H:%M:%S")
    }
    return {"status": "success"}, 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
