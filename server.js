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

/************ GÜVENLİK SİSTEMİ ************/

// Şifre yönetimi
let validPasswords = ['251900', '3850', 'TÜBİTAK'];

// DDoS koruması - IP bazlı rate limiting
const ipRequestTracker = new Map();
const bannedIPs = new Map();
const visitorIPs = new Map(); // Siteye giren IP'leri takip et

const RATE_LIMIT = {
    maxRequests: 100,        // Maksimum istek sayısı
    windowMs: 1000,          // Zaman penceresi (1 saniye)
    banDuration: 300000      // Ban süresi (5 dakika)
};

// Rate limiting middleware
function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    // Ziyaretçi IP'sini kaydet
    if (!visitorIPs.has(ip)) {
        visitorIPs.set(ip, {
            firstVisit: now,
            lastVisit: now,
            visitCount: 1
        });
    } else {
        const visitor = visitorIPs.get(ip);
        visitor.lastVisit = now;
        visitor.visitCount++;
    }
    
    // Banlı IP kontrolü
    if (bannedIPs.has(ip)) {
        const banInfo = bannedIPs.get(ip);
        if (now < banInfo.until) {
            const remainingTime = Math.ceil((banInfo.until - now) / 1000);
            return res.status(429).json({
                success: false,
                message: `IP adresiniz geçici olarak engellenmiştir`,
                remainingTime: remainingTime,
                reason: 'Çok fazla istek'
            });
        } else {
            // Ban süresi doldu, temizle
            bannedIPs.delete(ip);
            ipRequestTracker.delete(ip);
        }
    }
    
    // İstek sayısını izle
    if (!ipRequestTracker.has(ip)) {
        ipRequestTracker.set(ip, {
            requests: [],
            warnings: 0
        });
    }
    
    const tracker = ipRequestTracker.get(ip);
    
    // Eski istekleri temizle (1 saniyeden eski olanlar)
    tracker.requests = tracker.requests.filter(time => now - time < RATE_LIMIT.windowMs);
    
    // Yeni isteği ekle
    tracker.requests.push(now);
    
    // Rate limit kontrolü
    if (tracker.requests.length > RATE_LIMIT.maxRequests) {
        // IP'yi banla
        bannedIPs.set(ip, {
            until: now + RATE_LIMIT.banDuration,
            bannedAt: now,
            requestCount: tracker.requests.length
        });
        
        console.log(`🚫 IP BANLANDI: ${ip} (${tracker.requests.length} istek/saniye)`);
        
        return res.status(429).json({
            success: false,
            message: 'Çok fazla istek gönderdiniz. IP adresiniz 5 dakika engellenmiştir.',
            bannedUntil: new Date(now + RATE_LIMIT.banDuration).toISOString()
        });
    }
    
    next();
}

// Tüm endpoint'lere rate limiting uygula
app.use(rateLimiter);

// Session yönetimi (basit cookie tabanlı)
const activeSessions = new Map();

function generateSessionId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function isAuthenticated(req) {
    const sessionId = req.headers['x-session-id'] || req.query.session || req.cookies?.session;
    if (!sessionId) return false;
    
    const session = activeSessions.get(sessionId);
    if (!session) return false;
    
    // Session süresi dolmuş mu? (24 saat)
    if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
        activeSessions.delete(sessionId);
        return false;
    }
    
    return true;
}

/************ KONUM VERİLERİ ************/
let locationData = [];

/************ GİRİŞ SAYFASI ************/
app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="tr">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Giriş - Alzheimer ve Otizm Hastaları İçin Akıllı
                       Ayakkabı Takip Sistemi</title>
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
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .login-container {
                    background: white;
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    padding: 50px;
                    max-width: 450px;
                    width: 100%;
                    text-align: center;
                }
                .logo {
                    font-size: 4em;
                    margin-bottom: 20px;
                }
                h1 {
                    color: #333;
                    margin-bottom: 10px;
                    font-size: 2em;
                }
                .subtitle {
                    color: #666;
                    margin-bottom: 40px;
                    font-size: 1.1em;
                }
                .input-group {
                    margin-bottom: 25px;
                    text-align: left;
                }
                label {
                    display: block;
                    color: #555;
                    margin-bottom: 8px;
                    font-weight: 500;
                }
                input[type="password"] {
                    width: 100%;
                    padding: 15px;
                    border: 2px solid #e0e0e0;
                    border-radius: 10px;
                    font-size: 1.1em;
                    transition: all 0.3s ease;
                }
                input[type="password"]:focus {
                    outline: none;
                    border-color: #667eea;
                    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
                }
                .btn-login {
                    width: 100%;
                    padding: 15px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-size: 1.2em;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }
                .btn-login:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 25px rgba(102, 126, 234, 0.4);
                }
                .error-message {
                    background: #fee;
                    color: #c33;
                    padding: 12px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    display: none;
                }
                .info-box {
                    background: #f0f4ff;
                    padding: 15px;
                    border-radius: 10px;
                    margin-top: 25px;
                    color: #555;
                    font-size: 0.9em;
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <div class="logo">🔐</div>
                <h1>Alzheimer ve Otizm Hastaları İçin Akıllı
                        Ayakkabı Takip Sistemi</h1>
                <p class="subtitle">Güvenli Giriş</p>
                
                <div class="error-message" id="errorMsg"></div>
                
                <form id="loginForm">
                    <div class="input-group">
                        <label>Erişim Şifresi</label>
                        <input type="password" id="password" placeholder="Şifrenizi girin" required autofocus>
                    </div>
                    
                    <button type="submit" class="btn-login">🚀 Giriş Yap</button>
                </form>
                
                <div class="info-box">
                    🛡️ Bu sistem DDoS korumalıdır<br>
                    ⚡ Saniyede 100+ istek = 5 dakika ban
                </div>
            </div>
            
            <script>
                document.getElementById('loginForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const password = document.getElementById('password').value;
                    const errorMsg = document.getElementById('errorMsg');
                    
                    // Admin kontrolü - büyük/küçük harf duyarsız
                    if (password.toLowerCase() === 'admin') {
                        try {
                            const response = await fetch('/api/login', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ password: '251900' }) // İlk geçerli şifre ile session oluştur
                            });
                            
                            const result = await response.json();
                            
                            if (result.success) {
                                localStorage.setItem('sessionId', result.sessionId);
                                window.location.href = '/admin?session=' + result.sessionId;
                            }
                        } catch (error) {
                            errorMsg.textContent = '❌ Bağlantı hatası';
                            errorMsg.style.display = 'block';
                        }
                        return;
                    }
                    
                    try {
                        const response = await fetch('/api/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ password })
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            // Session ID'yi kaydet
                            localStorage.setItem('sessionId', result.sessionId);
                            // Ana sayfaya yönlendir
                            window.location.href = '/?session=' + result.sessionId;
                        } else {
                            errorMsg.textContent = '❌ ' + result.message;
                            errorMsg.style.display = 'block';
                            document.getElementById('password').value = '';
                        }
                    } catch (error) {
                        errorMsg.textContent = '❌ Bağlantı hatası';
                        errorMsg.style.display = 'block';
                    }
                });
            </script>
        </body>
        </html>
    `);
});

/************ API: LOGIN ************/
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    
    if (validPasswords.includes(password)) {
        const sessionId = generateSessionId();
        activeSessions.set(sessionId, {
            createdAt: Date.now(),
            password: password
        });
        
        console.log(`✅ Başarılı giriş: ${password}`);
        
        res.json({
            success: true,
            message: 'Giriş başarılı',
            sessionId: sessionId
        });
    } else {
        console.log(`❌ Başarısız giriş denemesi: ${password}`);
        res.status(401).json({
            success: false,
            message: 'Geçersiz şifre'
        });
    }
});

/************ API: LOGOUT ************/
app.post('/api/logout', (req, res) => {
    const sessionId = req.headers['x-session-id'] || req.body.sessionId;
    if (sessionId) {
        activeSessions.delete(sessionId);
    }
    res.json({ success: true, message: 'Çıkış yapıldı' });
});

/************ API: MANUEL IP BAN ************/
app.post('/api/admin/ban-ip', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ success: false, message: 'Yetkisiz erişim' });
    }
    
    const { ip, duration } = req.body;
    
    if (!ip || !ip.trim()) {
        return res.status(400).json({ success: false, message: 'IP adresi boş olamaz' });
    }
    
    const banDuration = duration || 300000; // Varsayılan 5 dakika
    const now = Date.now();
    
    bannedIPs.set(ip, {
        until: now + banDuration,
        bannedAt: now,
        requestCount: 0,
        manual: true
    });
    
    console.log(`🚫 IP MANUEL BANLANDI: ${ip} (${banDuration / 1000} saniye)`);
    
    res.json({ success: true, message: 'IP başarıyla banlandı' });
});

/************ API: IP BAN KALDIR ************/
app.post('/api/admin/unban-ip', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ success: false, message: 'Yetkisiz erişim' });
    }
    
    const { ip } = req.body;
    
    if (bannedIPs.has(ip)) {
        bannedIPs.delete(ip);
        console.log(`✅ IP BANI KALDIRILDI: ${ip}`);
        res.json({ success: true, message: 'IP banı kaldırıldı' });
    } else {
        res.status(404).json({ success: false, message: 'IP banı bulunamadı' });
    }
});

/************ ADMIN PANELİ ************/
app.get('/admin', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.redirect('/login');
    }
    
    const bannedIPsList = Array.from(bannedIPs.entries()).map(([ip, info]) => ({
        ip,
        until: new Date(info.until).toLocaleString('tr-TR'),
        remaining: Math.max(0, Math.ceil((info.until - Date.now()) / 1000)),
        manual: info.manual || false
    }));
    
    const visitorIPsList = Array.from(visitorIPs.entries()).map(([ip, info]) => ({
        ip,
        firstVisit: new Date(info.firstVisit).toLocaleString('tr-TR'),
        lastVisit: new Date(info.lastVisit).toLocaleString('tr-TR'),
        visitCount: info.visitCount,
        isBanned: bannedIPs.has(ip)
    }));
    
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
                    max-width: 1200px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    overflow: hidden;
                }
                .header {
                    background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
                    color: white;
                    padding: 20px 30px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 15px;
                }
                .header h1 {
                    font-size: 1.8em;
                    flex: 1;
                    min-width: 200px;
                }
                .logout-btn {
                    background: rgba(255,255,255,0.2);
                    color: white;
                    border: 2px solid white;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    transition: all 0.3s ease;
                    white-space: nowrap;
                }
                .logout-btn:hover {
                    background: white;
                    color: #dc3545;
                }
                .content {
                    padding: 40px;
                }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    margin-bottom: 40px;
                }
                .stat-card {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 25px;
                    border-radius: 15px;
                    text-align: center;
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
                .section {
                    background: #f8f9fa;
                    padding: 25px;
                    border-radius: 15px;
                    margin-bottom: 25px;
                }
                .section h3 {
                    color: #333;
                    margin-bottom: 20px;
                    font-size: 1.5em;
                }
                .password-list {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                    margin-bottom: 20px;
                }
                .password-item {
                    background: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    border: 2px solid #e0e0e0;
                }
                .password-text {
                    font-weight: bold;
                    color: #333;
                }
                .btn-remove {
                    background: #dc3545;
                    color: white;
                    border: none;
                    padding: 5px 12px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 0.9em;
                }
                .btn-remove:hover {
                    background: #c82333;
                }
                .input-group {
                    display: flex;
                    gap: 10px;
                    margin-top: 15px;
                    flex-wrap: wrap;
                }
                .input-group input {
                    flex: 1;
                    min-width: 200px;
                    padding: 12px;
                    border: 2px solid #e0e0e0;
                    border-radius: 8px;
                    font-size: 1em;
                }
                .btn-add {
                    background: #28a745;
                    color: white;
                    border: none;
                    padding: 12px 25px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                }
                .btn-add:hover {
                    background: #218838;
                }
                .btn-primary {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 12px 25px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    margin: 5px;
                }
                .btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                }
                .btn-danger {
                    background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
                    color: white;
                    border: none;
                    padding: 12px 25px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    margin: 5px;
                }
                .btn-danger:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(220, 53, 69, 0.4);
                }
                .banned-ip-item {
                    background: white;
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 10px;
                    border-left: 4px solid #dc3545;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    background: white;
                    border-radius: 8px;
                    overflow: hidden;
                }
                th, td {
                    padding: 12px;
                    text-align: left;
                    border-bottom: 1px solid #e0e0e0;
                }
                th {
                    background: #f8f9fa;
                    font-weight: bold;
                    color: #333;
                }
                .btn-unban {
                    background: #28a745;
                    color: white;
                    border: none;
                    padding: 6px 15px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 0.9em;
                }
                .btn-unban:hover {
                    background: #218838;
                }
                .btn-ban {
                    background: #dc3545;
                    color: white;
                    border: none;
                    padding: 6px 15px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 0.9em;
                }
                .btn-ban:hover {
                    background: #c82333;
                }
                
                /* Modal stilleri */
                .modal {
                    display: none;
                    position: fixed;
                    z-index: 1000;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0,0,0,0.5);
                    animation: fadeIn 0.3s;
                }
                .modal-content {
                    background-color: white;
                    margin: 15% auto;
                    padding: 30px;
                    border-radius: 15px;
                    width: 90%;
                    max-width: 400px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                    animation: slideIn 0.3s;
                }
                .modal-header {
                    font-size: 1.5em;
                    font-weight: bold;
                    margin-bottom: 15px;
                    color: #333;
                }
                .modal-body {
                    margin-bottom: 25px;
                    color: #666;
                    font-size: 1.1em;
                }
                .modal-buttons {
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                }
                .modal-btn {
                    padding: 10px 25px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 1em;
                    transition: all 0.3s ease;
                }
                .modal-btn-cancel {
                    background: #6c757d;
                    color: white;
                }
                .modal-btn-cancel:hover {
                    background: #5a6268;
                }
                .modal-btn-confirm {
                    background: #dc3545;
                    color: white;
                }
                .modal-btn-confirm:hover {
                    background: #c82333;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideIn {
                    from { transform: translateY(-50px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                
                @media (max-width: 768px) {
                    .header h1 {
                        font-size: 1.3em;
                    }
                    .content {
                        padding: 20px;
                    }
                    table {
                        font-size: 0.9em;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔧 Admin Paneli - Akıllı Ayakkabı Takip Sistemi</h1>
                    <button class="logout-btn" onclick="logout()">🚪 Çıkış Yap</button>
                </div>
                
                <div class="content">
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-value">${locationData.length}</div>
                            <div class="stat-label">Toplam Konum</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${validPasswords.length}</div>
                            <div class="stat-label">Aktif Şifre</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${bannedIPs.size}</div>
                            <div class="stat-label">Banlı IP</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${visitorIPs.size}</div>
                            <div class="stat-label">Ziyaretçi IP</div>
                        </div>
                    </div>
                    
                    <div class="section">
                        <h3>🌐 IP İzleme ve Yönetim</h3>
                        ${visitorIPsList.length > 0 ? `
                            <table>
                                <tr>
                                    <th>IP Adresi</th>
                                    <th>İlk Ziyaret</th>
                                    <th>Son Ziyaret</th>
                                    <th>Ziyaret Sayısı</th>
                                    <th>İşlem</th>
                                </tr>
                                ${visitorIPsList.map(visitor => `
                                    <tr style="${visitor.isBanned ? 'background: #ffe0e0;' : ''}">
                                        <td>${visitor.ip} ${visitor.isBanned ? '🚫' : ''}</td>
                                        <td>${visitor.firstVisit}</td>
                                        <td>${visitor.lastVisit}</td>
                                        <td>${visitor.visitCount}</td>
                                        <td>
                                            ${visitor.isBanned ? 
                                                `<button class="btn-unban" onclick="unbanIP('${visitor.ip}')">✅ Banı Kaldır</button>` :
                                                `<button class="btn-ban" onclick="banIP('${visitor.ip}')">🚫 Banla</button>`
                                            }
                                        </td>
                                    </tr>
                                `).join('')}
                            </table>
                        ` : '<p>🎉 Henüz ziyaretçi yok</p>'}
                    </div>
                    
                    <div class="section">
                        <h3>🚫 Banlı IP Adresleri</h3>
                        ${bannedIPsList.length > 0 ? `
                            <table>
                                <tr>
                                    <th>IP Adresi</th>
                                    <th>Ban Bitiş</th>
                                    <th>Kalan Süre</th>
                                    <th>Tip</th>
                                    <th>İşlem</th>
                                </tr>
                                ${bannedIPsList.map(ban => `
                                    <tr>
                                        <td>${ban.ip}</td>
                                        <td>${ban.until}</td>
                                        <td>${ban.remaining} saniye</td>
                                        <td>${ban.manual ? '🔨 Manuel' : '🤖 Otomatik'}</td>
                                        <td>
                                            <button class="btn-unban" onclick="unbanIP('${ban.ip}')">✅ Kaldır</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </table>
                        ` : '<p>🎉 Banlı IP adresi yok</p>'}
                    </div>
                    
                    <div class="section">
                        <h3>🔑 Şifre Yönetimi</h3>
                        <div class="password-list" id="passwordList">
                            ${validPasswords.map(pwd => `
                                <div class="password-item">
                                    <span class="password-text">🔐 ${pwd}</span>
                                    <button class="btn-remove" onclick="removePassword('${pwd}')">❌</button>
                                </div>
                            `).join('')}
                        </div>
                        <div class="input-group">
                            <input type="text" id="newPassword" placeholder="Yeni şifre ekle...">
                            <button class="btn-add" onclick="addPassword()">➕ Ekle</button>
                        </div>
                    </div>
                    
                    <div class="section">
                        <h3>📋 Hızlı Erişim</h3>
                        <button class="btn-primary" onclick="window.location.href='/?session=${req.query.session}'">🗺️ Harita Görünümü</button>
                        <button class="btn-primary" onclick="window.location.href='/all-locations?session=${req.query.session}'">📊 Tüm Veriler</button>
                        <button class="btn-danger" onclick="clearAllLocations()">🗑️ Tüm Konumları Temizle</button>
                    </div>
                </div>
            </div>
            
            <!-- Onay Modalı -->
            <div id="confirmModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header" id="modalTitle">Onay</div>
                    <div class="modal-body" id="modalMessage">İşlemi onaylıyor musunuz?</div>
                    <div class="modal-buttons">
                        <button class="modal-btn modal-btn-cancel" onclick="closeModal()">İptal</button>
                        <button class="modal-btn modal-btn-confirm" id="modalConfirmBtn">Onayla</button>
                    </div>
                </div>
            </div>
            
            <script>
                const sessionId = '${req.query.session}';
                
                // Modal fonksiyonları
                function showModal(title, message, onConfirm) {
                    document.getElementById('modalTitle').textContent = title;
                    document.getElementById('modalMessage').textContent = message;
                    document.getElementById('confirmModal').style.display = 'block';
                    
                    document.getElementById('modalConfirmBtn').onclick = function() {
                        closeModal();
                        onConfirm();
                    };
                }
                
                function closeModal() {
                    document.getElementById('confirmModal').style.display = 'none';
                }
                
                // Modal dışına tıklayınca kapat
                window.onclick = function(event) {
                    const modal = document.getElementById('confirmModal');
                    if (event.target == modal) {
                        closeModal();
                    }
                }
                
                async function banIP(ip) {
                    const response = await fetch('/api/admin/ban-ip', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Session-Id': sessionId
                        },
                        body: JSON.stringify({ ip, duration: 300000 })
                    });
                    
                    const result = await response.json();
                    if (result.success) {
                        location.reload();
                    }
                }
                
                async function unbanIP(ip) {
                    const response = await fetch('/api/admin/unban-ip', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Session-Id': sessionId
                        },
                        body: JSON.stringify({ ip })
                    });
                    
                    const result = await response.json();
                    if (result.success) {
                        location.reload();
                    }
                }
                
                async function clearAllLocations() {
                    showModal(
                        '⚠️ Dikkat!',
                        'Tüm konum verilerini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz!',
                        async function() {
                            const response = await fetch('/clear?session=' + sessionId, {
                                method: 'DELETE'
                            });
                            
                            const result = await response.json();
                            if (result.success) {
                                location.reload();
                            }
                        }
                    );
                }
                
                async function addPassword() {
                    const password = document.getElementById('newPassword').value.trim();
                    if (!password) {
                        alert('❌ Şifre boş olamaz');
                        return;
                    }
                    
                    const response = await fetch('/api/admin/add-password', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Session-Id': sessionId
                        },
                        body: JSON.stringify({ password })
                    });
                    
                    const result = await response.json();
                    if (result.success) {
                        location.reload();
                    } else {
                        alert('❌ ' + result.message);
                    }
                }
                
                async function removePassword(password) {
                    showModal(
                        '🔑 Şifre Sil',
                        'Bu şifreyi silmek istediğinizden emin misiniz?',
                        async function() {
                            const response = await fetch('/api/admin/remove-password', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-Session-Id': sessionId
                                },
                                body: JSON.stringify({ password })
                            });
                            
                            const result = await response.json();
                            if (result.success) {
                                location.reload();
                            } else {
                                alert('❌ ' + result.message);
                            }
                        }
                    );
                }
                
                async function logout() {
                    await fetch('/api/logout', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Session-Id': sessionId
                        }
                    });
                    window.location.href = '/login';
                }
            </script>
        </body>
        </html>
    `);
});

/************ API: ŞİFRE EKLE ************/
app.post('/api/admin/add-password', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ success: false, message: 'Yetkisiz erişim' });
    }
    
    const { password } = req.body;
    
    if (!password || password.trim() === '') {
        return res.status(400).json({ success: false, message: 'Şifre boş olamaz' });
    }
    
    if (validPasswords.includes(password)) {
        return res.status(400).json({ success: false, message: 'Bu şifre zaten mevcut' });
    }
    
    validPasswords.push(password);
    console.log(`➕ Yeni şifre eklendi: ${password}`);
    
    res.json({ success: true, message: 'Şifre başarıyla eklendi' });
});

/************ API: ŞİFRE SİL ************/
app.post('/api/admin/remove-password', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ success: false, message: 'Yetkisiz erişim' });
    }
    
    const { password } = req.body;
    
    if (validPasswords.length <= 1) {
        return res.status(400).json({ success: false, message: 'En az bir şifre olmalı' });
    }
    
    const index = validPasswords.indexOf(password);
    if (index === -1) {
        return res.status(400).json({ success: false, message: 'Şifre bulunamadı' });
    }
    
    validPasswords.splice(index, 1);
    console.log(`➖ Şifre silindi: ${password}`);
    
    res.json({ success: true, message: 'Şifre başarıyla silindi' });
});

/************ ANA SAYFA ************/
app.get('/', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.redirect('/login');
    }
    
    const lastLocation = locationData.length > 0 ? locationData[locationData.length - 1] : null;
    
    res.send(`
        <!DOCTYPE html>
        <html lang="tr">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Alzheimer ve Otizm Hastaları İçin Akıllı
                      Ayakkabı Takip Sistemi</title>
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
                    padding: 20px 30px;
                    text-align: center;
                    position: relative;
                }
                .header h1 {
                    font-size: 2em;
                    margin-bottom: 10px;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
                    padding-right: 120px;
                }
                .header p {
                    font-size: 1.1em;
                    opacity: 0.9;
                }
                .logout-btn-header {
                    position: absolute;
                    top: 20px;
                    right: 20px;
                    background: rgba(255,255,255,0.2);
                    color: white;
                    border: 2px solid white;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    transition: all 0.3s ease;
                }
                .logout-btn-header:hover {
                    background: white;
                    color: #667eea;
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
                    z-index: 1000;
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
                
                @media (max-width: 768px) {
                    .header h1 {
                        font-size: 1.3em;
                        padding-right: 100px;
                    }
                    .logout-btn-header {
                        padding: 8px 15px;
                        font-size: 0.9em;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <button class="logout-btn-header" onclick="logout()">🚪 Çıkış</button>
                    <h1>Alzheimer ve Otizm Hastaları İçin Akıllı
                        Ayakkabı Takip Sistemi</h1>
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
                    <div class="stat-card" style="background: ${lastLocation && lastLocation.wearing ? 'linear-gradient(135deg, #28a745 0%, #218838 100%)' : 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)'}; color: white;">
                        <div class="stat-value" style="color: white;">${lastLocation ? (lastLocation.wearing ? '✅' : '❌') : '-'}</div>
                        <div class="stat-label" style="color: white;">Giyilme Durumu</div>
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
                                <div class="location-time">
                                    🕐 ${loc.timestamp} | 
                                    <span style="color: ${loc.wearing ? '#28a745' : '#dc3545'}; font-weight: bold;">
                                        ${loc.wearing ? '✅ Giyildi' : '❌ Giyilmedi'}
                                    </span>
                                </div>
                            </div>
                        `).join('') 
                        : '<div class="no-data">Henüz konum verisi alınmadı. Deneyap Kart\'ı başlatın...</div>'
                    }
                </div>
            </div>
            
            <button class="refresh-btn" onclick="location.reload()">🔄 Yenile</button>
            
            <script>
                const sessionId = '${req.query.session}';
                
                const map = L.map('map').setView([${lastLocation ? lastLocation.lat : 39.9334}, ${lastLocation ? lastLocation.lng : 32.8597}], ${lastLocation ? 13 : 6});
                
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: 19
                }).addTo(map);
                
                let locations = ${JSON.stringify(locationData)};
                let markers = [];
                
                function drawMarkers() {
                    markers.forEach(marker => map.removeLayer(marker));
                    markers = [];
                    
                    if (locations.length > 0) {
                        locations.forEach((loc, index) => {
                            const marker = L.marker([loc.lat, loc.lng]).addTo(map);
                            markers.push(marker);
                            
                            const wearingColor = loc.wearing ? '#28a745' : '#dc3545';
                            const wearingText = loc.wearing ? '✅ Giyildi' : '❌ Giyilmedi';
                            
                            marker.bindPopup(\`
                                <div style="min-width: 220px;">
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
                                    <div style="margin: 5px 0;">
                                        <strong>👕 Durum:</strong> 
                                        <span style="color: \${wearingColor}; font-weight: bold;">
                                            \${wearingText}
                                        </span>
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
                                        "
                                    >
                                        ❌ Bu Konumu Sil
                                    </button>
                                </div>
                            \`);
                            
                            if (index === locations.length - 1) {
                                marker.openPopup();
                            }
                        });
                        
                        if (locations.length > 1) {
                            const bounds = L.latLngBounds(locations.map(loc => [loc.lat, loc.lng]));
                            map.fitBounds(bounds, { padding: [50, 50] });
                        }
                    }
                }
                
                drawMarkers();
                
                async function deleteLocation(index) {
                    const response = await fetch('/delete-location/' + index + '?session=' + sessionId, {
                        method: 'DELETE'
                    });
                    const result = await response.json();
                    
                    if (result.success) {
                        locations.splice(index, 1);
                        drawMarkers();
                        setTimeout(() => location.reload(), 500);
                    }
                }
                
                async function logout() {
                    await fetch('/api/logout', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Session-Id': sessionId
                        }
                    });
                    window.location.href = '/login';
                }
                
                setTimeout(() => location.reload(), 30000);
            </script>
        </body>
        </html>
    `);
});

/************ KONUM ALMA (GET) ************/
app.get('/location', (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const wearing = req.query.wearing === 'true';
    
    if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({
            success: false,
            message: 'Geçersiz enlem veya boylam değeri'
        });
    }
    
    const locationEntry = {
        lat: lat,
        lng: lng,
        wearing: wearing,
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
    
    console.log(`📍 Konum alındı: ${lat}, ${lng} | Giyildi: ${wearing ? 'Evet' : 'Hayır'} - Toplam: ${locationData.length}`);
    
    res.json({
        success: true,
        message: 'Konum başarıyla kaydedildi',
        location: locationEntry,
        totalLocations: locationData.length
    });
});

/************ TÜM KONUMLAR ************/
app.get('/all-locations', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ success: false, message: 'Yetkisiz erişim' });
    }
    
    res.json({
        success: true,
        totalLocations: locationData.length,
        locations: locationData
    });
});

/************ TEK KONUM SİL ************/
app.delete('/delete-location/:index', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ success: false, message: 'Yetkisiz erişim' });
    }
    
    const index = parseInt(req.params.index);
    
    if (isNaN(index) || index < 0 || index >= locationData.length) {
        return res.status(400).json({
            success: false,
            message: 'Geçersiz konum indeksi'
        });
    }
    
    const deletedLocation = locationData.splice(index, 1)[0];
    
    console.log(`🗑️ Konum silindi: ${deletedLocation.lat}, ${deletedLocation.lng}`);
    
    res.json({
        success: true,
        message: 'Konum başarıyla silindi',
        deletedLocation: deletedLocation,
        remainingLocations: locationData.length
    });
});

/************ TÜM KONUMLARI TEMİZLE ************/
app.delete('/clear', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ success: false, message: 'Yetkisiz erişim' });
    }
    
    const count = locationData.length;
    locationData = [];
    
    console.log(`🗑️ Tüm konumlar temizlendi: ${count} konum silindi`);
    
    res.json({
        success: true,
        message: `${count} konum verisi silindi`
    });
});

/************ HEALTH CHECK ************/
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        bannedIPs: bannedIPs.size,
        activeSessions: activeSessions.size
    });
});

/************ 404 HANDLER ************/
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint bulunamadı'
    });
});

/************ SERVER BAŞLAT ************/
app.listen(PORT, '0.0.0.0', () => {
    console.log('╔════════════════════════════════════════╗');
    console.log('║  Akıllı Ayakkabı Takip Sistemi          ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║  📡 Server: http://0.0.0.0:${PORT.toString().padEnd(19)}║`);
    console.log('║  🔐 Giriş: /login                     ║');
    console.log('║  🛡️  DDoS Koruması: Aktif             ║');
    console.log('║  ⚡ Rate Limit: 100 istek/saniye      ║');
    console.log('║  ⏰ Ban Süresi: 5 dakika              ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');
    console.log('🔑 Varsayılan Şifreler:');
    validPasswords.forEach(pwd => console.log(`   - ${pwd}`));
    console.log('');
    console.log('💡 Admin Panel Erişimi: Login\'de "Admin" yazın');
    console.log('');
});
