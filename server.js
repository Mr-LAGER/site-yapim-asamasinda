const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS ayarları
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Gelen konum verilerini saklamak için array
let locationData = [];

// Admin paneli sayfası
app.get('/admin', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="tr">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin Paneli - Deneyap Kart</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 20px;
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    overflow: hidden;
                }
                .header {
                    background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
                    color: white;
                    padding: 30px;
                    text-align: center;
                }
                .header h1 {
                    font-size: 2.5em;
                    margin-bottom: 10px;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
                }
                .content {
                    padding: 40px;
                }
                .info-box {
                    background: #f8f9fa;
                    padding: 20px;
                    border-radius: 10px;
                    margin-bottom: 20px;
                    border-left: 4px solid #667eea;
                }
                .info-box h3 {
                    color: #333;
                    margin-bottom: 10px;
                }
                .info-box p {
                    color: #666;
                    line-height: 1.6;
                }
                .endpoint-box {
                    background: #fff;
                    border: 2px solid #e9ecef;
                    padding: 20px;
                    border-radius: 10px;
                    margin-bottom: 20px;
                }
                .endpoint-box h4 {
                    color: #667eea;
                    margin-bottom: 15px;
                    font-size: 1.2em;
                }
                .method {
                    display: inline-block;
                    padding: 5px 15px;
                    border-radius: 5px;
                    font-weight: bold;
                    margin-right: 10px;
                    font-size: 0.9em;
                }
                .method-get {
                    background: #28a745;
                    color: white;
                }
                .method-post {
                    background: #007bff;
                    color: white;
                }
                .method-delete {
                    background: #dc3545;
                    color: white;
                }
                .url-box {
                    background: #f8f9fa;
                    padding: 10px 15px;
                    border-radius: 5px;
                    margin: 10px 0;
                    font-family: 'Courier New', monospace;
                    font-size: 0.9em;
                    word-break: break-all;
                }
                .btn {
                    padding: 12px 30px;
                    border: none;
                    border-radius: 8px;
                    font-size: 1em;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    margin: 10px 5px;
                }
                .btn-primary {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                .btn-danger {
                    background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
                    color: white;
                }
                .btn-success {
                    background: linear-gradient(135deg, #28a745 0%, #218838 100%);
                    color: white;
                }
                .btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                }
                .action-section {
                    background: #fff3cd;
                    padding: 20px;
                    border-radius: 10px;
                    border: 2px solid #ffc107;
                    margin-top: 30px;
                }
                .action-section h3 {
                    color: #856404;
                    margin-bottom: 15px;
                }
                .stat-card {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 20px;
                    border-radius: 10px;
                    text-align: center;
                    margin-bottom: 20px;
                }
                .stat-value {
                    font-size: 3em;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .stat-label {
                    font-size: 1.1em;
                    opacity: 0.9;
                }
                .example-code {
                    background: #2d2d2d;
                    color: #f8f8f2;
                    padding: 15px;
                    border-radius: 8px;
                    margin: 10px 0;
                    font-family: 'Courier New', monospace;
                    font-size: 0.85em;
                    overflow-x: auto;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔧 Admin Paneli</h1>
                    <p>API Endpoint'leri ve Yönetim</p>
                </div>
                
                <div class="content">
                    <div class="stat-card">
                        <div class="stat-value">${locationData.length}</div>
                        <div class="stat-label">Toplam Kayıtlı Konum</div>
                    </div>
                    
                    <div class="info-box">
                        <h3>📋 Hızlı Linkler</h3>
                        <button class="btn btn-primary" onclick="window.location.href='/'">🗺️ Harita Görünümü</button>
                        <button class="btn btn-success" onclick="window.location.href='/all-locations'">📊 Tüm Veriler (JSON)</button>
                    </div>
                    
                    <div class="endpoint-box">
                        <h4>📍 Konum Gönderme (GET)</h4>
                        <span class="method method-get">GET</span>
                        <div class="url-box">${req.protocol}://${req.get('host')}/location?lat=39.9334&lng=32.8597</div>
                        <p><strong>Kullanım:</strong> Tarayıcıda veya Arduino'dan GET isteği ile</p>
                    </div>
                    
                    <div class="endpoint-box">
                        <h4>📍 Konum Gönderme (POST)</h4>
                        <span class="method method-post">POST</span>
                        <div class="url-box">${req.protocol}://${req.get('host')}/location</div>
                        <p><strong>Body (JSON):</strong></p>
                        <div class="example-code">{
  "lat": 39.9334,
  "lng": 32.8597
}</div>
                        <p><strong>Kullanım:</strong> Postman veya cURL ile POST isteği</p>
                        <div class="example-code">curl -X POST ${req.protocol}://${req.get('host')}/location \\
  -H "Content-Type: application/json" \\
  -d '{"lat":39.9334,"lng":32.8597}'</div>
                    </div>
                    
                    <div class="endpoint-box">
                        <h4>🗑️ Tek Konum Silme</h4>
                        <span class="method method-delete">DELETE</span>
                        <div class="url-box">${req.protocol}://${req.get('host')}/delete-location/{index}</div>
                        <p><strong>Kullanım:</strong> Haritada marker'a tıklayıp çarpı butonuna basın, veya:</p>
                        <div class="example-code">curl -X DELETE ${req.protocol}://${req.get('host')}/delete-location/0</div>
                        <p><small>* index: 0'dan başlar (ilk konum = 0, ikinci = 1, vs.)</small></p>
                    </div>
                    
                    <div class="endpoint-box">
                        <h4>🗑️ Tüm Konumları Temizle</h4>
                        <span class="method method-delete">DELETE</span>
                        <div class="url-box">${req.protocol}://${req.get('host')}/clear</div>
                        <p><strong>Kullanım - Tarayıcı Console'da (F12):</strong></p>
                        <div class="example-code">fetch('${req.protocol}://${req.get('host')}/clear', {method: 'DELETE'})
  .then(r => r.json())
  .then(d => {
    console.log(d);
    alert('Tüm konumlar silindi!');
    location.reload();
  });</div>
                        <p><strong>Veya cURL ile:</strong></p>
                        <div class="example-code">curl -X DELETE ${req.protocol}://${req.get('host')}/clear</div>
                    </div>
                    
                    <div class="action-section">
                        <h3>⚠️ Tehlikeli İşlemler</h3>
                        <p style="color: #856404; margin-bottom: 15px;">
                            Bu buton tüm konum verilerini kalıcı olarak silecektir. Bu işlem geri alınamaz!
                        </p>
                        <button class="btn btn-danger" onclick="clearAllLocations()">
                            🗑️ TÜM KONUMLARI SİL
                        </button>
                    </div>
                    
                    <div class="info-box" style="margin-top: 30px; border-left-color: #28a745;">
                        <h3>✅ Endpoint Testi</h3>
                        <p>Tarayıcınızın console'unu açın (F12) ve şu komutu yapıştırın:</p>
                        <div class="example-code">// Konum gönder
fetch('${req.protocol}://${req.get('host')}/location?lat=41.0082&lng=28.9784')
  .then(r => r.json())
  .then(d => console.log('✅ Başarılı:', d));

// Tüm konumları getir
fetch('${req.protocol}://${req.get('host')}/all-locations')
  .then(r => r.json())
  .then(d => console.log('📊 Tüm konumlar:', d));</div>
                    </div>
                </div>
            </div>
            
            <script>
                async function clearAllLocations() {
                    const confirmation = prompt('Tüm konumları silmek için "SIL" yazın:');
                    
                    if (confirmation === 'SIL') {
                        try {
                            const response = await fetch('/clear', {
                                method: 'DELETE'
                            });
                            const result = await response.json();
                            
                            if (result.success) {
                                alert('✅ ' + result.message);
                                location.reload();
                            } else {
                                alert('❌ Hata: ' + result.message);
                            }
                        } catch (error) {
                            alert('❌ İşlem hatası: ' + error.message);
                        }
                    } else if (confirmation !== null) {
                        alert('❌ İptal edildi. "SIL" yazmanız gerekiyor.');
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// Ana sayfa - Harita ile konum gösterimi
app.get('/', (req, res) => {
    const lastLocation = locationData.length > 0 ? locationData[locationData.length - 1] : null;
    
    res.send(`
        <!DOCTYPE html>
        <html lang="tr">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Deneyap Kart Konum Takip</title>
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
            <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 20px;
                }
                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    overflow: hidden;
                }
                .header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 30px;
                    text-align: center;
                }
                .header h1 {
                    font-size: 2.5em;
                    margin-bottom: 10px;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
                }
                .header p {
                    font-size: 1.1em;
                    opacity: 0.9;
                }
                .stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    padding: 30px;
                    background: #f8f9fa;
                }
                .stat-card {
                    background: white;
                    padding: 20px;
                    border-radius: 15px;
                    text-align: center;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    transition: transform 0.3s ease;
                }
                .stat-card:hover {
                    transform: translateY(-5px);
                }
                .stat-value {
                    font-size: 2em;
                    font-weight: bold;
                    color: #667eea;
                    margin-bottom: 5px;
                }
                .stat-label {
                    color: #6c757d;
                    font-size: 0.9em;
                }
                #map {
                    width: 100%;
                    height: 500px;
                    border-top: 3px solid #667eea;
                    border-bottom: 3px solid #667eea;
                }
                .location-list {
                    padding: 30px;
                    max-height: 400px;
                    overflow-y: auto;
                }
                .location-item {
                    background: #f8f9fa;
                    padding: 15px;
                    margin-bottom: 10px;
                    border-radius: 10px;
                    border-left: 4px solid #667eea;
                    transition: all 0.3s ease;
                }
                .location-item:hover {
                    background: #e9ecef;
                    transform: translateX(5px);
                }
                .location-coords {
                    font-size: 1.1em;
                    font-weight: bold;
                    color: #333;
                    margin-bottom: 5px;
                }
                .location-time {
                    color: #6c757d;
                    font-size: 0.9em;
                }
                .no-data {
                    text-align: center;
                    padding: 40px;
                    color: #6c757d;
                    font-style: italic;
                }
                .refresh-btn {
                    position: fixed;
                    bottom: 30px;
                    right: 30px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 15px 30px;
                    border-radius: 50px;
                    font-size: 1em;
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                    transition: all 0.3s ease;
                }
                .refresh-btn:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                .live-indicator {
                    display: inline-block;
                    width: 10px;
                    height: 10px;
                    background: #28a745;
                    border-radius: 50%;
                    margin-right: 8px;
                    animation: pulse 2s infinite;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📍 Deneyap Kart Konum Takip</h1>
                    <p><span class="live-indicator"></span>Gerçek Zamanlı Konum İzleme</p>
                </div>
                
                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-value">${locationData.length}</div>
                        <div class="stat-label">Toplam Konum Verisi</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${lastLocation ? lastLocation.lat.toFixed(6) : '-'}</div>
                        <div class="stat-label">Son Enlem</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${lastLocation ? lastLocation.lng.toFixed(6) : '-'}</div>
                        <div class="stat-label">Son Boylam</div>
                    </div>
                </div>
                
                <div id="map"></div>
                
                <div class="location-list">
                    <h2 style="margin-bottom: 20px; color: #333;">📋 Son Konumlar</h2>
                    ${locationData.length > 0 ? 
                        locationData.slice(-10).reverse().map((loc, index) => `
                            <div class="location-item">
                                <div class="location-coords">
                                    📌 Enlem: ${loc.lat.toFixed(6)} | Boylam: ${loc.lng.toFixed(6)}
                                </div>
                                <div class="location-time">🕐 ${loc.timestamp}</div>
                            </div>
                        `).join('') 
                        : '<div class="no-data">Henüz konum verisi alınmadı. Deneyap Kart\'ı başlatın...</div>'
                    }
                </div>
            </div>
            
            <button class="refresh-btn" onclick="location.reload()">🔄 Yenile</button>
            
            <script>
                // Harita başlatma
                const map = L.map('map').setView([${lastLocation ? lastLocation.lat : 39.9334}, ${lastLocation ? lastLocation.lng : 32.8597}], ${lastLocation ? 13 : 6});
                
                // OpenStreetMap tile layer
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: 19
                }).addTo(map);
                
                // Tüm konumları haritaya ekle
                const locations = ${JSON.stringify(locationData)};
                
                // Konum silme fonksiyonu
                async function deleteLocation(index) {
                    if (confirm('Bu konumu silmek istediğinizden emin misiniz?')) {
                        try {
                            const response = await fetch('/delete-location/' + index, {
                                method: 'DELETE'
                            });
                            const result = await response.json();
                            
                            if (result.success) {
                                alert('✅ Konum silindi!');
                                location.reload();
                            } else {
                                alert('❌ Hata: ' + result.message);
                            }
                        } catch (error) {
                            alert('❌ Silme hatası: ' + error.message);
                        }
                    }
                }
                
                if (locations.length > 0) {
                    // Marker'ları ekle
                    locations.forEach((loc, index) => {
                        const marker = L.marker([loc.lat, loc.lng]).addTo(map);
                        marker.bindPopup(\`
                            <div style="min-width: 200px;">
                                <b style="color: \${index === locations.length - 1 ? '#dc3545' : '#667eea'}; font-size: 1.1em;">
                                    \${index === locations.length - 1 ? '🔴 Son Konum' : '📍 Konum ' + (index + 1)}
                                </b>
                                <hr style="margin: 8px 0; border-color: #ddd;">
                                <div style="margin: 5px 0;">
                                    <strong>📍 Enlem:</strong> \${loc.lat.toFixed(6)}
                                </div>
                                <div style="margin: 5px 0;">
                                    <strong>📍 Boylam:</strong> \${loc.lng.toFixed(6)}
                                </div>
                                <div style="margin: 5px 0; color: #666;">
                                    <strong>🕐 Zaman:</strong> \${loc.timestamp}
                                </div>
                                <hr style="margin: 8px 0; border-color: #ddd;">
                                <button 
                                    onclick="deleteLocation(\${index})" 
                                    style="
                                        width: 100%;
                                        padding: 8px;
                                        background: #dc3545;
                                        color: white;
                                        border: none;
                                        border-radius: 5px;
                                        cursor: pointer;
                                        font-weight: bold;
                                        font-size: 0.9em;
                                        transition: all 0.3s ease;
                                    "
                                    onmouseover="this.style.background='#c82333'"
                                    onmouseout="this.style.background='#dc3545'"
                                >
                                    ❌ Bu Konumu Sil
                                </button>
                            </div>
                        \`);
                        
                        // Son konum için popup'ı aç
                        if (index === locations.length - 1) {
                            marker.openPopup();
                        }
                    });
                    
                    // Tüm marker'ları gösterecek şekilde zoom ayarla
                    if (locations.length > 1) {
                        const bounds = L.latLngBounds(locations.map(loc => [loc.lat, loc.lng]));
                        map.fitBounds(bounds, { padding: [50, 50] });
                    }
                }
                
                // Otomatik yenileme (30 saniyede bir)
                setTimeout(() => location.reload(), 30000);
            </script>
        </body>
        </html>
    `);
});

// Konum verisi alma endpoint'i (GET)
app.get('/location', (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    
    if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({
            success: false,
            message: 'Geçersiz enlem veya boylam değeri'
        });
    }
    
    const locationEntry = {
        lat: lat,
        lng: lng,
        timestamp: new Date().toLocaleString('tr-TR', { 
            timeZone: 'Europe/Istanbul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
    };
    
    locationData.push(locationEntry);
    
    console.log(`📍 Konum alındı: Enlem ${lat}, Boylam ${lng} - Toplam: ${locationData.length}`);
    
    res.json({
        success: true,
        message: 'Konum başarıyla kaydedildi',
        location: locationEntry,
        totalLocations: locationData.length
    });
});

// Konum verisi alma endpoint'i (POST)
app.post('/location', (req, res) => {
    const lat = parseFloat(req.body.lat || req.query.lat);
    const lng = parseFloat(req.body.lng || req.query.lng);
    
    if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({
            success: false,
            message: 'Geçersiz enlem veya boylam değeri'
        });
    }
    
    const locationEntry = {
        lat: lat,
        lng: lng,
        timestamp: new Date().toLocaleString('tr-TR', { 
            timeZone: 'Europe/Istanbul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
    };
    
    locationData.push(locationEntry);
    
    console.log(`📍 Konum alındı: Enlem ${lat}, Boylam ${lng} - Toplam: ${locationData.length}`);
    
    res.json({
        success: true,
        message: 'Konum başarıyla kaydedildi',
        location: locationEntry,
        totalLocations: locationData.length
    });
});

// Tüm konumları getir
app.get('/all-locations', (req, res) => {
    res.json({
        success: true,
        totalLocations: locationData.length,
        locations: locationData
    });
});

// Tek konum silme endpoint'i
app.delete('/delete-location/:index', (req, res) => {
    const index = parseInt(req.params.index);
    
    if (isNaN(index) || index < 0 || index >= locationData.length) {
        return res.status(400).json({
            success: false,
            message: 'Geçersiz konum indeksi'
        });
    }
    
    const deletedLocation = locationData.splice(index, 1)[0];
    
    console.log(`🗑️ Konum silindi: Enlem ${deletedLocation.lat}, Boylam ${deletedLocation.lng}`);
    
    res.json({
        success: true,
        message: 'Konum başarıyla silindi',
        deletedLocation: deletedLocation,
        remainingLocations: locationData.length
    });
});

// Tüm konumları temizle
app.delete('/clear', (req, res) => {
    const count = locationData.length;
    locationData = [];
    
    console.log(`🗑️ Tüm konumlar temizlendi: ${count} konum silindi`);
    
    res.json({
        success: true,
        message: `${count} konum verisi silindi`
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint bulunamadı',
        availableEndpoints: [
            'GET /',
            'GET /location?lat=39.9334&lng=32.8597',
            'POST /location',
            'GET /all-locations',
            'DELETE /clear'
        ]
    });
});

// Server'ı başlat
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server çalışıyor: http://0.0.0.0:${PORT}`);
    console.log(`📍 Konum göndermek için: /location?lat=39.9334&lng=32.8597`);
});
