function showSection(sectionId) {
  const sections = document.querySelectorAll('#registerSection, #verifySection, #loginSection, #forgotPasswordSection');
  sections.forEach(section => {
    section.classList.add('hidden');
    section.classList.remove('opacity-100');
  });
  const targetSection = document.getElementById(sectionId);
  targetSection.classList.remove('hidden');
  setTimeout(() => targetSection.classList.add('opacity-100'), 10);
  document.getElementById('message').textContent = '';
}

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const message = document.getElementById('message');
  const buttonText = document.getElementById('registerButtonText');
  const spinner = document.getElementById('registerSpinner');

  if (username.length < 3) {
    message.textContent = 'Kullanıcı adı en az 3 karakter olmalı.';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    message.textContent = 'Geçerli bir e-posta girin.';
    return;
  }
  if (password.length < 6) {
    message.textContent = 'Şifre en az 6 karakter olmalı.';
    return;
  }

  const recaptchaResponse = grecaptcha.getResponse();
  if (!recaptchaResponse) {
    message.textContent = 'Lütfen reCAPTCHA\'yı tamamlayın.';
    return;
  }

  buttonText.classList.add('hidden');
  spinner.classList.remove('hidden');

  try {
    const response = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, recaptchaResponse })
    });
    const data = await response.json();
    console.log('Kayıt yanıtı:', data);
    message.textContent = data.message;
    if (response.ok) {
      showSection('verifySection');
      document.getElementById('verifyEmail').value = email;
      gtag('event', 'sign_up', { method: 'email' }); // Analytics
    }
  } catch (error) {
    console.error('Kayıt frontend hatası:', error);
    message.textContent = 'Bir hata oluştu.';
  } finally {
    buttonText.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
});

document.getElementById('verifyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('verifyEmail').value;
  const code = document.getElementById('code').value;
  const message = document.getElementById('message');
  const buttonText = document.getElementById('verifyButtonText');
  const spinner = document.getElementById('verifySpinner');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    message.textContent = 'Geçerli bir e-posta girin.';
    return;
  }
  if (!/^\d{6}$/.test(code)) {
    message.textContent = 'Doğrulama kodu 6 rakam olmalı.';
    return;
  }

  buttonText.classList.add('hidden');
  spinner.classList.remove('hidden');

  try {
    const response = await fetch('/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    const data = await response.json();
    console.log('Doğrulama yanıtı:', data);
    message.textContent = data.message;
    if (response.ok) {
      showSection('loginSection');
    }
  } catch (error) {
    console.error('Doğrulama frontend hatası:', error);
    message.textContent = 'Bir hata oluştu.';
  } finally {
    buttonText.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const message = document.getElementById('message');
  const buttonText = document.getElementById('loginButtonText');
  const spinner = document.getElementById('loginSpinner');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email !== 'admin') {
    message.textContent = 'Geçerli bir e-posta girin.';
    return;
  }
  if (password.length < 6 && password !== 'admin') {
    message.textContent = 'Şifre en az 6 karakter olmalı.';
    return;
  }

  const recaptchaResponse = grecaptcha.getResponse();
  if (!recaptchaResponse) {
    message.textContent = 'Lütfen reCAPTCHA\'yı tamamlayın.';
    return;
  }

  buttonText.classList.add('hidden');
  spinner.classList.remove('hidden');

  let latitude = null;
  let longitude = null;
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 });
    });
    latitude = position.coords.latitude;
    longitude = position.coords.longitude;
    console.log('Konum alındı:', { latitude, longitude });
  } catch (error) {
    console.log('Konum alınamadı, IP yedeği kullanılacak:', error);
  }

  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, latitude, longitude, recaptchaResponse })
    });
    const data = await response.json();
    console.log('Giriş yanıtı:', data);
    message.textContent = data.message;
    if (data.redirect) {
      localStorage.setItem('lastEmail', email);
      localStorage.setItem('isAdmin', data.isAdmin);
      localStorage.setItem('username', data.username);
      window.location.href = data.redirect;
      gtag('event', 'login', { method: email === 'admin' ? 'admin' : 'email' }); // Analytics
    }
  } catch (error) {
    console.error('Giriş frontend hatası:', error);
    message.textContent = 'Bir hata oluştu.';
  } finally {
    buttonText.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
});

document.getElementById('forgotPasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('forgotEmail').value;
  const message = document.getElementById('message');
  const buttonText = document.getElementById('forgotButtonText');
  const spinner = document.getElementById('forgotSpinner');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    message.textContent = 'Geçerli bir e-posta girin.';
    return;
  }

  buttonText.classList.add('hidden');
  spinner.classList.remove('hidden');

  try {
    const response = await fetch('/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    console.log('Şifre sıfırlama yanıtı:', data);
    message.textContent = data.message;
  } catch (error) {
    console.error('Şifre sıfırlama frontend hatası:', error);
    message.textContent = 'Bir hata oluştu.';
  } finally {
    buttonText.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
});