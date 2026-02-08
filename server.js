const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cookieParser = require('cookie-parser');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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
const ipAccessLog = new Map(); // Yeni: IP erişim kayıtları

const RATE_LIMIT = {
    maxRequests: 100,
    windowMs: 1000,
    banDuration: 300000
};

// IP bilgilerini kaydet
function logIPAccess(ip, endpoint, userAgent) {
    if (!ipAccessLog.has(ip)) {
        ipAccessLog.set(ip, {
            firstSeen: new Date(),
            lastSeen: new Date(),
            requestCount: 0,
            endpoints: new Set(),
            userAgents: new Set(),
            requests: []
        });
    }
    
    const log = ipAccessLog.get(ip);
    log.lastSeen = new Date();
    log.requestCount++;
    log.endpoints.add(endpoint);
    log.userAgents.add(userAgent);
    log.requests.push({
        timestamp: new Date(),
        endpoint: endpoint
    });
    
    // Son 100 isteği tut
    if (log.requests.length > 100) {
        log.requests = log.requests.slice(-100);
    }
}

// Rate limiting middleware
function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const endpoint = req.path;
    
    // IP erişimini kaydet
    logIPAccess(ip, endpoint, userAgent);
    
    const now = Date.now();
    
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
            requestCount: tracker.requests.length,
            reason: 'Rate limit aşıldı'
        });
        
        console.log(`🚫 IP BANLANDI: ${ip} (${tracker.requests.length} istek/saniye)`);
        
        // Socket.IO üzerinden admin'e bildir
        io.emit('ip-banned', {
            ip: ip,
            reason: 'Rate limit aşıldı',
            timestamp: new Date().toLocaleString('tr-TR')
        });
        
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

/************ SOCKET.IO BAGLANTILARI ************/
io.on('connection', (socket) => {
    console.log('🔌 Yeni WebSocket bağlantısı:', socket.id);
    
    // İstemciye mevcut konumları gönder
    socket.emit('initial-locations', locationData);
    
    socket.on('disconnect', () => {
        console.log('❌ WebSocket bağlantısı kesildi:', socket.id);
    });
    
    // Admin IP ban isteği
    socket.on('ban-ip', (data) => {
        const { ip, reason, duration } = data;
        const banUntil = Date.now() + (duration || RATE_LIMIT.banDuration);
        
        bannedIPs.set(ip, {
            until: banUntil,
            bannedAt: Date.now(),
            requestCount: 0,
            reason: reason || 'Admin tarafından yasaklandı'
        });
        
        console.log(`🚫 Admin tarafından IP banlandi: ${ip}`);
        io.emit('ip-list-updated');
    });
    
    // Admin IP ban kaldırma isteği
    socket.on('unban-ip', (ip) => {
        if (bannedIPs.has(ip)) {
            bannedIPs.delete(ip);
            ipRequestTracker.delete(ip);
            console.log(`✅ IP banı kaldırıldı: ${ip}`);
            io.emit('ip-list-updated');
        }
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
                
                /* Animasyonlu arka plan */
                body::before {
                    content: '';
                    position: absolute;
                    width: 200%;
                    height: 200%;
                    background: radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px);
                    background-size: 50px 50px;
                    animation: backgroundMove 20s linear infinite;
                }
                
                @keyframes backgroundMove {
                    0% { transform: translate(0, 0); }
                    100% { transform: translate(50px, 50px); }
                }
                
                .login-container {
                    background: white;
                    border-radius: 25px;
                    box-shadow: 0 30px 80px rgba(0,0,0,0.3);
                    padding: 60px 50px;
                    max-width: 480px;
                    width: 100%;
                    text-align: center;
                    position: relative;
                    z-index: 1;
                    animation: slideUp 0.6s ease-out;
                }
                
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(50px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                .logo {
                    font-size: 5em;
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
                    font-size: 2.2em;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                
                .subtitle {
                    color: #666;
                    margin-bottom: 40px;
                    font-size: 1.1em;
                }
                
                .input-group {
                    margin-bottom: 30px;
                    text-align: left;
                }
                
                label {
                    display: block;
                    color: #555;
                    margin-bottom: 10px;
                    font-weight: 600;
                    font-size: 1em;
                }
                
                input[type="password"] {
                    width: 100%;
                    padding: 18px;
                    border: 2px solid #e0e0e0;
                    border-radius: 12px;
                    font-size: 1.1em;
                    transition: all 0.3s ease;
                    background: #f8f9fa;
                }
                
                input[type="password"]:focus {
                    outline: none;
                    border-color: #667eea;
                    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
                    background: white;
                }
                
                .btn-login {
                    width: 100%;
                    padding: 18px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 12px;
                    font-size: 1.3em;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                }
                
                .btn-login:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 6px 25px rgba(102, 126, 234, 0.6);
                }
                
                .btn-login:active {
                    transform: translateY(-1px);
                }
                
                .error-message {
                    background: #fee;
                    color: #c33;
                    padding: 15px;
                    border-radius: 10px;
                    margin-bottom: 25px;
                    display: none;
                    animation: shake 0.5s;
                }
                
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-10px); }
                    75% { transform: translateX(10px); }
                }
                
                .info-box {
                    background: linear-gradient(135deg, #f0f4ff 0%, #e8ecff 100%);
                    padding: 20px;
                    border-radius: 12px;
                    margin-top: 30px;
                    color: #555;
                    font-size: 0.95em;
                    border-left: 4px solid #667eea;
                }
                
                .features {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 15px;
                    margin-top: 30px;
                }
                
                .feature-item {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 10px;
                    text-align: center;
                    transition: all 0.3s ease;
                }
                
                .feature-item:hover {
                    transform: translateY(-5px);
                    background: #e9ecef;
                }
                
                .feature-icon {
                    font-size: 2em;
                    margin-bottom: 5px;
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <div class="logo">🔐</div>
                <h1>Akıllı Ayakkabı Takip</h1>
                <p class="subtitle">Alzheimer & Otizm Hastaları İçin</p>
                
                <div class="error-message" id="errorMsg"></div>
                
                <form id="loginForm">
                    <div class="input-group">
                        <label>🔑 Erişim Şifresi</label>
                        <input type="password" id="password" placeholder="Şifrenizi girin" required autofocus>
                    </div>
                    
                    <button type="submit" class="btn-login">🚀 Giriş Yap</button>
                </form>
                
                <div class="features">
                    <div class="feature-item">
                        <div class="feature-icon">⚡</div>
                        <div>Gerçek Zamanlı</div>
                    </div>
                    <div class="feature-item">
                        <div class="feature-icon">🛡️</div>
                        <div>Güvenli</div>
                    </div>
                    <div class="feature-item">
                        <div class="feature-icon">📍</div>
                        <div>GPS Takip</div>
                    </div>
                    <div class="feature-item">
                        <div class="feature-icon">🔔</div>
                        <div>Anlık Alarm</div>
                    </div>
                </div>
                
                <div class="info-box">
                    🛡️ Bu sistem DDoS korumalıdır<br>
                    ⚡ WebSocket ile anlık güncelleme<br>
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

/************ API: IP LİSTESİ ************/
app.get('/api/admin/ip-list', (req, res) => {
    if (!isAuthenticated(req)) {
        return res.status(401).json({ success: false, message: 'Yetkisiz erişim' });
    }
    
    const ipList = Array.from(ipAccessLog.entries()).map(([ip, data]) => ({
        ip,
        firstSeen: data.firstSeen.toLocaleString('tr-TR'),
        lastSeen: data.lastSeen.toLocaleString('tr-TR'),
        requestCount: data.requestCount,
        endpoints: Array.from(data.endpoints),
        userAgents: Array.from(data.userAgents),
        isBanned: bannedIPs.has(ip),
        banInfo: bannedIPs.has(ip) ? {
            until: new Date(bannedIPs.get(ip).until).toLocaleString('tr-TR'),
            reason: bannedIPs.get(ip).reason
        } : null
    }));
    
    res.json({
        success: true,
        ipList: ipList.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
    });
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
        reason: info.reason
    }));
    
    res.send(`
        <!DOCTYPE html>
        <html lang="tr">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin Paneli - Akıllı Ayakkabı Takip</title>
            <script src="/socket.io/socket.io.js"></script>
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
                    max-width: 1400px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 25px;
                    box-shadow: 0 30px 80px rgba(0,0,0,0.3);
                    overflow: hidden;
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
                
                .header {
                    background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
                    color: white;
                    padding: 35px 40px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                }
                
                .header h1 {
                    font-size: 2.2em;
                    display: flex;
                    align-items: center;
                    gap: 15px;
                }
                
                .status-indicator {
                    display: inline-block;
                    width: 12px;
                    height: 12px;
                    background: #28a745;
                    border-radius: 50%;
                    animation: pulse 2s infinite;
                }
                
                @keyframes pulse {
                    0%, 100% {
                        opacity: 1;
                        transform: scale(1);
                    }
                    50% {
                        opacity: 0.6;
                        transform: scale(1.2);
                    }
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
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 25px;
                    margin-bottom: 40px;
                }
                
                .stat-card {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 30px;
                    border-radius: 18px;
                    text-align: center;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                }
                
                .stat-card:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 8px 25px rgba(0,0,0,0.3);
                }
                
                .stat-value {
                    font-size: 3.5em;
                    font-weight: bold;
                    margin-bottom: 8px;
                }
                
                .stat-label {
                    font-size: 1.1em;
                    opacity: 0.95;
                }
                
                .section {
                    background: #f8f9fa;
                    padding: 30px;
                    border-radius: 18px;
                    margin-bottom: 30px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                }
                
                .section h3 {
                    color: #333;
                    margin-bottom: 25px;
                    font-size: 1.6em;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .ip-table-container {
                    overflow-x: auto;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                
                th {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 15px;
                    text-align: left;
                    font-weight: 600;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                
                td {
                    padding: 15px;
                    border-bottom: 1px solid #e0e0e0;
                }
                
                tr:hover {
                    background: #f8f9fa;
                }
                
                .btn-ban {
                    background: #dc3545;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: bold;
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
                    font-weight: bold;
                    transition: all 0.3s ease;
                }
                
                .btn-unban:hover {
                    background: #218838;
                    transform: scale(1.05);
                }
                
                .badge {
                    display: inline-block;
                    padding: 4px 10px;
                    border-radius: 12px;
                    font-size: 0.85em;
                    font-weight: bold;
                }
                
                .badge-danger {
                    background: #dc3545;
                    color: white;
                }
                
                .badge-success {
                    background: #28a745;
                    color: white;
                }
                
                .password-list {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 12px;
                    margin-bottom: 25px;
                }
                
                .password-item {
                    background: white;
                    padding: 15px 25px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    border: 2px solid #e0e0e0;
                    transition: all 0.3s ease;
                }
                
                .password-item:hover {
                    border-color: #667eea;
                    transform: translateY(-2px);
                }
                
                .password-text {
                    font-weight: bold;
                    color: #333;
                    font-size: 1.1em;
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
                    transform: scale(1.1);
                }
                
                .input-group {
                    display: flex;
                    gap: 12px;
                    margin-top: 20px;
                }
                
                .input-group input {
                    flex: 1;
                    padding: 15px;
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
                    padding: 15px 30px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: bold;
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
                    padding: 15px 30px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: bold;
                    margin: 5px;
                    transition: all 0.3s ease;
                }
                
                .btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(0,0,0,0.2);
                }
                
                .btn-danger {
                    background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
                    color: white;
                    border: none;
                    padding: 15px 30px;
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: bold;
                    margin: 5px;
                    transition: all 0.3s ease;
                }
                
                .btn-danger:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(220, 53, 69, 0.4);
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
                    background-color: rgba(0,0,0,0.6);
                    animation: fadeIn 0.3s;
                }
                
                .modal-content {
                    background-color: white;
                    margin: 10% auto;
                    padding: 35px;
                    border-radius: 18px;
                    width: 90%;
                    max-width: 500px;
                    box-shadow: 0 15px 50px rgba(0,0,0,0.4);
                    animation: slideIn 0.3s;
                }
                
                .modal-header {
                    font-size: 1.6em;
                    font-weight: bold;
                    margin-bottom: 20px;
                    color: #333;
                }
                
                .modal-body {
                    margin-bottom: 30px;
                    color: #666;
                    font-size: 1.1em;
                    line-height: 1.6;
                }
                
                .modal-input-group {
                    margin-bottom: 20px;
                }
                
                .modal-input-group label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: bold;
                    color: #555;
                }
                
                .modal-input-group input,
                .modal-input-group select {
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #e0e0e0;
                    border-radius: 8px;
                    font-size: 1em;
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
                    from {
                        transform: translateY(-50px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
                
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 20px 25px;
                    background: #28a745;
                    color: white;
                    border-radius: 10px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    z-index: 2000;
                    animation: slideInRight 0.4s ease-out;
                    display: none;
                }
                
                @keyframes slideInRight {
                    from {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            </style>
        </head>
        <body>
            <div class="notification" id="notification"></div>
            
            <div class="container">
                <div class="header">
                    <h1>
                        <span class="status-indicator"></span>
                        🔧 Admin Paneli
                    </h1>
                    <button class="logout-btn" onclick="logout()">🚪 Çıkış Yap</button>
                </div>
                
                <div class="content">
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-value" id="totalLocations">${locationData.length}</div>
                            <div class="stat-label">📍 Toplam Konum</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${validPasswords.length}</div>
                            <div class="stat-label">🔑 Aktif Şifre</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value" id="bannedIPCount">${bannedIPs.size}</div>
                            <div class="stat-label">🚫 Banlı IP</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${activeSessions.size}</div>
                            <div class="stat-label">👥 Aktif Oturum</div>
                        </div>
                    </div>
                    
                    <div class="section">
                        <h3>🌐 IP Yönetimi</h3>
                        <button class="btn-primary" onclick="refreshIPList()">🔄 Yenile</button>
                        <div id="ipTableContainer" class="ip-table-container" style="margin-top: 20px;">
                            <p style="text-align: center; padding: 20px;">Yükleniyor...</p>
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
                        <h3>📋 Hızlı Erişim</h3>
                        <button class="btn-primary" onclick="window.location.href='/?session=${req.query.session}'">🗺️ Harita Görünümü</button>
                        <button class="btn-primary" onclick="window.location.href='/all-locations?session=${req.query.session}'">📊 Tüm Veriler</button>
                        <button class="btn-danger" onclick="clearAllLocations()">🗑️ Tüm Konumları Temizle</button>
                    </div>
                </div>
            </div>
            
            <!-- Ban Modal -->
            <div id="banModal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">🚫 IP Adresi Banla</div>
                    <div class="modal-body">
                        <div class="modal-input-group">
                            <label>IP Adresi:</label>
                            <input type="text" id="banIP" readonly>
                        </div>
                        <div class="modal-input-group">
                            <label>Ban Sebebi:</label>
                            <input type="text" id="banReason" placeholder="Örn: Şüpheli aktivite">
                        </div>
                        <div class="modal-input-group">
                            <label>Ban Süresi:</label>
                            <select id="banDuration">
                                <option value="300000">5 Dakika</option>
                                <option value="900000">15 Dakika</option>
                                <option value="1800000">30 Dakika</option>
                                <option value="3600000">1 Saat</option>
                                <option value="86400000">24 Saat</option>
                                <option value="604800000">7 Gün</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-buttons">
                        <button class="modal-btn modal-btn-cancel" onclick="closeBanModal()">İptal</button>
                        <button class="modal-btn modal-btn-confirm" onclick="confirmBan()">Banla</button>
                    </div>
                </div>
            </div>
            
            <!-- Genel Modal -->
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
                const socket = io();
                
                // WebSocket bağlantısı kuruldu
                socket.on('connect', () => {
                    console.log('✅ WebSocket bağlantısı kuruldu');
                    showNotification('🔌 Gerçek zamanlı bağlantı aktif', 'success');
                });
                
                // IP listesi güncellendi
                socket.on('ip-list-updated', () => {
                    refreshIPList();
                    document.getElementById('bannedIPCount').textContent = bannedIPs.size;
                });
                
                // Yeni IP banlandı
                socket.on('ip-banned', (data) => {
                    showNotification('🚫 IP banlandı: ' + data.ip, 'danger');
                    refreshIPList();
                });
                
                // Sayfa yüklendiğinde IP listesini getir
                refreshIPList();
                
                function showNotification(message, type = 'success') {
                    const notification = document.getElementById('notification');
                    notification.textContent = message;
                    notification.style.background = type === 'success' ? '#28a745' : '#dc3545';
                    notification.style.display = 'block';
                    
                    setTimeout(() => {
                        notification.style.display = 'none';
                    }, 3000);
                }
                
                async function refreshIPList() {
                    try {
                        const response = await fetch('/api/admin/ip-list?session=' + sessionId);
                        const result = await response.json();
                        
                        if (result.success) {
                            displayIPTable(result.ipList);
                        }
                    } catch (error) {
                        console.error('IP listesi alınamadı:', error);
                    }
                }
                
                function displayIPTable(ipList) {
                    const container = document.getElementById('ipTableContainer');
                    
                    if (ipList.length === 0) {
                        container.innerHTML = '<p style="text-align: center; padding: 20px;">Henüz IP erişimi yok</p>';
                        return;
                    }
                    
                    const html = \`
                        <table>
                            <thead>
                                <tr>
                                    <th>IP Adresi</th>
                                    <th>İlk Erişim</th>
                                    <th>Son Erişim</th>
                                    <th>İstek Sayısı</th>
                                    <th>Durum</th>
                                    <th>İşlem</th>
                                </tr>
                            </thead>
                            <tbody>
                                \${ipList.map(ip => \`
                                    <tr>
                                        <td><strong>\${ip.ip}</strong></td>
                                        <td>\${ip.firstSeen}</td>
                                        <td>\${ip.lastSeen}</td>
                                        <td>\${ip.requestCount}</td>
                                        <td>
                                            \${ip.isBanned 
                                                ? '<span class="badge badge-danger">🚫 BANLI</span>' 
                                                : '<span class="badge badge-success">✅ Aktif</span>'
                                            }
                                        </td>
                                        <td>
                                            \${ip.isBanned 
                                                ? \`<button class="btn-unban" onclick="unbanIP('\${ip.ip}')">Banı Kaldır</button>\`
                                                : \`<button class="btn-ban" onclick="showBanModal('\${ip.ip}')">Banla</button>\`
                                            }
                                        </td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    \`;
                    
                    container.innerHTML = html;
                }
                
                function showBanModal(ip) {
                    document.getElementById('banIP').value = ip;
                    document.getElementById('banReason').value = '';
                    document.getElementById('banModal').style.display = 'block';
                }
                
                function closeBanModal() {
                    document.getElementById('banModal').style.display = 'none';
                }
                
                function confirmBan() {
                    const ip = document.getElementById('banIP').value;
                    const reason = document.getElementById('banReason').value || 'Admin tarafından yasaklandı';
                    const duration = parseInt(document.getElementById('banDuration').value);
                    
                    socket.emit('ban-ip', { ip, reason, duration });
                    closeBanModal();
                    showNotification('🚫 IP banlandı: ' + ip, 'success');
                }
                
                function unbanIP(ip) {
                    socket.emit('unban-ip', ip);
                    showNotification('✅ IP banı kaldırıldı: ' + ip, 'success');
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
                    if (event.target == document.getElementById('confirmModal')) {
                        closeModal();
                    }
                    if (event.target == document.getElementById('banModal')) {
                        closeBanModal();
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
                                showNotification('✅ Tüm konumlar temizlendi', 'success');
                                setTimeout(() => location.reload(), 1000);
                            }
                        }
                    );
                }
                
                async function addPassword() {
                    const password = document.getElementById('newPassword').value.trim();
                    if (!password) {
                        showNotification('❌ Şifre boş olamaz', 'danger');
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
                        showNotification('✅ Şifre eklendi', 'success');
                        setTimeout(() => location.reload(), 1000);
                    } else {
                        showNotification('❌ ' + result.message, 'danger');
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
                                showNotification('✅ Şifre silindi', 'success');
                                setTimeout(() => location.reload(), 1000);
                            } else {
                                showNotification('❌ ' + result.message, 'danger');
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

/************ ANA SAYFA (DEVAMI) ************/
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
            <title>Akıllı Ayakkabı Takip Sistemi</title>
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
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    padding: 20px;
                }
                
                .container {
                    max-width: 1400px;
                    margin: 0 auto;
                    background: white;
                    border-radius: 25px;
                    box-shadow: 0 30px 80px rgba(0,0,0,0.3);
                    overflow: hidden;
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
                
                .header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 35px 40px;
                    text-align: center;
                    position: relative;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                }
                
                .header h1 {
                    font-size: 2.5em;
                    margin-bottom: 12px;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
                }
                
                .header p {
                    font-size: 1.2em;
                    opacity: 0.95;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
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
                
                .live-indicator {
                    display: inline-block;
                    width: 12px;
                    height: 12px;
                    background: #28a745;
                    border-radius: 50%;
                    animation: pulse 2s infinite;
                }
                
                @keyframes pulse {
                    0%, 100% {
                        opacity: 1;
                        transform: scale(1);
                    }
                    50% {
                        opacity: 0.6;
                        transform: scale(1.2);
                    }
                }
                
                .stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                    gap: 25px;
                    padding: 35px;
                    background: #f8f9fa;
                }
                
                .stat-card {
                    background: white;
                    padding: 25px;
                    border-radius: 18px;
                    text-align: center;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                    transition: all 0.3s ease;
                    border: 2px solid transparent;
                }
                
                .stat-card:hover {
                    transform: translateY(-8px);
                    border-color: #667eea;
                    box-shadow: 0 8px 25px rgba(0,0,0,0.15);
                }
                
                .stat-value {
                    font-size: 2.5em;
                    font-weight: bold;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 8px;
                }
                
                .stat-label {
                    color: #6c757d;
                    font-size: 1em;
                    font-weight: 500;
                }
                
                #map {
                    width: 100%;
                    height: 550px;
                    border-top: 3px solid #667eea;
                    border-bottom: 3px solid #667eea;
                }
                
                .location-list {
                    padding: 35px;
                    max-height: 450px;
                    overflow-y: auto;
                }
                
                .location-list::-webkit-scrollbar {
                    width: 8px;
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
                    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                    padding: 20px;
                    margin-bottom: 15px;
                    border-radius: 12px;
                    border-left: 5px solid #667eea;
                    transition: all 0.3s ease;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }
                
                .location-item:hover {
                    background: linear-gradient(135deg, #e9ecef 0%, #dee2e6 100%);
                    transform: translateX(8px);
                    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
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
                    font-weight: bold;
                    cursor: pointer;
                    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
                    transition: all 0.3s ease;
                    z-index: 1000;
                }
                
                .refresh-btn:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 8px 30px rgba(102, 126, 234, 0.6);
                }
                
                /* Animasyonlu marker */
                .pulse-marker {
                    animation: markerPulse 2s ease-in-out infinite;
                }
                
                @keyframes markerPulse {
                    0%, 100% {
                        transform: scale(1);
                    }
                    50% {
                        transform: scale(1.1);
                    }
                }
                
                /* Popup stilleri */
                .leaflet-popup-content-wrapper {
                    border-radius: 15px;
                    box-shadow: 0 8px 25px rgba(0,0,0,0.2);
                }
                
                .leaflet-popup-content {
                    margin: 15px;
                    min-width: 250px;
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
                    background-color: rgba(0,0,0,0.6);
                    animation: fadeIn 0.3s;
                }
                
                .modal-content {
                    background-color: white;
                    margin: 10% auto;
                    padding: 35px;
                    border-radius: 18px;
                    width: 90%;
                    max-width: 500px;
                    box-shadow: 0 15px 50px rgba(0,0,0,0.4);
                    animation: slideIn 0.3s;
                }
                
                .modal-header {
                    font-size: 1.6em;
                    font-weight: bold;
                    margin-bottom: 20px;
                    color: #333;
                }
                
                .modal-body {
                    margin-bottom: 30px;
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
                    from {
                        transform: translateY(-50px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
                
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 20px 25px;
                    background: #28a745;
                    color: white;
                    border-radius: 10px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    z-index: 2000;
                    animation: slideInRight 0.4s ease-out;
                    display: none;
                }
                
                @keyframes slideInRight {
                    from {
                        transform: translateX(400px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            </style>
        </head>
        <body>
            <div class="notification" id="notification"></div>
            
            <div class="container">
                <div class="header">
                    <button class="logout-btn-header" onclick="logout()">🚪 Çıkış</button>
                    <h1>🥾 Akıllı Ayakkabı Takip Sistemi</h1>
                    <p><span class="live-indicator"></span>Gerçek Zamanlı Konum İzleme</p>
                </div>
                
                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-value" id="totalLocations">${locationData.length}</div>
                        <div class="stat-label">📍 Toplam Konum</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="lastLat">${lastLocation ? lastLocation.lat.toFixed(6) : '-'}</div>
                        <div class="stat-label">🌍 Son Enlem</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="lastLng">${lastLocation ? lastLocation.lng.toFixed(6) : '-'}</div>
                        <div class="stat-label">🌍 Son Boylam</div>
                    </div>
                    <div class="stat-card" style="background: ${lastLocation && lastLocation.wearing ? 'linear-gradient(135deg, #28a745 0%, #218838 100%)' : 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)'}; color: white;">
                        <div class="stat-value" style="color: white; -webkit-text-fill-color: white;" id="wearingStatus">${lastLocation ? (lastLocation.wearing ? '✅' : '❌') : '-'}</div>
                        <div class="stat-label" style="color: white;">👟 Giyilme Durumu</div>
                    </div>
                </div>
                
                <div id="map"></div>
                
                <div class="location-list">
                    <h2 style="margin-bottom: 25px; color: #333; font-size: 1.8em;">📋 Son Konumlar</h2>
                    <div id="locationListContainer">
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
            
            <!-- Modal -->
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
                const socket = io();
                
                let map, markers = [];
                let locations = ${JSON.stringify(locationData)};
                
                // Harita başlat
                map = L.map('map').setView([${lastLocation ? lastLocation.lat : 39.9334}, ${lastLocation ? lastLocation.lng : 32.8597}], ${lastLocation ? 13 : 6});
                
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: 19
                }).addTo(map);
                
                function showNotification(message, type = 'success') {
                    const notification = document.getElementById('notification');
                    notification.textContent = message;
                    notification.style.background = type === 'success' ? '#28a745' : type === 'info' ? '#17a2b8' : '#dc3545';
                    notification.style.display = 'block';
                    
                    setTimeout(() => {
                        notification.style.display = 'none';
                    }, 3000);
                }
                
                // WebSocket bağlantısı
                socket.on('connect', () => {
                    console.log('✅ WebSocket bağlantısı kuruldu');
                    showNotification('🔌 Gerçek zamanlı bağlantı aktif', 'info');
                });
                
                // Başlangıç konumları
                socket.on('initial-locations', (data) => {
                    locations = data;
                    drawMarkers();
                });
                
                // Yeni konum geldi
                socket.on('new-location', (location) => {
                    console.log('📍 Yeni konum alındı:', location);
                    locations.push(location);
                    drawMarkers();
                    updateStats();
                    updateLocationList();
                    showNotification('📍 Yeni konum alındı!', 'success');
                });
                
                // Konum silindi
                socket.on('location-deleted', (data) => {
                    locations = data.locations;
                    drawMarkers();
                    updateStats();
                    updateLocationList();
                    showNotification('🗑️ Konum silindi', 'info');
                });
                
                // Tüm konumlar temizlendi
                socket.on('locations-cleared', () => {
                    locations = [];
                    drawMarkers();
                    updateStats();
                    updateLocationList();
                    showNotification('🗑️ Tüm konumlar temizlendi', 'info');
                });
                
                function updateStats() {
                    document.getElementById('totalLocations').textContent = locations.length;
                    
                    if (locations.length > 0) {
                        const last = locations[locations.length - 1];
                        document.getElementById('lastLat').textContent = last.lat.toFixed(6);
                        document.getElementById('lastLng').textContent = last.lng.toFixed(6);
                        document.getElementById('wearingStatus').textContent = last.wearing ? '✅' : '❌';
                    }
                }
                
                function updateLocationList() {
                    const container = document.getElementById('locationListContainer');
                    
                    if (locations.length === 0) {
                        container.innerHTML = '<div class="no-data">Henüz konum verisi alınmadı. Deneyap Kart\'ı başlatın...</div>';
                        return;
                    }
                    
                    const html = locations.slice(-10).reverse().map((loc, index) => \`
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
                    
                    container.innerHTML = html;
                }
                
                function drawMarkers() {
                    // Eski markerları temizle
                    markers.forEach(marker => map.removeLayer(marker));
                    markers = [];
                    
                    if (locations.length === 0) return;
                    
                    // Yeni markerları ekle
                    locations.forEach((loc, index) => {
                        // Animasyonlu marker ikonu
                        const markerIcon = L.divIcon({
                            className: 'pulse-marker',
                            html: \`
                                <div style="
                                    background: \${index === locations.length - 1 ? '#dc3545' : '#667eea'};
                                    width: 40px;
                                    height: 40px;
                                    border-radius: 50%;
                                    border: 4px solid white;
                                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    color: white;
                                    font-weight: bold;
                                    font-size: 1.2em;
                                ">
                                    \${index === locations.length - 1 ? '🔴' : '📍'}
                                </div>
                            \`,
                            iconSize: [40, 40],
                            iconAnchor: [20, 20]
                        });
                        
                        const marker = L.marker([loc.lat, loc.lng], { icon: markerIcon }).addTo(map);
                        markers.push(marker);
                        
                        const wearingColor = loc.wearing ? '#28a745' : '#dc3545';
                        const wearingText = loc.wearing ? '✅ Giyildi' : '❌ Giyilmedi';
                        
                        marker.bindPopup(\`
                            <div style="min-width: 260px; font-family: 'Segoe UI', sans-serif;">
                                <b style="
                                    color: \${index === locations.length - 1 ? '#dc3545' : '#667eea'}; 
                                    font-size: 1.3em;
                                    display: block;
                                    margin-bottom: 15px;
                                ">
                                    \${index === locations.length - 1 ? '🔴 Son Konum' : '📍 Konum ' + (index + 1)}
                                </b>
                                <hr style="margin: 12px 0; border: none; border-top: 2px solid #eee;">
                                <div style="margin: 10px 0; font-size: 1.05em;">
                                    <strong>🌍 Enlem:</strong> \${loc.lat.toFixed(6)}
                                </div>
                                <div style="margin: 10px 0; font-size: 1.05em;">
                                    <strong>🌍 Boylam:</strong> \${loc.lng.toFixed(6)}
                                </div>
                                <div style="margin: 10px 0; font-size: 1.05em;">
                                    <strong>👟 Durum:</strong> 
                                    <span style="color: \${wearingColor}; font-weight: bold;">
                                        \${wearingText}
                                    </span>
                                </div>
                                <div style="margin: 10px 0; color: #666; font-size: 0.95em;">
                                    <strong>🕐 Zaman:</strong> \${loc.timestamp}
                                </div>
                                <hr style="margin: 12px 0; border: none; border-top: 2px solid #eee;">
                                <button 
                                    onclick="deleteLocationWithModal(\${index})" 
                                    style="
                                        width: 100%;
                                        padding: 12px;
                                        background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
                                        color: white;
                                        border: none;
                                        border-radius: 8px;
                                        cursor: pointer;
                                        font-weight: bold;
                                        font-size: 1em;
                                        transition: all 0.3s ease;
                                    "
                                    onmouseover="this.style.transform='scale(1.05)'"
                                    onmouseout="this.style.transform='scale(1)'"
                                >
                                    ❌ Bu Konumu Sil
                                </button>
                            </div>
                        \`);
                        
                        if (index === locations.length - 1) {
                            marker.openPopup();
                        }
                    });
                    
                    // Haritayı tüm markerları gösterecek şekilde ayarla
                    if (locations.length > 1) {
                        const bounds = L.latLngBounds(locations.map(loc => [loc.lat, loc.lng]));
                        map.fitBounds(bounds, { padding: [50, 50] });
                    } else if (locations.length === 1) {
                        map.setView([locations[0].lat, locations[0].lng], 15);
                    }
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
                                // Socket.IO otomatik güncelleyecek
                                showNotification('✅ Konum silindi', 'success');
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
                
                // İlk yükleme
                drawMarkers();
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
    
    // WebSocket üzerinden tüm bağlı istemcilere bildir
    io.emit('new-location', locationEntry);
    
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
    
    // WebSocket ile bildir
    io.emit('location-deleted', {
        deletedLocation,
        locations: locationData
    });
    
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
    
    // WebSocket ile bildir
    io.emit('locations-cleared');
    
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
        totalIPs: ipAccessLog.size,
        websocketConnections: io.engine.clientsCount
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
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   🚀 Akıllı Ayakkabı Takip Sistemi       ║');
    console.log('║   📡 WebSocket Edition                   ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  🌐 Server: http://0.0.0.0:${PORT.toString().padEnd(21)}║`);
    console.log('║  🔐 Giriş: /login                        ║');
    console.log('║  🛡️  DDoS Koruması: Aktif                ║');
    console.log('║  ⚡ WebSocket: Gerçek Zamanlı            ║');
    console.log('║  📊 IP Yönetimi: Aktif                   ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
    console.log('🔑 Varsayılan Şifreler:');
    validPasswords.forEach(pwd => console.log(`   - ${pwd}`));
    console.log('');
    console.log('💡 Admin Panel: Login\'de "Admin" yazın');
    console.log('🎨 Yenilikler: WebSocket, IP Tracking, Animasyonlar');
    console.log('');
});
