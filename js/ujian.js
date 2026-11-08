/* Ujian teori Mine Permit.
   Peserta (tanpa akun): halaman masuk → "Ujian teori" → scan QR dari permohonan → konfirmasi identitas → 30 menit.
   Jawaban tersimpan otomatis di server; nilai pilihan ganda dihitung server, soal rambu dinilai SHE. */
(function () {
  const A = () => window.App;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => A().esc(s);
  const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  const tokenDari = t => ((t || '').match(/(?:ujian=)?([0-9a-f]{24})/) || [])[1] || null;
  const urlUjian = token => location.origin + location.pathname + '?ujian=' + token;
  let stream = null, loopId = null, jsqr = null, timerId = null;
  const hentiKamera = () => { if (loopId) cancelAnimationFrame(loopId); loopId = null; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };

  function kerangka(isi) {
    document.body.innerHTML = '<div class="publik"><header class="pub-head"><img class="pub-logo" src="img/pkg-mark.svg" alt=""><b>SHE PKG</b> · Ujian teori Mine Permit</header><main class="pub-main" id="ujm">' + isi + '</main></div>';
  }
  const pesan = (t, kind) => kerangka('<div class="note ' + (kind || 'err') + '">' + t + '</div><div class="actions"><a class="btn primary" href="./?ujian=1">Scan QR lagi</a><a class="btn ghost" href="./">Ke halaman masuk</a></div>');

  /* ---------- masuk dari halaman login ---------- */
  async function viewPublik(param) {
    const token = tokenDari(param);
    if (token) return infoPeserta(token);
    kerangka('<p>Arahkan kamera ke <b>QR ujian</b> yang ditunjukkan petugas SHE / PIC (ada di halaman permohonan Mine Permit).</p>' +
      '<div class="scan-wrap"><video playsinline muted></video><div class="scan-frame"></div><div class="scan-msg">Menyalakan kamera…</div></div>' +
      '<div class="actions"><a class="btn ghost" href="./">Batal</a></div>');
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
    catch (e) { $('.scan-msg').textContent = 'Kamera tidak bisa dibuka (' + (e.name || e) + '). Izinkan kamera untuk halaman ini.'; return; }
    const v = $('video'); v.srcObject = stream; try { await v.play(); } catch (e) { }
    $('.scan-msg').textContent = 'Arahkan ke QR ujian';
    let det = null; if ('BarcodeDetector' in window) { try { det = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { } }
    if (!det) { jsqr = jsqr || new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); await jsqr; }
    const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true }); let sibuk = false, akhir = 0;
    const tick = async t => {
      loopId = requestAnimationFrame(tick); if (sibuk || t - akhir < 150 || v.readyState < 2) return; akhir = t; sibuk = true;
      try {
        let teks = null;
        if (det) teks = (await det.detect(v))[0]?.rawValue;
        else { const w = 640, h = Math.round(v.videoHeight * 640 / v.videoWidth); c.width = w; c.height = h; g.drawImage(v, 0, 0, w, h); teks = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })?.data; }
        if (teks) { const tk = tokenDari(teks); if (tk) { navigator.vibrate && navigator.vibrate(80); hentiKamera(); history.replaceState(null, '', '?ujian=' + tk); return infoPeserta(tk); } $('.scan-msg').textContent = 'Ini bukan QR ujian Mine Permit'; }
      } catch (e) { } sibuk = false;
    };
    loopId = requestAnimationFrame(tick);
  }

  /* ---------- konfirmasi identitas (waktu belum berjalan) ---------- */
  async function infoPeserta(token) {
    kerangka('<div class="loading">Memeriksa QR…</div>');
    let i; try { i = await A().q(A().sb.rpc('ujian_info', { p_token: token })); } catch (e) { return pesan(esc(A().errMsg(e))); }
    const p = i.peserta || {};
    if (i.status !== 'uji') return pesan('Ujian untuk permohonan <b>' + esc(i.nomor) + '</b> sudah ditutup.', 'warn');
    if (!i.siap) return pesan('Ujian belum dibuka: kunci jawaban belum dikonfirmasi tim SHE. Hubungi petugas SHE.', 'warn');
    if (i.lulus) return pesan('<b>' + esc(p.nama) + '</b> sudah lulus ujian teori. Hasil ada di permohonan.', 'ok');
    if (i.menunggu) return pesan('Ujian <b>' + esc(p.nama) + '</b> sudah dikerjakan dan sedang dinilai tim SHE. Hasilnya muncul di permohonan.', 'warn');
    if (!i.berjalan && i.percobaan >= i.maks) return pesan('Kesempatan ujian <b>' + esc(p.nama) + '</b> sudah habis (' + i.maks + ' kali). Hubungi tim SHE.');
    kerangka('<div class="box"><h3>Peserta ujian</h3><dl><dt>Nama</dt><dd><b class="big">' + esc(p.nama) + '</b></dd><dt>NIK</dt><dd>' + esc(p.nik || '-') + '</dd>' +
      '<dt>Perusahaan</dt><dd>' + esc(p.perusahaan || '-') + '</dd><dt>Jabatan</dt><dd>' + esc(p.jabatan || '-') + '</dd><dt>Unit</dt><dd>' + esc((i.unit || []).join(', ') || '-') + '</dd>' +
      '<dt>Permohonan</dt><dd>' + esc(i.nomor) + '</dd></dl></div>' +
      '<div class="note">' + (i.berjalan ? '<b>Ujian sedang berjalan</b> — lanjutkan di HP ini.' : 'Percobaan ke-<b>' + (i.percobaan + 1) + '</b> dari ' + i.maks + '. Waktu <b>' + i.durasi + ' menit</b> mulai berjalan saat Anda menekan <b>Mulai ujian</b>.') +
      '<br>Soal: pilihan ganda + arti rambu. Jawaban tersimpan otomatis. Kerjakan sendiri, tanpa bantuan orang lain.</div>' +
      '<label class="cek"><input type="checkbox" id="saya"> Saya adalah <b>' + esc(p.nama) + '</b> dan akan mengerjakan ujian ini sendiri.</label>' +
      '<div class="actions"><button class="btn primary" id="mulai" disabled>' + (i.berjalan ? 'Lanjutkan ujian' : 'Mulai ujian') + '</button><a class="btn ghost" href="./">Bukan saya</a></div>');
    $('#saya').onchange = e => $('#mulai').disabled = !e.target.checked;
    $('#mulai').onclick = () => mulai(token);
  }

  /* ---------- ujian ---------- */
  async function mulai(token) {
    const btn = $('#mulai'); A().busy(btn, true, 'Membuka soal…');
    let r; try { r = await A().q(A().sb.rpc('ujian_mulai', { p_token: token, p_perangkat: await window.Hazard.idPerangkat(), p_info: await window.Hazard.infoPerangkat() })); }
    catch (e) { return pesan(esc(A().errMsg(e))); }
    const kunciLokal = 'ujian_' + r.sesi, jawab = { ...(r.jawaban || {}), ...ls.get(kunciLokal, {}) };
    const geser = new Date(r.sekarang).getTime() - Date.now(), batas = new Date(r.batas_at).getTime();
    // urutan soal & pilihan diacak per peserta (tetap sama bila halaman dimuat ulang: benih = ID sesi)
    let benih = [...r.sesi].reduce((h, ch) => (Math.imul(h ^ ch.charCodeAt(0), 16777619)) >>> 0, 2166136261);
    const acak = () => { benih = (benih + 0x6D2B79F5) >>> 0; let t = benih; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const kocok = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(acak() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const daftar = kocok(r.soal);
    kerangka('<div class="ujian-bar"><span id="sisa">--:--</span><span id="terisi"></span><span id="simpan" class="small"></span></div>' +
      '<p class="small muted">' + esc(r.peserta?.nama) + ' · ' + esc(r.nomor) + ' · percobaan ' + r.percobaan + '/' + r.maks + ' · ' + daftar.length + ' soal, pilih satu jawaban yang paling benar</p>' +
      daftar.map((s, i) => '<div class="soal" data-id="' + s.id + '"><p><b>' + (i + 1) + '.</b> ' + esc(s.teks) + '</p>' +
        (s.gambar ? '<img class="rambu" src="' + esc(s.gambar) + '" alt="rambu">' : '') +
        ((s.pilihan || []).length ? kocok(s.pilihan).map((o, j) => '<label class="opsi"><input type="radio" name="s' + s.id + '" value="' + o.k + '"' + (jawab[s.id] === o.k ? ' checked' : '') + '><span><b>' + 'ABCD'[j] + '.</b> ' + esc(o.t) + '</span></label>').join('')
          : '<input class="isian" name="s' + s.id + '" maxlength="200" placeholder="Tulis jawaban…" value="' + esc(jawab[s.id] || '') + '">') + '</div>').join('') +
      '<div class="actions"><button class="btn primary" id="kirimujian">Selesai & kirim jawaban</button></div>');
    const total = r.soal.length;
    const hitung = () => { const n = r.soal.filter(s => (jawab[s.id] || '').toString().trim()).length; $('#terisi').textContent = n + '/' + total + ' terjawab'; return n; };
    hitung();
    let tertunda = {}, tSimpan = null;
    const simpan = async () => { const kirim = tertunda; tertunda = {}; if (!Object.keys(kirim).length) return; $('#simpan').textContent = 'menyimpan…';
      try { await A().q(A().sb.rpc('ujian_simpan', { p_sesi: r.sesi, p_token: token, p_jawaban: kirim })); $('#simpan').textContent = '✓ tersimpan'; }
      catch (e) { Object.assign(tertunda, kirim); $('#simpan').textContent = navigator.onLine ? 'gagal simpan' : 'tanpa sinyal — tersimpan di HP'; if (/habis|selesai/i.test(A().errMsg(e))) selesai(token, r, jawab, true); } };
    const ubah = (id, val) => { jawab[id] = val; tertunda[id] = val; ls.set(kunciLokal, jawab); hitung(); clearTimeout(tSimpan); tSimpan = setTimeout(simpan, 1200); };
    $$('input[type=radio]').forEach(x => x.onchange = () => ubah(x.closest('.soal').dataset.id, x.value));
    $$('input.isian').forEach(x => x.oninput = () => ubah(x.closest('.soal').dataset.id, x.value));
    clearInterval(timerId);
    timerId = setInterval(() => { const sisa = batas - (Date.now() + geser); const el = $('#sisa'); if (!el) return clearInterval(timerId);
      if (sisa <= 0) { clearInterval(timerId); el.textContent = '00:00'; return selesai(token, r, jawab, true); }
      const m = Math.floor(sisa / 60000), d = Math.floor(sisa % 60000 / 1000); el.textContent = '⏱ ' + String(m).padStart(2, '0') + ':' + String(d).padStart(2, '0'); el.classList.toggle('err', sisa < 300000); }, 500);
    $('#kirimujian').onclick = () => { const kosong = total - hitung();
      if (!confirm(kosong ? kosong + ' soal belum dijawab. Tetap kirim jawaban?' : 'Kirim semua jawaban? Jawaban tidak bisa diubah lagi.')) return; selesai(token, r, jawab, false); };
  }

  let mengirim = false;
  async function selesai(token, r, jawab, waktuHabis) {
    if (mengirim) return; mengirim = true; clearInterval(timerId);
    kerangka('<div class="loading">' + (waktuHabis ? 'Waktu habis — mengirim jawaban…' : 'Mengirim jawaban…') + '</div>');
    let h, coba = 0;
    while (true) { try { h = await A().q(A().sb.rpc('ujian_selesai', { p_sesi: r.sesi, p_token: token, p_jawaban: jawab })); break; }
      catch (e) { if (++coba > 20 || !/fetch|network|load failed/i.test(A().errMsg(e))) { mengirim = false; return pesan('Jawaban belum terkirim: ' + esc(A().errMsg(e)) + '. Buka lagi QR ujian saat ada sinyal — jawaban yang sudah tersimpan tidak hilang.'); }
        $('.loading').textContent = 'Menunggu sinyal untuk mengirim jawaban… (jangan tutup halaman)'; await new Promise(x => setTimeout(x, 5000)); } }
    try { localStorage.removeItem('ujian_' + r.sesi); } catch (e) { }
    mengirim = false;
    const ul = h.boleh_ulang ? '<div class="note warn">Nilai belum mencapai ' + h.minimal + '. Anda boleh <b>mengulang 1 kali</b> sekarang atau nanti dengan QR yang sama.</div><div class="actions"><a class="btn primary" href="./?ujian=' + token + '">Ulangi ujian</a></div>' : '';
    if (h.status === 'menunggu_nilai_rambu')
      kerangka('<div class="note ok"><b>Jawaban terkirim.</b><br>Pilihan ganda: <b>' + h.benar_pg + ' dari ' + h.jumlah_pg + '</b> benar.<br>' + h.jumlah_rambu + ' soal rambu sedang dinilai tim SHE. Nilai akhir muncul di permohonan Mine Permit.</div><div class="actions"><a class="btn ghost" href="./">Selesai</a></div>');
    else
      kerangka('<div class="note ' + (h.lulus ? 'ok' : 'err') + '"><b>' + (h.lulus ? 'LULUS' : 'BELUM LULUS') + '</b> ujian teori — nilai <b>' + h.nilai + '</b> (minimal ' + h.minimal + ').<br>Jawaban benar: ' + h.benar_pg + ' dari ' + h.jumlah_pg + ' soal.' + (h.lulus ? '<br>Permohonan diteruskan ke SPV SHE untuk persetujuan.' : '') + '</div>' + ul +
        (!h.lulus && !h.boleh_ulang ? '<div class="note">Kesempatan ujian sudah habis. Hubungi tim SHE.</div>' : '') + '<div class="actions"><a class="btn ghost" href="./">Selesai</a></div>');
  }

  /* ---------- di permohonan: QR, hasil, penilaian rambu ---------- */
  async function kotakPermohonan(el, p, she) {
    const sb = A().sb, q = A().q;
    const [sesi, soalR] = await Promise.all([q(sb.from('ujian_sesi').select('id,percobaan,mulai_at,selesai_at,status,jawaban,benar_pg,jumlah_pg,jumlah_rambu,nilai,lulus,nilai_rambu').eq('pengajuan_id', p.id).order('percobaan')),
      she ? q(sb.from('ujian_soal').select('id,no,teks,gambar,kunci,pilihan').eq('aktif', true).order('no')).then(x => x.filter(s => !(s.pilihan || []).length)) : Promise.resolve([])]);
    if (p.status !== 'uji' && !sesi.length) { el.remove(); return; }
    const siap = !!A().state.setting.ujian_kunci_siap, min = (A().state.setting.kimper_nilai_lulus || {}).teori ?? 70;
    let html = '<h3>Ujian teori</h3>';
    if (p.status === 'uji' && p.ujian_token) {
      let svg = ''; try { const qr = qrcode(0, 'M'); qr.addData(urlUjian(p.ujian_token)); qr.make(); svg = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } catch (e) { }
      html += (siap ? '' : '<div class="note warn">Ujian belum bisa dimulai — kunci jawaban belum dikonfirmasi SHE (menu <b>Pengajuan → Bank soal ujian</b>).</div>') +
        '<div class="ujian-qr"><div class="qrbox">' + svg + '</div><div class="small"><b>Cara ujian:</b><ol><li>Peserta membuka web SHE PKG di HP-nya.</li><li>Di halaman masuk, tekan <b>📝 Ujian teori Mine Permit</b>.</li><li>Scan QR ini, cek nama, lalu mulai (' + (A().state.setting.ujian_durasi_menit || 30) + ' menit).</li></ol>' +
        '<p class="muted">QR khusus permohonan ini — jangan dibagikan. Bisa juga dibuka dengan kamera HP biasa.</p></div></div>';
    }
    html += sesi.length ? '<table class="tbl"><thead><tr><th>Ke</th><th>Waktu</th><th>Benar</th><th>Nilai</th></tr></thead><tbody>' + sesi.map(s => '<tr><td>' + s.percobaan + '</td><td><small>' + A().tgl(s.mulai_at) + ' ' + A().jam(s.mulai_at) + '</small></td>' +
      '<td>' + (s.benar_pg != null ? s.benar_pg + '/' + s.jumlah_pg + ' benar' : '—') + '</td><td>' + (s.status === 'berjalan' ? '<span class="badge">sedang ujian</span>' : s.status === 'menunggu_nilai_rambu' ? '<span class="badge hz-baru">menunggu nilai rambu</span>' :
        '<b class="' + (s.lulus ? 'ok-t' : 'err') + '">' + s.nilai + '</b> ' + (s.lulus ? 'Lulus' : 'Belum lulus')) + '</td></tr>').join('') + '</tbody></table><p class="small muted">Nilai = jawaban benar ÷ jumlah soal × 100. Lulus bila ≥ ' + min + '. Praktik: diganti surat pernyataan kompetensi.</p>'
      : (p.status === 'uji' ? '<p class="muted small">Belum ada peserta yang mengerjakan.</p>' : '');
    const tunggu = sesi.find(s => s.status === 'menunggu_nilai_rambu');
    if (she && tunggu) {
      html += '<form id="frambu" class="box-in"><h4>Nilai soal rambu — percobaan ke-' + tunggu.percobaan + '</h4>' + soalR.map((s, i) => '<div class="rambu-nilai"><img src="' + esc(s.gambar) + '" alt=""><div><small class="muted">Rambu ' + (i + 1) + ' · acuan: ' + esc(s.kunci || '-') + '</small>' +
        '<div class="jwb">' + esc(tunggu.jawaban?.[s.id] || '(tidak dijawab)') + '</div><span class="seg kecil"><label><input type="radio" name="r' + s.id + '" value="1" required><span>Benar</span></label><label><input type="radio" name="r' + s.id + '" value="0"><span>Salah</span></label></span></div></div>').join('') +
        '<p class="small">Pilihan ganda: ' + tunggu.benar_pg + '/' + tunggu.jumlah_pg + ' benar.</p><button class="btn primary">Simpan nilai rambu</button></form>';
    }
    el.innerHTML = html;
    const f = $('#frambu', el);
    if (f) f.onsubmit = async e => { e.preventDefault(); const nilai = {}; soalR.forEach(s => nilai[s.id] = f['r' + s.id].value); A().busy($('button', f), true);
      try { const h = await q(sb.rpc('ujian_nilai_rambu', { p_sesi: tunggu.id, p_nilai: nilai })); A().toast('Nilai akhir ' + h.nilai + (h.lulus ? ' — LULUS, diteruskan ke SPV' : ' — belum lulus')); A().route(); }
      catch (er) { A().toast(A().errMsg(er), 'err'); A().busy($('button', f), false); } };
  }

  /* ---------- bank soal (tim SHE) ---------- */
  async function viewBank(v) {
    if (!A().isShe()) { v.innerHTML = '<div class="empty">Khusus tim SHE.</div>'; return; }
    const sb = A().sb, q = A().q;
    const [soal, st] = await Promise.all([q(sb.from('ujian_soal').select('*').order('tipe').order('no')), q(sb.from('setting').select('k,v').in('k', ['ujian_kunci_siap', 'ujian_durasi_menit', 'ujian_maks_percobaan', 'kimper_nilai_lulus']))]);
    const S = Object.fromEntries(st.map(x => [x.k, x.v])), siap = !!S.ujian_kunci_siap;
    const pg = soal.filter(s => s.tipe === 'pg'), rb = soal.filter(s => s.tipe === 'rambu'), aktif = soal.filter(s => s.aktif);
    const tanpa = aktif.filter(s => (s.pilihan || []).length && !['a', 'b', 'c', 'd'].includes(s.kunci)).length;
    const kartuSoal = (s, label) => '<div class="box soal-bank" data-id="' + s.id + '"><p><b>' + label + '.</b> ' + esc(s.teks) + '</p>' + (s.gambar ? '<img class="rambu" src="' + esc(s.gambar) + '" alt="">' : '') +
      ((s.pilihan || []).length ? s.pilihan.map(o => '<label class="opsi' + (s.kunci === o.k ? ' kunci' : '') + '"><input type="radio" name="k' + s.id + '" value="' + o.k + '"' + (s.kunci === o.k ? ' checked' : '') + '><span><b>' + o.k + '.</b> ' + esc(o.t) + '</span></label>').join('')
        : '<label class="lbl">Jawaban acuan (dinilai SHE)<input name="acuan" value="' + esc(s.kunci || '') + '"></label>') + '</div>';
    v.innerHTML = '<div class="page-head"><div><a href="#/pengajuan" class="back">‹ Pengajuan</a><h1>Bank soal ujian teori</h1><div class="muted">' + aktif.length + ' soal (' + pg.length + ' umum + ' + rb.length + ' rambu) · pilihan a–d · urutan soal & pilihan diacak per peserta · ' + (S.ujian_durasi_menit || 30) + ' menit · maks ' + (S.ujian_maks_percobaan || 2) + ' percobaan · lulus ≥ ' + ((S.kimper_nilai_lulus || {}).teori ?? 70) + '</div></div></div>' +
      '<div class="note ' + (siap ? 'ok' : 'warn') + '">' + (siap ? '<b>Ujian DIBUKA.</b> Peserta dengan QR permohonan bisa mengerjakan ujian.' : '<b>Ujian DITUTUP.</b> ' + (tanpa ? tanpa + ' soal belum punya kunci jawaban.' : 'Semua kunci sudah diisi — periksa lalu tekan Konfirmasi.')) +
      ' <button class="btn sm ' + (siap ? 'danger' : 'primary') + '" id="siap"' + (!siap && tanpa ? ' disabled' : '') + '>' + (siap ? 'Tutup ujian' : 'Konfirmasi kunci & buka ujian') + '</button></div>' +
      '<p class="small muted">Klik pilihan untuk menandai kunci jawaban (hijau, tersimpan otomatis). Kunci tidak pernah dikirim ke HP peserta.</p>' +
      pg.map(s => kartuSoal(s, s.no)).join('') + '<h3>Soal rambu</h3>' + rb.map(s => kartuSoal(s, 'Rambu ' + s.no)).join('');
    $$('.soal-bank input[type=radio]').forEach(x => x.onchange = async () => { const box = x.closest('.soal-bank');
      try { await q(sb.from('ujian_soal').update({ kunci: x.value, diubah_oleh: A().state.user.id, diubah_at: new Date().toISOString() }).eq('id', box.dataset.id));
        $$('.opsi', box).forEach(l => l.classList.toggle('kunci', $('input', l).checked)); A().toast('Kunci soal disimpan'); } catch (e) { A().toast(A().errMsg(e), 'err'); } });
    $$('.soal-bank input[name=acuan]').forEach(x => x.onchange = async () => { try { await q(sb.from('ujian_soal').update({ kunci: x.value.trim(), diubah_oleh: A().state.user.id, diubah_at: new Date().toISOString() }).eq('id', x.closest('.soal-bank').dataset.id)); A().toast('Acuan disimpan'); } catch (e) { A().toast(A().errMsg(e), 'err'); } });
    $('#siap').onclick = async e => { if (!confirm(siap ? 'Tutup ujian? Peserta tidak bisa memulai ujian baru.' : 'Kunci jawaban sudah benar dan ujian dibuka?')) return;
      try { await q(sb.rpc('ujian_atur_siap', { p_siap: !siap })); A().state.setting.ujian_kunci_siap = !siap; A().toast(siap ? 'Ujian ditutup' : 'Ujian dibuka'); A().route(); } catch (er) { A().toast(A().errMsg(er), 'err'); } };
  }

  window.Ujian = { viewPublik, kotakPermohonan, viewBank, urlUjian };
})();
