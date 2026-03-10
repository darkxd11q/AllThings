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

const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE,"utf8")); }
  catch(e){ console.error("Okuma hatası:", e.message); }
  return {};
}
function saveData(data) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data,null,2),"utf8"); return true; }
  catch(e){ console.error("Yazma hatası:", e.message); return false; }
}

// Kaydet
app.post("/api/save", (req,res) => {
  const {key="default",data} = req.body;
  if(!data) return res.status(400).json({ok:false,error:"Veri boş."});
  const all = loadData();
  all[key] = {...data, savedAt: new Date().toISOString()};
  if(saveData(all)){
    console.log(`Kaydedildi: "${key}"`);
    res.json({ok:true, savedAt:all[key].savedAt});
  } else {
    res.status(500).json({ok:false,error:"Dosyaya yazılamadı."});
  }
});

// Yükle
app.get("/api/load", (req,res) => {
  const key = req.query.key||"default";
  const all = loadData();
  if(all[key]){ console.log(`Yüklendi: "${key}"`); res.json({ok:true,data:all[key]}); }
  else res.json({ok:false,data:null});
});

// Liste
app.get("/api/list", (req,res) => {
  const all = loadData();
  res.json({ok:true, keys: Object.keys(all).map(k=>({key:k,title:all[k].title||k,savedAt:all[k].savedAt}))});
});

// Sil
app.delete("/api/delete/:key", (req,res) => {
  const {key} = req.params;
  const all = loadData();
  if(!all[key]) return res.status(404).json({ok:false,error:"Kayıt bulunamadı."});
  delete all[key]; saveData(all);
  res.json({ok:true});
});

// AI — Google Gemini (UCRETSIZ)
app.post("/api/ai", async (req,res) => {
  const {message, schedule, subjects} = req.body;

  if(!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ok:false, error:"GEMINI_API_KEY eksik! .env dosyasına ekle. Ücretsiz anahtar: https://aistudio.google.com"});
  }
  if(!message) return res.status(400).json({ok:false,error:"Mesaj boş."});

  const weeklyHours = (subjects||[]).map(s => {
    const cnt = Object.values(schedule||{}).reduce((a,d)=>a+Object.values(d||{}).filter(c=>c===s.id).length,0);
    return cnt>0 ? `${s.name}: ${cnt} saat` : null;
  }).filter(Boolean).join(", ");

  const systemContext = `Sen bir ders çalışma programı asistanısın. Öğrencinin haftalık programı: ${weeklyHours||"henüz boş"}. Türkçe, kısa ve motive edici cevap ver. Öğrenciye "sen" diye hitap et.`;

  const URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  try {
    const response = await fetch(URL, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        system_instruction: { parts:[{text:systemContext}] },
        contents: [{role:"user", parts:[{text:message}]}],
        generationConfig: { maxOutputTokens:600, temperature:0.8 }
      })
    });

    const data = await response.json();

    if(data.error) {
      console.error("Gemini hatası:", data.error);
      return res.status(400).json({ok:false, error:"Gemini: " + data.error.message});
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if(!reply) return res.status(500).json({ok:false,error:"Gemini boş cevap verdi."});

    console.log(`Gemini cevap: ${reply.length} karakter`);
    res.json({ok:true, reply});

  } catch(err) {
    console.error("AI istek hatası:", err.message);
    res.status(500).json({ok:false, error:"Bağlantı hatası: "+err.message});
  }
});

app.get("*", (req,res) => {
  res.sendFile(path.join(__dirname,"public","index.html"));
});

app.listen(PORT, () => {
  console.log("");
  console.log("╔════════════════════════════════════════╗");
  console.log("║  📚 Ders Programı Sunucu Başladı!      ║");
  console.log(`║  👉  http://localhost:${PORT}             ║`);
  console.log("╚════════════════════════════════════════╝");
  if(!process.env.GEMINI_API_KEY){
    console.warn("\n⚠️  GEMINI_API_KEY yok — AI çalışmaz");
    console.warn("   Ücretsiz anahtar: https://aistudio.google.com\n");
  } else {
    console.log("\n✅ Gemini AI aktif! (gemini-2.0-flash, ücretsiz)\n");
  }
});
