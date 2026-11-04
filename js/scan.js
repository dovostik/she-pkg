/* Scan QR Mine Permit & catat pelanggaran (bisa tanpa sinyal: antre di HP, terkirim saat online) */
(function () {
  const A = () => window.App;
  const $ = (s, el) => (el || document).querySelector(s);
  const KEY_Q = 'plg_antrian', KEY_J = 'plg_jenis', KEY_AREA = 'plg_area', KEY_CACHE = 'mp_cache';
  let stream = null, loopId = null, jsqrLoaded = null;

  const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  const antrian = () => ls.get(KEY_Q, []);

  function parseQR(text) {
    const id = (text.match(/ID:\s*([0-9A-Fa-f]{12,32})/) || text.trim().match(/^([0-9A-Fa-f]{12,32})$/) || [])[1];
    const g = r => (text.match(r) || [])[1];
    return { id: id && id.toLowerCase(), nomor: g(/No:\s*(.+)/), nama: g(/Nama:\s*(.+)/), berlaku: g(/Berlaku s\/d:\s*(.+)/), raw: text };
  }

  async function refreshRef() {
    try {
      const j = await A().q(A().sb.from('pelanggaran_jenis').select('kode,nama').eq('aktif', true).order('urut'));
      ls.set(KEY_J, j);
      const a = await A().q(A().sb.from('area').select('id,nama').eq('aktif', true).order('nama'));
      ls.set(KEY_AREA, a);
    } catch (e) { /* offline: pakai cache */ }
  }

  /* pencarian jenis: cocok kata / awalan / salah ketik ringan */
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  function lev(a, b) { const m = a.length, n = b.length; if (!m || !n) return m + n; const d = Array.from({ length: m + 1 }, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
  function cariJenis(q) {
    const list = ls.get(KEY_J, []); const qs = norm(q); if (!qs) return list.slice(0, 12);
    const toks = qs.split(' ');
    return list.map(j => { const n = norm(j.nama), words = n.split(' ');
      let s = 0; toks.forEach(t => { if (n.includes(t)) s += 3; else if (words.some(w => w.startsWith(t.slice(0, 3)) && lev(w.slice(0, t.length), t) <= 1)) s += 2; else if (words.some(w => lev(w, t) <= Math.max(1, Math.floor(t.length / 4)))) s += 1; });
      if (n.startsWith(qs)) s += 2; if (j.kode.toLowerCase() === qs) s += 5; return { j, s }; })
      .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 8).map(x => x.j);
  }

  async function kirimAntrian() {
    const q = antrian(); if (!q.length || !navigator.onLine) return;
    const sisa = [];
    for (const it of q) {
      try {
        let kimper_id = it.kimper_id;
        if (!kimper_id && it.qr_id) { const r = await A().q(A().sb.rpc('scan_mine_permit', { p_isi: it.qr_id })); kimper_id = r[0]?.kimper_id; }
        if (!kimper_id) throw new Error('Mine Permit tidak ditemukan untuk ' + (it.nama || it.qr_id));
        const foto = [];
        for (const f of it.foto || []) {
          const blob = await (await fetch(f)).blob(); const path = kimper_id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.jpg';
          await A().q(A().sb.storage.from('pelanggaran').upload(path, blob, { contentType: 'image/jpeg' })); foto.push(path);
        }
        await A().q(A().sb.from('pelanggaran').insert({ kimper_id, karyawan_id: it.karyawan_id || null, jenis_kode: it.jenis_kode, tgl: it.tgl, area_id: it.area_id || null, lokasi: it.lokasi || null,
          unit_no: it.unit_no || null, keterangan: it.keterangan || null, tindakan: it.tindakan || null, foto, lat: it.lat, lng: it.lng, sumber: it.sumber || 'scan_qr',
          dicatat_offline_at: it.offline ? it.tgl : null }));
      } catch (e) { it.gagal = A().errMsg(e); sisa.push(it); }
    }
    ls.set(KEY_Q, sisa);
    const n = q.length - sisa.length; if (n) A().toast(n + ' pelanggaran dari antrean terkirim');
    badge();
  }
  function badge() { const n = antrian().length; const el = document.querySelector('[data-nav="scan"]'); if (el) el.dataset.count = n || ''; const b = $('#antrian'); if (b) b.innerHTML = n ? '<div class="note warn">' + n + ' pelanggaran menunggu sinyal untuk dikirim. <button class="btn sm" id="kirimq">Kirim sekarang</button></div>' : ''; const k = $('#kirimq'); if (k) k.onclick = kirimAntrian; }
  window.addEventListener('online', kirimAntrian);

  function stop() { if (loopId) cancelAnimationFrame(loopId); loopId = null; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; }

  async function view(v) {
    if (!A().canScan()) { v.innerHTML = '<div class="empty">Scan hanya untuk SHE / pengawas.</div>'; return; }
    refreshRef();
    v.innerHTML = '<div class="page-head"><h1>Scan Mine Permit</h1></div><div id="antrian"></div>' +
      '<div class="scan-wrap"><video playsinline muted></video><div class="scan-frame"></div><div class="scan-msg">Arahkan kamera ke QR di belakang Mine Permit</div></div>' +
      '<div class="actions"><button class="btn" id="mulai">Nyalakan kamera</button></div>' +
      '<form class="filters" id="manual"><input name="cari" placeholder="QR rusak? Ketik nomor Mine Permit / nama"><button class="btn">Cari</button></form><div id="hasil"></div>';
    badge(); kirimAntrian();
    $('#mulai').onclick = mulai;
    $('#manual').onsubmit = async e => {
      e.preventDefault(); const s = e.target.cari.value.replace(/[%,()]/g, ' ').trim(); if (!s) return;
      try { const r = await A().q(A().sb.from('v_mine_permit').select('id,nomor,nama,perusahaan,status,token_qr').or('nomor.ilike.%' + s + '%,nama.ilike.%' + s + '%').order('berlaku_sampai', { ascending: false }).limit(8));
        $('#hasil').innerHTML = r.length ? '<div class="suggest">' + r.map(x => '<button type="button" data-t="' + x.token_qr + '">' + A().esc(x.nama) + ' <small>' + A().esc(x.nomor) + ' · ' + A().esc(x.perusahaan) + ' · ' + x.status + '</small></button>').join('') + '</div>' : '<div class="empty">Tidak ditemukan.</div>';
        document.querySelectorAll('#hasil [data-t]').forEach(b => b.onclick = () => tampil(b.dataset.t, 'manual'));
      } catch (er) { A().toast('Pencarian butuh sinyal: ' + A().errMsg(er), 'err'); }
    };
    mulai();
  }

  async function mulai() {
    const video = $('.scan-wrap video'); if (!video) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      video.srcObject = stream; await video.play(); $('#mulai').style.display = 'none';
    } catch (e) { $('.scan-msg').textContent = 'Kamera tidak bisa dibuka (' + (e.name || e) + '). Izinkan kamera, atau ketik nomor di bawah.'; return; }
    let detector = null;
    if ('BarcodeDetector' in window) { try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { } }
    if (!detector) { jsqrLoaded = jsqrLoaded || new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); await jsqrLoaded; }
    const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
    let busy = false, last = 0;
    const tick = async t => {
      loopId = requestAnimationFrame(tick);
      if (busy || t - last < 150 || video.readyState < 2) return; last = t; busy = true;
      try {
        let text = null;
        if (detector) { const r = await detector.detect(video); text = r[0]?.rawValue; }
        else { const w = 640, h = Math.round(video.videoHeight * 640 / video.videoWidth); c.width = w; c.height = h; g.drawImage(video, 0, 0, w, h); const r = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' }); text = r?.data; }
        if (text) { const p = parseQR(text); if (p.id) { navigator.vibrate && navigator.vibrate(80); stop(); tampil(text, 'scan_qr'); } else $('.scan-msg').textContent = 'QR bukan Mine Permit'; }
      } catch (e) { } busy = false;
    };
    loopId = requestAnimationFrame(tick);
  }

  async function tampil(isi, sumber) {
    const p = parseQR(isi.includes('ID:') || isi.length >= 12 ? isi : ''); const H = $('#hasil'); const esc = A().esc;
    let r = null;
    if (navigator.onLine) { try { r = (await A().q(A().sb.rpc('scan_mine_permit', { p_isi: isi })))[0]; } catch (e) { A().toast(A().errMsg(e), 'err'); } }
    if (r) { const c = ls.get(KEY_CACHE, {}); c[p.id || r.kimper_id] = { nama: r.nama, nomor: r.nomor }; ls.set(KEY_CACHE, c); }
    const boleh = r ? (r.status === 'aktif') : null;
    const foto = r?.foto_path ? await A().fotoUrl(r.foto_path).catch(() => null) : null;
    H.innerHTML = '<div class="scan-res ' + (r ? (boleh ? 'ok' : 'no') : 'off') + '">' +
      '<div class="sr-head"><span class="thumb lg">' + (foto ? '<img src="' + esc(foto) + '" alt="">' : '') + '</span><div><b class="big">' + esc(r?.nama || p.nama || '—') + '</b><div>' + esc(r?.nomor || p.nomor || '') + '</div><div class="muted">' + esc(r?.perusahaan || '') + (r?.jabatan ? ' · ' + esc(r.jabatan) : '') + '</div>' +
        (r ? '<div class="verdict">' + (boleh ? 'BOLEH mengoperasikan unit' : 'TIDAK BOLEH — Mine Permit ' + esc(r.status)) + '</div><div class="small">Berlaku s/d ' + A().tgl(r.berlaku_sampai) + ' · ' + (r.akses_kartu === 'RESTRICTED' ? 'RESTRICTED' : 'FULL ACCESS') + '</div>'
           : '<div class="verdict">Tanpa sinyal — data dari QR (berlaku s/d ' + esc(p.berlaku || '-') + ')</div>') + '</div></div>' +
      (r ? '<div class="small"><b>Unit:</b> ' + esc((r.unit || []).join(', ') || '-') + '</div>' +
        '<div class="small"><b>Pelanggaran:</b> ' + r.jumlah_pelanggaran + (r.pelanggaran_terakhir?.length ? '<ul class="plain">' + r.pelanggaran_terakhir.map(x => '<li>' + A().tgl(x.tgl) + ' — ' + esc(x.jenis) + (x.lokasi ? ' (' + esc(x.lokasi) + ')' : '') + '</li>').join('') + '</ul>' : '') + '</div>' +
        (r.accident?.length ? '<div class="small"><b>Accident:</b> ' + r.accident.map(a => '<span class="dot ' + a.warna + '"></span>' + a.tingkat).join(' ') + '</div>' : '') : '') +
      '</div>' + formHTML() +
      '<div class="actions"><button class="btn ghost" id="lagi">Scan berikutnya</button>' + (r ? '<a class="btn ghost" href="#/mp/' + r.kimper_id + '">Buka Mine Permit</a>' : '') + '</div>';
    $('#lagi').onclick = () => { H.innerHTML = ''; mulai(); };
    pasangForm(r, p, sumber);
  }

  function formHTML() {
    const area = ls.get(KEY_AREA, []); const esc = A().esc;
    return '<form id="fplg" class="form box"><h3>Catat pelanggaran</h3>' +
      '<label class="lbl">Jenis pelanggaran<input name="jenis_q" placeholder="Ketik, mis. kecepatan, hp, apd…" autocomplete="off" required></label><input type="hidden" name="jenis_kode"><div class="suggest" id="jsug"></div>' +
      '<div class="grid2"><label class="lbl">Area<select name="area_id"><option value="">—</option>' + area.map(a => '<option value="' + a.id + '">' + esc(a.nama) + '</option>').join('') + '</select></label>' +
      '<label class="lbl">Lokasi detail<input name="lokasi" placeholder="mis. Hauling KM 5"></label>' +
      '<label class="lbl">No. lambung unit<input name="unit_no" placeholder="mis. DT-021"></label>' +
      '<label class="lbl">Tindakan<select name="tindakan"><option value="">—</option><option>Teguran lisan</option><option>Teguran tertulis</option><option>SP 1</option><option>SP 2</option><option>SP 3</option><option>Mine Permit ditahan</option><option>Lainnya</option></select></label></div>' +
      '<label class="lbl">Keterangan<textarea name="keterangan" rows="2"></textarea></label>' +
      '<label class="btn">Foto bukti<input type="file" accept="image/*" capture="environment" multiple hidden name="foto"></label><span class="small muted" id="nfoto"></span>' +
      '<div class="actions"><button class="btn primary">Simpan pelanggaran</button></div></form>';
  }

  function pasangForm(r, p, sumber) {
    const f = $('#fplg'), sug = $('#jsug');
    const show = () => { const list = cariJenis(f.jenis_q.value); sug.innerHTML = list.map(j => '<button type="button" data-k="' + j.kode + '">' + A().esc(j.nama) + '</button>').join('') || '<div class="muted small">Tidak ada yang cocok — pilih "Lainnya" dan tulis di keterangan.</div>';
      sug.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { f.jenis_kode.value = b.dataset.k; f.jenis_q.value = b.textContent; sug.innerHTML = ''; }); };
    f.jenis_q.oninput = () => { f.jenis_kode.value = ''; show(); };
    f.jenis_q.onfocus = show;
    const fotos = [];
    f.foto.onchange = async () => { for (const file of f.foto.files) fotos.push(await kecilkan(file)); $('#nfoto').textContent = fotos.length + ' foto'; };
    let pos = null; if (navigator.geolocation) navigator.geolocation.getCurrentPosition(g => pos = g.coords, () => { }, { enableHighAccuracy: true, timeout: 8000 });
    f.onsubmit = async e => {
      e.preventDefault();
      if (!f.jenis_kode.value) { const m = cariJenis(f.jenis_q.value)[0]; if (m && confirm('Pakai jenis "' + m.nama + '"?')) { f.jenis_kode.value = m.kode; f.jenis_q.value = m.nama; } else return A().toast('Pilih jenis pelanggaran dari daftar', 'err'); }
      const it = { kimper_id: r?.kimper_id || null, qr_id: p.id || null, nama: r?.nama || p.nama, jenis_kode: f.jenis_kode.value, tgl: new Date().toISOString(),
        area_id: f.area_id.value ? +f.area_id.value : null, lokasi: f.lokasi.value.trim(), unit_no: f.unit_no.value.trim().toUpperCase(), tindakan: f.tindakan.value || null,
        keterangan: f.keterangan.value.trim(), foto: fotos, lat: pos ? +pos.latitude.toFixed(6) : null, lng: pos ? +pos.longitude.toFixed(6) : null, sumber, offline: !navigator.onLine };
      const q = antrian(); q.push(it); ls.set(KEY_Q, q);
      if (navigator.onLine) await kirimAntrian(); else A().toast('Tanpa sinyal — pelanggaran disimpan di HP dan terkirim otomatis nanti');
      f.closest('#hasil').innerHTML = '<div class="note ok">Pelanggaran ' + A().esc(it.nama || '') + ' tercatat.</div><div class="actions"><button class="btn primary" id="lagi2">Scan berikutnya</button></div>';
      $('#lagi2').onclick = () => { $('#hasil').innerHTML = ''; mulai(); };
      badge();
    };
  }

  async function kecilkan(file) {
    const bmp = await (window.FotoEditor ? FotoEditor.loadBitmap(file) : createImageBitmap(file));
    const s = Math.min(1, 1280 / Math.max(bmp.width, bmp.height)); const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.8);
  }

  window.Scan = { view, stop, parseQR, cariJenis, kirimAntrian };
})();
