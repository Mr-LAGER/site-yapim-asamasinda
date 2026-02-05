const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Ana sayfa (test)
app.get("/", (req, res) => {
  res.send("Deneyap Sunucusu Calisiyor!");
});

// Deneyap Kart veri endpointi
app.post("/api/veri-gonder", (req, res) => {
  const veri = req.body;

  console.log("================================");
  console.log("YENI VERI GELDI:");
  console.log(veri);
  console.log("================================");

  res.status(200).json({ durum: "OK" });
});

app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda calisiyor`);
});
