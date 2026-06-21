/* ===================================================
   RESIM SERGİSİ — ART EXHIBITION
   Application Logic (API-Driven)
   =================================================== */

// ─── Artwork Data (loaded from API) ─────────────────
let artworks = [];

// ─── DOM Elements ───────────────────────────────────
const galleryGrid = document.getElementById('gallery-grid');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxTitle = document.getElementById('lightbox-title');
const lightboxArtist = document.getElementById('lightbox-artist');
const lightboxOverline = document.getElementById('lightbox-overline');
const lightboxSpecs = document.getElementById('lightbox-specs');
const lightboxDescription = document.getElementById('lightbox-description');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxBackdrop = document.getElementById('lightbox-backdrop');
const lightboxPrev = document.getElementById('lightbox-prev');
const lightboxNext = document.getElementById('lightbox-next');
const menuToggle = document.getElementById('menu-toggle');
const headerNav = document.getElementById('header-nav');
const siteHeader = document.getElementById('site-header');
const filterBtns = document.querySelectorAll('.filter-btn');

let currentArtworkIndex = 0;
let filteredArtworks = [];

// ─── Gallery Rendering ──────────────────────────────
function createGalleryCard(artwork, index) {
  const card = document.createElement('article');
  card.className = 'gallery-card reveal';
  card.dataset.technique = artwork.technique;
  card.dataset.index = index;
  card.style.transitionDelay = `${(index % 4) * 80}ms`;

  card.innerHTML = `
    <div class="gallery-card-image">
      <img src="${artwork.image}" alt="${artwork.title} — ${artwork.artist}" loading="lazy">
      <div class="gallery-card-overlay">
        <div class="gallery-card-zoom">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </div>
      </div>
    </div>
    <div class="gallery-card-info">
      <h3 class="gallery-card-title">${artwork.title}</h3>
      <p class="gallery-card-artist">${artwork.artist} · ${artwork.grade}</p>
      <div class="gallery-card-meta">
        <span class="gallery-card-technique">${artwork.techniqueLabel}</span>
        <span class="gallery-card-dimensions">${artwork.dimensions}</span>
      </div>
    </div>
  `;

  card.addEventListener('click', () => openLightbox(artwork.id));
  return card;
}

function renderGallery(artworksToRender) {
  galleryGrid.innerHTML = '';
  artworksToRender.forEach((artwork, index) => {
    galleryGrid.appendChild(createGalleryCard(artwork, index));
  });
  // Re-observe new elements
  observeElements();
}

// ─── Load from API ──────────────────────────────────
async function loadArtworks() {
  try {
    const res = await fetch('/api/artworks');
    artworks = await res.json();
    filteredArtworks = [...artworks];
    renderGallery(artworks);

    // Auto-update artwork count in hero
    const countEl = document.getElementById('hero-artwork-count');
    if (countEl) countEl.textContent = `${artworks.length} Eser`;
  } catch (err) {
    console.error('Eserler yüklenirken hata:', err);
    renderGallery([]);
  }
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const s = await res.json();

    // Hero meta
    const heroDate = document.getElementById('hero-date');
    const heroLocation = document.getElementById('hero-location');
    if (heroDate) heroDate.textContent = s.dateRange || '';
    if (heroLocation) heroLocation.textContent = s.location || '';

    // Info cards
    const infoDatetime = document.getElementById('info-datetime');
    const infoLocation = document.getElementById('info-location');
    const infoContact = document.getElementById('info-contact');

    if (infoDatetime) {
      infoDatetime.innerHTML = `${s.dateRange || ''}<br>${s.weekdayHours || ''}<br>${s.weekendHours || ''}`;
    }
    if (infoLocation) {
      infoLocation.innerHTML = (s.locationDetail || '').replace(/\n/g, '<br>');
    }
    if (infoContact) {
      infoContact.innerHTML = `${s.contactEmail || ''}<br>Tel: ${s.contactPhone || ''}<br>${s.contactDepartment || ''}`;
    }
  } catch (err) {
    console.error('Ayarlar yüklenirken hata:', err);
  }
}

// Initial load
loadArtworks();
loadSettings();

// ─── Filtering ──────────────────────────────────────
filterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    // Update active state
    filterBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const filter = btn.dataset.filter;

    if (filter === 'all') {
      filteredArtworks = [...artworks];
    } else {
      filteredArtworks = artworks.filter((a) => a.technique === filter);
    }

    // Animate out, then re-render
    const cards = galleryGrid.querySelectorAll('.gallery-card');
    cards.forEach((card) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(16px)';
    });

    setTimeout(() => {
      renderGallery(filteredArtworks);
    }, 250);
  });
});

// ─── Lightbox ───────────────────────────────────────
function openLightbox(artworkId) {
  const artwork = artworks.find((a) => a.id === artworkId);
  if (!artwork) return;

  currentArtworkIndex = filteredArtworks.findIndex((a) => a.id === artworkId);

  populateLightbox(artwork);
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.remove('active');
  document.body.style.overflow = '';
}

function populateLightbox(artwork) {
  lightboxImage.src = artwork.image;
  lightboxImage.alt = `${artwork.title} — ${artwork.artist}`;
  lightboxOverline.textContent = `Eser #${artwork.id.toString().padStart(2, '0')}`;
  lightboxTitle.textContent = artwork.title;
  lightboxArtist.textContent = `${artwork.artist} · ${artwork.grade}`;
  lightboxDescription.textContent = artwork.description;

  lightboxSpecs.innerHTML = `
    <div class="lightbox-spec">
      <span class="lightbox-spec-label">Teknik</span>
      <span class="lightbox-spec-value">${artwork.techniqueLabel}</span>
    </div>
    <div class="lightbox-spec">
      <span class="lightbox-spec-label">Boyut</span>
      <span class="lightbox-spec-value">${artwork.dimensions}</span>
    </div>
    <div class="lightbox-spec">
      <span class="lightbox-spec-label">Yıl</span>
      <span class="lightbox-spec-value">${artwork.year}</span>
    </div>
    <div class="lightbox-spec">
      <span class="lightbox-spec-label">Sınıf</span>
      <span class="lightbox-spec-value">${artwork.grade}</span>
    </div>
  `;
}

function navigateLightbox(direction) {
  currentArtworkIndex += direction;

  if (currentArtworkIndex < 0) {
    currentArtworkIndex = filteredArtworks.length - 1;
  } else if (currentArtworkIndex >= filteredArtworks.length) {
    currentArtworkIndex = 0;
  }

  const artwork = filteredArtworks[currentArtworkIndex];

  // Animate transition
  const imageArea = lightbox.querySelector('.lightbox-image-wrapper');
  const detail = lightbox.querySelector('.lightbox-detail');

  imageArea.style.opacity = '0';
  imageArea.style.transform = direction > 0 ? 'translateX(24px)' : 'translateX(-24px)';
  detail.style.opacity = '0';

  setTimeout(() => {
    populateLightbox(artwork);
    imageArea.style.transition = 'all 400ms cubic-bezier(0.22, 1, 0.36, 1)';
    imageArea.style.opacity = '1';
    imageArea.style.transform = 'translateX(0)';
    detail.style.transition = 'opacity 400ms cubic-bezier(0.22, 1, 0.36, 1)';
    detail.style.opacity = '1';

    setTimeout(() => {
      imageArea.style.transition = '';
      detail.style.transition = '';
    }, 400);
  }, 200);
}

// Lightbox event listeners
lightboxClose.addEventListener('click', closeLightbox);
lightboxBackdrop.addEventListener('click', closeLightbox);
lightboxPrev.addEventListener('click', () => navigateLightbox(-1));
lightboxNext.addEventListener('click', () => navigateLightbox(1));

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (!lightbox.classList.contains('active')) return;

  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') navigateLightbox(-1);
  if (e.key === 'ArrowRight') navigateLightbox(1);
});

// ─── Scroll Reveal ──────────────────────────────────
function observeElements() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px',
    }
  );

  document.querySelectorAll('.reveal:not(.revealed)').forEach((el) => {
    observer.observe(el);
  });
}

observeElements();

// ─── Header Scroll Effect ───────────────────────────
let lastScrollY = 0;

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;

  if (scrollY > 60) {
    siteHeader.classList.add('scrolled');
  } else {
    siteHeader.classList.remove('scrolled');
  }

  lastScrollY = scrollY;
});

// ─── Mobile Menu ────────────────────────────────────
menuToggle.addEventListener('click', () => {
  menuToggle.classList.toggle('active');
  headerNav.classList.toggle('open');
});

// Close mobile menu on link click
headerNav.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    menuToggle.classList.remove('active');
    headerNav.classList.remove('open');
  });
});

// ─── Smooth Scroll ──────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const targetId = this.getAttribute('href');
    const targetElement = document.querySelector(targetId);

    if (targetElement) {
      const headerOffset = 80;
      const elementPosition = targetElement.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  });
});

// ─── Preload Critical Images ────────────────────────
function preloadImages() {
  artworks.forEach((artwork) => {
    const img = new Image();
    img.src = artwork.image;
  });

  // Preload famous paintings
  const famousPaintings = [
    'images/famous_starrynight.png',
    'images/famous_waterlilies.png',
    'images/famous_sunflowers.png',
    'images/famous_greatwave.png',
    'images/famous_girlpearl.png',
    'images/famous_impressionsunrise.png',
    'images/famous_monalisa.png',
    'images/famous_scream.png',
    'images/famous_persistence.png',
  ];
  famousPaintings.forEach((src) => {
    const img = new Image();
    img.src = src;
  });
}

// Preload after initial render
window.addEventListener('load', preloadImages);

// ─── Quote Rotator ──────────────────────────────────
const quoteRotator = document.getElementById('hero-quote-rotator');
if (quoteRotator) {
  const quotes = quoteRotator.querySelectorAll('.hero-quote');
  let currentQuoteIndex = 0;

  function rotateQuote() {
    quotes[currentQuoteIndex].classList.remove('active');
    currentQuoteIndex = (currentQuoteIndex + 1) % quotes.length;
    quotes[currentQuoteIndex].classList.add('active');
  }

  // Rotate every 5 seconds
  setInterval(rotateQuote, 5000);
}

// ─── Submission Form (Multi-Image) ──────────────────
const subForm = document.getElementById('submission-form');
const subSuccess = document.getElementById('sub-success');
const subSubmitBtn = document.getElementById('sub-submit-btn');

const TECHNIQUE_MAP = {
  yagliboya: 'Yağlı Boya',
  suluboya: 'Suluboya',
  akrilik: 'Akrilik',
  karakalem: 'Karakalem',
  murekkep: 'Mürekkep',
};

if (subForm) {
  // Setup each upload slot (1, 2, 3)
  [1, 2, 3].forEach((slot) => {
    const zone = document.getElementById(`sub-upload-zone-${slot}`);
    const input = document.getElementById(`sub-image-${slot}`);
    const preview = document.getElementById(`sub-preview-${slot}`);
    const previewImg = document.getElementById(`sub-preview-img-${slot}`);
    const clearBtn = document.querySelector(`[data-clear="${slot}"]`);

    if (!zone || !input) return;

    // Click to upload
    zone.addEventListener('click', () => input.click());

    // Drag and drop
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        input.files = e.dataTransfer.files;
        showSlotPreview(slot, e.dataTransfer.files[0]);
      }
    });

    // File change
    input.addEventListener('change', () => {
      if (input.files.length) showSlotPreview(slot, input.files[0]);
    });

    // Clear
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        preview.classList.add('hidden');
        zone.style.display = '';
        input.value = '';
      });
    }
  });

  function showSlotPreview(slot, file) {
    const zone = document.getElementById(`sub-upload-zone-${slot}`);
    const preview = document.getElementById(`sub-preview-${slot}`);
    const img = document.getElementById(`sub-preview-img-${slot}`);
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
      preview.classList.remove('hidden');
      zone.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }

  // Submit
  subForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    subSubmitBtn.disabled = true;
    subSubmitBtn.querySelector('span').textContent = 'Gönderiliyor…';

    const technique = document.getElementById('sub-technique').value;
    const formData = new FormData();
    formData.append('artist', document.getElementById('sub-artist').value);
    formData.append('grade', document.getElementById('sub-grade').value);
    formData.append('title', document.getElementById('sub-title').value);
    formData.append('technique', technique);
    formData.append('techniqueLabel', TECHNIQUE_MAP[technique] || technique);
    formData.append('dimensions', document.getElementById('sub-dimensions').value);
    formData.append('exhibition', document.getElementById('sub-exhibition').value);
    formData.append('description', document.getElementById('sub-description').value);

    // Append all image slots
    const img1 = document.getElementById('sub-image-1');
    const img2 = document.getElementById('sub-image-2');
    const img3 = document.getElementById('sub-image-3');
    if (img1?.files.length) formData.append('image', img1.files[0]);
    if (img2?.files.length) formData.append('image2', img2.files[0]);
    if (img3?.files.length) formData.append('image3', img3.files[0]);

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Sunucu hatası');

      // Show success
      subForm.querySelectorAll('.form-row, .form-group, .form-group--full, .btn-submit').forEach((el) => {
        el.style.display = 'none';
      });
      subSuccess.classList.remove('hidden');
    } catch (err) {
      alert('Başvuru gönderilemedi: ' + err.message);
      subSubmitBtn.disabled = false;
      subSubmitBtn.querySelector('span').textContent = 'Başvuruyu Gönder';
    }
  });
}

