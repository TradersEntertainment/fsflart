/* ===================================================
   FIRÇA İZLERİ — Express Server
   Fuat Sezgin Fen Lisesi Resim Sergisi
   =================================================== */

const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'firca-izleri-secret-key-2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'sergi2026';

// ─── Paths (Railway Volume Support) ─────────────────
// Railway'de volume mount path'i varsa, veri ve yüklenen
// görseller kalıcı volume'a yazılır.
const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || null;

const DATA_DIR = VOLUME_PATH
  ? path.join(VOLUME_PATH, 'data')
  : path.join(__dirname, 'data');

const UPLOADS_DIR = VOLUME_PATH
  ? path.join(VOLUME_PATH, 'images')
  : path.join(__dirname, 'public', 'images');

const ARTWORKS_FILE = path.join(DATA_DIR, 'artworks.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Seed: If artworks.json doesn't exist in volume, copy from bundled data
const BUNDLED_ARTWORKS = path.join(__dirname, 'data', 'artworks.json');
if (!fs.existsSync(ARTWORKS_FILE) && fs.existsSync(BUNDLED_ARTWORKS) && VOLUME_PATH) {
  fs.copyFileSync(BUNDLED_ARTWORKS, ARTWORKS_FILE);
  console.log('📋 Mevcut eser verileri volume\'a kopyalandı.');
}

// Seed: Copy bundled images to volume on first deploy
if (VOLUME_PATH) {
  const bundledImages = path.join(__dirname, 'public', 'images');
  if (fs.existsSync(bundledImages)) {
    const files = fs.readdirSync(bundledImages);
    files.forEach((file) => {
      const dest = path.join(UPLOADS_DIR, file);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(bundledImages, file), dest);
      }
    });
    if (files.length > 0) console.log(`🖼️  ${files.length} görsel volume'a kopyalandı.`);
  }
}

// ─── Middleware ─────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// Serve uploaded/volume images at /images path (before static)
app.use('/images', express.static(UPLOADS_DIR));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// ─── Multer Config ──────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `eser_${Date.now()}${ext}`;
    cb(null, safeName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /\.(jpg|jpeg|png|webp|gif)$/i;
  if (allowed.test(path.extname(file.originalname))) {
    cb(null, true);
  } else {
    cb(new Error('Sadece resim dosyaları yüklenebilir (jpg, png, webp, gif)'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ─── Data Helpers ───────────────────────────────────
function readArtworks() {
  try {
    if (!fs.existsSync(ARTWORKS_FILE)) return [];
    const raw = fs.readFileSync(ARTWORKS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeArtworks(data) {
  fs.writeFileSync(ARTWORKS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getNextId(artworks) {
  if (artworks.length === 0) return 1;
  return Math.max(...artworks.map((a) => a.id)) + 1;
}

// ─── Auth Middleware ────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Yetkilendirme gerekli' });

  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş oturum' });
  }
}

// ─── API Routes ─────────────────────────────────────

// Login
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24h
      sameSite: 'lax',
    });
    return res.json({ success: true, token });
  }
  return res.status(401).json({ error: 'Yanlış şifre' });
});

// Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// Check auth status
app.get('/api/auth-check', authMiddleware, (req, res) => {
  res.json({ authenticated: true });
});

// Get all artworks (public)
app.get('/api/artworks', (req, res) => {
  const artworks = readArtworks();
  res.json(artworks);
});

// Get single artwork (public)
app.get('/api/artworks/:id', (req, res) => {
  const artworks = readArtworks();
  const artwork = artworks.find((a) => a.id === parseInt(req.params.id));
  if (!artwork) return res.status(404).json({ error: 'Eser bulunamadı' });
  res.json(artwork);
});

// Create artwork (admin)
app.post('/api/artworks', authMiddleware, upload.single('image'), (req, res) => {
  try {
    const artworks = readArtworks();
    const newArtwork = {
      id: getNextId(artworks),
      title: req.body.title || 'İsimsiz Eser',
      artist: req.body.artist || 'Bilinmeyen',
      grade: req.body.grade || '',
      technique: req.body.technique || 'yagliboya',
      techniqueLabel: req.body.techniqueLabel || 'Yağlı Boya',
      dimensions: req.body.dimensions || '',
      year: req.body.year || new Date().getFullYear().toString(),
      image: req.file ? `images/${req.file.filename}` : 'images/placeholder.png',
      description: req.body.description || '',
    };
    artworks.push(newArtwork);
    writeArtworks(artworks);
    res.status(201).json(newArtwork);
  } catch (err) {
    res.status(500).json({ error: 'Eser eklenirken hata oluştu: ' + err.message });
  }
});

// Update artwork (admin)
app.put('/api/artworks/:id', authMiddleware, upload.single('image'), (req, res) => {
  try {
    const artworks = readArtworks();
    const index = artworks.findIndex((a) => a.id === parseInt(req.params.id));
    if (index === -1) return res.status(404).json({ error: 'Eser bulunamadı' });

    const existing = artworks[index];

    artworks[index] = {
      ...existing,
      title: req.body.title || existing.title,
      artist: req.body.artist || existing.artist,
      grade: req.body.grade || existing.grade,
      technique: req.body.technique || existing.technique,
      techniqueLabel: req.body.techniqueLabel || existing.techniqueLabel,
      dimensions: req.body.dimensions || existing.dimensions,
      year: req.body.year || existing.year,
      description: req.body.description || existing.description,
      image: req.file ? `images/${req.file.filename}` : existing.image,
    };

    writeArtworks(artworks);
    res.json(artworks[index]);
  } catch (err) {
    res.status(500).json({ error: 'Güncelleme hatası: ' + err.message });
  }
});

// Delete artwork (admin)
app.delete('/api/artworks/:id', authMiddleware, (req, res) => {
  try {
    let artworks = readArtworks();
    const index = artworks.findIndex((a) => a.id === parseInt(req.params.id));
    if (index === -1) return res.status(404).json({ error: 'Eser bulunamadı' });

    const removed = artworks.splice(index, 1)[0];

    // Delete image file if it's an uploaded one (starts with "eser_")
    if (removed.image && path.basename(removed.image).startsWith('eser_')) {
      const imgPath = path.join(__dirname, 'public', removed.image);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }

    writeArtworks(artworks);
    res.json({ success: true, deleted: removed });
  } catch (err) {
    res.status(500).json({ error: 'Silme hatası: ' + err.message });
  }
});

// ─── Fallback ───────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error Handler ──────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Dosya boyutu 10MB\'dan büyük olamaz' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(500).json({ error: err.message });
  }
  next();
});

// ─── Start ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎨 Fırça İzleri Sergisi`);
  console.log(`   Sunucu çalışıyor: http://localhost:${PORT}`);
  console.log(`   Admin paneli:     http://localhost:${PORT}/admin.html`);
  console.log(`   API:              http://localhost:${PORT}/api/artworks\n`);
});
