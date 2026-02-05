const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Gelen JSON verilerini okuyabilmek için middleware
app.use(express.json());

// Veriyi alacağımız ana endpoint
app.post('/veri-al', (req, res) => {
    const gelenVeri = req.body;
    
    console.log("--------------------------------");
    console.log("Deneyap Kart'tan veri geldi!");
    console.log("Gelen İçerik:", gelenVeri);
    console.log("--------------------------------");

    // Deneyap Kart'a başarılı olduğuna dair yanıt dönüyoruz
    res.status(200).json({
        mesaj: "Veri başarıyla alındı",
        alinan_deger: gelenVeri.deger
    });
});

// Sunucuyu başlat
app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif. Deneyap Kart bekleniyor...`);
});
