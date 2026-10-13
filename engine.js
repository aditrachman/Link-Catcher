/* Smart Link Catcher: mesin ekstraksi link, ringkasan ekstraktif, dan tagging.
   Murni (tanpa DOM), jalan di browser dan Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SLC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STOP = new Set((
    'yang dan di ke dari untuk dengan ini itu atau pada juga akan bisa ada sudah telah saya kamu kita kami mereka dia nya ' +
    'lagi buat bikin jadi kalau kalo tapi tetapi karena sebagai dalam oleh agar supaya sih dong deh aja saja ya yg gak nggak ' +
    'tidak bukan lebih sangat semua setiap para hanya masih belum sedang harus mau udah yuk nih tuh banget kok lah mah pun ' +
    'the a an and or of to in on for with is are was were be been it this that these those as at by from you your i we they ' +
    'he she not no but if so do does did have has had can will just about into over than then there their its our my me his ' +
    'her what which who how when where why also more most some any all each other such only own same too very'
  ).split(/\s+/));

  var ID_W = new Set((
    'yang dan di ke dari untuk dengan ini itu atau pada juga akan bisa ada sudah telah saya kamu kita kami mereka dia lagi ' +
    'buat bikin jadi kalau kalo tapi karena sebagai dalam oleh agar supaya tidak bukan lebih sangat semua setiap hanya masih ' +
    'belum sedang harus mau udah yuk banget kok aja saja nih tuh dong deh'
  ).split(/\s+/));
  var EN_W = new Set((
    'the and of to in on for with is are was were be been it this that these those as at by from you your we they he she not ' +
    'but if so do does did have has had can will just about into over than then there their its our my what which who how ' +
    'when where why also more most some any all each other such only'
  ).split(/\s+/));

  var NOISE_WORDS =/^(reply|replies|repost|reposts|retweet|retweets|share|shares|like|likes|view|views|quote|quotes|bookmark|bookmarks|balas|bagikan|suka|komentar|tayangan|simpan)$/i;
  var URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
  var WA_PREFIX = /^\[?\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4},?\s+\d{1,2}[.:]\d{2}(?:[.:]\d{2})?(?:\s?[AaPp][Mm])?\]?\s*[-\u2013]?\s*[^:\n]{1,40}:\s*/;
  var THREAD_MARK = /^\s*\(?\d{1,2}\s*\/\s*\d{0,2}\)?\s+/;
  var LIST_MARK = /^\s*(?:\d{1,2}[.)]|[-*\u2022\u2013])\s+(?=\S)/;

  var TAG_DICT = {
    'Linux': ['linux', 'ubuntu', 'debian', 'fedora', 'arch linux', 'distro', 'terminal', 'bash'],
    'Open Source': ['open source', 'opensource', 'github.com', 'gitlab.com', 'foss'],
    'Coding': ['coding', 'programming', 'pemrograman', 'developer', 'framework', 'repo', 'git', 'api', 'javascript', 'typescript', 'compiler', 'library'],
    'Python': ['python', 'pip', 'jupyter', 'pandas', 'numpy'],
    'AI': ['ai', 'llm', 'gpt', 'chatgpt', 'machine learning', 'deep learning', 'prompt', 'claude'],
    'NLP': ['nlp', 'sastrawi', 'tokenisasi', 'sentimen', 'preprocessing', 'corpus'],
    'Office': ['office', 'spreadsheet', 'excel', 'libreoffice', 'onlyoffice', 'presentasi', 'dokumen'],
    'Produktivitas': ['produktivitas', 'productivity', 'catatan', 'notes', 'obsidian', 'notion', 'todo'],
    'Database': ['database', 'sql', 'mysql', 'postgres', 'postgresql', 'sqlite', 'mongodb', 'firebase', 'firestore'],
    'Desain': ['desain', 'design', 'figma', 'ui', 'ux', 'font', 'tipografi'],
    'Web': ['website', 'frontend', 'backend', 'react', 'nextjs', 'next.js', 'vue', 'css', 'html', 'pwa'],
    'Keamanan': ['keamanan', 'security', 'vpn', 'password', 'enkripsi', 'privasi', 'privacy'],
    'Jaringan': ['jaringan', 'network', 'router', 'mikrotik', 'wifi', 'dns']
  };

  function trimUrl(u) {
    var prev;
    do {
      prev = u;
      u = u.replace(/[.,;:!?'"\]}>]+$/, '');
      if (u.slice(-1) === ')' && (u.match(/\(/g) || []).length < (u.match(/\)/g) || []).length) u = u.slice(0, -1);
    } while (u !== prev);
    return u;
  }

  function domainOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch (e) { return url.replace(/^https?:\/\//, '').split('/')[0]; }
  }

  function githubRepo(url) {
    var m = /^https?:\/\/(?:www\.)?github\.com\/([^\/\s?#]+)\/([^\/\s?#]+)/i.exec(url);
    return m ? { owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
  }

  function normKey(url) {
    try {
      var u = new URL(url);
      return u.hostname.toLowerCase().replace(/^www\./, '') + u.pathname.replace(/\/+$/, '') + u.search;
    } catch (e) { return url.toLowerCase(); }
  }

  function extractLinks(text) {
    var out = [], seen = {}, m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text)) !== null) {
      var url = trimUrl(m[0]);
      if (url.length < 10) continue;
      var key = normKey(url);
      if (seen[key]) continue;
      seen[key] = true;
      out.push({ url: url, index: m.index, end: m.index + url.length });
    }
    return out;
  }

  function isNoiseLine(line) {
    var toks = line.split(/[\s\u00b7\u2022|]+/).filter(Boolean);
    if (!toks.length) return false;
    var hasWord = false;
    for (var i = 0; i < toks.length; i++) {
      if (NOISE_WORDS.test(toks[i])) hasWord = true;
      else if (!/^[\d.,]+[kKmM]?$/.test(toks[i])) return false;
    }
    return hasWord || (toks.length === 1 && /^[\d.,]+[kKmM]?$/.test(toks[0]));
  }

  function words(s) { return (s.match(/[\p{L}\p{N}]+/gu) || []); }

  // Deteksi kasar Inggris vs Indonesia dari kata fungsi; 'unknown' bila tidak yakin.
  function detectLang(s) {
    var en = 0, id = 0;
    words(String(s || '').toLowerCase()).forEach(function (w) {
      if (EN_W.has(w)) en++;
      if (ID_W.has(w)) id++;
    });
    if (en >= 4 && en > id * 1.5) return 'en';
    if (id >= 2 && id >= en) return 'id';
    return 'unknown';
  }

  function stripNoise(line) {
    return line.replace(WA_PREFIX, '').replace(/(^|\s)@\w+/g, '$1').replace(/\s{2,}/g, ' ').trim();
  }

  function cutAtWord(s, max) {
    if (s.length <= max) return s;
    var cut = s.slice(0, max);
    var sp = cut.lastIndexOf(' ');
    return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:\-]+$/, '') + '\u2026';
  }

  function cleanLines(text) {
    return text.replace(/\r\n?/g, '\n').split('\n').map(function (raw) {
      return { raw: raw, text: stripNoise(raw) };
    });
  }

  function detectList(lines) {
    var items = [];
    lines.forEach(function (l) { if (LIST_MARK.test(l.raw)) items.push(l); });
    return items.length >= 3 ? items : null;
  }

  function sentencesOf(lines) {
    var out = [];
    out.linked = {};
    lines.forEach(function (l) {
      if (!l.text || isNoiseLine(l.text)) return;
      var t = l.text.replace(URL_RE, ' ').replace(THREAD_MARK, '').replace(/\s{2,}/g, ' ').trim();
      if (!t) return;
      var hasUrl = /https?:\/\//.test(l.text);
      t.split(/(?<=[.!?\u2026])\s+/).forEach(function (s) {
        s = s.trim();
        if (words(s).length >= 4) { out.push(s); out.linked[out.length - 1] = hasUrl; }
      });
    });
    return out;
  }

  function endPunct(s) { return /[.!?\u2026]$/.test(s) ? s : s + '.'; }

  function summarize(sentences, n, linked) {
    linked = linked || sentences.linked || {};
    if (sentences.length <= n) return sentences.map(endPunct).join(' ');
    var N = sentences.length, tokens = sentences.map(function (s) {
      return words(s.toLowerCase()).filter(function (w) { return !STOP.has(w) && w.length > 2; });
    });
    var tf = {}, df = {}, total = 0;
    tokens.forEach(function (ts) {
      var seen = {};
      ts.forEach(function (w) { tf[w] = (tf[w] || 0) + 1; total++; if (!seen[w]) { seen[w] = 1; df[w] = (df[w] || 0) + 1; } });
    });
    var scored = sentences.map(function (s, i) {
      var ts = tokens[i], uniq = {}, sc = 0;
      ts.forEach(function (w) { uniq[w] = 1; });
      Object.keys(uniq).forEach(function (w) { sc += (tf[w] / total) * Math.log(1 + N / df[w]); });
      sc = ts.length ? sc / Math.sqrt(ts.length) : 0;
      var wc = words(s).length;
      if (i === 0) sc *= 1.25;
      if (linked[i]) sc *= 1.15;
      if (wc < 6) sc *= 0.7;
      if (wc > 45) sc *= 0.8;
      return { i: i, sc: sc };
    });
    scored.sort(function (a, b) { return b.sc - a.sc; });
    var pick = scored.slice(0, n).map(function (x) { return x.i; }).sort(function (a, b) { return a - b; });
    return pick.map(function (i) { return endPunct(cutAtWord(sentences[i], 280)); }).join(' ');
  }

  // Label dari pola URL platform populer saat teks sekitarnya tidak memberi konteks.
  function platformLabel(url) {
    var u;
    try { u = new URL(url); } catch (e) { return null; }
    var host = u.hostname.replace(/^www\./, '').toLowerCase();
    var p = u.pathname.split('/').filter(Boolean), m;
    if (/(^|\.)threads\.(com|net)$/.test(host)) {
      m = /^@([^\/]+)/.exec(p[0] || '');
      return m ? 'Postingan Threads dari @' + m[1] : 'Postingan Threads';
    }
    if (host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com') {
      return p[0] && p[1] === 'status' ? 'Postingan X dari @' + p[0] : null;
    }
    if (host === 'youtu.be' || /(^|\.)youtube\.com$/.test(host)) return 'Video YouTube';
    if (host === 'instagram.com') return /^(p|reel|reels)$/.test(p[0] || '') ? 'Postingan Instagram' : null;
    if (host === 'tiktok.com' || /\.tiktok\.com$/.test(host)) {
      m = /^@([^\/]+)/.exec(p[0] || '');
      return m ? 'Video TikTok dari @' + m[1] : 'Video TikTok';
    }
    if (host === 'reddit.com' || /\.reddit\.com$/.test(host)) return p[0] === 'r' && p[1] ? 'Diskusi di r/' + p[1] : null;
    return null;
  }

  function labelFor(text, link, domain) {
    var lineStart = text.lastIndexOf('\n', link.index - 1) + 1;
    var lineEnd = text.indexOf('\n', link.end);
    if (lineEnd < 0) lineEnd = text.length;
    function tidy(s) {
      return stripNoise(s.replace(URL_RE, ' ')).replace(THREAD_MARK, '').replace(LIST_MARK, '')
        .replace(/[\s:\-\u2013>]+$/, '').replace(/\.$/, '').trim();
    }
    var label = tidy(text.slice(lineStart, lineEnd));
    if (words(label).length < 3) {
      var before = text.slice(0, lineStart).split('\n');
      for (var i = before.length - 1; i >= 0 && i >= before.length - 3; i--) {
        var cand = tidy(before[i]);
        if (words(cand).length >= 3 && !isNoiseLine(cand)) { label = cand; break; }
      }
    }
    if (words(label).length < 2) return platformLabel(link.url) || domain;
    return cutAtWord(label, 80);
  }

  function autoTags(text, links, max) {
    var hay = ' ' + text.toLowerCase().replace(URL_RE, ' ') + ' ' + links.map(function (l) { return l.domain; }).join(' ').toLowerCase() + ' ';
    var scored = [];
    Object.keys(TAG_DICT).forEach(function (tag) {
      var hits = 0;
      TAG_DICT[tag].forEach(function (kw) {
        var esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var re = new RegExp('(^|[^\\p{L}\\p{N}])' + esc + '(?=$|[^\\p{L}\\p{N}])', 'giu');
        var m = hay.match(re);
        if (m) hits += m.length;
      });
      if (hits) scored.push({ tag: tag, hits: hits });
    });
    scored.sort(function (a, b) { return b.hits - a.hits; });
    return scored.slice(0, max || 4).map(function (x) { return x.tag; });
  }

  function processText(raw) {
    var text = String(raw || '').replace(/\r\n?/g, '\n');
    var found = extractLinks(text);
    var links = found.map(function (l) {
      var domain = domainOf(l.url);
      var gh = githubRepo(l.url);
      var o = { url: l.url, domain: domain, label: labelFor(text, l, domain) };
      if (gh) o.github = gh;
      return o;
    });
    var lines = cleanLines(text);
    var listLines = detectList(lines);
    var mode = 'prose', items = null, summary;
    if (listLines) {
      mode = 'list';
      items = listLines.map(function (l) {
        var t = l.text.replace(URL_RE, ' ').replace(LIST_MARK, '').replace(/\s{2,}/g, ' ').trim();
        return t || 'Tautan';
      });
      var intro = sentencesOf(lines.filter(function (l) { return !LIST_MARK.test(l.raw); }));
      summary = intro.length ? cutAtWord(intro[0], 280) : 'Daftar ' + items.length + ' item.';
    } else {
      var sents = sentencesOf(lines);
      summary = sents.length ? summarize(sents, 3) : cutAtWord(lines.map(function (l) { return l.text; }).join(' ').replace(URL_RE, ' ').replace(/\s{2,}/g, ' ').trim(), 280);
    }
    var note = '';
    if (!summary.trim() && links.length) {
      // Teks hanya berisi link: tidak ada kalimat untuk diringkas.
      summary = links.length === 1
        ? links[0].label + '.'
        : 'Berisi ' + links.length + ' link: ' + links.slice(0, 3).map(function (l) { return l.label; }).join('; ') + (links.length > 3 ? '; dan lainnya.' : '.');
      note = 'Hanya ada link, tanpa teks. Tempel juga isi postingannya di kotak yang sama agar ringkasannya berisi.';
    }
    return {
      summary: summary,
      note: note,
      lang: detectLang(text.replace(URL_RE, ' ').slice(0, 3000)),
      links: links,
      tags: autoTags(text, links, 4),
      mode: mode,
      items: items,
      stats: { words: words(text).length, links: links.length }
    };
  }

  return {
    processText: processText, extractLinks: extractLinks, summarize: summarize,
    autoTags: autoTags, detectLang: detectLang, domainOf: domainOf, githubRepo: githubRepo, trimUrl: trimUrl
  };
});
