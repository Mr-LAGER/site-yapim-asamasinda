const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 3000;

// JSON verilerini okumak için gerekli ayar
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Ana sayfa (Tarayıcıdan girince görünür)
app.get('/', (req, res) => {
    res.send('Deneyap Sunucusu Calisiyor!');
});

// Deneyap Kartın Veri Göndereceği Adres (POST İsteği)
app.post('/api/veri-gonder', (req, res) => {
    // Karttan gelen veri: {"deger": 100}
    const gelenVeri = req.body;
    
    console.log("--------------------------------");
    console.log("KARTTAN YENI VERI GELDI:");
    console.log(gelenVeri); // Render Loglarında bu görünecek
    console.log("--------------------------------");

    res.status(200).send("Veri alindi.");
});

app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda baslatildi.`);
});
