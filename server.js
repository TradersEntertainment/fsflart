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
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
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
const VISITORS_FILE = path.join(DATA_DIR, 'visitors.json');

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

const submissionUpload = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 },
]);

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

// ─── Settings Helpers ───────────────────────────────
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const BUNDLED_SETTINGS = path.join(__dirname, 'data', 'settings.json');

// Seed settings to volume on first deploy
if (!fs.existsSync(SETTINGS_FILE) && fs.existsSync(BUNDLED_SETTINGS)) {
  fs.copyFileSync(BUNDLED_SETTINGS, SETTINGS_FILE);
  console.log('⚙️  Sergi ayarları volume\'a kopyalandı.');
}

function readSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE) && fs.existsSync(BUNDLED_SETTINGS)) {
      return JSON.parse(fs.readFileSync(BUNDLED_SETTINGS, 'utf-8'));
    }
    if (!fs.existsSync(SETTINGS_FILE)) return {};
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeSettings(data) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── Submissions Helpers ────────────────────────────
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');

function readSubmissions() {
  try {
    if (!fs.existsSync(SUBMISSIONS_FILE)) return [];
    return JSON.parse(fs.readFileSync(SUBMISSIONS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeSubmissions(data) {
  fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getNextSubmissionId(subs) {
  if (subs.length === 0) return 1;
  return Math.max(...subs.map((s) => s.id)) + 1;
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

// ─── Settings API ───────────────────────────────────

// Get settings (public)
app.get('/api/settings', (req, res) => {
  const settings = readSettings();
  res.json(settings);
});

// Update settings (admin)
app.put('/api/settings', authMiddleware, (req, res) => {
  try {
    const current = readSettings();
    const updated = { ...current, ...req.body };
    writeSettings(updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Ayarlar güncellenirken hata: ' + err.message });
  }
});

// ─── Artworks API ───────────────────────────────────

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
app.post('/api/artworks', authMiddleware, submissionUpload, (req, res) => {
  try {
    const artworks = readArtworks();
    const files = req.files || {};
    const newArtwork = {
      id: getNextId(artworks),
      title: req.body.title || 'İsimsiz Eser',
      artist: req.body.artist || 'Bilinmeyen',
      grade: req.body.grade || '',
      technique: req.body.technique || 'yagliboya',
      techniqueLabel: req.body.techniqueLabel || 'Yağlı Boya',
      dimensions: req.body.dimensions || '',
      year: req.body.year || new Date().getFullYear().toString(),
      image: files.image?.[0] ? `images/${files.image[0].filename}` : 'images/placeholder.png',
      image2: files.image2?.[0] ? `images/${files.image2[0].filename}` : '',
      image3: files.image3?.[0] ? `images/${files.image3[0].filename}` : '',
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
app.put('/api/artworks/:id', authMiddleware, submissionUpload, (req, res) => {
  try {
    const artworks = readArtworks();
    const index = artworks.findIndex((a) => a.id === parseInt(req.params.id));
    if (index === -1) return res.status(404).json({ error: 'Eser bulunamadı' });

    const existing = artworks[index];
    const files = req.files || {};

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
    };

    if (files.image?.[0]) artworks[index].image = `images/${files.image[0].filename}`;
    if (files.image2?.[0]) artworks[index].image2 = `images/${files.image2[0].filename}`;
    if (files.image3?.[0]) artworks[index].image3 = `images/${files.image3[0].filename}`;

    writeArtworks(artworks);
    res.json(artworks[index]);
  } catch (err) {
    res.status(500).json({ error: 'Güncellenirken hata oluştu: ' + err.message });
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

// ─── Submissions API ────────────────────────────────

// Submit artwork application (public — no auth required)

app.post('/api/submissions', submissionUpload, (req, res) => {
  try {
    const subs = readSubmissions();
    const files = req.files || {};
    const newSub = {
      id: getNextSubmissionId(subs),
      title: req.body.title || 'İsimsiz Eser',
      artist: req.body.artist || 'Bilinmeyen',
      grade: req.body.grade || '',
      technique: req.body.technique || 'yagliboya',
      techniqueLabel: req.body.techniqueLabel || 'Yağlı Boya',
      dimensions: req.body.dimensions || '',
      description: req.body.description || '',
      image: files.image?.[0] ? `images/${files.image[0].filename}` : '',
      image2: files.image2?.[0] ? `images/${files.image2[0].filename}` : '',
      image3: files.image3?.[0] ? `images/${files.image3[0].filename}` : '',
      submittedAt: new Date().toISOString(),
      status: 'pending',
    };
    subs.push(newSub);
    writeSubmissions(subs);
    res.status(201).json({ success: true, submission: newSub });
  } catch (err) {
    res.status(500).json({ error: 'Başvuru gönderilirken hata: ' + err.message });
  }
});

// Get all submissions (admin)
app.get('/api/submissions', authMiddleware, (req, res) => {
  const subs = readSubmissions();
  res.json(subs);
});

// Delete / reject submission (admin)
app.delete('/api/submissions/:id', authMiddleware, (req, res) => {
  try {
    let subs = readSubmissions();
    const index = subs.findIndex((s) => s.id === parseInt(req.params.id));
    if (index === -1) return res.status(404).json({ error: 'Başvuru bulunamadı' });

    const removed = subs.splice(index, 1)[0];
    writeSubmissions(subs);
    res.json({ success: true, deleted: removed });
  } catch (err) {
    res.status(500).json({ error: 'Silme hatası: ' + err.message });
  }
});

// Approve submission → add to artworks gallery (admin)
app.post('/api/submissions/:id/approve', authMiddleware, (req, res) => {
  try {
    let subs = readSubmissions();
    const index = subs.findIndex((s) => s.id === parseInt(req.params.id));
    if (index === -1) return res.status(404).json({ error: 'Başvuru bulunamadı' });

    const sub = subs[index];
    const artworks = readArtworks();

    // Move to artworks
    const newArtwork = {
      id: getNextId(artworks),
      title: sub.title,
      artist: sub.artist,
      grade: sub.grade,
      technique: sub.technique,
      techniqueLabel: sub.techniqueLabel,
      dimensions: sub.dimensions,
      year: new Date().getFullYear().toString(),
      image: sub.image,
      description: sub.description,
    };
    artworks.push(newArtwork);
    writeArtworks(artworks);

    // Remove from submissions
    subs.splice(index, 1);
    writeSubmissions(subs);

    res.json({ success: true, artwork: newArtwork });
  } catch (err) {
    res.status(500).json({ error: 'Onaylama hatası: ' + err.message });
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

// ─── Visitors Data ───────────────────────────────
function readVisitors() {
  try { return JSON.parse(fs.readFileSync(VISITORS_FILE, 'utf-8')); }
  catch { return []; }
}
function writeVisitors(v) {
  fs.writeFileSync(VISITORS_FILE, JSON.stringify(v, null, 2));
}

// ─── Visitors API (admin) ───────────────────────
app.get('/api/visitors', authMiddleware, (req, res) => {
  const visitors = readVisitors();
  const dateFilter = req.query.date || new Date().toISOString().split('T')[0];
  const filtered = visitors.filter((v) => v.joinedAt && v.joinedAt.startsWith(dateFilter));
  // Also include currently online players
  const online = [];
  players.forEach((p) => online.push({ name: p.name, color: p.color, online: true }));
  res.json({ date: dateFilter, visitors: filtered, online, onlineCount: players.size });
});

// ─── Socket.IO — Multiplayer Gallery ────────────────
const galleryNsp = io.of('/gallery');
const players = new Map();

const AVATAR_COLORS = [
  '#c9a96e', '#6ec9a9', '#a96ec9', '#c96e6e',
  '#6e8fc9', '#c9c16e', '#6ec9c9', '#c96eaa',
];

galleryNsp.on('connection', (socket) => {
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  const joinedAt = new Date().toISOString();
  const playerData = {
    id: socket.id,
    name: 'Ziyaretçi',
    color,
    position: { x: 0, y: 1.65, z: 15 },
    rotation: { x: 0, y: 0 },
  };

  // Send existing players to the new player
  const existingPlayers = [];
  players.forEach((p) => existingPlayers.push(p));
  socket.emit('init', { id: socket.id, players: existingPlayers, color });

  // Set name
  socket.on('set-name', (name) => {
    playerData.name = (name || 'Ziyaretçi').substring(0, 20);
    players.set(socket.id, playerData);
    // Log visitor
    const visitors = readVisitors();
    visitors.push({
      name: playerData.name,
      color: playerData.color,
      joinedAt,
      leftAt: null,
    });
    writeVisitors(visitors);
    // Broadcast new player joined
    socket.broadcast.emit('player-joined', playerData);
  });

  // Position update
  socket.on('move', (data) => {
    if (!players.has(socket.id)) return;
    playerData.position = data.position;
    playerData.rotation = data.rotation;
    players.set(socket.id, playerData);
    socket.broadcast.emit('player-moved', {
      id: socket.id,
      position: data.position,
      rotation: data.rotation,
    });
  });

  // Disconnect
  socket.on('disconnect', () => {
    players.delete(socket.id);
    galleryNsp.emit('player-left', socket.id);
    // Update visitor leftAt
    const visitors = readVisitors();
    for (let i = visitors.length - 1; i >= 0; i--) {
      if (visitors[i].joinedAt === joinedAt && visitors[i].name === playerData.name && !visitors[i].leftAt) {
        visitors[i].leftAt = new Date().toISOString();
        break;
      }
    }
    writeVisitors(visitors);
  });
});

// ─── Start ────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🎨 Fırça İzleri Sergisi`);
  console.log(`   Sunucu çalışıyor: http://localhost:${PORT}`);
  console.log(`   Admin paneli:     http://localhost:${PORT}/admin.html`);
  console.log(`   3D Sanal Tur:     http://localhost:${PORT}/3d.html`);
  console.log(`   API:              http://localhost:${PORT}/api/artworks\n`);
});
