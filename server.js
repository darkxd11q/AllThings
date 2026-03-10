require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const fetch   = require("node-fetch");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ── HuggingFace Model Listesi (öncelik sırasıyla) ──────────────────────────
const HF_MODELS = [
  "Qwen/Qwen2.5-7B-Instruct",           // 1. öncelik
  "meta-llama/Llama-3.1-8B-Instruct",   // 2. öncelik (fallback)
];

const HF_BASE = "https://api-inference.huggingface.co/models";

// ── Veri Depolama ──────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE))
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) { console.error("Okuma hatası:", e.message); }
  return {};
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (e) { console.error("Yazma hatası:", e.message); return false; }
}

// ── API: Kaydet ────────────────────────────────────────────────────────────
app.post("/api/save", (req, res) => {
  const { key = "default", data } = req.body;
  if (!data) return res.status(400).json({ ok: false, error: "Veri boş." });
  const all = loadData();
  all[key] = { ...data, savedAt: new Date().toISOString() };
  if (saveData(all)) {
    console.log(`✅ Kaydedildi: "${key}"`);
    res.json({ ok: true, savedAt: all[key].savedAt });
  } else {
    res.status(500).json({ ok: false, error: "Dosyaya yazılamadı." });
  }
});

// ── API: Yükle ─────────────────────────────────────────────────────────────
app.get("/api/load", (req, res) => {
  const key = req.query.key || "default";
  const all = loadData();
  if (all[key]) {
    console.log(`📂 Yüklendi: "${key}"`);
    res.json({ ok: true, data: all[key] });
  } else {
    res.json({ ok: false, data: null });
  }
});

// ── API: Liste ─────────────────────────────────────────────────────────────
app.get("/api/list", (req, res) => {
  const all = loadData();
  res.json({
    ok: true,
    keys: Object.keys(all).map(k => ({
      key: k,
      title: all[k].title || k,
      savedAt: all[k].savedAt,
    })),
  });
});

// ── API: Sil ───────────────────────────────────────────────────────────────
app.delete("/api/delete/:key", (req, res) => {
  const { key } = req.params;
  const all = loadData();
  if (!all[key]) return res.status(404).json({ ok: false, error: "Kayıt bulunamadı." });
  delete all[key];
  saveData(all);
  console.log(`🗑️  Silindi: "${key}"`);
  res.json({ ok: true });
});

// ── HuggingFace'e tek model için istek ────────────────────────────────────
async function callHFModel(modelId, prompt, apiKey) {
  const url = `${HF_BASE}/${modelId}/v1/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: "system",
          content: prompt.system,
        },
        {
          role: "user",
          content: prompt.user,
        },
      ],
      max_tokens: 600,
      temperature: 0.8,
      stream: false,
    }),
  });

  const data = await response.json();

  // Kota / model yükleniyor / sunucu hatası kontrolü
  if (!response.ok || data.error) {
    const errMsg = data.error?.message || data.error || `HTTP ${response.status}`;
    const isQuotaOrLoading =
      response.status === 429 ||   // Too Many Requests
      response.status === 503 ||   // Model loading / unavailable
      response.status === 402 ||   // Payment required (kota)
      (typeof errMsg === "string" && (
        errMsg.toLowerCase().includes("loading") ||
        errMsg.toLowerCase().includes("quota") ||
        errMsg.toLowerCase().includes("rate limit") ||
        errMsg.toLowerCase().includes("overloaded")
      ));

    throw { quota: isQuotaOrLoading, message: errMsg, status: response.status };
  }

  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw { quota: false, message: "Model boş cevap verdi." };
  return reply;
}

// ── API: AI Asistan — HuggingFace (Qwen → Llama fallback) ─────────────────
app.post("/api/ai", async (req, res) => {
  const { message, schedule, subjects } = req.body;

  if (!process.env.HF_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "HF_API_KEY eksik! .env dosyasına ekle. Ücretsiz anahtar: https://huggingface.co/settings/tokens",
    });
  }

  if (!message) return res.status(400).json({ ok: false, error: "Mesaj boş." });

  // Haftalık özet
  const weeklyHours = (subjects || [])
    .map(s => {
      const cnt = Object.values(schedule || {}).reduce(
        (a, d) => a + Object.values(d || {}).filter(c => c === s.id).length,
        0
      );
      return cnt > 0 ? `${s.name}: ${cnt} saat` : null;
    })
    .filter(Boolean)
    .join(", ");

  const prompt = {
    system: `Sen bir ders çalışma programı asistanısın. Öğrencinin haftalık programı: ${weeklyHours || "henüz boş program"}. Türkçe konuş, kısa ve motive edici cevap ver. Öğrenciye "sen" diye hitap et. Maksimum 3-4 cümle yaz.`,
    user: message,
  };

  // ── Sırayla modelleri dene ──────────────────────────────────────────────
  let lastError = null;

  for (let i = 0; i < HF_MODELS.length; i++) {
    const modelId = HF_MODELS[i];
    const isFirst = i === 0;

    try {
      console.log(`🤖 Deneniyor: ${modelId}`);
      const reply = await callHFModel(modelId, prompt, process.env.HF_API_KEY);
      console.log(`✅ Cevap alındı (${modelId}) — ${reply.length} karakter`);

      return res.json({
        ok: true,
        reply,
        model: modelId,           // hangi model cevap verdi
        fallback: !isFirst,       // fallback kullanıldı mı
      });

    } catch (err) {
      console.warn(`⚠️  ${modelId} başarısız: ${err.message}`);
      lastError = err;

      // Kota/yükleme hatası → sonraki modele geç
      if (err.quota) {
        console.log("   → Kota/yükleme hatası, fallback modele geçiliyor...");
        continue;
      }

      // Geçersiz API anahtarı → döngüyü kır, diğer modeli deneme
      if (err.status === 401 || err.status === 403) {
        console.error("   → API anahtarı geçersiz veya yetkisiz.");
        return res.status(401).json({
          ok: false,
          error: "HuggingFace API anahtarı geçersiz. https://huggingface.co/settings/tokens adresinden kontrol et.",
        });
      }

      // Diğer hatalar → yine de sonraki modeli dene
      continue;
    }
  }

  // Tüm modeller başarısız
  console.error("❌ Tüm modeller başarısız:", lastError);
  return res.status(503).json({
    ok: false,
    error: "Tüm AI modelleri şu an kullanılamıyor. Biraz bekleyip tekrar dene.",
    detail: lastError?.message,
  });
});

// ── Ana Sayfa ──────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Başlat ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("");
  console.log("╔════════════════════════════════════════════════╗");
  console.log("║   📚 Ders Programı Sunucu Başladı!             ║");
  console.log(`║   👉  http://localhost:${PORT}                   ║`);
  console.log("╚════════════════════════════════════════════════╝");
  console.log("");
  console.log("🤖 AI Modeller (öncelik sırasıyla):");
  HF_MODELS.forEach((m, i) => console.log(`   ${i + 1}. ${m}`));
  console.log("");

  if (!process.env.HF_API_KEY) {
    console.warn("⚠️  HF_API_KEY ayarlanmamış — AI çalışmaz!");
    console.warn("   Ücretsiz anahtar: https://huggingface.co/settings/tokens\n");
  } else {
    console.log("✅ HuggingFace API anahtarı bulundu — AI aktif!\n");
  }
});
