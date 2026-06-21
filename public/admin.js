/* ============================================================
   ADMIN PANEL — Resim Sergisi
   Vanilla JS — API-driven CRUD
   ============================================================ */

(() => {
  'use strict';

  // ── Technique label map ──
  const TECHNIQUE_LABELS = {
    yagliboya:  'Yağlı Boya',
    suluboya:   'Suluboya',
    akrilik:    'Akrilik',
    karakalem:  'Karakalem',
    murekkep:   'Mürekkep',
  };

  // ── State ──
  let artworks = [];
  let selectedFile = null;
  let editingId = null;
  let deletingId = null;

  // ── DOM refs ──
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const loginScreen     = $('#login-screen');
  const dashboard       = $('#dashboard');
  const loginForm       = $('#login-form');
  const loginPassword   = $('#login-password');
  const loginBtn        = $('#login-btn');
  const loginError      = $('#login-error');

  const logoutBtn       = $('#logout-btn');
  const addArtworkBtn   = $('#add-artwork-btn');
  const emptyAddBtn     = $('#empty-add-btn');
  const searchInput     = $('#search-input');
  const artworkGrid     = $('#artwork-grid');
  const emptyState      = $('#empty-state');
  const gridLoading     = $('#grid-loading');

  const statTotal       = $('#stat-total');
  const statTechniques  = $('#stat-techniques');
  const statGrades      = $('#stat-grades');

  const modalOverlay    = $('#modal-overlay');
  const modal           = $('#modal');
  const modalTitle      = $('#modal-title');
  const modalClose      = $('#modal-close');
  const modalCancel     = $('#modal-cancel');
  const artworkForm     = $('#artwork-form');
  const artworkIdInput  = $('#artwork-id');
  const submitText      = $('#submit-text');
  const submitLoader    = $('#submit-loader');
  const formSubmitBtn   = $('#form-submit-btn');

  const uploadArea      = $('#upload-area');
  const uploadPlaceholder = $('#upload-placeholder');
  const uploadPreview   = $('#upload-preview');
  const previewImg      = $('#preview-img');
  const removeImageBtn  = $('#remove-image');
  const imageInput      = $('#image-input');

  const confirmOverlay  = $('#confirm-overlay');
  const confirmMessage  = $('#confirm-message');
  const confirmCancel   = $('#confirm-cancel');
  const confirmDelete   = $('#confirm-delete');

  const toastContainer  = $('#toast-container');

  // ── Init ──
  document.addEventListener('DOMContentLoaded', checkAuth);

  // ============================================================
  //  AUTH
  // ============================================================
  async function checkAuth() {
    try {
      const res = await fetch('/api/auth-check', { credentials: 'include' });
      if (res.ok) {
        showDashboard();
      } else {
        showLogin();
      }
    } catch {
      showLogin();
    }
  }

  function showLogin() {
    loginScreen.classList.remove('hidden');
    dashboard.classList.add('hidden');
    loginPassword.focus();
  }

  function showDashboard() {
    loginScreen.classList.add('hidden');
    dashboard.classList.remove('hidden');
    loadArtworks();
    loadVisitors();
    // Auto-refresh visitors every 30s
    setInterval(loadVisitors, 30000);
  }

  // Login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = loginPassword.value.trim();
    if (!password) return;

    setLoading(loginBtn, true);
    loginError.classList.add('hidden');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        showDashboard();
        loginPassword.value = '';
      } else {
        const data = await res.json().catch(() => ({}));
        loginError.textContent = data.message || 'Geçersiz şifre. Lütfen tekrar deneyin.';
        loginError.classList.remove('hidden');
        loginPassword.select();
      }
    } catch {
      loginError.textContent = 'Sunucuya bağlanılamadı. Lütfen tekrar deneyin.';
      loginError.classList.remove('hidden');
    } finally {
      setLoading(loginBtn, false);
    }
  });

  // Password toggle
  $('.toggle-password').addEventListener('click', () => {
    const isPassword = loginPassword.type === 'password';
    loginPassword.type = isPassword ? 'text' : 'password';
    $('.icon-eye').classList.toggle('hidden', !isPassword);
    $('.icon-eye-off').classList.toggle('hidden', isPassword);
  });

  // Logout
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    showLogin();
  });

  // ============================================================
  //  LOAD ARTWORKS
  // ============================================================
  async function loadArtworks() {
    artworkGrid.innerHTML = '';
    emptyState.classList.add('hidden');
    gridLoading.classList.remove('hidden');

    try {
      const res = await fetch('/api/artworks', { credentials: 'include' });
      if (res.status === 401) {
        showLogin();
        return;
      }
      artworks = await res.json();

      // Handle both array and object-with-array responses
      if (!Array.isArray(artworks)) {
        artworks = artworks.artworks || artworks.data || [];
      }

      renderArtworks(artworks);
      updateStats();
    } catch {
      toast('Eserler yüklenirken bir hata oluştu.', 'error');
    } finally {
      gridLoading.classList.add('hidden');
    }
  }

  // ============================================================
  //  RENDER
  // ============================================================
  function renderArtworks(list) {
    artworkGrid.innerHTML = '';

    if (list.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }
    emptyState.classList.add('hidden');

    list.forEach((art, idx) => {
      const card = document.createElement('div');
      card.className = 'artwork-card';
      card.style.animationDelay = `${idx * 0.05}s`;
      card.dataset.id = art._id || art.id;

      const technique = TECHNIQUE_LABELS[art.technique] || art.technique || '—';
      const imgSrc = art.imageUrl || art.image || '/uploads/' + (art.imagePath || '');

      card.innerHTML = `
        <div class="card-image-wrapper">
          <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(art.title)}" loading="lazy" />
          <span class="card-technique-badge">${escapeHtml(technique)}</span>
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(art.title)}</h3>
          <p class="card-artist">${escapeHtml(art.artist)}</p>
          <div class="card-meta">
            ${art.grade ? `
            <span class="card-meta-item">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
              </svg>
              ${escapeHtml(art.grade)}
            </span>` : ''}
            ${art.dimensions ? `
            <span class="card-meta-item">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
              </svg>
              ${escapeHtml(art.dimensions)}
            </span>` : ''}
            ${art.year ? `
            <span class="card-meta-item">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              ${art.year}
            </span>` : ''}
          </div>
          ${art.description ? `<p class="card-description">${escapeHtml(art.description)}</p>` : ''}
          <div class="card-actions">
            <button class="btn-icon edit-btn" data-id="${art._id || art.id}" title="Düzenle">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-icon danger delete-btn" data-id="${art._id || art.id}" data-title="${escapeAttr(art.title)}" title="Sil">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      `;

      artworkGrid.appendChild(card);
    });

    // Attach card action listeners
    artworkGrid.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    artworkGrid.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => openConfirmDelete(btn.dataset.id, btn.dataset.title));
    });
  }

  function updateStats() {
    statTotal.textContent = artworks.length;
    const techniques = new Set(artworks.map(a => a.technique).filter(Boolean));
    statTechniques.textContent = techniques.size;
    const grades = new Set(artworks.map(a => a.grade).filter(Boolean));
    statGrades.textContent = grades.size;
  }

  // ============================================================
  //  SEARCH
  // ============================================================
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) {
        renderArtworks(artworks);
        return;
      }
      const filtered = artworks.filter(a =>
        (a.title && a.title.toLowerCase().includes(q)) ||
        (a.artist && a.artist.toLowerCase().includes(q)) ||
        (a.grade && a.grade.toLowerCase().includes(q)) ||
        (a.technique && (TECHNIQUE_LABELS[a.technique] || a.technique).toLowerCase().includes(q))
      );
      renderArtworks(filtered);
    }, 250);
  });

  // ============================================================
  //  MODAL — ADD / EDIT
  // ============================================================
  addArtworkBtn.addEventListener('click', () => openAddModal());
  emptyAddBtn.addEventListener('click', () => openAddModal());

  function openAddModal() {
    editingId = null;
    modalTitle.textContent = 'Yeni Eser Ekle';
    submitText.textContent = 'Kaydet';
    artworkForm.reset();
    artworkIdInput.value = '';
    resetUpload();
    openModal();
  }

  function openEditModal(id) {
    const art = artworks.find(a => (a._id || a.id) === id);
    if (!art) return;

    editingId = id;
    modalTitle.textContent = 'Eseri Düzenle';
    submitText.textContent = 'Güncelle';

    // Fill form
    artworkIdInput.value = id;
    $('#field-title').value = art.title || '';
    $('#field-artist').value = art.artist || '';
    $('#field-grade').value = art.grade || '';
    $('#field-technique').value = art.technique || '';
    $('#field-dimensions').value = art.dimensions || '';
    $('#field-year').value = art.year || '';
    $('#field-description').value = art.description || '';

    // Show existing image
    const imgSrc = art.imageUrl || art.image || '/uploads/' + (art.imagePath || '');
    if (imgSrc && imgSrc !== '/uploads/') {
      previewImg.src = imgSrc;
      uploadPlaceholder.classList.add('hidden');
      uploadPreview.classList.remove('hidden');
    } else {
      resetUpload();
    }
    selectedFile = null;

    openModal();
  }

  function openModal() {
    modalOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // Focus first field
    setTimeout(() => $('#field-title').focus(), 100);
  }

  function closeModal() {
    modalOverlay.classList.add('hidden');
    document.body.style.overflow = '';
    editingId = null;
    selectedFile = null;
  }

  modalClose.addEventListener('click', closeModal);
  modalCancel.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!confirmOverlay.classList.contains('hidden')) {
        closeConfirm();
      } else if (!modalOverlay.classList.contains('hidden')) {
        closeModal();
      }
    }
  });

  // ============================================================
  //  IMAGE UPLOAD
  // ============================================================
  uploadArea.addEventListener('click', (e) => {
    if (e.target.closest('.remove-image')) return;
    imageInput.click();
  });

  imageInput.addEventListener('change', () => {
    if (imageInput.files && imageInput.files[0]) {
      handleFile(imageInput.files[0]);
    }
  });

  // Drag & drop
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  function handleFile(file) {
    const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast('Desteklenmeyen dosya türü. PNG, JPG veya WEBP kullanın.', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast('Dosya çok büyük. Maksimum 10MB yüklenebilir.', 'error');
      return;
    }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      uploadPlaceholder.classList.add('hidden');
      uploadPreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  removeImageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetUpload();
  });

  function resetUpload() {
    selectedFile = null;
    imageInput.value = '';
    previewImg.src = '';
    uploadPlaceholder.classList.remove('hidden');
    uploadPreview.classList.add('hidden');
  }

  // ============================================================
  //  FORM SUBMIT (CREATE / UPDATE)
  // ============================================================
  artworkForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = artworkIdInput.value;
    const isEdit = !!id;

    // Require image for new artworks
    if (!isEdit && !selectedFile) {
      toast('Lütfen bir görsel yükleyin.', 'error');
      return;
    }

    const formData = new FormData();
    if (selectedFile) {
      formData.append('image', selectedFile);
    }
    formData.append('title',       $('#field-title').value.trim());
    formData.append('artist',      $('#field-artist').value.trim());
    formData.append('grade',       $('#field-grade').value.trim());
    formData.append('technique',   $('#field-technique').value);
    formData.append('dimensions',  $('#field-dimensions').value.trim());
    formData.append('year',        $('#field-year').value.trim());
    formData.append('description', $('#field-description').value.trim());

    setLoading(formSubmitBtn, true);

    try {
      const url = isEdit ? `/api/artworks/${id}` : '/api/artworks';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        credentials: 'include',
        body: formData,
      });

      if (res.status === 401) {
        showLogin();
        toast('Oturum süresi doldu. Lütfen tekrar giriş yapın.', 'error');
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'İşlem başarısız oldu.');
      }

      toast(isEdit ? 'Eser başarıyla güncellendi.' : 'Eser başarıyla eklendi.', 'success');
      closeModal();
      await loadArtworks();
    } catch (err) {
      toast(err.message || 'Bir hata oluştu.', 'error');
    } finally {
      setLoading(formSubmitBtn, false);
    }
  });

  // ============================================================
  //  DELETE
  // ============================================================
  function openConfirmDelete(id, title) {
    deletingId = id;
    confirmMessage.innerHTML = `<strong>"${escapeHtml(title)}"</strong> adlı eseri silmek istediğinize emin misiniz?<br>Bu işlem geri alınamaz.`;
    confirmOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeConfirm() {
    confirmOverlay.classList.add('hidden');
    document.body.style.overflow = '';
    deletingId = null;
    // reset delete button
    const delBtn = confirmDelete;
    delBtn.querySelector('.btn-text').classList.remove('hidden');
    delBtn.querySelector('.btn-loader').classList.add('hidden');
    delBtn.disabled = false;
  }

  confirmCancel.addEventListener('click', closeConfirm);
  confirmOverlay.addEventListener('click', (e) => {
    if (e.target === confirmOverlay) closeConfirm();
  });

  confirmDelete.addEventListener('click', async () => {
    if (!deletingId) return;

    setLoading(confirmDelete, true);

    try {
      const res = await fetch(`/api/artworks/${deletingId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.status === 401) {
        showLogin();
        toast('Oturum süresi doldu. Lütfen tekrar giriş yapın.', 'error');
        return;
      }

      if (!res.ok) {
        throw new Error('Silme işlemi başarısız oldu.');
      }

      toast('Eser başarıyla silindi.', 'success');
      closeConfirm();
      await loadArtworks();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(confirmDelete, false);
    }
  });

  // ============================================================
  //  TOAST
  // ============================================================
  function toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;

    const iconSvg = type === 'success'
      ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>'
      : type === 'error'
      ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
      : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

    el.innerHTML = `
      <span class="toast-icon">${iconSvg}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
      <button class="toast-dismiss" aria-label="Kapat">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    el.querySelector('.toast-dismiss').addEventListener('click', () => removeToast(el));
    toastContainer.appendChild(el);

    // Auto dismiss
    setTimeout(() => removeToast(el), 4500);
  }

  function removeToast(el) {
    if (!el.parentNode) return;
    el.style.animation = 'toastOut 0.25s ease forwards';
    setTimeout(() => el.remove(), 250);
  }

  // ============================================================
  //  HELPERS
  // ============================================================
  function setLoading(btn, loading) {
    const text = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loader');
    if (loading) {
      if (text) text.classList.add('hidden');
      if (loader) loader.classList.remove('hidden');
      btn.disabled = true;
    } else {
      if (text) text.classList.remove('hidden');
      if (loader) loader.classList.add('hidden');
      btn.disabled = false;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Settings Management ──────────────────────────────
  const settingsPanel = $('#settings-panel');
  const toggleSettingsBtn = $('#toggle-settings-btn');
  const settingsForm = $('#settings-form');

  const settingsFields = [
    'dateRange', 'weekdayHours', 'weekendHours',
    'location', 'locationDetail',
    'contactEmail', 'contactPhone', 'contactDepartment'
  ];

  if (toggleSettingsBtn && settingsPanel) {
    toggleSettingsBtn.addEventListener('click', () => {
      settingsPanel.classList.toggle('hidden');
    });
  }

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const settings = await res.json();
      settingsFields.forEach((key) => {
        const el = $(`#s-${key}`);
        if (el && settings[key] !== undefined) {
          el.value = settings[key];
        }
      });
    } catch (err) {
      console.error('Settings load error:', err);
    }
  }

  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {};
      settingsFields.forEach((key) => {
        const el = $(`#s-${key}`);
        if (el) data[key] = el.value;
      });

      try {
        const res = await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Kaydetme hatası');
        toast('Sergi ayarları güncellendi!', 'success');
      } catch (err) {
        toast('Ayarlar kaydedilemedi: ' + err.message, 'error');
      }
    });
  }

  // ============================================================
  //  SUBMISSIONS MANAGEMENT
  // ============================================================
  let submissions = [];

  const submissionGrid    = $('#submission-grid');
  const submissionsEmpty  = $('#submissions-empty');
  const statSubmissions   = $('#stat-submissions');
  const submissionsBadge  = $('#submissions-badge');

  async function loadSubmissions() {
    if (!submissionGrid) return;
    submissionGrid.innerHTML = '';
    if (submissionsEmpty) submissionsEmpty.classList.add('hidden');

    try {
      const res = await fetch('/api/submissions', { credentials: 'include' });
      if (res.status === 401) {
        showLogin();
        return;
      }
      if (!res.ok) throw new Error('Başvurular yüklenemedi.');

      submissions = await res.json();

      // Handle both array and object-with-array responses
      if (!Array.isArray(submissions)) {
        submissions = submissions.submissions || submissions.data || [];
      }

      renderSubmissions(submissions);
      updateSubmissionStats();
    } catch (err) {
      console.error('Submissions load error:', err);
    }
  }

  function renderSubmissions(list) {
    if (!submissionGrid) return;
    submissionGrid.innerHTML = '';

    if (list.length === 0) {
      if (submissionsEmpty) submissionsEmpty.classList.remove('hidden');
      return;
    }
    if (submissionsEmpty) submissionsEmpty.classList.add('hidden');

    list.forEach((sub, idx) => {
      const card = document.createElement('div');
      card.className = 'submission-card';
      card.style.animationDelay = `${idx * 0.05}s`;
      card.dataset.id = sub.id || sub._id;

      const technique = sub.techniqueLabel || TECHNIQUE_LABELS[sub.technique] || sub.technique || '—';
      const imgSrc = sub.image || sub.imageUrl || '/uploads/' + (sub.imagePath || '');
      const dateStr = sub.submittedAt ? formatDate(sub.submittedAt) : '—';

      card.innerHTML = `
        <div class="card-image-wrapper">
          <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(sub.title)}" loading="lazy" />
          <span class="card-technique-badge">${escapeHtml(technique)}</span>
          <span class="submission-status-badge">Beklemede</span>
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(sub.title)}</h3>
          <p class="card-artist">${escapeHtml(sub.artist)}</p>
          <div class="card-meta">
            ${sub.grade ? `
            <span class="card-meta-item">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
              </svg>
              ${escapeHtml(sub.grade)}
            </span>` : ''}
            ${sub.dimensions ? `
            <span class="card-meta-item">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
              </svg>
              ${escapeHtml(sub.dimensions)}
            </span>` : ''}
          </div>
          <div class="card-date">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            ${escapeHtml(dateStr)}
          </div>
          ${sub.description ? `<p class="card-description">${escapeHtml(sub.description)}</p>` : ''}
          <div class="submission-actions">
            <button class="btn-approve approve-btn" data-id="${sub.id || sub._id}" title="Onayla">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Onayla
            </button>
            <button class="btn-reject reject-btn" data-id="${sub.id || sub._id}" data-title="${escapeAttr(sub.title)}" title="Reddet">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              Reddet
            </button>
          </div>
        </div>
      `;

      submissionGrid.appendChild(card);
    });

    // Attach approve listeners
    submissionGrid.querySelectorAll('.approve-btn').forEach(btn => {
      btn.addEventListener('click', () => approveSubmission(btn.dataset.id, btn));
    });
    // Attach reject listeners
    submissionGrid.querySelectorAll('.reject-btn').forEach(btn => {
      btn.addEventListener('click', () => rejectSubmission(btn.dataset.id, btn.dataset.title, btn));
    });
  }

  function updateSubmissionStats() {
    const count = submissions.length;
    if (statSubmissions) statSubmissions.textContent = count;
    if (submissionsBadge) submissionsBadge.textContent = count;
  }

  function formatDate(dateStr) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  }

  async function approveSubmission(id, btn) {
    if (!id) return;
    btn.disabled = true;
    const card = btn.closest('.submission-card');
    const rejectBtn = card ? card.querySelector('.reject-btn') : null;
    if (rejectBtn) rejectBtn.disabled = true;

    try {
      const res = await fetch(`/api/submissions/${id}/approve`, {
        method: 'POST',
        credentials: 'include',
      });

      if (res.status === 401) {
        showLogin();
        toast('Oturum süresi doldu. Lütfen tekrar giriş yapın.', 'error');
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Onaylama işlemi başarısız oldu.');
      }

      toast('Başvuru onaylandı ve sergiye eklendi.', 'success');
      await Promise.all([loadArtworks(), loadSubmissions()]);
    } catch (err) {
      toast(err.message || 'Bir hata oluştu.', 'error');
      btn.disabled = false;
      if (rejectBtn) rejectBtn.disabled = false;
    }
  }

  async function rejectSubmission(id, title, btn) {
    if (!id) return;
    const confirmed = confirm(`"${title || 'Bu başvuru'}" reddedilecek. Emin misiniz?`);
    if (!confirmed) return;

    btn.disabled = true;
    const card = btn.closest('.submission-card');
    const approveBtn = card ? card.querySelector('.approve-btn') : null;
    if (approveBtn) approveBtn.disabled = true;

    try {
      const res = await fetch(`/api/submissions/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.status === 401) {
        showLogin();
        toast('Oturum süresi doldu. Lütfen tekrar giriş yapın.', 'error');
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Reddetme işlemi başarısız oldu.');
      }

      toast('Başvuru reddedildi.', 'success');
      await loadSubmissions();
    } catch (err) {
      toast(err.message || 'Bir hata oluştu.', 'error');
      btn.disabled = false;
      if (approveBtn) approveBtn.disabled = false;
    }
  }

  // Load settings & submissions when dashboard is shown
  const dashboardObserver = new MutationObserver(() => {
    if (!dashboard.classList.contains('hidden')) {
      loadSettings();
      loadSubmissions();
      dashboardObserver.disconnect();
    }
  });
  dashboardObserver.observe(dashboard, { attributes: true, attributeFilter: ['class'] });

  // ─── Visitors ──────────────────────────────────────
  async function loadVisitors() {
    try {
      const res = await fetch('/api/visitors');
      if (!res.ok) return;
      const data = await res.json();

      // Update stat card
      const statOnline = document.getElementById('stat-online');
      if (statOnline) statOnline.textContent = data.onlineCount || 0;

      // Badge
      const badge = document.getElementById('visitors-badge');
      if (badge) badge.textContent = data.visitors.length;

      // Online players
      const onlineEl = document.getElementById('visitors-online');
      if (onlineEl) {
        if (data.online.length === 0) {
          onlineEl.innerHTML = '';
        } else {
          onlineEl.innerHTML = data.online.map((p) =>
            `<span class="visitor-online-tag"><span class="visitor-online-dot"></span>${esc(p.name)}</span>`
          ).join('');
        }
      }

      // Visitors list
      const listEl = document.getElementById('visitors-list');
      const emptyEl = document.getElementById('visitors-empty');
      if (listEl) {
        if (data.visitors.length === 0) {
          listEl.innerHTML = '';
          if (emptyEl) emptyEl.classList.remove('hidden');
        } else {
          if (emptyEl) emptyEl.classList.add('hidden');
          listEl.innerHTML = data.visitors.map((v) => {
            const joinDate = new Date(v.joinedAt);
            const timeStr = joinDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            let durationStr = '';
            if (v.leftAt) {
              const dur = Math.round((new Date(v.leftAt) - joinDate) / 60000);
              durationStr = `<span class="visitor-duration">${dur < 1 ? '<1' : dur} dk</span>`;
            } else {
              durationStr = `<span class="visitor-online-tag" style="padding:2px 8px;font-size:0.65rem"><span class="visitor-online-dot"></span>hala burada</span>`;
            }
            const initials = (v.name || 'Z').substring(0, 2).toUpperCase();
            return `<div class="visitor-item">
              <div class="visitor-avatar" style="background:${v.color || '#c9a96e'}">${initials}</div>
              <span class="visitor-name">${esc(v.name)}</span>
              <span class="visitor-time">${timeStr}</span>
              ${durationStr}
            </div>`;
          }).join('');
        }
      }
    } catch (err) {
      // silently fail
    }
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

})();
