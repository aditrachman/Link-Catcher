# Smart Link Catcher

PWA statis: tempel teks atau thread berisi link, dapatkan ringkasan 2-3 kalimat, link berlabel, dan tag. Login Google dan sinkronisasi antar perangkat lewat Firebase. Tanpa build.

## Setup Firebase (sekali saja, di console)

Proyek: `link-catcher-fe7ae`. Konfigurasi sudah ada di `sync.js`.

1. **Authentication > Sign-in method:** aktifkan **Google**.
2. **Authentication > Settings > Authorized domains:** tambahkan domain tempat app di-deploy (mis. `namaapp.vercel.app`). `localhost` sudah ada secara default.
3. **Firestore Database:** buat database (mode production).
4. **Firestore > Rules:** tempel isi `firestore.rules`, lalu **Publish**. Tanpa langkah ini sinkronisasi gagal dengan `permission-denied`; kartu tetap aman di perangkat.

Kunci web di `sync.js` memang publik. Yang melindungi data adalah aturan di langkah 4: tiap pengguna hanya bisa membaca dan menulis `users/{uid}/notes/*` miliknya.

## Jalankan lokal

```bash
python3 -m http.server 8080      # atau: npx serve
```

Buka **http://localhost:8080** (bukan `file://`, dan bukan `0.0.0.0` atau `127.0.0.1`). Login Google hanya jalan di domain yang ada di Authorized domains, dan secara bawaan itu hanya `localhost`. Error `auth/unauthorized-domain` berarti kamu membuka lewat alamat lain.

## Terjemahan ringkasan

Teks berbahasa Inggris dideteksi otomatis dan ringkasannya diterjemahkan ke Indonesia.

- Bila browser punya penerjemah bawaan (Chrome 138+), terjemahan jalan otomatis di perangkat dan tidak ada data yang dikirim ke luar.
- Bila tidak ada, muncul tombol "Terjemahkan ke Indonesia". Saat diklik, ringkasan (bukan seluruh teks, tanpa link) dikirim ke layanan gratis MyMemory.
- Tombol "Lihat asli" mengembalikan teks Inggris. Label link tidak diterjemahkan.

## Deploy

Unggah seluruh folder ke Firebase Hosting, Vercel, atau Netlify. HTTPS wajib agar bisa di-install sebagai PWA.

Catatan Safari/iOS: login redirect paling andal bila `authDomain` sama dengan domain app. Paling mudah dengan Firebase Hosting, atau set `authDomain` ke domain sendiri.

## Cara kerja sinkronisasi

- Kartu selalu disimpan di localStorage dulu, jadi app tetap cepat dan jalan offline.
- Setelah login, kartu lokal naik ke Firestore dan perubahan dari perangkat lain turun otomatis.
- Konflik: yang `updatedAt`-nya paling baru menang, per kartu.
- Keluar menghapus salinan lokal (kartu tetap di akun). Ganti akun tidak mencampur data.

## Uji mesin

```bash
node test.js
```

## Struktur

| File | Fungsi |
| --- | --- |
| `engine.js` | Ekstrak URL, bersihkan teks, ringkasan ekstraktif, label link, tag, mode daftar |
| `app.js` | UI, localStorage, merge sinkronisasi, enrichment GitHub, Share Target |
| `sync.js` | Login Google + Firestore (SDK dari CDN, v10.14.1) |
| `firestore.rules` | Aturan keamanan Firestore |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA |
| `make-icons.py` | Membuat ulang ikon (butuh Pillow) |
# Link-Catcher
