# 📚 Ders Çalışma Programı (Gemini AI — Ücretsiz)

---

## 🔑 Ücretsiz API Anahtarı Nasıl Alınır?

1. https://aistudio.google.com adresine git
2. Google hesabınla giriş yap
3. "Get API Key" → "Create API key"
4. Anahtarı kopyala, .env dosyasına yapıştır

✅ Kredi kartı YOK  
✅ Günlük 1500 istek ücretsiz  
✅ gemini-2.0-flash — hızlı ve akıllı

---

## 🚀 Kurulum

npm install
cp .env.example .env
# .env dosyasını aç, GEMINI_API_KEY=AIzaSy... satırını doldur
node server.js
# http://localhost:3000

---

## Dosya Yapısı

ders-programi/
├── server.js        ← Express + Gemini AI
├── package.json
├── .env.example     ← API anahtar şablonu
├── .env             ← Kendi anahtarın (git'e ekleme!)
├── data.json        ← Kayıtlı programlar (otomatik oluşur)
└── public/
    └── index.html   ← Tüm frontend
