const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

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

/************ IP KAYIT SİSTEMİ ************/
const ipVisitors = new Map(); // IP => { firstSeen, lastSeen, visits, userAgent, banned }

// Her isteği kaydet
app.use((req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
                req.connection.remoteAddress || 
                req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const now = Date.now();
    
    if (ipVisitors.has(ip)) {
        const visitor = ipVisitors.get(ip);
        visitor.lastSeen = now;
        visitor.visits++;
    } else {
        ipVisitors.set(ip, {
            firstSeen: now,
            lastSeen: now,
            visits: 1,
            userAgent: userAgent,
            banned: false
        });
        console.log(`🆕 Yeni ziyaretçi: ${ip}`);
    }
    
    next();
});

/************ GÜVENLİK SİSTEMİ ************/
let validPasswords = ['251900', '3850', 'TÜBİTAK'];

// DDoS koruması - IP bazlı rate limiting
const ipRequestTracker = new Map();
const bannedIPs = new Map();

const RATE_LIMIT = {
    maxRequests: 100,
    windowMs: 1000,
    banDuration: 300000
};

function rateLimiter(req, res, next) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
                req.connection.remoteAddress || 
                req.socket.remoteAddress;
    const now = Date.now();
    
    // Manuel ban kontrolü
    if (ipVisitors.has(ip) && ipVisitors.get(ip).banned) {
        return res.status(403).json({
            success: false,
            message: 'IP adresiniz kalıcı olarak engellenmiştir',
            reason: 'Manuel Ban'
        });
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
            bannedIPs.delete(ip);
            ipRequestTracker.delete(ip);
        }
    }
    
    if (!ipRequestTracker.has(ip)) {
        ipRequestTracker.set(ip, {
            requests: [],
            warnings: 0
        });
    }
    
    const tracker = ipRequestTracker.get(ip);
    tracker.requests = tracker.requests.filter(time => now - time < RATE_LIMIT.windowMs);
    tracker.requests.push(now);
    
    if (tracker.requests.length > RATE_LIMIT.maxRequests) {
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

app.use(rateLimiter);

// Session yönetimi
const activeSessions = new Map();

function generateSessionId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function isAuthenticated(req) {
    const sessionId = req.headers['x-session-id'] || req.query.session || req.cookies?.session;
    if (!sessionId) return false;
    
    const session = activeSessions.get(sessionId);
    if (!session) return false;
    
    if (Date.now() - session.createdAt > 24 * 60 * 60 * 1000) {
        activeSessions.delete(sessionId);
        return false;
    }
    
    return true;
}

/************ KONUM VERİLERİ ************/
let locationData = [];

/************ SOCKET.IO BAĞLANTILARI ************/
io.on('connection', (socket) => {
    console.log('🔌 Yeni client bağlandı:', socket.id);
    
    // İlk bağlantıda tüm konumları gönder
    socket.emit('initialLocations', locationData);
    
    socket.on('disconnect', () => {
        console.log('🔌 Client bağlantısı kesildi:', socket.id);
    });
});

/************ GİRİŞ SAYFASI ************/
app.get('/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="tr">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Giriş - Akıllı Ayakkabı Takip Sistemi</title>
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
                    position: relative;
                    overflow: hidden;
                }
                body::before {
                    content: '';
                    position: absolute;
                    width: 200%;
                    height: 200%;
                    background: radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px);
                    background-size: 50px 50px;
                    animation: moveBackground 20s linear infinite;
                }
                @keyframes moveBackground {
                    0% { transform: translate(0, 0); }
                    100% { transform: translate(50px, 50px); }
                }
                .login-container {
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(10px);
                    border-radius: 25px;
                    box-shadow: 0 25px 70px rgba(0,0,0,0.3);
                    padding: 50px;
                    max-width: 450px;
                    width: 100%;
                    text-align: center;
                    position: relative;
                    z-index: 1;
                    animation: slideUp 0.6s ease-out;
                }
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .logo {
                    font-size: 4em;
                    margin-bottom: 20px;
                    animation: bounce 2s ease-in-out infinite;
                }
                @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
                h1 {
                    color: #333;
                    margin-bottom: 10px;
                    font-size: 2em;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
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
                    background: white;
                }
                input[type="password"]:focus {
                    outline: none;
                    border-color: #667eea;
                    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
                    transform: translateY(-2px);
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
                    position: relative;
                    overflow: hidden;
                }
                .btn-login::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: -100%;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
                    transition: left 0.5s;
                }
                .btn-login:hover::before {
                    left: 100%;
                }
                .btn-login:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 12px 30px rgba(102, 126, 234, 0.5);
                }
                .error-message {
                    background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
                    color: white;
                    padding: 12px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    display: none;
                    animation: shake 0.5s;
                }
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-10px); }
                    75% { transform: translateX(10px); }
                }
                .info-box {
                    background: linear-gradient(135deg, #e0e7ff 0%, #f0f4ff 100%);
                    padding: 15px;
                    border-radius: 10px;
                    margin-top: 25px;
                    color: #555;
                    font-size: 0.9em;
                    border-left: 4px solid #667eea;
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <div class="logo">🔐</div>
                <h1>Alzheimer ve Otizm Hastaları İçin Akıllı Ayakkabı Takip Sistemi</h1>
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
                    ⚡ Saniyede 100+ istek = 5 dakika ban<br>
                    🔒 Güvenli oturum yönetimi
                </div>
            </div>
            
            <script>
                document.getElementById('loginForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const password = document.getElementById('password').value;
                    const errorMsg = document.getElementById('errorMsg');
                    
                    if (password.toLowerCase() === 'admin') {
                        try {
                            const response = await fetch('/api/login', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ password: '251900' })
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
                            localStorage.setItem('sessionId', result.sessionId);
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

/************ API: IP İSTATİSTİKLERİ ************/
app.get('/api/admin/ip-stats', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ success: false, message: 'Yetkisiz erişim' });
    }
    
    const ipList = Array.from(ipVisitors.entries()).map(([ip, data]) => ({
        ip,
        firstSeen: new Date(data.firstSeen).toLocaleString('tr-TR'),
        lastSeen: new Date(data.lastSeen).toLocaleString('tr-TR'),
        visits: data.visits,
        userAgent: data.userAgent,
        banned: data.banned
    })).sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
    
    res.json({
        success: true,
        totalIPs: ipList.length,
        ips: ipList
    });
});

/************ API: MANUEL IP BAN ************/
app.post('/api/admin/ban-ip', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ success: false, message: 'Yetkisiz erişim' });
    }
    
    const { ip } = req.body;
    
    if (!ip) {
        return res.status(400).json({ success: false, message: 'IP adresi gerekli' });
    }
    
    if (ipVisitors.has(ip)) {
        ipVisitors.get(ip).banned = true;
        console.log(`🚫 IP manuel olarak banlandı: ${ip}`);
        res.json({ success: true, message: 'IP başarıyla banlandı' });
    } else {
        // IP sistemde yoksa ekle ve banla
        ipVisitors.set(ip, {
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            visits: 0,
            userAgent: 'Manuel Ban',
            banned: true
        });
        console.log(`🚫 IP manuel olarak banlandı (yeni): ${ip}`);
        res.json({ success: true, message: 'IP başarıyla banlandı' });
    }
});

/************ API: IP BAN KALDIR ************/
app.post('/api/admin/unban-ip', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ success: false, message: 'Yetkisiz erişim' });
    }
    
    const { ip } = req.body;
    
    if (!ip) {
        return res.status(400).json({ success: false, message: 'IP adresi gerekli' });
    }
    
    if (ipVisitors.has(ip)) {
        ipVisitors.get(ip).banned = false;
        console.log(`✅ IP ban kaldırıldı: ${ip}`);
        res.json({ success: true, message: 'IP ban kaldırıldı' });
    } else {
        res.status(404).json({ success: false, message: 'IP bulunamadı' });
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
        remaining: Math.max(0, Math.ceil((info.until - Date.now()) / 1000))
    }));
    
    res.send(`
        <!DOCTYPE html>
        <html lang="tr">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin Paneli - Akıllı Ayakkabı Sistemi</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #7e22ce 100%);
                    min-height: 100vh;
                    padding: 20px;
                }
                .container {
                    max-width: 1400px;
                    margin: 0 auto;
                    background: rgba(255, 255, 255, 0.98);
                    border-radius: 25px;
                    box-shadow: 0 25px 80px rgba(0,0,0,0.4);
                    overflow: hidden;
                    animation: fadeIn 0.6s ease-out;
                }
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .header {
                    background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
                    color: white;
                    padding: 35px 40px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    box-shadow: 0 4px 15px rgba(220, 53, 69, 0.3);
                }
                .header h1 {
                    font-size: 2.2em;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
                }
                .logout-btn {
                    background: rgba(255,255,255,0.2);
                    color: white;
                    border: 2px solid white;
                    padding: 12px 25px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 1em;
                    transition: all 0.3s ease;
                }
                .logout-btn:hover {
                    background: white;
                    color: #dc3545;
                    transform: translateY(-2px);
                }
                .content {
                    padding: 40px;
                }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 20px;
                    margin-bottom: 40px;
                }
                .stat-card {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 30px;
                    border-radius: 18px;
                    text-align: center;
                    box-shadow: 0 8px 20px rgba(0,0,0,0.15);
                    transition: all 0.3s ease;
                }
                .stat-card:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 12px 30px rgba(0,0,0,0.25);
                }
                .stat-value {
                    font-size: 3em;
                    font-weight: bold;
                    margin-bottom: 8px;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
                }
                .stat-label {
                    font-size: 1.1em;
                    opacity: 0.95;
                }
                .section {
                    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                    padding: 30px;
                    border-radius: 18px;
                    margin-bottom: 25px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.08);
                }
                .section h3 {
                    color: #333;
                    margin-bottom: 25px;
                    font-size: 1.6em;
                    padding-bottom: 15px;
                    border-bottom: 3px solid #667eea;
                }
                .password-list {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                    margin-bottom: 20px;
                }
                .password-item {
                    background: white;
                    padding: 14px 22px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    border: 2px solid #e0e0e0;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                    transition: all 0.3s ease;
                }
                .password-item:hover {
                    border-color: #667eea;
                    transform: translateY(-2px);
                }
                .password-text {
                    font-weight: bold;
                    color: #333;
                    font-size: 1.05em;
                }
                .btn-remove {
                    background: #dc3545;
                    color: white;
                    border: none;
                    padding: 6px 14px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.9em;
                    transition: all 0.3s ease;
                }
                .btn-remove:hover {
                    background: #c82333;
                    transform: scale(1.05);
                }
                .input-group {
                    display: flex;
                    gap: 12px;
                    margin-top: 15px;
                }
                .input-group input {
                    flex: 1;
                    padding: 14px;
                    border: 2px solid #e0e0e0;
                    border-radius: 10px;
                    font-size: 1em;
                    transition: all 0.3s ease;
                }
                .input-group input:focus {
                    outline: none;
                    border-color: #667eea;
                    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
                }
                .btn-add {
                    background: #28a745;
                    color: white;
                    border: none;
                    padding: 14px 28px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 1em;
                    transition: all 0.3s ease;
                }
                .btn-add:hover {
                    background: #218838;
                    transform: translateY(-2px);
                }
                .btn-primary {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 14px 28px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: bold;
                    margin: 5px;
                    font-size: 1em;
                    transition: all 0.3s ease;
                }
                .btn-primary:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 6px 18px rgba(102, 126, 234, 0.4);
                }
                .btn-danger {
                    background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
                    color: white;
                    border: none;
                    padding: 14px 28px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: bold;
                    margin: 5px;
                    font-size: 1em;
                    transition: all 0.3s ease;
                }
                .btn-danger:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 6px 18px rgba(220, 53, 69, 0.4);
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    background: white;
                    border-radius: 10px;
                    overflow: hidden;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                }
                th, td {
                    padding: 15px;
                    text-align: left;
                    border-bottom: 1px solid #e0e0e0;
                }
                th {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    font-weight: bold;
                    color: white;
                }
                tr:hover {
                    background: #f8f9fa;
                }
                .ip-item {
                    background: white;
                    padding: 18px;
                    border-radius: 10px;
                    margin-bottom: 12px;
                    border-left: 4px solid #667eea;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    transition: all 0.3s ease;
                }
                .ip-item:hover {
                    transform: translateX(5px);
                    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                }
                .ip-item.banned {
                    border-left-color: #dc3545;
                    background: #fff5f5;
                }
                .ip-info {
                    flex: 1;
                }
                .ip-address {
                    font-weight: bold;
                    font-size: 1.1em;
                    color: #333;
                    margin-bottom: 5px;
                }
                .ip-details {
                    color: #666;
                    font-size: 0.9em;
                }
                .ip-actions {
                    display: flex;
                    gap: 8px;
                }
                .btn-ban {
                    background: #dc3545;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.9em;
                    transition: all 0.3s ease;
                }
                .btn-ban:hover {
                    background: #c82333;
                    transform: scale(1.05);
                }
                .btn-unban {
                    background: #28a745;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.9em;
                    transition: all 0.3s ease;
                }
                .btn-unban:hover {
                    background: #218838;
                    transform: scale(1.05);
                }
                .ban-badge {
                    background: #dc3545;
                    color: white;
                    padding: 4px 10px;
                    border-radius: 12px;
                    font-size: 0.85em;
                    font-weight: bold;
                    margin-left: 10px;
                }
                .ip-list {
                    max-height: 500px;
                    overflow-y: auto;
                }
                .ip-list::-webkit-scrollbar {
                    width: 8px;
                }
                .ip-list::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 10px;
                }
                .ip-list::-webkit-scrollbar-thumb {
                    background: #667eea;
                    border-radius: 10px;
                }
                .modal {
                    display: none;
                    position: fixed;
                    z-index: 1000;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0,0,0,0.6);
                    animation: fadeIn 0.3s;
                }
                .modal-content {
                    background-color: white;
                    margin: 10% auto;
                    padding: 35px;
                    border-radius: 18px;
                    width: 90%;
                    max-width: 450px;
                    box-shadow: 0 15px 50px rgba(0,0,0,0.4);
                    animation: slideIn 0.3s;
                }
                .modal-header {
                    font-size: 1.6em;
                    font-weight: bold;
                    margin-bottom: 18px;
                    color: #333;
                }
                .modal-body {
                    margin-bottom: 28px;
                    color: #666;
                    font-size: 1.1em;
                    line-height: 1.6;
                }
                .modal-buttons {
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                }
                .modal-btn {
                    padding: 12px 28px;
                    border: none;
                    border-radius: 10px;
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
                    transform: translateY(-2px);
                }
                .modal-btn-confirm {
                    background: #dc3545;
                    color: white;
                }
                .modal-btn-confirm:hover {
                    background: #c82333;
                    transform: translateY(-2px);
                }
                @keyframes slideIn {
                    from { transform: translateY(-50px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .loading {
                    text-align: center;
                    padding: 20px;
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔧 Admin Paneli</h1>
                    <button class="logout-btn" onclick="logout()">🚪 Çıkış Yap</button>
                </div>
                
                <div class="content">
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-value">${locationData.length}</div>
                            <div class="stat-label">📍 Toplam Konum</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${validPasswords.length}</div>
                            <div class="stat-label">🔑 Aktif Şifre</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${bannedIPs.size}</div>
                            <div class="stat-label">🚫 Banlı IP (Geçici)</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${activeSessions.size}</div>
                            <div class="stat-label">👤 Aktif Oturum</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value" id="totalIPsCount">${ipVisitors.size}</div>
                            <div class="stat-label">🌐 Toplam Ziyaretçi</div>
                        </div>
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
                        <h3>🌐 IP Adresi İzleme ve Yönetimi</h3>
                        <div class="input-group" style="margin-bottom: 20px;">
                            <input type="text" id="manualBanIP" placeholder="Manuel ban için IP adresi girin (örn: 192.168.1.1)">
                            <button class="btn-danger" onclick="manualBanIP()">🚫 Manuel Ban</button>
                        </div>
                        <div class="loading" id="ipLoading">Yükleniyor...</div>
                        <div class="ip-list" id="ipList" style="display: none;"></div>
                    </div>
                    
                    <div class="section">
                        <h3>⚡ Geçici Banlı IP Adresleri (Rate Limit)</h3>
                        ${bannedIPsList.length > 0 ? `
                            <table>
                                <tr>
                                    <th>IP Adresi</th>
                                    <th>Ban Bitiş</th>
                                    <th>Kalan Süre</th>
                                </tr>
                                ${bannedIPsList.map(ban => `
                                    <tr>
                                        <td>${ban.ip}</td>
                                        <td>${ban.until}</td>
                                        <td>${ban.remaining} saniye</td>
                                    </tr>
                                `).join('')}
                            </table>
                        ` : '<p style="text-align: center; color: #666;">🎉 Geçici banlı IP adresi yok</p>'}
                    </div>
                    
                    <div class="section">
                        <h3>📋 Hızlı Erişim</h3>
                        <button class="btn-primary" onclick="window.location.href='/?session=${req.query.session}'">🗺️ Harita Görünümü</button>
                        <button class="btn-primary" onclick="window.location.href='/all-locations?session=${req.query.session}'">📊 Tüm Veriler</button>
                        <button class="btn-danger" onclick="clearAllLocations()">🗑️ Tüm Konumları Temizle</button>
                    </div>
                </div>
            </div>
            
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
                
                // IP listesini yükle
                async function loadIPList() {
                    try {
                        const response = await fetch('/api/admin/ip-stats?session=' + sessionId);
                        const result = await response.json();
                        
                        if (result.success) {
                            document.getElementById('ipLoading').style.display = 'none';
                            document.getElementById('ipList').style.display = 'block';
                            document.getElementById('totalIPsCount').textContent = result.totalIPs;
                            
                            const ipListHTML = result.ips.map(ip => \`
                                <div class="ip-item \${ip.banned ? 'banned' : ''}">
                                    <div class="ip-info">
                                        <div class="ip-address">
                                            🌐 \${ip.ip}
                                            \${ip.banned ? '<span class="ban-badge">BANLI</span>' : ''}
                                        </div>
                                        <div class="ip-details">
                                            👁️ Ziyaret: \${ip.visits} | 
                                            🕐 İlk: \${ip.firstSeen} | 
                                            🕐 Son: \${ip.lastSeen}
                                        </div>
                                        <div class="ip-details" style="margin-top: 5px;">
                                            💻 \${ip.userAgent.substring(0, 80)}\${ip.userAgent.length > 80 ? '...' : ''}
                                        </div>
                                    </div>
                                    <div class="ip-actions">
                                        \${ip.banned ? 
                                            \`<button class="btn-unban" onclick="unbanIP('\${ip.ip}')">✅ Ban Kaldır</button>\` :
                                            \`<button class="btn-ban" onclick="banIP('\${ip.ip}')">🚫 Banla</button>\`
                                        }
                                    </div>
                                </div>
                            \`).join('');
                            
                            document.getElementById('ipList').innerHTML = ipListHTML || '<p style="text-align: center; color: #666;">Henüz ziyaretçi yok</p>';
                        }
                    } catch (error) {
                        document.getElementById('ipLoading').textContent = '❌ Yükleme hatası';
                    }
                }
                
                loadIPList();
                
                async function banIP(ip) {
                    showModal(
                        '🚫 IP Ban',
                        \`\${ip} adresini banlamak istediğinizden emin misiniz? Bu IP artık siteye erişemeyecek.\`,
                        async function() {
                            const response = await fetch('/api/admin/ban-ip', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'X-Session-Id': sessionId
                                },
                                body: JSON.stringify({ ip })
                            });
                            
                            const result = await response.json();
                            if (result.success) {
                                loadIPList();
                            } else {
                                alert('❌ ' + result.message);
                            }
                        }
                    );
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
                        loadIPList();
                    } else {
                        alert('❌ ' + result.message);
                    }
                }
                
                async function manualBanIP() {
                    const ip = document.getElementById('manualBanIP').value.trim();
                    if (!ip) {
                        alert('❌ Lütfen bir IP adresi girin');
                        return;
                    }
                    
                    // Basit IP format kontrolü
                    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
                    if (!ipRegex.test(ip)) {
                        alert('❌ Geçersiz IP adresi formatı');
                        return;
                    }
                    
                    await banIP(ip);
                    document.getElementById('manualBanIP').value = '';
                }
                
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
                
                window.onclick = function(event) {
                    const modal = document.getElementById('confirmModal');
                    if (event.target == modal) {
                        closeModal();
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
                            } else {
                                alert('❌ ' + result.message);
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

/************ ANA SAYFA - GERÇEKZAMANLIs HARITA ************/
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
            <title>Alzheimer ve Otizm Hastaları İçin Akıllı Ayakkabı Takip Sistemi</title>
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
            <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
            <script src="/socket.io/socket.io.js"></script>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #7e22ce 100%);
                    min-height: 100vh;
                    padding: 20px;
                }
                .container {
                    max-width: 1400px;
                    margin: 0 auto;
                    background: rgba(255, 255, 255, 0.98);
                    border-radius: 25px;
                    box-shadow: 0 25px 80px rgba(0,0,0,0.4);
                    overflow: hidden;
                    animation: fadeIn 0.6s ease-out;
                }
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 35px 40px;
                    text-align: center;
                    position: relative;
                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
                }
                .header h1 {
                    font-size: 2.5em;
                    margin-bottom: 12px;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
                }
                .header p {
                    font-size: 1.2em;
                    opacity: 0.95;
                }
                .logout-btn-header {
                    position: absolute;
                    top: 35px;
                    right: 40px;
                    background: rgba(255,255,255,0.2);
                    color: white;
                    border: 2px solid white;
                    padding: 12px 25px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 1em;
                    transition: all 0.3s ease;
                }
                .logout-btn-header:hover {
                    background: white;
                    color: #667eea;
                    transform: translateY(-2px);
                }
                .admin-btn-header {
                    position: absolute;
                    top: 35px;
                    left: 40px;
                    background: rgba(255,255,255,0.2);
                    color: white;
                    border: 2px solid white;
                    padding: 12px 25px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: bold;
                    font-size: 1em;
                    transition: all 0.3s ease;
                }
                .admin-btn-header:hover {
                    background: white;
                    color: #667eea;
                    transform: translateY(-2px);
                }
                .stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 20px;
                    padding: 30px;
                    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                }
                .stat-card {
                    background: white;
                    padding: 25px;
                    border-radius: 15px;
                    text-align: center;
                    box-shadow: 0 6px 15px rgba(0,0,0,0.12);
                    transition: all 0.3s ease;
                    border: 2px solid transparent;
                }
                .stat-card:hover {
                    transform: translateY(-8px);
                    box-shadow: 0 12px 30px rgba(0,0,0,0.2);
                    border-color: #667eea;
                }
                .stat-value {
                    font-size: 2.5em;
                    font-weight: bold;
                    color: #667eea;
                    margin-bottom: 8px;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
                }
                .stat-label {
                    color: #6c757d;
                    font-size: 0.95em;
                    font-weight: 500;
                }
                #map {
                    width: 100%;
                    height: 600px;
                    border-top: 4px solid #667eea;
                    border-bottom: 4px solid #667eea;
                }
                .location-list {
                    padding: 35px;
                    max-height: 450px;
                    overflow-y: auto;
                    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                }
                .location-list::-webkit-scrollbar {
                    width: 10px;
                }
                .location-list::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 10px;
                }
                .location-list::-webkit-scrollbar-thumb {
                    background: #667eea;
                    border-radius: 10px;
                }
                .location-item {
                    background: white;
                    padding: 18px;
                    margin-bottom: 12px;
                    border-radius: 12px;
                    border-left: 5px solid #667eea;
                    box-shadow: 0 3px 10px rgba(0,0,0,0.08);
                    transition: all 0.3s ease;
                }
                .location-item:hover {
                    background: #f8f9fa;
                    transform: translateX(8px);
                    box-shadow: 0 5px 18px rgba(0,0,0,0.15);
                }
                .location-coords {
                    font-size: 1.15em;
                    font-weight: bold;
                    color: #333;
                    margin-bottom: 8px;
                }
                .location-time {
                    color: #6c757d;
                    font-size: 0.95em;
                }
                .no-data {
                    text-align: center;
                    padding: 50px;
                    color: #6c757d;
                    font-style: italic;
                    font-size: 1.1em;
                }
                .refresh-btn {
                    position: fixed;
                    bottom: 35px;
                    right: 35px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 18px 35px;
                    border-radius: 50px;
                    font-size: 1.1em;
                    cursor: pointer;
                    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
                    transition: all 0.3s ease;
                    z-index: 1000;
                    font-weight: bold;
                }
                .refresh-btn:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 10px 30px rgba(102, 126, 234, 0.7);
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(0.95); }
                }
                .live-indicator {
                    display: inline-block;
                    width: 12px;
                    height: 12px;
                    background: #28a745;
                    border-radius: 50%;
                    margin-right: 10px;
                    animation: pulse 2s infinite;
                    box-shadow: 0 0 10px #28a745;
                }
                .connection-status {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: rgba(40, 167, 69, 0.95);
                    color: white;
                    padding: 10px 20px;
                    border-radius: 25px;
                    font-weight: bold;
                    z-index: 999;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                    animation: slideInRight 0.5s ease-out;
                }
                @keyframes slideInRight {
                    from {
                        transform: translateX(100px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                .connection-status.disconnected {
                    background: rgba(220, 53, 69, 0.95);
                }
                .modal {
                    display: none;
                    position: fixed;
                    z-index: 1000;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0,0,0,0.6);
                }
                .modal-content {
                    background-color: white;
                    margin: 10% auto;
                    padding: 35px;
                    border-radius: 18px;
                    width: 90%;
                    max-width: 450px;
                    box-shadow: 0 15px 50px rgba(0,0,0,0.4);
                    animation: slideIn 0.3s;
                }
                .modal-header {
                    font-size: 1.6em;
                    font-weight: bold;
                    margin-bottom: 18px;
                    color: #333;
                }
                .modal-body {
                    margin-bottom: 28px;
                    color: #666;
                    font-size: 1.1em;
                    line-height: 1.6;
                }
                .modal-buttons {
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                }
                .modal-btn {
                    padding: 12px 28px;
                    border: none;
                    border-radius: 10px;
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
                    transform: translateY(-2px);
                }
                .modal-btn-confirm {
                    background: #dc3545;
                    color: white;
                }
                .modal-btn-confirm:hover {
                    background: #c82333;
                    transform: translateY(-2px);
                }
                @keyframes slideIn {
                    from { transform: translateY(-50px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            </style>
        </head>
        <body>
            <div class="connection-status" id="connectionStatus">
                <span class="live-indicator"></span>
                Canlı Bağlantı Aktif
            </div>
            
            <div class="container">
                <div class="header">
                    <button class="admin-btn-header" onclick="window.location.href='/admin?session=${req.query.session}'">🔧 Admin Panel</button>
                    <button class="logout-btn-header" onclick="logout()">🚪 Çıkış</button>
                    <h1>Alzheimer ve Otizm Hastaları İçin Akıllı Ayakkabı Takip Sistemi</h1>
                    <p><span class="live-indicator"></span>Gerçek Zamanlı Konum İzleme</p>
                </div>
                
                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-value" id="totalLocations">${locationData.length}</div>
                        <div class="stat-label">📍 Toplam Konum Verisi</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="lastLat">${lastLocation ? lastLocation.lat.toFixed(6) : '-'}</div>
                        <div class="stat-label">🌍 Son Enlem</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="lastLng">${lastLocation ? lastLocation.lng.toFixed(6) : '-'}</div>
                        <div class="stat-label">🌍 Son Boylam</div>
                    </div>
                    <div class="stat-card" style="background: ${lastLocation && lastLocation.wearing ? 'linear-gradient(135deg, #28a745 0%, #218838 100%)' : 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)'}; color: white;" id="wearingCard">
                        <div class="stat-value" style="color: white;" id="wearingStatus">${lastLocation ? (lastLocation.wearing ? '✅' : '❌') : '-'}</div>
                        <div class="stat-label" style="color: white;">👟 Giyilme Durumu</div>
                    </div>
                </div>
                
                <div id="map"></div>
                
                <div class="location-list">
                    <h2 style="margin-bottom: 25px; color: #333; font-size: 1.8em;">📋 Son Konumlar</h2>
                    <div id="locationListContent">
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
            </div>
            
            <button class="refresh-btn" onclick="location.reload()">🔄 Yenile</button>
            
            <div id="confirmModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header" id="modalTitle">Onay</div>
                    <div class="modal-body" id="modalMessage">İşlemi onaylıyor musunuz?</div>
                    <div class="modal-buttons">
                        <button class="modal-btn modal-btn-cancel" onclick="closeModal()">İptal</button>
                        <button class="modal-btn modal-btn-confirm" id="modalConfirmBtn">Sil</button>
                    </div>
                </div>
            </div>
            
            <script>
                const sessionId = '${req.query.session}';
                let socket;
                let locations = ${JSON.stringify(locationData)};
                let markers = [];
                let map;
                
                // Harita başlat
                map = L.map('map').setView([${lastLocation ? lastLocation.lat : 39.9334}, ${lastLocation ? lastLocation.lng : 32.8597}], ${lastLocation ? 13 : 6});
                
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: 19
                }).addTo(map);
                
                // Socket.IO bağlantısı
                function connectSocket() {
                    socket = io();
                    
                    socket.on('connect', () => {
                        console.log('✅ WebSocket bağlandı');
                        document.getElementById('connectionStatus').className = 'connection-status';
                        document.getElementById('connectionStatus').innerHTML = '<span class="live-indicator"></span>Canlı Bağlantı Aktif';
                    });
                    
                    socket.on('disconnect', () => {
                        console.log('❌ WebSocket bağlantısı kesildi');
                        document.getElementById('connectionStatus').className = 'connection-status disconnected';
                        document.getElementById('connectionStatus').innerHTML = '⚠️ Bağlantı Kesildi';
                    });
                    
                    socket.on('initialLocations', (data) => {
                        console.log('📍 İlk konumlar alındı:', data.length);
                        locations = data;
                        updateUI();
                        drawMarkers();
                    });
                    
                    socket.on('newLocation', (location) => {
                        console.log('📍 Yeni konum alındı:', location);
                        locations.push(location);
                        updateUI();
                        addNewMarker(location);
                    });
                }
                
                connectSocket();
                
                function updateUI() {
                    const lastLoc = locations[locations.length - 1];
                    
                    document.getElementById('totalLocations').textContent = locations.length;
                    
                    if (lastLoc) {
                        document.getElementById('lastLat').textContent = lastLoc.lat.toFixed(6);
                        document.getElementById('lastLng').textContent = lastLoc.lng.toFixed(6);
                        document.getElementById('wearingStatus').textContent = lastLoc.wearing ? '✅' : '❌';
                        
                        const wearingCard = document.getElementById('wearingCard');
                        wearingCard.style.background = lastLoc.wearing ? 
                            'linear-gradient(135deg, #28a745 0%, #218838 100%)' : 
                            'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
                    }
                    
                    // Konum listesini güncelle
                    const listHTML = locations.slice(-10).reverse().map((loc, index) => \`
                        <div class="location-item">
                            <div class="location-coords">
                                📌 Enlem: \${loc.lat.toFixed(6)} | Boylam: \${loc.lng.toFixed(6)}
                            </div>
                            <div class="location-time">
                                🕐 \${loc.timestamp} | 
                                <span style="color: \${loc.wearing ? '#28a745' : '#dc3545'}; font-weight: bold;">
                                    \${loc.wearing ? '✅ Giyildi' : '❌ Giyilmedi'}
                                </span>
                            </div>
                        </div>
                    \`).join('');
                    
                    document.getElementById('locationListContent').innerHTML = listHTML || 
                        '<div class="no-data">Henüz konum verisi alınmadı. Deneyap Kart\'ı başlatın...</div>';
                }
                
                function drawMarkers() {
                    markers.forEach(marker => map.removeLayer(marker));
                    markers = [];
                    
                    if (locations.length > 0) {
                        locations.forEach((loc, index) => {
                            addMarkerToMap(loc, index);
                        });
                        
                        if (locations.length > 1) {
                            const bounds = L.latLngBounds(locations.map(loc => [loc.lat, loc.lng]));
                            map.fitBounds(bounds, { padding: [50, 50] });
                        }
                    }
                }
                
                function addNewMarker(location) {
                    const index = locations.length - 1;
                    addMarkerToMap(location, index);
                    map.setView([location.lat, location.lng], 13);
                }
                
                function addMarkerToMap(loc, index) {
                    // Sürüklenebilir marker oluştur
                    const marker = L.marker([loc.lat, loc.lng], {
                        draggable: true,
                        autoPan: true
                    }).addTo(map);
                    
                    markers.push(marker);
                    
                    const wearingColor = loc.wearing ? '#28a745' : '#dc3545';
                    const wearingText = loc.wearing ? '✅ Giyildi' : '❌ Giyilmedi';
                    
                    marker.bindPopup(\`
                        <div style="min-width: 240px;">
                            <b style="color: \${index === locations.length - 1 ? '#dc3545' : '#667eea'}; font-size: 1.2em;">
                                \${index === locations.length - 1 ? '🔴 Son Konum' : '📍 Konum ' + (index + 1)}
                            </b>
                            <hr style="margin: 10px 0; border-color: #ddd;">
                            <div style="margin: 8px 0;">
                                <strong>📍 Enlem:</strong> \${loc.lat.toFixed(6)}
                            </div>
                            <div style="margin: 8px 0;">
                                <strong>📍 Boylam:</strong> \${loc.lng.toFixed(6)}
                            </div>
                            <div style="margin: 8px 0;">
                                <strong>👟 Durum:</strong> 
                                <span style="color: \${wearingColor}; font-weight: bold;">
                                    \${wearingText}
                                </span>
                            </div>
                            <div style="margin: 8px 0; color: #666;">
                                <strong>🕐 Zaman:</strong> \${loc.timestamp}
                            </div>
                            <hr style="margin: 10px 0; border-color: #ddd;">
                            <button 
                                onclick="deleteLocationWithModal(\${index})" 
                                style="
                                    width: 100%;
                                    padding: 10px;
                                    background: #dc3545;
                                    color: white;
                                    border: none;
                                    border-radius: 6px;
                                    cursor: pointer;
                                    font-weight: bold;
                                    font-size: 0.95em;
                                    transition: all 0.3s ease;
                                "
                                onmouseover="this.style.background='#c82333'"
                                onmouseout="this.style.background='#dc3545'"
                            >
                                ❌ Bu Konumu Sil
                            </button>
                        </div>
                    \`);
                    
                    if (index === locations.length - 1) {
                        marker.openPopup();
                    }
                    
                    // Sürükleme bitince yeni konumu kaydet
                    marker.on('dragend', function(event) {
                        const position = marker.getLatLng();
                        console.log('📍 Marker taşındı:', position);
                        
                        // Konum verisini güncelle
                        locations[index].lat = position.lat;
                        locations[index].lng = position.lng;
                        
                        // Popup'ı güncelle
                        marker.setPopupContent(\`
                            <div style="min-width: 240px;">
                                <b style="color: \${index === locations.length - 1 ? '#dc3545' : '#667eea'}; font-size: 1.2em;">
                                    \${index === locations.length - 1 ? '🔴 Son Konum (Taşındı)' : '📍 Konum ' + (index + 1) + ' (Taşındı)'}
                                </b>
                                <hr style="margin: 10px 0; border-color: #ddd;">
                                <div style="margin: 8px 0;">
                                    <strong>📍 Yeni Enlem:</strong> \${position.lat.toFixed(6)}
                                </div>
                                <div style="margin: 8px 0;">
                                    <strong>📍 Yeni Boylam:</strong> \${position.lng.toFixed(6)}
                                </div>
                                <div style="margin: 8px 0;">
                                    <strong>👟 Durum:</strong> 
                                    <span style="color: \${wearingColor}; font-weight: bold;">
                                        \${wearingText}
                                    </span>
                                </div>
                                <div style="margin: 8px 0; color: #666;">
                                    <strong>🕐 Zaman:</strong> \${loc.timestamp}
                                </div>
                                <hr style="margin: 10px 0; border-color: #ddd;">
                                <div style="background: #fff3cd; padding: 8px; border-radius: 5px; margin-bottom: 10px; color: #856404;">
                                    ℹ️ Konum manuel olarak taşındı
                                </div>
                                <button 
                                    onclick="deleteLocationWithModal(\${index})" 
                                    style="
                                        width: 100%;
                                        padding: 10px;
                                        background: #dc3545;
                                        color: white;
                                        border: none;
                                        border-radius: 6px;
                                        cursor: pointer;
                                        font-weight: bold;
                                        font-size: 0.95em;
                                        transition: all 0.3s ease;
                                    "
                                    onmouseover="this.style.background='#c82333'"
                                    onmouseout="this.style.background='#dc3545'"
                                >
                                    ❌ Bu Konumu Sil
                                </button>
                            </div>
                        \`);
                    });
                }
                
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
                
                window.onclick = function(event) {
                    const modal = document.getElementById('confirmModal');
                    if (event.target == modal) {
                        closeModal();
                    }
                }
                
                function deleteLocationWithModal(index) {
                    showModal(
                        '🗑️ Konum Sil',
                        'Bu konumu silmek istediğinizden emin misiniz?',
                        async function() {
                            const response = await fetch('/delete-location/' + index + '?session=' + sessionId, {
                                method: 'DELETE'
                            });
                            const result = await response.json();
                            
                            if (result.success) {
                                locations.splice(index, 1);
                                drawMarkers();
                                updateUI();
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
    
    // Tüm bağlı clientlere yeni konumu gönder
    io.emit('newLocation', locationEntry);
    
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
        activeSessions: activeSessions.size,
        totalVisitors: ipVisitors.size,
        locations: locationData.length
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
server.listen(PORT, '0.0.0.0', () => {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║  🚀 Akıllı Ayakkabı Takip Sistemi v2.0           ║');
    console.log('╠════════════════════════════════════════════════════╣');
    console.log(`║  📡 Server: http://0.0.0.0:${PORT.toString().padEnd(29)}║`);
    console.log('║  🔐 Giriş: /login                                 ║');
    console.log('║  🛡️  DDoS Koruması: Aktif                         ║');
    console.log('║  ⚡ Rate Limit: 100 istek/saniye                  ║');
    console.log('║  ⏰ Ban Süresi: 5 dakika                          ║');
    console.log('║  🔌 WebSocket: Aktif (Gerçek Zamanlı)             ║');
    console.log('║  🌐 IP İzleme: Aktif                              ║');
    console.log('║  🗺️  Sürüklenebilir Marker: Aktif                ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log('');
    console.log('🔑 Varsayılan Şifreler:');
    validPasswords.forEach(pwd => console.log(`   - ${pwd}`));
    console.log('');
    console.log('💡 Admin Panel Erişimi: Login\'de "Admin" yazın');
    console.log('🎨 Geliştirilmiş tasarım ve animasyonlar aktif!');
    console.log('');
});
