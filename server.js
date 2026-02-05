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
                
                if (locations.length > 0) {
                    // Marker'ları ekle
                    locations.forEach((loc, index) => {
                        const marker = L.marker([loc.lat, loc.lng]).addTo(map);
                        marker.bindPopup(\`
                            <b>\${index === locations.length - 1 ? '🔴 Son Konum' : '📍 Konum ' + (index + 1)}</b><br>
                            Enlem: \${loc.lat.toFixed(6)}<br>
                            Boylam: \${loc.lng.toFixed(6)}<br>
                            Zaman: \${loc.timestamp}
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

// Konumları temizle
app.delete('/clear', (req, res) => {
    const count = locationData.length;
    locationData = [];
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
