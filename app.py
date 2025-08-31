from flask import Flask, request
from datetime import datetime

app = Flask(__name__)

# İstekleri kaydetmek için liste
logs = []

@app.route('/')
def index():
    # İstek bilgilerini al
    ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Kaydet
    logs.append({"ip": ip, "time": time})

    # Toplam istek sayısı
    total_requests = len(logs)

    # Son 10 isteği göster
    last_requests = logs[-10:]

    # HTML çıktısı
    return f"""
    <h2>Siteye Gelen İstekler</h2>
    <p><b>Toplam İstek:</b> {total_requests}</p>
    <table border="1" cellpadding="5">
        <tr><th>IP</th><th>Zaman</th></tr>
        {''.join(f"<tr><td>{req['ip']}</td><td>{req['time']}</td></tr>" for req in last_requests)}
    </table>
    """

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
