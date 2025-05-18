const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// MongoDB bağlantısı
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Kullanıcı şeması
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  verificationCode: String,
  isVerified: { type: Boolean, default: false },
  resetToken: String,
  resetTokenExpiry: Number
});
const User = mongoose.model('User', userSchema);

// Not şeması
const noteSchema = new mongoose.Schema({
  content: String,
  createdBy: String,
  createdAt: { type: Date, default: Date.now },
  likes: [{ type: String }] // Beğenen kullanıcı adları
});
const Note = mongoose.model('Note', noteSchema);

// Yorum şeması
const commentSchema = new mongoose.Schema({
  noteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Note' },
  content: String,
  createdBy: String,
  createdAt: { type: Date, default: Date.now }
});
const Comment = mongoose.model('Comment', commentSchema);

// Nodemailer yapılandırması
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Ana sayfa
app.get('/', (req, res) => {
  console.log('Ana sayfa isteği alındı');
  res.sendFile(__dirname + '/index.html');
});

// Kayıt işlemi
app.post('/register', async (req, res) => {
  console.log('Kayıt isteği alındı:', req.body);
  const { username, email, password, recaptchaResponse } = req.body;
  try {
    const recaptchaVerify = await axios.post(`https://www.google.com/recaptcha/api/siteverify`, null, {
      params: {
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: recaptchaResponse
      }
    });
    if (!recaptchaVerify.data.success) {
      console.log('reCAPTCHA doğrulama başarısız');
      return res.status(400).json({ message: 'reCAPTCHA doğrulama başarısız.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('E-posta zaten kayıtlı:', email);
      return res.status(400).json({ message: 'Bu e-posta zaten kayıtlı.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    const user = new User({
      username,
      email,
      password: hashedPassword,
      verificationCode
    });
    await user.save();
    console.log('Kullanıcı kaydedildi:', email);

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Doğrulama Kodu',
        html: `<p>Merhaba ${username},</p><p>Doğrulama kodunuz: <strong>${verificationCode}</strong></p><p>Bu kodu 10 dakika içinde doğrulayın.</p>`
      });
      console.log('E-posta gönderildi:', email);
    } catch (emailError) {
      console.error('E-posta gönderim hatası:', emailError);
      return res.status(500).json({ message: 'E-posta gönderilemedi.' });
    }

    res.status(200).json({ message: 'Kayıt başarılı! Doğrulama kodu e-postanıza gönderildi.' });
  } catch (error) {
    console.error('Kayıt hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});

// Doğrulama işlemi
app.post('/verify', async (req, res) => {
  console.log('Doğrulama isteği alındı:', req.body);
  const { email, code } = req.body;
  try {
    const user = await User.findOne({ email, verificationCode: code });
    if (!user) {
      console.log('Geçersiz kod veya e-posta:', email);
      return res.status(400).json({ message: 'Geçersiz kod veya e-posta.' });
    }

    user.isVerified = true;
    user.verificationCode = null;
    await user.save();
    console.log('Doğrulama başarılı:', email);

    res.status(200).json({ message: 'Doğrulama başarılı! Şimdi giriş yapabilirsiniz.' });
  } catch (error) {
    console.error('Doğrulama hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});

// Giriş işlemi ve konum loglama
app.post('/login', async (req, res) => {
  console.log('Giriş isteği alındı:', req.body);
  const { email, password, latitude, longitude, recaptchaResponse } = req.body;
  try {
    const recaptchaVerify = await axios.post(`https://www.google.com/recaptcha/api/siteverify`, null, {
      params: {
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: recaptchaResponse
      }
    });
    if (!recaptchaVerify.data.success) {
      console.log('reCAPTCHA doğrulama başarısız');
      return res.status(400).json({ message: 'reCAPTCHA doğrulama başarısız.' });
    }

    // Admin girişi
    if (email === 'admin' && password === 'admin') {
      console.log('Admin girişi başarılı');
      return res.status(200).json({ 
        message: 'Admin girişi başarılı!', 
        redirect: '/welcome.html', 
        isAdmin: true,
        username: 'Admin'
      });
    }

    // Normal kullanıcı girişi
    const user = await User.findOne({ email });
    if (!user || !user.isVerified) {
      console.log('Kullanıcı bulunamadı veya doğrulanmadı:', email);
      return res.status(400).json({ message: 'Kullanıcı bulunamadı veya e-posta doğrulanmadı.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Geçersiz şifre:', email);
      return res.status(400).json({ message: 'Geçersiz şifre.' });
    }

    let locationInfo = 'Konum bilgisi sağlanmadı';
    if (latitude && longitude) {
      locationInfo = `Konum: (${latitude}, ${longitude})`;
    } else {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      try {
        const response = await axios.get(`http://ip-api.com/json/${ip}`);
        const { city, region, country, lat, lon } = response.data;
        locationInfo = `Konum: ${city}, ${region}, ${country} (${lat}, ${lon})`;
      } catch (error) {
        console.error('IP konum hatası:', error);
      }
    }

    console.log(`Kullanıcı Girişi - Kullanıcı: ${user.username}, E-posta: ${user.email}, ${locationInfo}`);

    res.status(200).json({ 
      message: 'Giriş başarılı!', 
      redirect: '/welcome.html', 
      isAdmin: false,
      username: user.username
    });
  } catch (error) {
    console.error('Giriş hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});

// Şifre sıfırlama isteği
app.post('/forgot-password', async (req, res) => {
  console.log('Şifre sıfırlama isteği alındı:', req.body);
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log('Kullanıcı bulunamadı:', email);
      return res.status(400).json({ message: 'Kullanıcı bulunamadı.' });
    }

    const resetToken = Math.random().toString(36).slice(2);
    user.resetToken = resetToken;
    user.resetTokenExpiry = Date.now() + 3600000; // 1 saat
    await user.save();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Şifre Sıfırlama',
      html: `<p>Şifrenizi sıfırlamak için bu bağlantıya tıklayın:</p><a href="${process.env.APP_URL}/reset.html?token=${resetToken}">Şifreyi Sıfırla</a>`
    });

    console.log('Şifre sıfırlama e-postası gönderildi:', email);
    res.status(200).json({ message: 'Sıfırlama bağlantısı e-postanıza gönderildi.' });
  } catch (error) {
    console.error('Şifre sıfırlama hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});

// Şifre güncelleme
app.post('/reset-password', async (req, res) => {
  console.log('Şifre güncelleme isteği alındı:', req.body);
  const { token, newPassword } = req.body;
  try {
    const user = await User.findOne({ resetToken: token, resetTokenExpiry: { $gt: Date.now() } });
    if (!user) {
      console.log('Geçersiz veya süresi dolmuş token:', token);
      return res.status(400).json({ message: 'Geçersiz veya süresi dolmuş token.' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    console.log('Şifre güncellendi:', user.email);
    res.status(200).json({ message: 'Şifre başarıyla güncellendi.' });
  } catch (error) {
    console.error('Şifre güncelleme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});

// Profil bilgisi
app.get('/profile', async (req, res) => {
  console.log('Profil isteği alındı:', req.query);
  const { email } = req.query;
  try {
    if (email === 'admin') {
      return res.status(200).json({ username: 'Admin', email: 'admin' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      console.log('Kullanıcı bulunamadı:', email);
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }
    res.status(200).json({ username: user.username, email: user.email });
  } catch (error) {
    console.error('Profil hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});

// Not ekleme
app.post('/add-note', async (req, res) => {
  console.log('Not ekleme isteği alındı:', req.body);
  const { content, createdBy } = req.body;
  try {
    const note = new Note({ content, createdBy, likes: [] });
    await note.save();
    console.log('Not eklendi:', content);
    res.status(200).json({ message: 'Not başarıyla eklendi.' });
  } catch (error) {
    console.error('Not ekleme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});

// Not düzenleme
app.put('/edit-note/:id', async (req, res) => {
  console.log('Not düzenleme isteği alındı:', req.params.id, req.body);
  const { content, createdBy, isAdmin } = req.body;
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      console.log('Not bulunamadı:', req.params.id);
      return res.status(404).json({ message: 'Not bulunamadı.' });
    }
    if (!isAdmin && note.createdBy !== createdBy) {
      console.log('Yetkisiz düzenleme denemesi:', createdBy);
      return res.status(403).json({ message: 'Sadece not sahibi veya admin düzenleyebilir.' });
    }
    note.content = content;
    await note.save();
    console.log('Not güncellendi:', req.params.id);
    res.status(200).json({ message: 'Not başarıyla güncellendi.' });
  } catch (error) {
    console.error('Not düzenleme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});

// Notları getirme
app.get('/get-notes', async (req, res) => {
  console.log('Notlar isteniyor');
  try {
    const notes = await Note.find().sort({ createdAt: -1 });
    res.status(200).json(notes);
  } catch (error) {
    console.error('Not getirme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});

// Not silme (sadece admin)
app.delete('/delete-note/:id', async (req, res) => {
  console.log('Not silme isteği alındı:', req.params.id);
  const { isAdmin } = req.body;
  try {
    if (!isAdmin) {
      console.log('Yetkisiz silme denemesi');
      return res.status(403).json({ message: 'Sadece admin not silebilir.' });
    }
    await Note.findByIdAndDelete(req.params.id);
    await Comment.deleteMany({ noteId: req.params.id }); // İlgili yorumları sil
    console.log('Not ve yorumları silindi:', req.params.id);
    res.status(200).json({ message: 'Not başarıyla silindi.' });
  } catch (error) {
    console.error('Not silme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});

// Not beğenme
app.post('/like-note/:id', async (req, res) => {
  console.log('Not beğenme isteği alındı:', req.params.id, req.body);
  const { username } = req.body;
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      console.log('Not bulunamadı:', req.params.id);
      return res.status(404).json({ message: 'Not bulunamadı.' });
    }
    if (note.likes.includes(username)) {
      note.likes = note.likes.filter(user => user !== username);
      console.log('Beğeni kaldırıldı:', username);
    } else {
      note.likes.push(username);
      console.log('Beğeni eklendi:', username);
    }
    await note.save();
    res.status(200).json({ message: 'Beğeni güncellendi.', likes: note.likes.length });
  } catch (error) {
    console.error('Beğeni hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});

// Yorum ekleme
app.post('/add-comment', async (req, res) => {
  console.log('Yorum ekleme isteği alındı:', req.body);
  const { noteId, content, createdBy } = req.body;
  try {
    const comment = new Comment({ noteId, content, createdBy });
    await comment.save();
    console.log('Yorum eklendi:', content);
    res.status(200).json({ message: 'Yorum başarıyla eklendi.' });
  } catch (error) {
    console.error('Yorum ekleme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});

// Yorumları getirme
app.get('/get-comments/:noteId', async (req, res) => {
  console.log('Yorumlar isteniyor:', req.params.noteId);
  try {
    const comments = await Comment.find({ noteId: req.params.noteId }).sort({ createdAt: -1 });
    res.status(200).json(comments);
  } catch (error) {
    console.error('Yorum getirme hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor`));