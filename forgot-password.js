app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
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
      html: `<p>Şifrenizi sıfırlamak için bu bağlantıya tıklayın:</p><a href="https://your-app.onrender.com/reset.html?token=${resetToken}">Şifreyi Sıfırla</a>`
    });

    res.status(200).json({ message: 'Sıfırlama bağlantısı e-postanıza gönderildi.' });
  } catch (error) {
    console.error('Şifre sıfırlama hatası:', error);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});