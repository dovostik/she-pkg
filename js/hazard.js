/* Hazard report: Lapor → Verifikasi SHE → Perbaikan PIC area → Cek SHE → Selesai.
   Kunci lokasi: GPS & foto diambil langsung dari kamera saat itu (diberi stempel waktu + GPS),
   bukti perbaikan wajib diambil di titik temuan. Aturan yang sama ditegakkan di database. */
(function () {
  const A = () => window.App;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const KEY_Q = 'hz_antrian', KEY_AREA = 'hz_area';
  const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } } };
  const esc = s => A().esc(s);

  const ST = { baru: 'Menunggu verifikasi SHE', diverifikasi: 'Menunggu tindakan PIC', dikerjakan: 'Sedang diperbaiki', menunggu_verifikasi: 'Menunggu cek SHE', closed: 'Selesai', ditolak: 'Ditolak' };
  const ALUR = [['baru', 'Dilaporkan'], ['diverifikasi', 'Verifikasi SHE'], ['dikerjakan', 'Perbaikan PIC'], ['menunggu_verifikasi', 'Cek SHE'], ['closed', 'Selesai']];
  const RISK = { rendah: 'Rendah', sedang: 'Sedang', tinggi: 'Tinggi', ekstrem: 'Ekstrem' };
  const KAT = { KTA: 'Kondisi tidak aman', TTA: 'Tindakan tidak aman' };
  const KEMUNGKINAN = ['Hampir tidak mungkin', 'Jarang', 'Mungkin terjadi', 'Sering', 'Hampir pasti'];
  const KEPARAHAN = ['Tidak berarti (P3K)', 'Ringan', 'Sedang (hilang hari kerja)', 'Berat (cacat)', 'Fatal / kerusakan besar'];
  const JENIS = ['Jalan / tanggul', 'Lereng / longsor', 'Rambu & marka', 'Alat berat', 'Kendaraan / LV', 'Kelistrikan', 'APD', 'Housekeeping', 'Kebakaran', 'Bahan kimia / B3', 'Bekerja di ketinggian', 'Air / genangan', 'Peralatan kerja', 'Lainnya'];
  const set = k => A().state.setting[k];
  const akMax = () => +(set('hazard_gps_akurasi_maks') ?? 100);
  const radius = () => +(set('hazard_radius_m') ?? 150);
  const isShe = () => A().isShe();
  const uid = () => A().state.user?.id;
  const waktu = d => (d || new Date()).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\./g, ':') + ' WIB';
  const riskBadge = r => r ? '<span class="badge rk-' + r + '">' + RISK[r] + '</span>' : '';
  const stBadge = s => '<span class="badge hz-' + s + '">' + (ST[s] || s) + '</span>';
  const jarakM = (a, b, c, d) => { const R = 6371000, t = x => x * Math.PI / 180; const h = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const peta = (lat, lon) => 'https://www.google.com/maps?q=' + lat + ',' + lon;

  async function daftarArea() {
    try { const a = await A().q(A().sb.from('area').select('id,kode,nama,urut').eq('aktif', true).order('urut', { nullsFirst: false }).order('nama')); ls.set(KEY_AREA, a); return a; }
    catch (e) { return ls.get(KEY_AREA, []); }
  }

  /* ---------- GPS ---------- */
  function pantauGPS(cb) {
    if (!navigator.geolocation) { cb(null, 'HP / browser tidak mendukung GPS'); return () => { }; }
    let akhir = null;
    const id = navigator.geolocation.watchPosition(p => { const c = p.coords; akhir = { lat: c.latitude, lon: c.longitude, akurasi: Math.round(c.accuracy), t: Date.now() }; cb(akhir); },
      e => cb(akhir, e.code === 1 ? 'Izin lokasi ditolak — buka pengaturan browser/HP dan izinkan Lokasi untuk aplikasi ini' : 'Mencari sinyal GPS… pastikan GPS HP menyala'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    return () => navigator.geolocation.clearWatch(id);
  }
  function gpsHTML(g, err, extra) {
    if (!g) return '<div class="gps-box wait">📍 ' + esc(err || 'Mencari lokasi GPS…') + '</div>';
    const ok = g.akurasi <= akMax();
    return '<div class="gps-box ' + (ok ? 'ok' : 'wait') + '">🔒 <b>' + g.lat.toFixed(6) + ', ' + g.lon.toFixed(6) + '</b> · ketelitian ±' + g.akurasi + ' m' +
      (ok ? '' : '<br><small>Tunggu sampai ±' + akMax() + ' m atau kurang (ke tempat terbuka)</small>') + (extra || '') + '</div>';
  }

  /* ---------- kamera langsung + stempel ---------- */
  function kamera(stempelBaris) {
    return new Promise(async res => {
      const m = A().modal('<div class="cam"><div class="cam-view"><video playsinline muted autoplay></video></div><div class="cam-info small"></div>' +
        '<div class="actions"><button class="btn primary" data-jepret>📷 Ambil foto</button><button class="btn ghost" data-x>Batal</button></div></div>');
      m.classList.add('cam-modal');
      let stream = null, selesai = false;
      const tutup = v => { if (selesai) return; selesai = true; if (stream) stream.getTracks().forEach(t => t.stop()); m.remove(); res(v); };
      m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-x]')) { e.stopPropagation(); tutup(null); } }, true);
      const info = $('.cam-info', m); const btn = $('[data-jepret]', m);
      if (!navigator.mediaDevices?.getUserMedia) { info.textContent = 'Kamera langsung tidak didukung di browser ini. Pakai Chrome (Android) atau Safari (iPhone).'; btn.disabled = true; return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false }); }
      catch (e) { info.textContent = 'Kamera tidak bisa dibuka (' + (e.name || e) + '). Izinkan Kamera untuk aplikasi ini.'; btn.disabled = true; return; }
      const v = $('video', m); v.srcObject = stream; try { await v.play(); } catch (e) { }
      info.textContent = 'Foto otomatis diberi stempel waktu & GPS.';
      btn.onclick = () => {
        const w = v.videoWidth, h = v.videoHeight; if (!w) return;
        const s = Math.min(1, 1600 / Math.max(w, h)); const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
        const g = c.getContext('2d'); g.drawImage(v, 0, 0, c.width, c.height);
        const baris = stempelBaris(); const fs = Math.max(14, Math.round(c.width / 42)), pad = fs * .55, lh = fs * 1.3, tinggi = baris.length * lh + pad * 2;
        g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, c.height - tinggi, c.width, tinggi);
        g.fillStyle = '#fff'; g.font = '600 ' + fs + 'px Arial, sans-serif'; baris.forEach((t, i) => g.fillText(t, pad, c.height - tinggi + pad + lh * (i + .78), c.width - pad * 2));
        c.toBlob(b => tutup(b), 'image/jpeg', .82);
      };
    });
  }
  const keDataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
  async function unggahFoto(prefix, list) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i]; const blob = f.blob || await (await fetch(f.dataUrl)).blob();
      const path = prefix + '/' + Date.now() + '-' + i + '.jpg';
      await A().q(A().sb.storage.from('hazard').upload(path, blob, { contentType: 'image/jpeg', upsert: true }));
      out.push({ path, at: f.at, lat: f.lat, lon: f.lon, akurasi: f.akurasi });
    }
    return out;
  }

  /* ---------- antrean offline ---------- */
  const antrian = () => ls.get(KEY_Q, []);
  let kirimJalan = false;
  async function kirimAntrian() {
    if (kirimJalan || !navigator.onLine || !A()?.state?.user) return; const qd = antrian(); if (!qd.length) return;
    kirimJalan = true; const sisa = []; let n = 0;
    for (const it of qd) {
      try {
        const foto = await unggahFoto(it.row.client_id, it.foto);
        const { error } = await A().sb.from('hazard').insert({ ...it.row, foto, dilapor_offline: true, tgl_temuan: it.at });
        if (error && error.code !== '23505') throw error; n++;
      } catch (e) { it.gagal = A().errMsg(e); sisa.push(it); }
    }
    ls.set(KEY_Q, sisa); kirimJalan = false;
    if (n) A().toast(n + ' laporan hazard dari HP terkirim');
    const b = $('#hzantri'); if (b) tampilAntrian();
  }
  function tampilAntrian() {
    const b = $('#hzantri'); if (!b) return; const qd = antrian();
    b.innerHTML = qd.length ? '<div class="note warn">' + qd.length + ' laporan hazard tersimpan di HP, menunggu sinyal.' + (qd.some(x => x.gagal) ? '<br><small>' + esc(qd.find(x => x.gagal).gagal) + '</small>' : '') +
      ' <button class="btn sm" id="hzkirim">Kirim sekarang</button></div>' : '';
    const k = $('#hzkirim'); if (k) k.onclick = kirimAntrian;
  }
  addEventListener('online', kirimAntrian);

  /* ---------- identitas perangkat (pengganti nomor serial yang tidak bisa dibaca browser) ---------- */
  const KEY_DEV = 'hz_perangkat', KEY_QP = 'hz_antrian_publik', KEY_ID = 'hz_identitas';
  function idbGet() { return new Promise(r => { try { const o = indexedDB.open('she_pkg', 1); o.onupgradeneeded = () => o.result.createObjectStore('kv');
    o.onsuccess = () => { try { const g = o.result.transaction('kv').objectStore('kv').get(KEY_DEV); g.onsuccess = () => r(g.result || null); g.onerror = () => r(null); } catch (e) { r(null); } }; o.onerror = () => r(null); } catch (e) { r(null); } }); }
  function idbSet(v) { try { const o = indexedDB.open('she_pkg', 1); o.onupgradeneeded = () => o.result.createObjectStore('kv'); o.onsuccess = () => { try { o.result.transaction('kv', 'readwrite').objectStore('kv').put(v, KEY_DEV); } catch (e) { } }; } catch (e) { } }
  async function idPerangkat() {
    const dariCookie = (document.cookie.match(/(?:^|; )hzdev=([A-Za-z0-9-]+)/) || [])[1];
    let id = ls.get(KEY_DEV, null) || await idbGet() || dariCookie;
    if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) id = crypto.randomUUID ? crypto.randomUUID() : 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
    ls.set(KEY_DEV, id); idbSet(id); document.cookie = 'hzdev=' + id + '; max-age=315360000; path=/; SameSite=Lax';
    return id;
  }
  async function infoPerangkat() {
    const n = navigator, i = { ua: n.userAgent, bahasa: n.language, zona: Intl.DateTimeFormat().resolvedOptions().timeZone, layar: screen.width + 'x' + screen.height + '@' + (window.devicePixelRatio || 1),
      cpu: n.hardwareConcurrency || null, ram_gb: n.deviceMemory || null, sentuh: n.maxTouchPoints || 0, platform: n.platform || null };
    try { if (n.userAgentData?.getHighEntropyValues) { const h = await n.userAgentData.getHighEntropyValues(['model', 'platform', 'platformVersion', 'brands']);
      i.model = h.model || null; i.os = (h.platform || '') + ' ' + (h.platformVersion || ''); i.browser = (h.brands || []).map(b => b.brand + ' ' + b.version).join(', '); } } catch (e) { }
    if (!i.model) { const m = n.userAgent.match(/Android [\d.]+; ([^;)]+)/); if (m) i.model = m[1].trim(); else if (/iPhone|iPad/.test(n.userAgent)) i.model = /iPad/.test(n.userAgent) ? 'iPad' : 'iPhone'; }
    return i;
  }

  async function kirimPublik(it) {
    const foto = [];
    for (let i = 0; i < it.foto.length; i++) {
      const f = it.foto[i]; const blob = f.blob || await (await fetch(f.dataUrl)).blob(); const path = 'publik/' + it.dev + '/' + it.row.client_id + '-' + i + '.jpg';
      const { error } = await A().sb.storage.from('hazard').upload(path, blob, { contentType: 'image/jpeg' });
      if (error && !/exists|duplicate/i.test(error.message)) throw error;
      foto.push({ path, at: f.at, lat: f.lat, lon: f.lon, akurasi: f.akurasi });
    }
    return await A().q(A().sb.rpc('lapor_hazard_publik', { p: { ...it.row, foto, perangkat_id: it.dev, perangkat: it.info, offline: !!it.offline, tgl_temuan: it.at } }));
  }
  let kirimPubJalan = false;
  async function kirimAntrianPublik() {
    if (kirimPubJalan || !navigator.onLine) return; const qd = ls.get(KEY_QP, []); if (!qd.length) return;
    kirimPubJalan = true; const sisa = []; let n = 0;
    for (const it of qd) { try { await kirimPublik(it); n++; } catch (e) { it.gagal = A().errMsg(e); if (!/diblokir|tidak valid/i.test(it.gagal)) sisa.push(it); } }
    ls.set(KEY_QP, sisa); kirimPubJalan = false; if (n) A().toast(n + ' laporan hazard dari HP ini terkirim');
  }
  addEventListener('online', kirimAntrianPublik);

  async function viewPublik() {
    const dev = await idPerangkat(); const info = await infoPerangkat(); kirimAntrianPublik();
    let areas = []; try { areas = await A().q(A().sb.from('area').select('id,nama,urut').eq('aktif', true).order('urut', { nullsFirst: false }).order('nama')); ls.set(KEY_AREA, areas); } catch (e) { areas = ls.get(KEY_AREA, []); }
    const idt = ls.get(KEY_ID, {}); let g = null, gErr = null; const foto = [];
    document.body.innerHTML = '<div class="publik"><header class="pub-head">' + '<b>SHE PKG</b> · Lapor hazard</header><main class="pub-main">' +
      '<p class="small muted">Untuk karyawan & kontraktor tanpa akun. Laporan langsung masuk ke tim SHE PT Hamparan Mulya.</p>' +
      '<form id="fpub" class="form">' +
      '<fieldset><legend>Identitas pelapor</legend><label class="lbl">Nama lengkap<input name="nama" required minlength="3" autocomplete="name" value="' + esc(idt.nama || '') + '"></label>' +
        '<label class="lbl">Jabatan<input name="jabatan" required value="' + esc(idt.jabatan || '') + '" placeholder="mis. Operator DT, Helper"></label>' +
        '<label class="lbl">Perusahaan<input name="perusahaan" required list="dlpp" value="' + esc(idt.perusahaan || '') + '"></label><datalist id="dlpp"><option>PT Hamparan Mulya</option><option>PT ABA</option><option>PT CSMU</option><option>PT BAT</option></datalist></fieldset>' +
      '<fieldset><legend>Lokasi temuan (terkunci otomatis)</legend><div id="gps"></div><label class="lbl">Area / PIC area<select name="area" required><option value="">— pilih —</option>' +
        areas.map(a => '<option value="' + a.id + '">' + esc(a.nama) + '</option>').join('') + '</select></label><label class="lbl">Detail lokasi<input name="lokasi" placeholder="mis. KM 12 hauling"></label></fieldset>' +
      '<fieldset><legend>Temuan</legend><div class="seg"><label><input type="radio" name="kat" value="KTA" checked><span>Kondisi tidak aman</span></label><label><input type="radio" name="kat" value="TTA"><span>Tindakan tidak aman</span></label></div>' +
        '<label class="lbl">Jenis bahaya<input name="jenis" list="dljenis" required></label><datalist id="dljenis">' + JENIS.map(j => '<option>' + j + '</option>').join('') + '</datalist>' +
        '<label class="lbl">Uraian temuan<textarea name="desk" rows="3" required minlength="5"></textarea></label><label class="lbl">Tindakan langsung <small class="muted">(bila ada)</small><input name="langsung"></label></fieldset>' +
      '<fieldset><legend>Foto temuan (kamera langsung, maks 4)</legend><div class="foto-grid" id="fgrid"></div><button type="button" class="btn" id="ambil">📷 Ambil foto</button></fieldset>' +
      '<div class="note small">Untuk mencegah laporan palsu / atas nama orang lain, laporan ini menyimpan <b>identitas perangkat</b> (ID perangkat, model HP' + (info.model ? ': ' + esc(info.model) : '') + ', alamat IP), lokasi GPS dan waktu. Data ini hanya bisa dilihat tim SHE.</div>' +
      '<div class="actions"><button class="btn primary" id="kirim">Kirim laporan</button><a class="btn ghost" href="./">Batal</a></div></form></main></div>';
    const f = $('#fpub');
    const henti = pantauGPS((x, e) => { g = x; gErr = e; const el = $('#gps'); if (el) el.innerHTML = gpsHTML(g, gErr); else henti(); });
    const gambar = () => { $('#fgrid').innerHTML = foto.map((x, i) => '<span class="fthumb"><img src="' + x.url + '" alt=""><button type="button" data-hapus="' + i + '">✕</button></span>').join('');
      $$('[data-hapus]').forEach(b => b.onclick = () => { foto.splice(+b.dataset.hapus, 1); gambar(); }); $('#ambil').style.display = foto.length >= 4 ? 'none' : ''; };
    $('#ambil').onclick = async () => {
      if (!g) return A().toast('Tunggu lokasi GPS dulu', 'err');
      if (f.nama.value.trim().length < 3) return A().toast('Isi nama lengkap dulu', 'err');
      const nmArea = f.area.value ? f.area.selectedOptions[0].text : 'Area belum dipilih', at = new Date(), gg = { ...g };
      const blob = await kamera(() => ['HAZARD · ' + nmArea, waktu(at), 'GPS ' + gg.lat.toFixed(6) + ', ' + gg.lon.toFixed(6) + ' ±' + gg.akurasi + ' m', 'Pelapor: ' + f.nama.value.trim() + ' (' + f.perusahaan.value.trim() + ') · ' + dev.slice(0, 8)]);
      if (blob) { foto.push({ blob, url: URL.createObjectURL(blob), at: at.toISOString(), lat: gg.lat, lon: gg.lon, akurasi: gg.akurasi }); gambar(); }
    };
    f.onsubmit = async e => {
      e.preventDefault(); const b = $('#kirim');
      if (!g) return A().toast('Lokasi GPS belum didapat', 'err');
      if (g.akurasi > akMax()) return A().toast('GPS belum akurat (±' + g.akurasi + ' m). Tunggu sampai ±' + akMax() + ' m', 'err');
      if (!foto.length) return A().toast('Ambil minimal 1 foto temuan', 'err');
      ls.set(KEY_ID, { nama: f.nama.value.trim(), jabatan: f.jabatan.value.trim(), perusahaan: f.perusahaan.value.trim() });
      const it = { dev, info, at: new Date().toISOString(), foto, row: { client_id: (crypto.randomUUID ? crypto.randomUUID() : dev + '-' + Date.now()), nama: f.nama.value.trim(), jabatan: f.jabatan.value.trim(), perusahaan: f.perusahaan.value.trim(),
        area_id: +f.area.value, lokasi_detail: f.lokasi.value.trim(), kategori: f.kat.value, jenis_bahaya: f.jenis.value.trim(), deskripsi: f.desk.value.trim(), tindakan_langsung: f.langsung.value.trim(), lat: g.lat, lon: g.lon, gps_akurasi: g.akurasi } };
      A().busy(b, true, 'Mengirim…');
      const selesai = msg => { document.querySelector('.pub-main').innerHTML = '<div class="note ok">' + msg + '</div><div class="actions"><a class="btn primary" href="./?lapor=1">Lapor lagi</a><a class="btn ghost" href="./">Ke halaman masuk</a></div>'; };
      const simpanHP = async () => { const fd = []; for (const x of foto) fd.push({ dataUrl: await keDataURL(x.blob), at: x.at, lat: x.lat, lon: x.lon, akurasi: x.akurasi });
        const qd = ls.get(KEY_QP, []); qd.push({ ...it, foto: fd, offline: true }); if (!ls.set(KEY_QP, qd)) throw new Error('Memori HP penuh');
        henti(); selesai('Tanpa sinyal — laporan disimpan di HP ini dan terkirim otomatis saat ada sinyal (buka halaman ini lagi).'); };
      try {
        if (!navigator.onLine) return await simpanHP();
        const nmr = await kirimPublik(it); henti();
        selesai('<b>Laporan ' + esc(nmr) + ' terkirim.</b><br>Terima kasih — tim SHE akan memverifikasi dan meneruskan ke PIC area. Catat nomor laporan ini.');
      } catch (er) {
        if (/fetch|network|load failed/i.test(A().errMsg(er))) { try { await simpanHP(); } catch (e2) { A().toast(A().errMsg(e2), 'err'); A().busy(b, false); } }
        else { A().toast(A().errMsg(er), 'err'); A().busy(b, false); }
      }
    };
  }

  /* ---------- router ---------- */
  async function view(v, parts, params) {
    if (parts[1] === 'baru') return viewBaru(v);
    if (parts[1] === 'area') return viewArea(v);
    if (parts[1]) return viewDetail(v, parts[1]);
    return viewList(v, params);
  }

  /* ---------- daftar & papan progres ---------- */
  async function viewList(v, params) {
    const tab = params.get('t') || 'saya', ar = params.get('area') || '';
    const areas = await daftarArea();
    v.innerHTML = '<div class="page-head"><h1>Hazard report</h1><div class="actions"><a class="btn primary" href="#/hazard/baru">+ Lapor hazard</a>' +
      (isShe() ? '<a class="btn" href="#/hazard/area">PIC area</a>' : '') + '</div></div><div id="hzantri"></div>' +
      '<div class="tabs">' + [['saya', 'Perlu tindakan'], ['proses', 'Dalam proses'], ['selesai', 'Selesai'], ['semua', 'Semua']].map(([k, t]) =>
        '<a href="#/hazard?t=' + k + (ar ? '&area=' + ar : '') + '"' + (k === tab ? ' class="on"' : '') + '>' + t + '</a>').join('') + '</div>' +
      '<form class="filters" id="fhz"><select name="area"><option value="">Semua area</option>' + areas.map(a => '<option value="' + a.id + '"' + (String(a.id) === ar ? ' selected' : '') + '>' + esc(a.nama) + '</option>').join('') + '</select></form>' +
      '<div id="hzsum"></div><div id="hzlist" class="loading">Memuat…</div>';
    $('#fhz').area.onchange = e => location.hash = '#/hazard?t=' + tab + (e.target.value ? '&area=' + e.target.value : '');
    tampilAntrian(); kirimAntrian();
    let qy = A().sb.from('v_hazard').select('id,nomor,tgl_temuan,status,kategori,jenis_bahaya,deskripsi,risiko,due_date,area,area_id,pelapor_nama,foto,terlambat,saya_pic,dibuat_oleh,pic_nama,sumber').order('tgl_temuan', { ascending: false }).limit(300);
    if (ar) qy = qy.eq('area_id', ar);
    if (tab === 'saya' || tab === 'proses') qy = qy.not('status', 'in', '(closed,ditolak)');
    if (tab === 'selesai') qy = qy.eq('status', 'closed');
    let data = await A().q(qy);
    if (tab === 'saya') data = data.filter(h => (isShe() && ['baru', 'menunggu_verifikasi'].includes(h.status)) || (h.saya_pic && ['diverifikasi', 'dikerjakan'].includes(h.status)) || h.dibuat_oleh === uid());
    papan(ar);
    const L = $('#hzlist'); if (!L) return; L.className = '';
    if (!data.length) { L.innerHTML = '<div class="empty">' + (tab === 'saya' ? 'Tidak ada hazard yang perlu tindakan Anda.' : 'Belum ada laporan.') + '</div>'; return; }
    const urls = await A().fotoUrls(data.map(h => h.foto?.[0]?.path).filter(Boolean), 'hazard');
    L.innerHTML = '<div class="mp-list">' + data.map(h => '<a class="mp-row mp-link hz-row" href="#/hazard/' + h.id + '"><span class="thumb">' + (urls[h.foto?.[0]?.path] ? '<img loading="lazy" src="' + esc(urls[h.foto[0].path]) + '" alt="">' : '') + '</span>' +
      '<span class="mp-main"><b>' + esc(h.area) + ' — ' + esc(h.jenis_bahaya || KAT[h.kategori] || '') + '</b><small class="clamp2">' + esc(h.deskripsi) + '</small><small class="muted">' + esc(h.nomor) + ' · ' + A().tgl(h.tgl_temuan) + ' ' + A().jam(h.tgl_temuan) + ' · ' + esc(h.pelapor_nama || '') + (h.sumber === 'publik' ? ' (tanpa akun)' : '') + '</small></span>' +
      '<span class="mp-side">' + stBadge(h.status) + riskBadge(h.risiko) + (h.due_date && !['closed', 'ditolak'].includes(h.status) ? '<small class="' + (h.terlambat ? 'err' : 'muted') + '">' + (h.terlambat ? 'TERLAMBAT · ' : 'batas ') + A().tgl(h.due_date) + '</small>' : '') + '</span></a>').join('') + '</div>';
  }
  async function papan(ar) {
    const el = $('#hzsum'); if (!el) return;
    let qy = A().sb.from('v_hazard').select('area,area_id,status,terlambat,pic_nama'); if (ar) qy = qy.eq('area_id', ar);
    let rows; try { rows = await A().q(qy); } catch (e) { return; }
    if (!rows.length) return;
    const by = {}; rows.forEach(r => { const b = by[r.area] ||= { area: r.area, pic: r.pic_nama, buka: 0, telat: 0, cek: 0, selesai: 0 };
      if (r.status === 'closed') b.selesai++; else if (r.status !== 'ditolak') { b.buka++; if (r.terlambat) b.telat++; if (r.status === 'menunggu_verifikasi') b.cek++; } });
    const list = Object.values(by).sort((a, b) => b.telat - a.telat || b.buka - a.buka);
    const tot = list.reduce((s, b) => ({ buka: s.buka + b.buka, telat: s.telat + b.telat, selesai: s.selesai + b.selesai }), { buka: 0, telat: 0, selesai: 0 });
    el.innerHTML = '<details class="box papan"' + (isShe() || A().state.profile?.role === 'viewer' ? ' open' : '') + '><summary><b>Progres per area</b> — ' + tot.buka + ' terbuka · <span class="' + (tot.telat ? 'err' : '') + '">' + tot.telat + ' terlambat</span> · ' + tot.selesai + ' selesai</summary>' +
      '<table class="tbl"><thead><tr><th>Area / PIC</th><th>Terbuka</th><th>Terlambat</th><th>Selesai</th><th>Progres</th></tr></thead><tbody>' + list.map(b => {
        const pct = b.buka + b.selesai ? Math.round(b.selesai * 100 / (b.buka + b.selesai)) : 0;
        return '<tr><td><b>' + esc(b.area) + '</b><br><small class="muted">' + esc(b.pic || 'PIC belum ditunjuk') + '</small></td><td>' + b.buka + '</td><td class="' + (b.telat ? 'err' : '') + '">' + b.telat + '</td><td>' + b.selesai + '</td>' +
          '<td><div class="bar"><i style="width:' + pct + '%"></i></div><small>' + pct + '%</small></td></tr>'; }).join('') + '</tbody></table></details>';
  }

  /* ---------- lapor baru ---------- */
  async function viewBaru(v) {
    const areas = await daftarArea();
    let g = null, gErr = null; const foto = [];
    v.innerHTML = '<div class="page-head"><div><a href="#/hazard" class="back">‹ Hazard</a><h1>Lapor hazard</h1></div></div>' +
      '<form id="fhzb" class="form">' +
      '<fieldset><legend>Lokasi temuan (terkunci otomatis)</legend><div id="gps"></div><label class="lbl">Area / PIC area<select name="area" required><option value="">— pilih —</option>' +
        areas.map(a => '<option value="' + a.id + '">' + esc(a.nama) + '</option>').join('') + '</select></label>' +
        '<label class="lbl">Detail lokasi<input name="lokasi" placeholder="mis. Ramp 3 sisi timur, KM 12 hauling"></label></fieldset>' +
      '<fieldset><legend>Temuan</legend><div class="seg"><label><input type="radio" name="kat" value="KTA" checked><span>Kondisi tidak aman</span></label><label><input type="radio" name="kat" value="TTA"><span>Tindakan tidak aman</span></label></div>' +
        '<label class="lbl">Jenis bahaya<input name="jenis" list="dljenis" required placeholder="Ketik atau pilih"></label><datalist id="dljenis">' + JENIS.map(j => '<option>' + j + '</option>').join('') + '</datalist>' +
        '<label class="lbl">Uraian temuan<textarea name="desk" rows="3" required placeholder="Apa yang berbahaya? Siapa/apa yang bisa celaka?"></textarea></label>' +
        '<label class="lbl">Tindakan langsung yang sudah dilakukan <small class="muted">(bila ada)</small><input name="langsung" placeholder="mis. Pasang cone, tegur operator"></label></fieldset>' +
      '<fieldset><legend>Foto temuan (kamera langsung, maks 4)</legend><div class="foto-grid" id="fgrid"></div><button type="button" class="btn" id="ambil">📷 Ambil foto</button></fieldset>' +
      '<div class="actions"><button class="btn primary" id="kirim">Kirim laporan</button></div><p class="small muted">Waktu, lokasi GPS & foto tidak bisa diubah setelah dikirim. Tanpa sinyal? Laporan disimpan di HP dan terkirim otomatis.</p></form>';
    const f = $('#fhzb');
    const henti = pantauGPS((x, e) => { g = x; gErr = e; const el = $('#gps'); if (el) el.innerHTML = gpsHTML(g, gErr); else henti(); });
    const gambar = () => { $('#fgrid').innerHTML = foto.map((x, i) => '<span class="fthumb"><img src="' + x.url + '" alt=""><button type="button" data-hapus="' + i + '" aria-label="Hapus">✕</button></span>').join('');
      $$('[data-hapus]').forEach(b => b.onclick = () => { foto.splice(+b.dataset.hapus, 1); gambar(); }); $('#ambil').style.display = foto.length >= 4 ? 'none' : ''; };
    $('#ambil').onclick = async () => {
      if (!g) return A().toast('Tunggu lokasi GPS dulu', 'err');
      const nmArea = f.area.selectedOptions[0]?.value ? f.area.selectedOptions[0].text : 'Area belum dipilih';
      const at = new Date(), gg = { ...g };
      const blob = await kamera(() => ['HAZARD · ' + nmArea, waktu(at), 'GPS ' + gg.lat.toFixed(6) + ', ' + gg.lon.toFixed(6) + ' ±' + gg.akurasi + ' m', 'Pelapor: ' + (A().state.profile?.nama || '')]);
      if (blob) { foto.push({ blob, url: URL.createObjectURL(blob), at: at.toISOString(), lat: gg.lat, lon: gg.lon, akurasi: gg.akurasi }); gambar(); }
    };
    f.onsubmit = async e => {
      e.preventDefault(); const b = $('#kirim');
      if (!g) return A().toast('Lokasi GPS belum didapat', 'err');
      if (g.akurasi > akMax()) return A().toast('GPS belum akurat (±' + g.akurasi + ' m). Tunggu sampai ±' + akMax() + ' m', 'err');
      if (!foto.length) return A().toast('Ambil minimal 1 foto temuan', 'err');
      const client_id = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
      const row = { client_id, area_id: +f.area.value, lokasi_detail: f.lokasi.value.trim() || null, kategori: f.kat.value, jenis_bahaya: f.jenis.value.trim(), deskripsi: f.desk.value.trim(),
        tindakan_langsung: f.langsung.value.trim() || null, lat: g.lat, lon: g.lon, gps_akurasi: g.akurasi };
      busy(b, true, 'Mengirim…');
      const simpanHP = async () => {
        const fotoData = []; for (const x of foto) fotoData.push({ dataUrl: await keDataURL(x.blob), at: x.at, lat: x.lat, lon: x.lon, akurasi: x.akurasi });
        const qd = antrian(); qd.push({ row, foto: fotoData, at: new Date().toISOString() });
        if (!ls.set(KEY_Q, qd)) throw new Error('Memori HP penuh — hapus beberapa foto lalu coba lagi');
        henti(); A().toast('Tanpa sinyal — laporan disimpan di HP, terkirim otomatis saat ada sinyal'); location.hash = '#/hazard';
      };
      try {
        if (!navigator.onLine) return await simpanHP();
        const fotoUp = await unggahFoto(client_id, foto);
        const r = await A().q(A().sb.from('hazard').insert({ ...row, foto: fotoUp }).select('id,nomor').single());
        henti(); A().toast('Laporan ' + r.nomor + ' terkirim ke SHE'); location.hash = '#/hazard/' + r.id;
      } catch (er) {
        if (/fetch|network|load failed/i.test(A().errMsg(er))) { try { await simpanHP(); } catch (e2) { A().toast(A().errMsg(e2), 'err'); busy(b, false); } }
        else { A().toast(A().errMsg(er), 'err'); busy(b, false); }
      }
    };
    const busy = A().busy;
    window.addEventListener('hashchange', henti, { once: true });
  }

  /* ---------- detail & alur ---------- */
  async function viewDetail(v, id) {
    const sb = A().sb, q = A().q;
    const [[h], log] = await Promise.all([q(sb.from('v_hazard').select('*').eq('id', id)), q(sb.from('hazard_log').select('dari,ke,catatan,at,data').eq('hazard_id', id).order('at'))]);
    if (!h) { v.innerHTML = '<div class="empty">Hazard tidak ditemukan atau Anda tidak berhak melihatnya.</div>'; return; }
    const full = await q(sb.from('hazard').select('tindakan_langsung,tindakan_perbaikan,perbaikan_lat,perbaikan_lon,perbaikan_akurasi,perbaikan_jarak_m,catatan_cek,alasan_tolak').eq('id', id).single());
    Object.assign(h, full);
    const paths = [...(h.foto || []), ...(h.foto_perbaikan || []), ...log.flatMap(l => l.data?.foto_perbaikan || [])].map(x => x.path);
    const urls = await A().fotoUrls(paths, 'hazard');
    const idx = ALUR.findIndex(a => a[0] === h.status), final = ['closed', 'ditolak'].includes(h.status);
    const fotoHTML = arr => (arr || []).length ? '<div class="foto-grid">' + arr.map(x => urls[x.path] ? '<a class="fthumb" href="' + esc(urls[x.path]) + '" target="_blank" rel="noopener"><img src="' + esc(urls[x.path]) + '" alt=""></a>' : '').join('') + '</div>' : '<p class="muted small">Tidak ada foto.</p>';
    v.innerHTML = '<div class="page-head"><div><a href="#/hazard" class="back">‹ Hazard</a><h1>' + esc(h.area) + ' — ' + esc(h.jenis_bahaya || '') + '</h1><div class="muted">' + esc(h.nomor) + ' · ' + KAT[h.kategori] + '</div></div>' +
      '<div class="hz-badges">' + stBadge(h.status) + riskBadge(h.risiko) + (h.terlambat ? '<span class="badge st-dicabut">TERLAMBAT</span>' : '') + '</div></div>' +
      (h.status === 'ditolak' ? '<div class="note err">Ditolak SHE: ' + esc(h.alasan_tolak) + '</div>' : '<ol class="stepper">' + ALUR.map((a, i) => '<li class="' + (i < idx || h.status === 'closed' ? 'done' : i === idx ? 'now' : '') + '">' + a[1] + '</li>').join('') + '</ol>') +
      (h.status === 'dikerjakan' && h.catatan_cek ? '<div class="note warn"><b>Perbaikan sebelumnya belum sesuai:</b> ' + esc(h.catatan_cek) + '</div>' : '') +
      '<div class="detail-grid"><section>' +
        '<div class="box"><h3>Temuan</h3>' + fotoHTML(h.foto) + '<p>' + esc(h.deskripsi) + '</p><dl>' +
          (h.tindakan_langsung ? '<dt>Tindakan langsung</dt><dd>' + esc(h.tindakan_langsung) + '</dd>' : '') +
          '<dt>Waktu</dt><dd>' + waktu(new Date(h.tgl_temuan)) + (h.dilapor_offline ? ' <small class="muted">(dicatat tanpa sinyal)</small>' : '') + '</dd>' +
          '<dt>Pelapor</dt><dd>' + esc(h.pelapor_nama || '-') + (h.sumber === 'publik' ? ' <span class="badge">tanpa akun</span><br><small>' + esc([h.pelapor_jabatan, h.pelapor_perusahaan].filter(Boolean).join(' · ')) + '</small>' : '') + '</dd>' +
          '<dt>Area</dt><dd>' + esc(h.area) + (h.lokasi_detail ? ' · ' + esc(h.lokasi_detail) : '') + '</dd>' +
          '<dt>Lokasi GPS 🔒</dt><dd>' + (h.lat ? '<a href="' + peta(h.lat, h.lon) + '" target="_blank" rel="noopener">' + h.lat.toFixed(6) + ', ' + h.lon.toFixed(6) + '</a> ±' + Math.round(h.gps_akurasi) + ' m' : '-') + '</dd></dl></div>' +
        (h.foto_perbaikan?.length || h.tindakan_perbaikan ? '<div class="box"><h3>Bukti perbaikan</h3>' + fotoHTML(h.foto_perbaikan) + '<p>' + esc(h.tindakan_perbaikan || '') + '</p><dl>' +
          '<dt>Waktu</dt><dd>' + (h.perbaikan_at ? waktu(new Date(h.perbaikan_at)) : '-') + '</dd>' +
          '<dt>Lokasi GPS 🔒</dt><dd>' + (h.perbaikan_lat ? '<a href="' + peta(h.perbaikan_lat, h.perbaikan_lon) + '" target="_blank" rel="noopener">' + (+h.perbaikan_lat).toFixed(6) + ', ' + (+h.perbaikan_lon).toFixed(6) + '</a> — <b>' + h.perbaikan_jarak_m + ' m</b> dari titik temuan' : '-') + '</dd></dl></div>' : '') +
      '</section><section>' +
        '<div class="box"><h3>Penanganan</h3><dl><dt>PIC area</dt><dd>' + esc(h.pic_nama || 'Belum ditunjuk') + '</dd>' +
          '<dt>Risiko</dt><dd>' + (h.risiko ? riskBadge(h.risiko) + ' <small class="muted">K' + h.kemungkinan + ' × P' + h.keparahan + ' = ' + h.kemungkinan * h.keparahan + '</small>' : '<span class="muted">belum dinilai SHE</span>') + '</dd>' +
          '<dt>Batas waktu</dt><dd>' + (h.due_date ? '<span class="' + (h.terlambat ? 'err' : '') + '">' + A().tgl(h.due_date) + (h.terlambat ? ' — terlambat' : '') + '</span>' : '-') + '</dd></dl></div>' +
        '<div class="box" id="aksi"></div>' + (h.sumber === 'publik' && isShe() ? '<div class="box" id="perangkat"><h3>Perangkat pelapor</h3><p class="muted small">Memuat…</p></div>' : '') +
        '<div class="box"><h3>Riwayat</h3><ol class="timeline">' + log.map(l => '<li><small class="muted">' + waktu(new Date(l.at)) + '</small><br>' + esc(l.catatan || (ST[l.ke] || l.ke)) +
          (l.data?.foto_perbaikan?.length ? '<details><summary class="small">Bukti yang dikembalikan</summary>' + fotoHTML(l.data.foto_perbaikan) + '</details>' : '') +
          (l.data?.area_lama ? '<br><small class="muted">Area: ' + esc(l.data.area_lama) + ' → ' + esc(l.data.area_baru) + (l.data.lokasi_baru !== l.data.lokasi_lama ? ' · lokasi: ' + esc(l.data.lokasi_lama || '-') + ' → ' + esc(l.data.lokasi_baru || '-') : '') + '</small>' : '') + '</li>').join('') + '</ol></div>' +
      '</section></div>';
    aksi(h, final);
    if ($('#perangkat')) perangkatBox(h);
  }
  async function perangkatBox(h) {
    const el = $('#perangkat'); let d;
    try { d = await A().q(A().sb.rpc('info_perangkat_hazard', { p_hazard: h.id })); } catch (e) { el.innerHTML = '<h3>Perangkat pelapor</h3><p class="err small">' + esc(A().errMsg(e)) + '</p>'; return; }
    if (!d) { el.innerHTML = '<h3>Perangkat pelapor</h3><p class="muted small">Tidak ada data perangkat.</p>'; return; }
    const i = d.info || {}, nama = (d.nama_lain || []).filter(Boolean);
    el.innerHTML = '<h3>Perangkat pelapor ' + (d.diblokir ? '<span class="badge st-dicabut">DIBLOKIR</span>' : '') + '</h3><dl>' +
      '<dt>ID perangkat</dt><dd><code>' + esc(d.perangkat_id) + '</code></dd>' +
      '<dt>HP</dt><dd>' + esc([i.model, i.os || i.platform].filter(Boolean).join(' · ') || '-') + '<br><small class="muted">' + esc(i.browser || '') + ' · layar ' + esc(i.layar || '-') + ' · ' + esc(i.zona || '') + '</small></dd>' +
      '<dt>Alamat IP</dt><dd>' + esc(d.ip || '-') + (d.laporan_ip > 1 ? ' <small class="muted">(' + d.laporan_ip + ' laporan dari IP ini)</small>' : '') + '</dd>' +
      '<dt>Riwayat perangkat</dt><dd>' + d.laporan_perangkat + ' laporan' + (d.ditolak_perangkat ? ', <span class="err">' + d.ditolak_perangkat + ' ditolak</span>' : '') + '</dd>' +
      '<dt>Nama yang dipakai</dt><dd class="' + (nama.length > 1 ? 'err' : '') + '">' + esc(nama.join(', ') || '-') + (nama.length > 1 ? '<br><small>Perangkat ini melapor dengan lebih dari satu nama</small>' : '') + '</dd></dl>' +
      '<details><summary class="small">Detail teknis</summary><pre class="small wrap">' + esc(d.user_agent || i.ua || '') + '</pre></details>' +
      '<div class="actions">' + (d.diblokir ? '<button class="btn sm" id="bukablok">Buka blokir perangkat</button>' : '<button class="btn sm danger" id="blok">Blokir perangkat ini</button>') + '</div>';
    const run = async (blokir, btn) => { const a = blokir ? prompt('Alasan memblokir perangkat ini (mis. laporan palsu, memakai nama orang lain):') : 'buka'; if (!a) return;
      A().busy(btn, true); try { await A().q(A().sb.rpc('blokir_perangkat', { p_hazard: h.id, p_alasan: a, p_blokir: blokir })); A().toast(blokir ? 'Perangkat diblokir' : 'Blokir dibuka'); A().route(); } catch (e) { A().toast(A().errMsg(e), 'err'); A().busy(btn, false); } };
    if ($('#blok')) $('#blok').onclick = e => run(true, e.target);
    if ($('#bukablok')) $('#bukablok').onclick = e => run(false, e.target);
  }

  function aksi(h, final) {
    const el = $('#aksi'), she = isShe(), pic = h.saya_pic; const sb = A().sb, q = A().q;
    const ubah = async (upd, pesan, btn) => { A().busy(btn, true); try { await q(sb.from('hazard').update(upd).eq('id', h.id)); A().toast(pesan); A().route(); } catch (e) { A().toast(A().errMsg(e), 'err'); A().busy(btn, false); } };
    let html = '';
    if (she && h.status === 'baru') {
      html += '<h3>Verifikasi SHE</h3><form id="fver"><div class="grid2"><label class="lbl">Kemungkinan<select name="k" required><option value="">—</option>' + KEMUNGKINAN.map((t, i) => '<option value="' + (i + 1) + '">' + (i + 1) + ' — ' + t + '</option>').join('') + '</select></label>' +
        '<label class="lbl">Keparahan<select name="p" required><option value="">—</option>' + KEPARAHAN.map((t, i) => '<option value="' + (i + 1) + '">' + (i + 1) + ' — ' + t + '</option>').join('') + '</select></label></div>' +
        '<div id="rprev" class="small muted"></div><label class="lbl">Batas waktu perbaikan <small class="muted">(kosong = otomatis sesuai risiko)</small><input type="date" name="due"></label>' +
        '<div class="actions"><button class="btn primary">Verifikasi & teruskan ke PIC area</button><button type="button" class="btn danger" id="tolak">Tolak laporan</button></div></form>';
    }
    if ((pic || she) && ['diverifikasi', 'dikerjakan'].includes(h.status)) {
      html += '<h3>Perbaikan oleh PIC area</h3>' + (h.status === 'diverifikasi' && pic ? '<div class="actions"><button class="btn" id="mulai">Mulai kerjakan</button></div>' : '') +
        '<form id="fperb"><p class="small muted">Bukti wajib difoto <b>di titik temuan</b> (maks ' + radius() + ' m).</p><div id="gps2"></div><div class="foto-grid" id="pgrid"></div><button type="button" class="btn" id="ambil2">📷 Foto bukti perbaikan</button>' +
        '<label class="lbl">Tindakan perbaikan yang dilakukan<textarea name="tindakan" rows="2" required></textarea></label><div class="actions"><button class="btn primary" id="kirim2">Kirim bukti ke SHE</button></div></form>';
    }
    if (she && h.status === 'menunggu_verifikasi') {
      html += '<h3>Cek SHE</h3><p class="small">Periksa foto bukti & jarak dari titik temuan, lalu putuskan.</p><div class="actions"><button class="btn primary" id="close">✓ Perbaikan sesuai — selesai</button><button class="btn danger" id="balik">Perbaikan belum sesuai</button></div>';
    }
    if (she && !final) {
      html += '<details class="koreksi"><summary class="small">Koreksi area / detail lokasi (SHE)</summary><form id="fkor"><label class="lbl">Area<select name="area"></select></label><label class="lbl">Detail lokasi<input name="lokasi" value="' + esc(h.lokasi_detail || '') + '"></label>' +
        '<label class="lbl">Alasan koreksi<input name="alasan" required placeholder="mis. Pelapor salah pilih area"></label><button class="btn sm">Simpan koreksi</button><p class="small muted">Titik GPS, waktu & foto asli tetap terkunci. Koreksi tercatat di riwayat.</p></form></details>';
    }
    if (!html) html = '<h3>Status</h3><p class="muted">' + (final ? (h.status === 'closed' ? 'Temuan sudah selesai diperbaiki.' : 'Laporan ditolak.') : ST[h.status] + '.') + '</p>';
    el.innerHTML = html;

    const fv = $('#fver');
    if (fv) {
      const prev = () => { const k = +fv.k.value, p = +fv.p.value; if (!k || !p) { $('#rprev').textContent = ''; return; } const s = k * p, r = s >= 15 ? 'ekstrem' : s >= 10 ? 'tinggi' : s >= 5 ? 'sedang' : 'rendah'; const hari = (A().state.setting.hazard_deadline_hari || {})[r];
        $('#rprev').innerHTML = 'Risiko: ' + riskBadge(r) + ' (' + s + ')' + (hari ? ' · batas otomatis ' + hari + ' hari' : ''); };
      fv.k.onchange = fv.p.onchange = prev;
      fv.onsubmit = e => { e.preventDefault(); const upd = { status: 'diverifikasi', kemungkinan: +fv.k.value, keparahan: +fv.p.value }; if (fv.due.value) upd.due_date = fv.due.value; ubah(upd, 'Diteruskan ke PIC area', $('button.primary', fv)); };
      $('#tolak').onclick = e => { const a = prompt('Alasan menolak laporan ini (mis. bukan bahaya, duplikat):'); if (a) ubah({ status: 'ditolak', alasan_tolak: a }, 'Laporan ditolak', e.target); };
    }
    if ($('#mulai')) $('#mulai').onclick = e => ubah({ status: 'dikerjakan' }, 'Status: sedang diperbaiki', e.target);
    const fp = $('#fperb');
    if (fp) {
      let g = null; const foto = [];
      const henti = pantauGPS((x, er) => { g = x; const el2 = $('#gps2'); if (!el2) return henti();
        const j = g && h.lat ? Math.round(jarakM(h.lat, h.lon, g.lat, g.lon)) : null, ok = j !== null && j <= radius() + g.akurasi;
        el2.innerHTML = gpsHTML(g, er, j !== null ? '<br><span class="' + (ok ? 'ok-t' : 'err') + '">' + j + ' m dari titik temuan' + (ok ? ' ✓' : ' — mendekat ke lokasi temuan') + '</span>' : ''); });
      window.addEventListener('hashchange', henti, { once: true });
      const gambar = () => { $('#pgrid').innerHTML = foto.map((x, i) => '<span class="fthumb"><img src="' + x.url + '" alt=""><button type="button" data-hp="' + i + '">✕</button></span>').join('');
        $$('[data-hp]').forEach(b => b.onclick = () => { foto.splice(+b.dataset.hp, 1); gambar(); }); };
      $('#ambil2').onclick = async () => {
        if (!g) return A().toast('Tunggu lokasi GPS dulu', 'err'); const at = new Date(), gg = { ...g };
        const blob = await kamera(() => ['PERBAIKAN ' + h.nomor + ' · ' + h.area, waktu(at), 'GPS ' + gg.lat.toFixed(6) + ', ' + gg.lon.toFixed(6) + ' ±' + gg.akurasi + ' m', 'PIC: ' + (A().state.profile?.nama || '')]);
        if (blob) { foto.push({ blob, url: URL.createObjectURL(blob), at: at.toISOString(), lat: gg.lat, lon: gg.lon, akurasi: gg.akurasi }); gambar(); }
      };
      fp.onsubmit = async e => {
        e.preventDefault(); const b = $('#kirim2');
        if (!g) return A().toast('Lokasi GPS belum didapat', 'err');
        if (!foto.length) return A().toast('Ambil foto bukti perbaikan', 'err');
        if (!navigator.onLine) return A().toast('Kirim bukti perbaikan butuh sinyal. Foto tetap tersimpan di halaman ini — coba lagi saat ada sinyal.', 'err');
        A().busy(b, true, 'Mengirim…');
        try {
          const up = await unggahFoto(h.id + '/perbaikan', foto);
          await q(sb.from('hazard').update({ status: 'menunggu_verifikasi', tindakan_perbaikan: fp.tindakan.value.trim(), foto_perbaikan: up, perbaikan_lat: g.lat, perbaikan_lon: g.lon, perbaikan_akurasi: g.akurasi }).eq('id', h.id));
          henti(); A().toast('Bukti perbaikan terkirim ke SHE'); A().route();
        } catch (er) { A().toast(A().errMsg(er), 'err'); A().busy(b, false); }
      };
    }
    if ($('#close')) $('#close').onclick = e => { if (confirm('Nyatakan hazard ini selesai?')) ubah({ status: 'closed' }, 'Hazard selesai', e.target); };
    if ($('#balik')) $('#balik').onclick = e => { const c = prompt('Apa yang belum sesuai? (dikirim ke PIC area)'); if (c) ubah({ status: 'dikerjakan', catatan_cek: c }, 'Dikembalikan ke PIC area', e.target); };
    const fk = $('#fkor');
    if (fk) {
      daftarArea().then(as => { fk.area.innerHTML = as.map(a => '<option value="' + a.id + '"' + (a.id === h.area_id ? ' selected' : '') + '>' + esc(a.nama) + '</option>').join(''); });
      fk.onsubmit = e => { e.preventDefault(); ubah({ area_id: +fk.area.value, lokasi_detail: fk.lokasi.value.trim() || null, koreksi_alasan: fk.alasan.value.trim() }, 'Koreksi disimpan', $('button', fk)); };
    }
  }

  /* ---------- PIC area (SHE) ---------- */
  async function viewArea(v) {
    if (!isShe()) { v.innerHTML = '<div class="empty">Khusus tim SHE.</div>'; return; }
    const sb = A().sb, q = A().q;
    const [as, ap] = await Promise.all([q(sb.from('area').select('id,kode,nama,jenis,aktif,urut,perusahaan_id').order('aktif', { ascending: false }).order('urut', { nullsFirst: false }).order('nama')),
      q(sb.from('area_pic').select('area_id,user_id,profil:user_id(nama,email,jabatan)').eq('aktif', true))]);
    v.innerHTML = '<div class="page-head"><div><a href="#/hazard" class="back">‹ Hazard</a><h1>PIC area</h1><div class="muted">Temuan di sebuah area otomatis diteruskan ke PIC-nya. Satu area boleh lebih dari satu PIC (mis. pengganti saat cuti).</div></div></div>' +
      '<p class="small muted">Penunjukan PIC juga bisa dilakukan SPV saat menyetujui akun (menu Akun). Akun tetap menjadi PIC sampai diubah tim SHE.</p>' +
      '<div class="mp-list">' + as.map(a => { const pics = ap.filter(x => x.area_id === a.id);
        return '<div class="box area-box' + (a.aktif ? '' : ' nonaktif') + '" data-a="' + a.id + '"><div class="akun-head"><div><b>' + esc(a.nama) + '</b> <small class="muted">' + esc(a.kode) + '</small>' + (a.aktif ? '' : ' <span class="badge">nonaktif</span>') + '</div>' +
          '<button class="btn sm ghost" data-tg="' + a.id + '" data-on="' + a.aktif + '">' + (a.aktif ? 'Nonaktifkan' : 'Aktifkan') + '</button></div>' +
          '<label class="small per-area">Milik perusahaan <select data-per="' + a.id + '"><option value="">—</option>' + (A().state.perusahaan || []).map(x => '<option value="' + x.id + '"' + (x.id === a.perusahaan_id ? ' selected' : '') + '>' + esc(x.nama) + '</option>').join('') + '</select> <span class="muted">— PIC SHE perusahaan ini bisa melihat semua temuan di area ini</span></label>' +
          '<div class="chips">' + (pics.length ? pics.map(p => '<span class="chip">' + esc(p.profil?.nama || '?') + (p.profil?.jabatan ? ' <small>' + esc(p.profil.jabatan) + '</small>' : '') + ' <button data-del="' + p.user_id + '" aria-label="Hapus PIC">✕</button></span>').join('') : '<span class="warn small">PIC belum ditunjuk</span>') + '</div>' +
          '<input class="pcari" placeholder="+ Tambah PIC: ketik nama / email akun" autocomplete="off"><div class="suggest psug"></div></div>'; }).join('') + '</div>' +
      '<form class="box form" id="fareab"><h3>Tambah area</h3><div class="grid3"><label class="lbl">Nama area / PIC<input name="nama" required placeholder="mis. CSMU Disposal"></label><label class="lbl">Kode<input name="kode" required placeholder="mis. CSMU-DISP"></label>' +
      '<label class="lbl">Milik perusahaan<select name="per"><option value="">—</option>' + (A().state.perusahaan || []).map(x => '<option value="' + x.id + '">' + esc(x.nama) + '</option>').join('') + '</select></label>' +
      '<label class="lbl">Jenis<select name="jenis">' + ['pit', 'disposal', 'hauling', 'workshop', 'fuel', 'gudang', 'tps_b3', 'kantor', 'mess', 'jetty', 'nursery', 'reklamasi', 'lainnya'].map(j => '<option>' + j + '</option>').join('') + '</select></label></div><button class="btn primary">Tambah area</button></form>';
    $$('.area-box').forEach(box => {
      const aid = +box.dataset.a, inp = $('.pcari', box), sug = $('.psug', box); let t;
      inp.oninput = () => { clearTimeout(t); t = setTimeout(async () => { const s = inp.value.replace(/[%,()]/g, ' ').trim(); if (s.length < 2) { sug.innerHTML = ''; return; }
        const r = await q(sb.from('profiles').select('id,nama,email,jabatan').eq('aktif', true).or('nama.ilike.%' + s + '%,email.ilike.%' + s + '%').limit(6));
        sug.innerHTML = r.map(p => '<button type="button" data-u="' + p.id + '">' + esc(p.nama) + ' <small>' + esc(p.jabatan || '') + ' · ' + esc(p.email || '') + '</small></button>').join('') || '<div class="small muted">Akun tidak ditemukan — orangnya perlu daftar dulu & disetujui SPV.</div>';
        $$('[data-u]', sug).forEach(b => b.onclick = () => aturArea(b.dataset.u, aid, true, 'PIC ditambahkan'));
      }, 250); };
      $$('[data-del]', box).forEach(b => b.onclick = () => { if (confirm('Lepas PIC ini dari area? (riwayat penunjukan tetap tersimpan)')) aturArea(b.dataset.del, aid, false, 'PIC dilepas'); });
      $('[data-per]', box).onchange = async e => { try { await q(sb.from('area').update({ perusahaan_id: e.target.value ? +e.target.value : null }).eq('id', aid)); A().toast('Perusahaan pemilik area disimpan'); } catch (er) { A().toast(A().errMsg(er), 'err'); } };
      $('[data-tg]', box).onclick = async e => { try { await q(sb.from('area').update({ aktif: e.target.dataset.on !== 'true' }).eq('id', aid)); A().route(); } catch (er) { A().toast(A().errMsg(er), 'err'); } };
    });
    async function aturArea(user, aid, tambah, pesan) {
      try { const cur = (await q(sb.from('area_pic').select('area_id').eq('user_id', user).eq('aktif', true))).map(x => x.area_id);
        const baru = tambah ? [...new Set([...cur, aid])] : cur.filter(x => x !== aid);
        await q(sb.rpc('atur_pic_area', { p_user: user, p_area: baru })); A().toast(pesan); A().route(); } catch (e) { A().toast(A().errMsg(e), 'err'); }
    }
    $('#fareab').onsubmit = async e => { e.preventDefault(); const f = e.target;
      try { await q(sb.from('area').insert({ nama: f.nama.value.trim(), kode: f.kode.value.trim().toUpperCase(), jenis: f.jenis.value, perusahaan_id: f.per.value ? +f.per.value : null, aktif: true, urut: 100 })); A().toast('Area ditambahkan'); A().route(); } catch (er) { A().toast(A().errMsg(er), 'err'); } };
  }

  window.Hazard = { view, kirimAntrian, viewPublik, kirimAntrianPublik, idPerangkat, infoPerangkat };
})();
