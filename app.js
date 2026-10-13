/* Smart Link Catcher: UI, penyimpanan lokal, Share Target. Mesin ada di engine.js (window.SLC). */
(function () {
  'use strict';

  var KEY = 'slc.notes.v1';
  var GHKEY = 'slc.gh.v1';
  var GH_TTL = 24 * 3600 * 1000;

  function $(id) { return document.getElementById(id); }

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === false || v == null) return;
      if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }

  function readJSON(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  var state = {
    notes: readJSON(KEY, []),
    filter: 'all',   // 'all' | 'pinned'
    tag: null,
    query: '',
    draft: null,
    raw: ''
  };
  var gh = readJSON(GHKEY, {});
  var undo = null, toastTimer = null, procTimer = null;
  var tomb = {};      // id kartu yang baru dihapus (cegah muncul lagi dari snapshot lama)
  var pushing = {};   // id kartu yang sedang dikirim ke server
  var user = null, syncState = '', syncErr = '', cloudCount = null;

  function persist() {
    if (!writeJSON(KEY, state.notes)) toast('Gagal menyimpan: penyimpanan penuh atau diblokir browser.');
  }

  /* ---------- util ---------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function rel(ts) {
    var d = Date.now() - ts, m = Math.floor(d / 60000);
    if (m < 1) return 'Baru saja';
    if (m < 60) return m + ' menit lalu';
    var a = new Date(ts), b = new Date();
    if (a.toDateString() === b.toDateString()) return 'Hari ini';
    var days = Math.round((new Date(b.toDateString()) - new Date(a.toDateString())) / 86400000);
    if (days === 1) return 'Kemarin';
    if (days < 7) return days + ' hari lalu';
    return a.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;opacity:0' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); }
      ta.remove();
    });
  }

  function noteText(n) {
    var lines = [n.summary];
    if (n.links && n.links.length) {
      lines.push('');
      n.links.forEach(function (l) { lines.push(l.label + ' - ' + l.url); });
    }
    return lines.join('\n');
  }

  function toast(msg, action, ms) {
    var t = $('toast');
    t.textContent = '';
    t.appendChild(h('span', { text: msg }));
    if (action) t.appendChild(h('button', { type: 'button', text: action.label, onclick: action.run }));
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; undo = null; }, ms || (action ? 7000 : 2800));
  }

  /* ---------- GitHub enrichment ---------- */
  function enrich(link, target) {
    if (!link.github) return;
    var key = link.github.owner + '/' + link.github.repo;
    function show(m) {
      link.meta = m;
      var bits = [];
      if (m.desc) bits.push(m.desc);
      if (m.stars != null) bits.push('★ ' + m.stars.toLocaleString('id-ID'));
      if (m.lang) bits.push(m.lang);
      target.textContent = bits.join(' · ');
    }
    if (link.meta) return show(link.meta);
    var c = gh[key];
    if (c && Date.now() - c.t < GH_TTL) return show(c);
    if (!navigator.onLine) return;
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
    fetch('https://api.github.com/repos/' + encodeURIComponent(link.github.owner) + '/' + encodeURIComponent(link.github.repo),
      { headers: { Accept: 'application/vnd.github+json' }, signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) {
        var m = { desc: j.description || '', stars: j.stargazers_count, lang: j.language || '', t: Date.now() };
        gh[key] = m; writeJSON(GHKEY, gh);
        show(m);
      })
      .catch(function () { /* batas API atau offline: tampilkan domain saja */ })
      .then(function () { clearTimeout(to); });
  }

  /* ---------- terjemahan ringkasan (Inggris -> Indonesia) ----------
     Prioritas: penerjemah bawaan browser (di perangkat, privat). Bila tidak ada,
     pengguna harus menekan tombol untuk memakai layanan MyMemory (teks dikirim ke pihak ketiga). */
  var trMode = null; // 'auto' | 'download' | 'external'

  function translateMode() {
    if (trMode) return Promise.resolve(trMode);
    var T = window.Translator;
    if (!T || typeof T.availability !== 'function') { trMode = 'external'; return Promise.resolve(trMode); }
    return T.availability({ sourceLanguage: 'en', targetLanguage: 'id' }).then(function (a) {
      trMode = a === 'available' ? 'auto' : (a === 'unavailable' ? 'external' : 'download');
      return trMode;
    }, function () { trMode = 'external'; return trMode; });
  }

  function chunkText(text, max) {
    var parts = text.split(/(?<=[.!?…])\s+/), out = [], cur = '';
    parts.forEach(function (p) {
      if (cur && (cur + ' ' + p).length > max) { out.push(cur); cur = p; }
      else cur = cur ? cur + ' ' + p : p;
    });
    if (cur) out.push(cur);
    var res = [];
    out.forEach(function (c) { while (c.length > max) { res.push(c.slice(0, max)); c = c.slice(max); } res.push(c); });
    return res;
  }

  function translateText(text, mode) {
    if (mode !== 'external') {
      return window.Translator.create({
        sourceLanguage: 'en', targetLanguage: 'id',
        monitor: function (m) {
          m.addEventListener('downloadprogress', function (e) { toast('Mengunduh model terjemahan: ' + Math.round(e.loaded * 100) + '%'); });
        }
      }).then(function (tr) {
        return tr.translate(text).then(function (out) {
          if (typeof tr.destroy === 'function') tr.destroy();
          trMode = 'auto';
          return out;
        });
      });
    }
    return Promise.all(chunkText(text, 450).map(function (c) {
      return fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(c) + '&langpair=en|id')
        .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(function (j) {
          var ok = j && j.responseData && typeof j.responseData.translatedText === 'string' && Number(j.responseStatus) === 200;
          if (!ok) throw new Error('mymemory');
          return j.responseData.translatedText;
        });
    })).then(function (parts) { return parts.join(' '); });
  }

  function doTranslate(d, mode) {
    d.tr.state = 'working';
    d.tr.original = d.summary;
    d.tr.via = mode === 'external' ? 'MyMemory' : 'di perangkat';
    renderPreview();
    translateText(d.summary, mode).then(function (out) {
      if (state.draft !== d) return;
      d.tr.translated = String(out).trim();
      d.tr.showing = 'tr';
      d.summary = d.tr.translated;
      d.tr.state = 'done';
      renderPreview();
    }, function (e) {
      if (state.draft !== d) return;
      d.summary = d.tr.original;
      d.tr.state = 'error';
      d.tr.failedMode = mode;
      d.tr.err = e ? String(e.name || 'Error') + (e.message ? ': ' + String(e.message).slice(0, 80) : '') : '';
      renderPreview();
    });
  }

  function trNode(d) {
    var t = d.tr, box = h('div', { class: 'tr' });
    if (t.state === 'working') { box.appendChild(h('span', { text: 'Menerjemahkan ke bahasa Indonesia…' })); return box; }
    if (t.state === 'done') {
      box.appendChild(h('span', { text: t.showing === 'tr'
        ? 'Diterjemahkan dari bahasa Inggris (' + t.via + ').'
        : 'Menampilkan teks asli (Inggris).' }));
      box.appendChild(h('button', { class: 'linkbtn', type: 'button', text: t.showing === 'tr' ? 'Lihat asli' : 'Lihat terjemahan', onclick: function () {
        t.showing = t.showing === 'tr' ? 'orig' : 'tr';
        d.summary = t.showing === 'tr' ? t.translated : t.original;
        renderPreview();
      } }));
      return box;
    }
    if (t.state === 'error') {
      box.appendChild(h('span', { text: 'Gagal menerjemahkan' + (t.err ? ' (' + t.err + ')' : '') + '.' }));
      if (t.failedMode !== 'external') {
        // Penerjemah bawaan gagal: tawarkan layanan luar, hanya bila pengguna memilih.
        box.appendChild(h('button', { class: 'btn secondary small', type: 'button', text: 'Coba lewat MyMemory',
          onclick: function () { doTranslate(d, 'external'); } }));
        box.appendChild(h('span', { class: 'trnote', text: 'Ringkasan (bukan seluruh teks) dikirim ke layanan MyMemory.' }));
        return box;
      }
    }
    if (t.mode === 'auto' && t.state !== 'error') return box;
    if (!t.mode) return box;
    box.appendChild(h('button', { class: 'btn secondary small', type: 'button',
      text: t.state === 'error' ? 'Coba lagi' : (t.mode === 'download' ? 'Terjemahkan ke Indonesia (unduh model sekali)' : 'Terjemahkan ke Indonesia'),
      onclick: function () { doTranslate(d, t.mode === 'auto' ? 'auto' : t.mode); } }));
    if (t.mode === 'external') box.appendChild(h('span', { class: 'trnote', text: 'Ringkasan (bukan seluruh teks) dikirim ke layanan MyMemory.' }));
    return box;
  }

  /* ---------- preview ---------- */
  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }

  function linkNode(l, withMeta) {
    var meta = h('span', { class: 'gh' });
    var a = h('a', { class: 'link', href: l.url, target: '_blank', rel: 'noopener noreferrer' }, [
      h('span', { class: 'lbl', text: l.label }),
      h('span', { class: 'dom', text: l.github ? l.domain + '/' + l.github.owner + '/' + l.github.repo : l.domain }),
      meta
    ]);
    if (l.meta) {
      var bits = [];
      if (l.meta.desc) bits.push(l.meta.desc);
      if (l.meta.stars != null) bits.push('★ ' + l.meta.stars.toLocaleString('id-ID'));
      if (l.meta.lang) bits.push(l.meta.lang);
      meta.textContent = bits.join(' · ');
    } else if (withMeta) {
      enrich(l, meta);
    }
    if (!meta.textContent && !withMeta) meta.remove();
    return a;
  }

  function tagChips(tags, onRemove) {
    return tags.map(function (t, i) {
      return h('span', { class: 'chip' }, [
        t,
        onRemove ? h('button', { class: 'x', type: 'button', 'aria-label': 'Hapus tag ' + t, text: '×', onclick: function () { onRemove(i); } }) : null
      ]);
    });
  }

  function renderPreview() {
    var box = $('preview');
    box.textContent = '';
    var d = state.draft;
    if (!d) {
      box.appendChild(h('p', { class: 'empty', text: 'Tempel teks di sebelah. Ringkasan, link berlabel, dan tag muncul di sini.' }));
      return;
    }

    var sum = h('textarea', { class: 'sum', rows: '2', 'aria-label': 'Ringkasan (bisa diedit)', spellcheck: 'false' });
    sum.value = d.summary;
    sum.addEventListener('input', function () { d.summary = sum.value; autosize(sum); });
    var sumBlock = h('div', { class: 'block' }, [
      h('div', { class: 'eyebrow', text: 'Ringkasan' }), sum,
      d.note ? h('div', { class: 'hint', role: 'note', text: d.note }) : null,
      d.lang === 'en' && d.tr ? trNode(d) : null
    ]);
    box.appendChild(sumBlock);

    if (d.mode === 'list' && d.items && d.items.length) {
      box.appendChild(h('div', { class: 'block' }, [
        h('div', { class: 'eyebrow', text: 'Daftar (' + d.items.length + ' item)' }),
        h('ul', { class: 'items' }, d.items.map(function (t) { return h('li', { text: t }); }))
      ]));
    }

    if (d.links.length) {
      var list = h('div', { class: 'links' });
      d.links.forEach(function (l, i) { list.appendChild(linkNode(l, i < 6)); });
      box.appendChild(h('div', { class: 'block' }, [h('div', { class: 'eyebrow', text: 'Link (' + d.links.length + ')' }), list]));
    }

    var chips = h('div', { class: 'chips' });
    function drawTags() {
      chips.textContent = '';
      tagChips(d.tags, function (i) { d.tags.splice(i, 1); drawTags(); }).forEach(function (c) { chips.appendChild(c); });
      var inp = h('input', { class: 'tagadd', type: 'text', placeholder: '+ tag', 'aria-label': 'Tambah tag', maxlength: '24' });
      inp.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var v = inp.value.trim();
        if (v && d.tags.length < 8 && d.tags.indexOf(v) < 0) { d.tags.push(v); drawTags(); chips.lastChild.focus(); }
      });
      chips.appendChild(inp);
    }
    drawTags();
    box.appendChild(chips);

    box.appendChild(h('div', { class: 'actions' }, [
      h('button', { class: 'btn primary', type: 'button', text: 'Simpan kartu', onclick: saveDraft }),
      h('button', { class: 'btn secondary', type: 'button', text: 'Salin ringkasan', onclick: function () {
        copyText(noteText(d)).then(function () { toast('Ringkasan disalin'); }, function () { toast('Gagal menyalin'); });
      } })
    ]));
    autosize(sum);
  }

  function process() {
    var raw = $('raw').value;
    state.raw = raw;
    if (!raw.trim()) { state.draft = null; $('stat').textContent = ''; renderPreview(); return; }
    var r = SLC.processText(raw);
    r.rawText = raw;
    state.draft = r;
    $('stat').textContent = r.stats.links + ' link · ' + r.stats.words + ' kata';
    if (r.lang === 'en' && r.summary) {
      r.tr = { state: 'idle', mode: null };
      translateMode().then(function (m) {
        if (state.draft !== r) return;
        r.tr.mode = m;
        if (m === 'auto') doTranslate(r, 'auto'); else renderPreview();
      });
    }
    renderPreview();
  }

  function saveDraft() {
    var d = state.draft;
    if (!d) return;
    var now = Date.now();
    var note = {
      id: uid(), createdAt: now, updatedAt: now,
      summary: d.summary, rawText: d.rawText, links: d.links, tags: d.tags,
      mode: d.mode, items: d.items, pinned: false
    };
    state.notes.unshift(note);
    syncPush(note);
    persist();
    $('raw').value = '';
    state.draft = null;
    $('stat').textContent = '';
    renderPreview();
    renderAll();
    toast('Kartu disimpan');
  }

  /* ---------- library ---------- */
  function visibleNotes() {
    var q = state.query.trim().toLowerCase();
    return state.notes.filter(function (n) {
      if (state.filter === 'pinned' && !n.pinned) return false;
      if (state.tag && n.tags.indexOf(state.tag) < 0) return false;
      if (!q) return true;
      var hay = (n.summary + ' ' + n.tags.join(' ') + ' ' + n.links.map(function (l) { return l.label + ' ' + l.url; }).join(' ')).toLowerCase();
      return hay.indexOf(q) >= 0;
    }).sort(function (a, b) {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return b.createdAt - a.createdAt;
    });
  }

  function removeNote(n) {
    var idx = state.notes.indexOf(n);
    if (idx < 0) return;
    state.notes.splice(idx, 1);
    tomb[n.id] = Date.now();
    syncRemove(n.id);
    persist();
    renderAll();
    undo = { note: n, idx: idx };
    toast('Kartu dihapus', { label: 'Urungkan', run: function () {
      if (!undo) return;
      var back = undo.note;
      delete tomb[back.id];
      back.updatedAt = Date.now();
      back.sync = false;
      state.notes.splice(Math.min(undo.idx, state.notes.length), 0, back);
      syncPush(back);
      undo = null; persist(); renderAll(); $('toast').hidden = true;
    } });
  }

  function cardNode(n) {
    var links = h('div', { class: 'links' }, n.links.map(function (l) { return linkNode(l, false); }));
    var body = [
      h('p', { text: n.summary }),
      h('div', { class: 'meta', text: n.links.length + ' link · ' + rel(n.createdAt) + (n.pinned ? ' · disematkan' : '') })
    ];
    if (n.mode === 'list' && n.items && n.items.length) {
      body.push(h('ul', { class: 'items' }, n.items.map(function (t) { return h('li', { text: t }); })));
    }
    if (n.tags.length) {
      body.push(h('div', { class: 'chips' }, n.tags.map(function (t) {
        return h('button', { class: 'chip', type: 'button', text: t, onclick: function () { state.tag = t; renderAll(); } });
      })));
    }
    if (n.links.length) body.push(h('details', {}, [h('summary', { text: 'Lihat link' }), links]));
    body.push(h('div', { class: 'actions' }, [
      h('button', { class: 'btn secondary', type: 'button', text: 'Salin', onclick: function () {
        copyText(noteText(n)).then(function () { toast('Disalin'); }, function () { toast('Gagal menyalin'); });
      } }),
      h('button', { class: 'btn primary', type: 'button', text: 'Buka link', disabled: !n.links.length, onclick: function () {
        if (n.links[0]) window.open(n.links[0].url, '_blank', 'noopener,noreferrer');
      } }),
      h('button', { class: 'btn ghost', type: 'button', text: n.pinned ? 'Lepas' : 'Sematkan', onclick: function () {
        n.pinned = !n.pinned; n.updatedAt = Date.now(); syncPush(n); persist(); renderAll();
      } }),
      h('button', { class: 'btn ghost', type: 'button', text: 'Hapus', onclick: function () { removeNote(n); } })
    ]));
    return h('article', { class: 'card' + (n.pinned ? ' pinned' : '') }, body);
  }

  function renderNav() {
    var nav = $('nav'), tn = $('tagnav');
    nav.textContent = ''; tn.textContent = '';
    var pinned = state.notes.filter(function (n) { return n.pinned; }).length;
    [['all', 'Semua kartu', state.notes.length], ['pinned', 'Disematkan', pinned]].forEach(function (x) {
      nav.appendChild(h('button', {
        class: 'navitem', type: 'button', 'aria-pressed': String(state.filter === x[0] && !state.tag),
        onclick: function () { state.filter = x[0]; state.tag = null; renderAll(); }
      }, [h('span', { text: x[1] }), h('span', { class: 'n', text: String(x[2]) })]));
    });
    var counts = {};
    state.notes.forEach(function (n) { n.tags.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); }).forEach(function (t) {
      tn.appendChild(h('button', {
        class: 'navitem', type: 'button', 'aria-pressed': String(state.tag === t),
        onclick: function () { state.tag = state.tag === t ? null : t; renderAll(); }
      }, [h('span', { text: t }), h('span', { class: 'n', text: String(counts[t]) })]));
    });
  }

  function renderGrid() {
    var grid = $('grid');
    grid.textContent = '';
    var list = visibleNotes();
    var title = state.tag ? 'Tag: ' + state.tag : state.filter === 'pinned' ? 'Disematkan' : 'Semua kartu';
    $('libtitle').textContent = title;
    $('libcount').textContent = list.length + ' kartu';
    if (!list.length) {
      grid.appendChild(h('div', { class: 'nothing', text: state.notes.length
        ? 'Tidak ada kartu yang cocok dengan filter atau pencarian ini.'
        : 'Belum ada kartu. Tempel teks atau thread di atas, lalu simpan.' }));
      return;
    }
    list.forEach(function (n) { grid.appendChild(cardNode(n)); });
  }

  function renderAll() { renderNav(); renderGrid(); }

  /* ---------- events ---------- */
  $('raw').addEventListener('input', function () {
    clearTimeout(procTimer);
    procTimer = setTimeout(process, 200);
  });
  $('raw').addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { clearTimeout(procTimer); process(); saveDraft(); }
  });
  $('q').addEventListener('input', function (e) { state.query = e.target.value; renderGrid(); });
  $('clear').addEventListener('click', function () { $('raw').value = ''; process(); $('raw').focus(); });
  $('paste').addEventListener('click', function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) { toast('Browser tidak mengizinkan baca clipboard. Tempel manual dengan Ctrl+V.'); $('raw').focus(); return; }
    navigator.clipboard.readText().then(function (t) { $('raw').value = t; process(); },
      function () { toast('Izin clipboard ditolak. Tempel manual dengan Ctrl+V.'); $('raw').focus(); });
  });

  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); installEvt = e; $('install').hidden = false;
  });
  $('install').addEventListener('click', function () {
    if (!installEvt) return;
    installEvt.prompt();
    installEvt.userChoice.then(function () { installEvt = null; $('install').hidden = true; });
  });

  /* ---------- Web Share Target: ?title=&text=&url= ---------- */
  function handleShare() {
    var p = new URLSearchParams(location.search);
    var parts = [p.get('title'), p.get('text'), p.get('url')].filter(Boolean);
    if (!parts.length) return;
    var url = p.get('url');
    if (url && (p.get('text') || '').indexOf(url) >= 0) parts = parts.filter(function (x) { return x !== url; });
    $('raw').value = parts.join('\n');
    process();
    if (state.draft) { saveDraft(); toast('Kartu dari Bagikan disimpan'); }
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* abaikan */ }
  }

  /* ---------- sinkronisasi (dipasok sync.js lewat window.SLCSync / window.SLCApp) ---------- */
  function syncReady() { return !!(window.SLCSync && window.SLCSync.ready()); }

  // n.sync = true hanya setelah server mengonfirmasi tulisan; dipakai untuk mendeteksi
  // kartu yang dihapus dari perangkat lain.
  // Satu pengiriman per kartu pada satu waktu; perubahan yang datang saat pengiriman
  // berjalan memicu pengiriman ulang dengan data terbaru.
  function syncPush(n) {
    if (!syncReady()) return;
    if (pushing[n.id]) { pushing[n.id] = 'again'; return; }
    pushing[n.id] = true;
    window.SLCSync.push(n).then(
      function () { if (pushing[n.id] !== 'again') { n.sync = true; persist(); } syncErr = ''; },
      function (e) { setSync('error', e && e.code); }
    ).then(function () {
      var again = pushing[n.id] === 'again';
      delete pushing[n.id];
      if (again) syncPush(n);
    });
  }

  function syncRemove(id) {
    if (!syncReady()) return;
    window.SLCSync.remove(id).catch(function (e) { setSync('error', e && e.code); });
  }

  function normalize(r) {
    return {
      id: r.id, summary: r.summary || '', rawText: r.rawText || '',
      links: r.links || [], tags: r.tags || [], mode: r.mode || 'prose',
      items: r.items || null, pinned: !!r.pinned,
      createdAt: r.createdAt || Date.now(), updatedAt: r.updatedAt || r.createdAt || Date.now(),
      sync: !r.__pending
    };
  }

  // Status error bersifat lengket: snapshot berikutnya tidak boleh menimpanya dengan
  // "Tersinkron" sebelum ada penulisan yang berhasil.
  function setSync(kind, detail) {
    if (kind === 'error') syncErr = detail || 'error';
    syncState = kind;
    renderAcct(kind === 'error' ? syncErr : detail);
  }

  function renderAcct(detail) {
    var row = $('acctRow'), login = $('login'), logout = $('logout');
    row.textContent = '';
    if (!user) {
      row.appendChild(h('div', { class: 'acct-text' }, [
        h('div', { class: 'acct-title', text: 'Mode lokal' }),
        h('div', { class: 'acct-sub', text: 'Kartu tersimpan di perangkat ini.' })
      ]));
      login.hidden = false; logout.hidden = true;
      return;
    }
    var labels = {
      syncing: 'Menyinkronkan…', synced: 'Tersinkron',
      saving: 'Menyimpan' + (detail ? ' ' + detail + ' kartu' : '') + '…',
      offline: 'Offline, menunggu sinkron',
      error: 'Gagal sinkron' + (detail ? ' (' + detail + ')' : '')
    };
    var who = user.name || user.email || 'Akun';
    row.appendChild(user.photo
      ? h('img', { class: 'avatar', src: user.photo, alt: '', referrerpolicy: 'no-referrer' })
      : h('div', { class: 'avatar', text: who.charAt(0).toUpperCase() }));
    row.appendChild(h('div', { class: 'acct-text' }, [
      h('div', { class: 'acct-title', text: who }),
      h('div', { class: 'acct-sub', text: labels[syncState] || labels.syncing }),
      // Bukti untuk dicocokkan dengan Firestore console: uid akun ini dan jumlah dokumen yang dilihat server.
      h('div', { class: 'acct-diag', title: 'UID lengkap: ' + user.uid,
        text: 'uid …' + user.uid.slice(-6) + (cloudCount == null ? '' : ' · ' + cloudCount + ' di cloud') })
    ]));
    login.hidden = true; logout.hidden = false;
  }

  function setUser(u) {
    user = u;
    syncErr = '';
    cloudCount = null;
    if (u) {
      var prev = null;
      try { prev = localStorage.getItem('slc.uid'); } catch (e) { /* abaikan */ }
      if (prev && prev !== u.uid) { state.notes = []; persist(); renderAll(); } // akun berbeda: jangan campur data
      try { localStorage.setItem('slc.uid', u.uid); } catch (e) { /* abaikan */ }
      setSync('syncing');
    } else {
      syncState = '';
      renderAcct();
    }
  }

  // Gabungkan snapshot Firestore ke daftar lokal: last-write-wins per kartu (updatedAt).
  function applyRemote(remote, meta) {
    meta = meta || {};
    cloudCount = remote.length;
    var byId = {}, rIds = {}, changed = false;
    state.notes.forEach(function (n) { byId[n.id] = n; });
    remote.forEach(function (r) {
      rIds[r.id] = true;
      if (tomb[r.id]) return;
      var l = byId[r.id];
      if (!l) { state.notes.push(normalize(r)); changed = true; return; }
      var ru = r.updatedAt || 0, lu = l.updatedAt || 0;
      if (ru > lu) {
        var nn = normalize(r);
        Object.keys(nn).forEach(function (k) { l[k] = nn[k]; });
        changed = true;
      } else if (lu > ru) {
        syncPush(l);
      } else if (!l.sync && !r.__pending) {
        l.sync = true; changed = true;
      }
    });
    var keep = [];
    state.notes.forEach(function (n) {
      if (rIds[n.id]) { keep.push(n); return; }
      if (n.sync) {
        // Hanya percaya ketidakhadiran jika snapshot dari server (bukan cache).
        if (meta.fromCache === false) { changed = true; return; }
        keep.push(n); return;
      }
      syncPush(n);   // kartu lokal yang belum pernah naik
      keep.push(n);
    });
    state.notes = keep;
    if (changed) { persist(); renderAll(); }
    var unsynced = state.notes.filter(function (n) { return !n.sync; }).length;
    if (syncErr) setSync('error', syncErr);
    else if (meta.hasPendingWrites || unsynced) setSync('saving', unsynced || 0);
    else if (meta.fromCache) setSync(navigator.onLine ? 'syncing' : 'offline');
    else setSync('synced');
  }

  window.SLCApp = { setUser: setUser, applyRemote: applyRemote, setSync: setSync, toast: toast };

  $('login').addEventListener('click', function () {
    if (!window.SLCSync) { toast('Sinkronisasi belum siap. Buka lewat http(s) dan pastikan online.'); return; }
    window.SLCSync.signIn().catch(function (e) {
      if (e && e.code === 'auth/unauthorized-domain') {
        toast('Domain "' + location.hostname + '" belum diizinkan di Firebase. Buka lewat http://localhost:' + (location.port || '80') +
          ' atau tambahkan domain ini di Authentication > Settings > Authorized domains.', null, 12000);
      } else {
        toast('Login gagal' + (e && e.code ? ' (' + e.code + ')' : ''));
      }
    });
  });
  $('logout').addEventListener('click', function () {
    var unsynced = state.notes.filter(function (n) { return !n.sync; }).length;
    var msg = 'Keluar akan menghapus salinan kartu dari perangkat ini. Kartu tetap aman di akunmu.' +
      (unsynced ? '\n\n' + unsynced + ' kartu belum tersinkron dan akan hilang. Tunggu status "Tersinkron" dulu.' : '') +
      '\n\nLanjut keluar?';
    if (!window.confirm(msg)) return;
    window.SLCSync.signOut().then(function () {
      state.notes = []; state.filter = 'all'; state.tag = null;
      persist();
      try { localStorage.removeItem('slc.uid'); } catch (e) { /* abaikan */ }
      renderAll();
      toast('Berhasil keluar');
    });
  });

  /* ---------- start ---------- */
  renderPreview();
  renderAll();
  renderAcct();
  handleShare();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* PWA opsional */ });
  }
})();
