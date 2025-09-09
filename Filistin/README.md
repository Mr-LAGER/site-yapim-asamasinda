
# Filistin İçin Boykot — React + Vite + Tailwind

Modern, estetik ve hızlı bir site. Arka planda **`public/aksa.jpg`** saydam biçimde görünür; metinler okunaklıdır.

## Kurulum
```bash
npm i
npm run dev
```

## Yapı
- `public/aksa.jpg` → Arkaplan (kendi görselini buraya koy)
- `src/App.jsx` → Sayfa yapısı ve içerik
- `src/data/brands.json` → Boykot listesi (kendi verilerinle güncelle)

## Render'a Deploy (Static Site)
1. Bu klasörü bir Git deposu olarak push et (GitHub/GitLab).
2. render.com → New → **Static Site**.
3. **Build Command:** `npm run build`
4. **Publish Directory:** `dist`
5. Deploy!

## Notlar
- Rakamları ve marka bilgilerini **güncel, doğrulanmış** kaynaklarla destekle.
- İçerik barışçıl, yasal ve doğrulanabilir olmalı.
