const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS ayarları - Deneyap karttan gelen istekleri kabul etmek için
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Gelen verileri saklamak için basit bir array
let receivedData = [];

// Ana sayfa
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Deneyap Kart Veri Sunucusu</title>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial; padding: 20px; background: #f0f0f0; }
                .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
                h1 { color: #333; }
                .data-item { background: #e8f4f8; padding: 10px; margin: 10px 0; border-radius: 4px; }
                .stats { background: #d4edda; padding: 15px; border-radius: 4px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📡 Deneyap Kart Veri Sunucusu</h1>
                <div class="stats">
                    <h3>İstatistikler</h3>
                    <p>Toplam Alınan Veri: <strong>${receivedData.length}</strong></p>
                </div>
                <h3>Son 20 Veri:</h3>
                <div id="dataList">
                    ${receivedData.slice(-20).reverse().map(item => `
                        <div class="data-item">
                            <strong>Değer:</strong> ${item.value} | 
                            <strong>Zaman:</strong> ${item.timestamp}
                        </div>
                    `).join('')}
                </div>
            </div>
        </body>
        </html>
    `);
});

// GET endpoint - veri almak için
app.get('/data', (req, res) => {
    const value = req.query.value;
    
    if (value !== undefined) {
        const dataEntry = {
            value: value,
            timestamp: new Date().toLocaleString('tr-TR'),
            method: 'GET'
        };
        
        receivedData.push(dataEntry);
        
        console.log(`📥 GET ile veri alındı: ${value} - Toplam: ${receivedData.length}`);
        
        res.json({
            success: true,
            message: 'Veri başarıyla alındı',
            receivedValue: value,
            totalData: receivedData.length
        });
    } else {
        res.status(400).json({
            success: false,
            message: 'Value parametresi gerekli'
        });
    }
});

// POST endpoint - veri almak için (alternatif)
app.post('/data', (req, res) => {
    const value = req.body.value || req.query.value;
    
    if (value !== undefined) {
        const dataEntry = {
            value: value,
            timestamp: new Date().toLocaleString('tr-TR'),
            method: 'POST'
        };
        
        receivedData.push(dataEntry);
        
        console.log(`📥 POST ile veri alındı: ${value} - Toplam: ${receivedData.length}`);
        
        res.json({
            success: true,
            message: 'Veri başarıyla alındı',
            receivedValue: value,
            totalData: receivedData.length
        });
    } else {
        res.status(400).json({
            success: false,
            message: 'Value parametresi gerekli'
        });
    }
});

// Tüm verileri görüntüle
app.get('/all-data', (req, res) => {
    res.json({
        success: true,
        totalData: receivedData.length,
        data: receivedData
    });
});

// Verileri temizle
app.delete('/clear', (req, res) => {
    const count = receivedData.length;
    receivedData = [];
    res.json({
        success: true,
        message: `${count} veri silindi`
    });
});

// Server'ı başlat
app.listen(PORT, () => {
    console.log(`✅ Server çalışıyor: http://localhost:${PORT}`);
    console.log(`📡 Veri göndermek için: http://localhost:${PORT}/data?value=100`);
});
