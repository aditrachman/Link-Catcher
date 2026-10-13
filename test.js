const SLC = require('./engine.js');
const assert = require('assert');

const thread = `5 aplikasi Linux yang wajib dicoba buat produktivitas

1/ Kalau kamu baru pindah ke Linux, ini aplikasi yang bikin kerjaan jauh lebih rapi.

2/ OnlyOffice buat dokumen yang kompatibel dengan format Microsoft Office. https://github.com/ONLYOFFICE/DesktopEditors

3/ Obsidian untuk catatan berbasis Markdown, jalan lokal dan bisa disinkronkan. https://obsidian.md

4/ Flameshot buat screenshot dengan anotasi cepat. https://github.com/flameshot-org/flameshot

5/ Ventoy buat bikin USB bootable tanpa format ulang tiap ganti ISO. https://github.com/ventoy/Ventoy

Semua gratis dan open source kecuali Obsidian.
124 Reply  2.3K Repost  Share`;

const r = SLC.processText(thread);
console.log(JSON.stringify(r, null, 2));

assert.strictEqual(r.links.length, 4, 'harus 4 link');
assert.strictEqual(r.mode, 'prose');
assert.ok(r.summary.length > 20 && r.summary.length <= 900, 'ringkasan wajar');
assert.ok(!/https?:/.test(r.summary), 'ringkasan tanpa URL');
assert.ok(!/Repost|Reply/.test(r.summary), 'noise sosmed dibuang');
assert.ok(r.tags.includes('Linux'), 'tag Linux');
assert.deepStrictEqual(r.links[0].github, { owner: 'ONLYOFFICE', repo: 'DesktopEditors' });
assert.ok(/OnlyOffice/.test(r.links[0].label), 'label dari konteks');

// trailing punctuation + dedup + kurung
const t2 = SLC.extractLinks('Lihat (https://example.com/a). Juga https://example.com/a/, dan https://en.wikipedia.org/wiki/Foo_(bar).');
assert.strictEqual(t2.length, 2);
assert.strictEqual(t2[0].url, 'https://example.com/a');
assert.strictEqual(t2[1].url, 'https://en.wikipedia.org/wiki/Foo_(bar)');

// mode daftar
const t3 = SLC.processText('Tools favorit minggu ini:\n1. Vim https://www.vim.org\n2. Tmux https://github.com/tmux/tmux\n3. Fzf https://github.com/junegunn/fzf');
assert.strictEqual(t3.mode, 'list');
assert.strictEqual(t3.items.length, 3);

// WhatsApp + tanpa link + teks kosong
const t4 = SLC.processText('[12/10/26 09.15] Budi: Besok rapat jam 9 di ruang BEM, jangan telat ya semuanya.\n[12/10/26 09.16] Sari: Siap, saya bawa laptop dan proyektor untuk presentasi.');
assert.ok(!/Budi|Sari|\[12/.test(t4.summary), 'prefix WA dibuang');
assert.strictEqual(SLC.processText('').summary, '');
assert.strictEqual(SLC.processText('   \n  ').links.length, 0);

// performa 5.000 kata
const big = Array(500).fill('Kalimat contoh tentang database relasional dan indeks pada tabel besar.').join(' ');
const t0 = Date.now();
SLC.processText(big);
assert.ok(Date.now() - t0 < 1000, 'kurang dari 1 detik');
console.log('\nSemua uji lulus');

// teks hanya berisi link (kasus Threads)
const t5 = SLC.processText('https://www.threads.com/@anurkholis/post/DeUJRjWEqFN?xmt=AQG0imU99JYU1ObBU--oUSGmzBI8RyPIYYAJRVXw5mnSLtbAreAaTzh-qrp6UWcL68i44xI&source_surface=35&slof=1');
assert.strictEqual(t5.links.length, 1);
assert.strictEqual(t5.links[0].label, 'Postingan Threads dari @anurkholis');
assert.ok(t5.summary.length > 0 && t5.note, 'ringkasan pengganti + catatan');
const t6 = SLC.processText('https://x.com/foo/status/123 https://youtu.be/abc12345678 https://example.com/halaman');
assert.ok(/^Berisi 3 link/.test(t6.summary));
assert.strictEqual(t6.links[0].label, 'Postingan X dari @foo');
assert.strictEqual(t6.links[2].label, 'example.com');
assert.strictEqual(SLC.processText('Teks biasa yang cukup panjang tanpa link apa pun di dalamnya.').note, '');
console.log('Uji link-saja lulus');
