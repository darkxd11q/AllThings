# 📚 Ders Çalışma Programı

Tamamen ücretsiz HuggingFace AI destekli ders çalışma programı.

## 🤖 Kullanılan AI Modeller

| Öncelik | Model |
|---|---|
| 1. (Ana) | Qwen/Qwen2.5-7B-Instruct |
| 2. (Yedek) | meta-llama/Llama-3.1-8B-Instruct |

Birinci model kota dolunca veya hata verince otomatik ikinciye geçer.

---

## 🔑 Ücretsiz API Anahtarı (2 dakika)

1. https://huggingface.co — hesap aç
2. https://huggingface.co/settings/tokens — "New token"
3. "Read" yetkisi seç → oluştur → kopyala

---

## 🚀 Kurulum

npm install
cp .env.example .env
# .env dosyasını aç → HF_API_KEY=hf_... satırını doldur
node server.js
# http://localhost:3000

---

## Dosyalar

ders-programi/
├── server.js        ← Express + HuggingFace AI (Qwen → Llama fallback)
├── package.json
├── .env.example
├── data.json        ← Kayıtlı programlar (otomatik oluşur)
└── public/
    └── index.html
