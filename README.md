# Smart Link Catcher

[![Live Demo](https://img.shields.io/badge/Live-Demo-14201B?style=for-the-badge&logo=firebase&logoColor=F2D94E)](https://link-catcher-fe7ae.web.app)
[![Firebase](https://img.shields.io/badge/Firebase-Hosting-FFCA28?style=for-the-badge&logo=firebase&logoColor=14201B)](https://console.firebase.google.com/project/link-catcher-fe7ae/overview)
[![PWA](https://img.shields.io/badge/PWA-Installable-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://link-catcher-fe7ae.web.app)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

> **Tempel teks atau thread berisi link → dapatkan ringkasan 2–3 kalimat, link berlabel, dan tag otomatis.**  
> PWA lokal-pertama (local-first), login Google + sinkronisasi Firestore, enrichment GitHub, Web Share Target Android.

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| **Ekstraksi URL Cerdas** | Regex tangkap http/https, bersihkan tanda baca ujung, deduplikasi, simpan posisi karakter |
| **Ringkasan Ekstraktif (TF-IDF)** | Pilih 2–3 kalimat paling representatif, urutkan seperti asli, potong ≤280 char/kalimat |
| **Label Link Kontekstual** | Ambil kalimat/baris terdekat sebelum/sesudah link (max 80 char), fallback ke domain |
| **Tag Otomatis** | Kamus 12 kategori (Linux, AI, Coding, Web, dll.) cocok ke teks + domain, max 4 tag |
| **Mode Daftar** | Deteksi bullet/nomor ≥3 baris → tampil sebagai item, bukan ringkasan prosa |
| **Enrichment GitHub** | `github.com/owner/repo` → nama, deskripsi, ⭐ bintang, bahasa (cache 24 jam, rate-limit 60/jam) |
| **Terjemahan Inggris→Indonesia** | Prioritas: Translator API bawaan browser (di perangkat, privat). Fallback: MyMemory (opt-in user) |
| **PWA + Offline** | Manifest, service worker, ikon maskable, installable, jalan offline penuh |
| **Login Google + Sync Firestore** | Popup (desktop) / redirect (iOS PWA). Kartu lokal naik ke cloud, conflict last-write-wins per kartu |
| **Web Share Target (Android)** | Bagikan dari X, WhatsApp, Chrome → buka app → kartu otomatis terbentuk |
| **Undo Delete** | Hapus kartu → toast dengan tombol "Urungkan" (7 detik) |
| **Search & Filter** | Cari di ringkasan, link, tag. Filter tag di sidebar, pin/unpin |

---

## 🚀 Demo Langsung

**🔗 https://link-catcher-fe7ae.web.app**

Coba paste thread seperti ini:

```text
Rekomendasi Linux apps hari ini:

1. https://github.com/zen-browser/desktop - Zen Browser, Firefox-based privacy browser
2. https://github.com/obsidianmd/obsidian-releases - Obsidian note-taking app
3. https://github.com/lxqt/lxqt - Lightweight Qt desktop environment

Semua open source dan ringan untuk daily driver.
```

Hasil: ringkasan 2 kalimat, 3 link dengan label + ⭐ bintang GitHub, tag `Linux`, `Open Source`, `Produktivitas`, `Keamanan`.

---

## 🛠 Tech Stack

| Layer | Pilihan | Alasan |
|-------|---------|--------|
| **Build** | Tanpa build (ESM + CDN) | Simpel, cepat, deploy drag-drop |
| **UI** | Vanilla JS (IIFE) + CSS custom | Bundle < 50 KB gzip, 0 dependency |
| **PWA** | `manifest.webmanifest` + `sw.js` (workbox-style) | Offline-first, installable, share_target |
| **Auth** | Firebase Auth (Google) | Popup/redirect, gratis, aman |
| **Database** | Cloud Firestore + persistent cache | Realtime sync, offline queue, security rules |
| **Hosting** | Firebase Hosting | HTTPS gratis, CDN global, custom domain mudah |
| **Enrichment** | GitHub REST API v3 (public, no token) | Rate limit 60/jam/IP, cache localStorage |

---

## 📁 Struktur Proyek

```
smart-link-catcher/
├── index.html          # Entry point, semantic HTML, a11y ready
├── style.css           # Design system: color, spacing, dark-ready
├── engine.js           # Mesin murni (tanpa DOM): extract, summarize, tag, detectList
├── app.js              # UI, localStorage, preview, library, sync glue, Share Target
├── sync.js             # Firebase Auth + Firestore (ESM from CDN)
├── firestore.rules     # Security rules: user isolation, field validation
├── manifest.webmanifest# PWA config + share_target (GET)
├── sw.js               # Service worker: precache + network-first HTML
├── icons/              # 192, 512, maskable (Pillow script: make-icons.py)
├── test.js             # Unit test engine (node test.js)
├── firebase.json       # Hosting config (SPA fallback, headers)
├── .firebaserc         # Project alias: link-catcher-fe7ae
└── README.md           # File ini
```

---

## ⚡ Quick Start (Lokal)

```bash
# 1. Clone
git clone https://github.com/aditrachman/Link-Catcher.git
cd Link-Catcher

# 2. Jalankan server statis (HTTPS diperlukan untuk PWA/Auth)
python3 -m http.server 8080
# atau: npx serve

# 3. Buka http://localhost:8080
#    ⚠️ Pakai localhost (bukan 127.0.0.1 / IP) agar login Google jalan
```

> **Penting:** Login Google hanya berfungsi di domain yang terdaftar di **Firebase Console → Authentication → Settings → Authorized domains**. Default: `localhost`. Untuk production, tambahkan domain hostingmu.

---

## 🔧 Setup Firebase (Sekali Saja)

Proyek sudah punya config di `sync.js` (project: `link-catcher-fe7ae`). Untuk pakai project sendiri:

1. Buat project baru di [Firebase Console](https://console.firebase.google.com)
2. **Authentication → Sign-in method → Google → Enable**
3. **Authentication → Settings → Authorized domains** → tambah domainmu (contoh: `myapp.web.app`, `localhost`)
4. **Firestore Database → Create database → Production mode**
5. **Firestore → Rules** → paste isi `firestore.rules` → **Publish**
6. Ganti `firebaseConfig` di `sync.js` dengan config projectmu
7. Deploy: `firebase deploy` (butuh `npm i -g firebase-tools` + `firebase login`)

> **Keamanan:** API key Firebase bersifat publik. Perlindungan data ada di `firestore.rules`: tiap user hanya bisa akses `users/{uid}/notes/*` miliknya.

---

## 🧪 Test Mesin (Node)

```bash
node test.js
```

Output: ringkasan, link, tag, mode list/proses untuk beberapa fixture teks.

---

## 📱 PWA Checklist (Lighthouse)

| Audit | Target |
|-------|--------|
| Installable | ✅ Manifest valid, icons 192/512/maskable, `display: standalone` |
| Service Worker | ✅ Registered, precache HTML/CSS/JS, network-first navigation |
| Offline | ✅ Bisa buat/baca/hapus kartu offline, sync saat online |
| Share Target | ✅ `share_target.action="./"` + `params.title/text/url` (Android) |
| Performance | < 2s FCP di 4G (bundle < 50 KB gzip) |
| Accessibility | ✅ Semantic HTML, ARIA labels, kontras WCAG AA, focus visible |

Jalankan: `npx lighthouse https://link-catcher-fe7ae.web.app --view`

---

## 📖 Cara Kerja Singkat

1. **Paste** teks di textarea → `engine.js` proses di < 100ms (tanpa network)
2. **Preview** real-time: ringkasan, link berlabel, tag, mode (prose/list)
3. **Edit** ringkasan/tag jika perlu → **Simpan**
4. **Local-first**: kartu masuk `localStorage` (`slc.notes.v1`), tetap jalan offline
5. **Login Google** → kartu lokal di-*push* ke Firestore (`users/{uid}/notes/{id}`)
6. **Sinkronisasi real-time**: `onSnapshot` → merge last-write-wins per kartu (`updatedAt`)
7. **Share Target Android**: buka app dari menu Bagikan → `?title=&text=&url=` → auto proses & simpan

---

## 🗺 Roadmap (Sesuai PRD)

- [x] **Fase 1**: Mesin + UI lokal (ekstraksi, ringkasan TF-IDF, tag, mode list, localStorage)
- [x] **Fase 2**: PWA (manifest, SW, icons, offline, install prompt, Share Target)
- [x] **Fase 3**: Auth Google + Firestore sync (popup/redirect, conflict resolution, security rules)
- [x] **Fase 4**: GitHub enrichment + mode daftar + Web Share Target
- [ ] **Fase 5** (opsional): Metadata link non-GitHub via serverless function, TWA Play Store

---

## 🤝 Kontribusi

PR & issue欢迎. Fokus: bug fix, aksesibilitas, performa, i18n, test coverage.

```bash
# Fork → branch → commit → PR
git checkout -b fix/ringkasan-tfidf
# ... edit engine.js ...
git commit -m "fix: perbaiki scoring TF-IDF untuk kalimat pendek"
git push origin fix/ringkasan-tfidf
```

---

## 📄 Lisensi

MIT © 2026 [Muhammad Aditya Rachman](https://github.com/aditrachman)

---

## 🙋‍♂️ Tentang Pembuat

**Muhammad Aditya Rachman** (NPM: 2405040018)  
Mahasiswa Teknik Informatika, Universitas Muhammadiyah Magelang (UNIMMA)  
Asisten Dosen Mata Kuliah Database

Project ini bagian dari portfolio & eksperimen *local-first PWA* tanpa framework berat.