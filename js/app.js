/* SHE PKG — aplikasi Mine Permit (PT Hamparan Mulya) */
(function () {
  const sb = supabase.createClient(SHE_CONFIG.url, SHE_CONFIG.key, { auth: { persistSession: true, autoRefreshToken: true } });
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BLN3 = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const tgl = s => { if (!s) return '-'; const d = new Date(String(s).length === 10 ? s + 'T00:00:00' : s); return d.getDate() + ' ' + BLN3[d.getMonth()] + ' ' + d.getFullYear(); };
  const jam = s => { if (!s) return ''; const d = new Date(s); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  const state = { user: null, profile: null, perusahaan: [], jenisUnit: [], syarat: [], setting: {}, pilih: new Set() };
  try { state.pilih = new Set(JSON.parse(localStorage.getItem('mp_pilih') || '[]')); } catch (e) { }
  const simpanPilih = () => { try { localStorage.setItem('mp_pilih', JSON.stringify([...state.pilih])); } catch (e) { } };

  const ROLE = { admin: 'Administrator', spv: 'SPV SHE', staff_she: 'Staff SHE HM', pic_kontraktor: 'PIC SHE Kontraktor', gudang: 'Admin Gudang', pengawas: 'Pengawas', pekerja: 'Pekerja', viewer: 'Viewer' };
  const role = () => state.profile?.role || '';
  const isShe = () => ['admin', 'spv', 'staff_she'].includes(role());
  const canApprove = () => ['admin', 'spv'].includes(role());
  const canScan = () => isShe() || role() === 'pengawas';
  const isPic = () => role() === 'pic_kontraktor';
  const canAjukan = () => isShe() || isPic();
  const picPer = () => state.perusahaan.find(p => p.id === state.profile?.perusahaan_id);

  /* ---------- util UI ---------- */
  function toast(msg, kind) {
    let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    const el = document.createElement('div'); el.className = 'toast ' + (kind || ''); el.textContent = msg; t.appendChild(el);
    setTimeout(() => el.remove(), kind === 'err' ? 6000 : 3000);
  }
  const errMsg = e => (e && (e.message || e.error_description || e.details)) || String(e);
  async function q(promise) { const r = await promise; if (r.error) throw r.error; return r.data; }
  function busy(btn, on, label) { if (!btn) return; if (on) { btn.dataset.lbl = btn.textContent; btn.textContent = label || 'Memproses…'; btn.disabled = true; } else { btn.textContent = btn.dataset.lbl || btn.textContent; btn.disabled = false; } }
  function modal(html) {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = '<div class="modal-box">' + html + '</div>'; document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-x]')) m.remove(); });
    return m;
  }
  const statusBadge = s => '<span class="badge st-' + esc(s) + '">' + esc({ aktif: 'Aktif', kadaluarsa: 'Kadaluarsa', diganti: 'Diganti', ditangguhkan: 'Ditangguhkan', dicabut: 'Dicabut' }[s] || s) + '</span>';
  const PST = { draft: 'Draft', diajukan: 'Diajukan', verifikasi_dok: 'Verifikasi dokumen', uji: 'Uji unit', menunggu_approval: 'Menunggu persetujuan', disetujui: 'Disetujui', ditolak: 'Ditolak' };
  const JENIS_P = { baru: 'Baru', perpanjangan: 'Perpanjangan', tambah_unit: 'Tambah unit', ganti_hilang: 'Ganti hilang/rusak' };

  /* ---------- foto (bucket privat, signed URL) ---------- */
  const fotoCache = new Map();
  async function fotoUrls(paths, bucket) {
    bucket = bucket || 'foto';
    const now = Date.now(), need = [...new Set(paths.filter(p => p && !(fotoCache.get(bucket + ':' + p)?.exp > now)))];
    for (let i = 0; i < need.length; i += 100) {
      const { data } = await sb.storage.from(bucket).createSignedUrls(need.slice(i, i + 100), 3600);
      (data || []).forEach(d => { if (d.signedUrl) fotoCache.set(bucket + ':' + d.path, { url: d.signedUrl, exp: now + 3500e3 }); });
    }
    const out = {}; paths.forEach(p => { const c = fotoCache.get(bucket + ':' + p); if (c) out[p] = c.url; }); return out;
  }
  const fotoUrl = async (p, bucket) => (await fotoUrls([p], bucket))[p];
  const clearFotoCache = p => { fotoCache.delete('foto:' + p); };

  /* ---------- data referensi ---------- */
  const simpanLokal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const bacaLokal = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  async function loadRef() {
    const c = bacaLokal('she_ref', null);
    if (!navigator.onLine && c) { Object.assign(state, { perusahaan: c.perusahaan, jenisUnit: c.jenisUnit, syarat: c.syarat }); Object.assign(state.setting, c.setting || {}); return; }
    try { await loadRefOnline(); simpanLokal('she_ref', { perusahaan: state.perusahaan, jenisUnit: state.jenisUnit, syarat: state.syarat, setting: state.setting }); }
    catch (e) { if (!c) throw e; Object.assign(state, { perusahaan: c.perusahaan, jenisUnit: c.jenisUnit, syarat: c.syarat }); Object.assign(state.setting, c.setting || {}); }
  }
  async function loadRefOnline() {
    const [per, ju, sy, st] = await Promise.all([
      q(sb.from('perusahaan').select('id,nama,kode,jenis').eq('aktif', true).order('nama')),
      q(sb.from('kimper_jenis_unit').select('kode,nama,kelas,sim_min,urut').eq('aktif', true).order('urut')),
      q(sb.from('kimper_syarat').select('kode,nama,berlaku_untuk,wajib,urut').eq('aktif', true).order('urut')),
      sb.from('setting').select('k,v')
    ]);
    state.perusahaan = per; state.jenisUnit = ju; state.syarat = sy;
    (st.data || []).forEach(r => state.setting[r.k] = r.v);
  }

  /* ---------- kerangka & router ---------- */
  const LOGO = '<svg class="logo" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="10" fill="#fff"/><svg x="6" y="6" width="36" height="36" viewBox="10 10 397 293">' +
    '<rect x="20" y="28" width="57" height="257" rx="28.5" fill="#0A8442"/><circle cx="113" cy="152" r="23" fill="#0A8442"/><rect x="148" y="28" width="57" height="257" rx="28.5" fill="#0A8442"/>' +
    '<rect x="215" y="28" width="57" height="257" rx="28.5" fill="#0C4F8F"/><rect x="280" y="70" width="53" height="170" rx="26.5" fill="#0C4F8F"/><rect x="340" y="28" width="57" height="257" rx="28.5" fill="#0C4F8F"/></svg></svg>';

  function tandaSinyal() {
    let b = $('#offbar');
    if (navigator.onLine) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'offbar'; b.className = 'offbar'; document.body.prepend(b); }
    b.textContent = 'Tanpa sinyal — mode offline. Scan & catat pelanggaran tetap jalan, data terkirim otomatis saat ada sinyal.';
  }
  addEventListener('online', () => { tandaSinyal(); if (window.Scan?.syncOffline) Scan.syncOffline(); });
  addEventListener('offline', tandaSinyal);
  function shell() {
    const nav = [['mp', 'Mine Permit'], ['pengajuan', 'Pengajuan']];
    if (canScan()) nav.push(['scan', 'Scan']);
    nav.push(['pelanggaran', 'Pelanggaran']);
    if (canApprove()) nav.push(['akun', 'Akun']);
    document.body.innerHTML =
      '<header class="top no-print"><a class="brand" href="#/mp">' + LOGO + '<span><b>SHE PKG</b><small>PT Hamparan Mulya</small></span></a>' +
      '<nav>' + nav.map(([h, t]) => '<a href="#/' + h + '" data-nav="' + h + '">' + t + '</a>').join('') + '</nav>' +
      '<div class="me"><span>' + esc(state.profile?.nama || state.user?.email) + '<small>' + esc(ROLE[role()] || 'Belum punya peran') + '</small></span><button class="btn sm ghost" id="sandi" title="Ganti kata sandi">Sandi</button><button class="btn sm ghost" id="keluar">Keluar</button></div></header>' +
      '<main id="view"></main>';
    $('#keluar').onclick = async () => { await sb.auth.signOut(); location.hash = ''; location.reload(); };
    $('#sandi').onclick = () => {
      const m = modal('<div class="modal-head"><b>Ganti kata sandi</b><button class="icon-btn" data-x aria-label="Tutup">✕</button></div>' +
        '<form id="fsandi"><label class="lbl">Kata sandi baru (min. 8 karakter)<input type="password" name="a" minlength="8" required autocomplete="new-password"></label>' +
        '<label class="lbl">Ulangi kata sandi baru<input type="password" name="b" minlength="8" required autocomplete="new-password"></label>' +
        '<button class="btn primary block">Simpan kata sandi</button></form>');
      $('#fsandi', m).onsubmit = async e => {
        e.preventDefault(); const f = e.target;
        if (f.a.value !== f.b.value) return toast('Kata sandi tidak sama', 'err');
        const b = $('button', f); busy(b, true);
        const { error } = await sb.auth.updateUser({ password: f.a.value });
        if (error) { toast(errMsg(error), 'err'); busy(b, false); } else { toast('Kata sandi diganti'); m.remove(); }
      };
    };
  }

  async function route() {
    if (/^#(access_token|error)=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#/');
    if (state.recovery) return state.user ? viewSandiBaru() : viewLogin('Tautan reset sandi tidak valid atau sudah kadaluarsa. Minta tautan baru.');
    if (!state.user) return viewLogin();
    if (!state.profile || !state.profile.aktif || !state.profile.role) return viewMenunggu();
    if (!$('#view')) shell();
    const h = location.hash.replace(/^#\/?/, ''); const [path, qs] = h.split('?'); const parts = path.split('/'); const params = new URLSearchParams(qs || '');
    $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === parts[0] || (!parts[0] && a.dataset.nav === 'mp')));
    const v = $('#view'); v.innerHTML = '<div class="loading">Memuat…</div>'; window.scrollTo(0, 0);
    if (window.Scan) Scan.stop();
    try {
      if (!parts[0] || parts[0] === 'mp') return await (parts[1] ? viewMPDetail(v, parts[1]) : viewMP(v, params));
      if (parts[0] === 'pengajuan') return await (parts[1] === 'baru' ? viewPengajuanBaru(v, params) : parts[1] ? viewPengajuan(v, parts[1]) : viewPengajuanList(v, params));
      if (parts[0] === 'cetak') return await viewCetak(v, params);
      if (parts[0] === 'scan') return await Scan.view(v);
      if (parts[0] === 'pelanggaran') return await viewPelanggaran(v, params);
      if (parts[0] === 'akun' && canApprove()) return await viewAkun(v, params);
      v.innerHTML = '<p>Halaman tidak ditemukan.</p>';
    } catch (e) { console.error(e);
      v.innerHTML = !navigator.onLine || /fetch|network|load failed/i.test(errMsg(e))
        ? '<div class="empty"><b>Tanpa sinyal.</b><br>Halaman ini butuh internet.' + (canScan() ? ' <b>Scan Mine Permit</b> & catat pelanggaran tetap bisa dipakai offline.<br><br><a class="btn primary" href="#/scan">Buka Scan</a>' : '') + '</div>'
        : '<div class="empty err">Gagal memuat: ' + esc(errMsg(e)) + '</div>'; }
  }

  /* ---------- login, daftar akun, menunggu persetujuan ---------- */
  const loginWrap = inner => '<div class="login"><div class="login-box">' + LOGO.replace('class="logo"', 'class="logo big"') +
    '<h1>SHE PKG</h1><p class="muted">Sistem Mine Permit, SHE &amp; gudang — PT Hamparan Mulya, Site Muara Teweh</p>' + inner + '</div></div>';
  function viewLogin(pesan) {
    document.body.innerHTML = loginWrap((pesan ? '<div class="note warn">' + esc(pesan) + '</div>' : '') + '<form id="flogin">' +
      '<label class="lbl">Email<input type="email" name="email" required autocomplete="username"></label>' +
      '<label class="lbl">Kata sandi<input type="password" name="pw" required autocomplete="current-password"></label>' +
      '<button class="btn primary block">Masuk</button><div class="login-err err"></div></form>' +
      '<p class="small center"><a href="#" id="kelupa">Lupa kata sandi?</a></p>' +
      '<p class="small center">Belum punya akun? <a href="#" id="kedaftar">Daftar di sini</a></p>');
    $('#kedaftar').onclick = e => { e.preventDefault(); viewDaftar(); };
    $('#kelupa').onclick = e => { e.preventDefault(); viewLupa($('#flogin').email.value.trim()); };
    $('#flogin').onsubmit = async e => {
      e.preventDefault(); const f = e.target, b = $('button', f); busy(b, true, 'Masuk…');
      const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.pw.value });
      if (error) {
        const m = error.message;
        $('.login-err').textContent = m === 'Invalid login credentials' ? 'Email atau kata sandi salah.' : /not confirmed/i.test(m) ? 'Akun Anda belum disetujui SPV SHE.' : /banned/i.test(m) ? 'Akun Anda dinonaktifkan.' : m;
        busy(b, false);
      }
    };
  }
  function viewDaftar() {
    document.body.innerHTML = loginWrap('<h3>Daftar akun baru</h3><p class="small muted">Setelah mendaftar, akun Anda diperiksa dan disetujui SPV SHE. SPV juga menentukan peran / jabatan Anda di aplikasi.</p>' +
      '<form id="fdaftar"><label class="lbl">Nama lengkap<input name="nama" required autocomplete="name"></label>' +
      '<label class="lbl">NIK karyawan <small class="muted">(bila ada)</small><input name="nik"></label>' +
      '<label class="lbl">Perusahaan<input name="perusahaan" list="dlper" placeholder="mis. PT Hamparan Mulya, PT ABA" required></label>' +
      '<datalist id="dlper"><option>PT Hamparan Mulya</option><option>PT ABA</option><option>PT CSMU</option><option>PT BAT</option></datalist>' +
      '<label class="lbl">Jabatan<input name="jabatan" placeholder="mis. Pengawas Pit, Staff SHE" required></label>' +
      '<label class="lbl">No. HP / WA<input name="hp" type="tel" inputmode="tel"></label>' +
      '<label class="lbl">Email<input type="email" name="email" required autocomplete="email"></label>' +
      '<label class="lbl">Kata sandi (min. 8 karakter)<input type="password" name="pw" minlength="8" required autocomplete="new-password"></label>' +
      '<label class="lbl">Ulangi kata sandi<input type="password" name="pw2" minlength="8" required autocomplete="new-password"></label>' +
      '<button class="btn primary block">Kirim pendaftaran</button><div class="login-err err"></div></form>' +
      '<p class="small center"><a href="#" id="kelogin">‹ Kembali ke halaman masuk</a></p>');
    $('#kelogin').onclick = e => { e.preventDefault(); viewLogin(); };
    $('#fdaftar').onsubmit = async e => {
      e.preventDefault(); const f = e.target, b = $('button', f);
      if (f.pw.value !== f.pw2.value) { $('.login-err').textContent = 'Kata sandi tidak sama.'; return; }
      busy(b, true, 'Mengirim…');
      const { data, error } = await sb.auth.signUp({ email: f.email.value.trim(), password: f.pw.value,
        options: { emailRedirectTo: location.origin + location.pathname,
          data: { nama: f.nama.value.trim(), nik: f.nik.value.trim(), perusahaan: f.perusahaan.value.trim(), jabatan: f.jabatan.value.trim(), no_hp: f.hp.value.trim() } } });
      if (error) { $('.login-err').textContent = /registered/i.test(error.message) ? 'Email ini sudah terdaftar.' : error.message; busy(b, false); return; }
      if (data.session) await sb.auth.signOut();
      document.body.innerHTML = loginWrap('<div class="note ok"><b>Pendaftaran terkirim.</b><br>Akun Anda menunggu persetujuan SPV SHE. Setelah disetujui, Anda bisa masuk dengan email &amp; kata sandi tadi.</div>' +
        '<p class="small center"><a href="#" id="kelogin">‹ Ke halaman masuk</a></p>');
      $('#kelogin').onclick = ev => { ev.preventDefault(); location.reload(); };
    };
  }
  function viewLupa(email) {
    document.body.innerHTML = loginWrap('<h3>Lupa kata sandi</h3><p class="small muted">Masukkan email akun Anda. Permintaan dikirim ke SPV SHE, dan bila email aktif Anda juga menerima tautan untuk membuat kata sandi baru.</p>' +
      '<form id="flupa"><label class="lbl">Email<input type="email" name="email" required autocomplete="email" value="' + esc(email || '') + '"></label>' +
      '<button class="btn primary block">Kirim permintaan</button><div class="login-err err"></div></form>' +
      '<p class="small center"><a href="#" id="kelogin">‹ Kembali ke halaman masuk</a></p>');
    $('#kelogin').onclick = e => { e.preventDefault(); viewLogin(); };
    $('#flupa').onsubmit = async e => {
      e.preventDefault(); const f = e.target, b = $('button', f); busy(b, true, 'Mengirim…');
      const em = f.email.value.trim();
      const r1 = await sb.rpc('minta_reset_sandi', { p_email: em });
      if (r1.error) { $('.login-err').textContent = r1.error.message; busy(b, false); return; }
      sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname + '?reset=1' }).catch(() => {});
      document.body.innerHTML = loginWrap('<div class="note ok"><b>Permintaan terkirim.</b> Bila <b>' + esc(em) + '</b> terdaftar, SPV SHE menerima permintaan reset sandi Anda dan akan memberi <b>sandi sementara</b> lewat WA / telepon.</div>' +
        '<p class="small muted">Bila email Anda aktif, mungkin juga masuk email berisi tautan untuk membuat sandi baru (cek folder Spam).</p>' +
        '<p class="small center"><a href="#" id="kelogin">‹ Ke halaman masuk</a></p>');
      $('#kelogin').onclick = ev => { ev.preventDefault(); viewLogin(); };
    };
  }
  function viewSandiBaru() {
    document.body.innerHTML = loginWrap('<h3>Buat kata sandi baru</h3><p class="small muted">Akun: <b>' + esc(state.user?.email || '') + '</b></p>' +
      '<form id="fbaru2"><label class="lbl">Kata sandi baru (min. 8 karakter)<input type="password" name="pw" minlength="8" required autocomplete="new-password"></label>' +
      '<label class="lbl">Ulangi kata sandi baru<input type="password" name="pw2" minlength="8" required autocomplete="new-password"></label>' +
      '<button class="btn primary block">Simpan kata sandi</button><div class="login-err err"></div></form>');
    $('#fbaru2').onsubmit = async e => {
      e.preventDefault(); const f = e.target, b = $('button', f);
      if (f.pw.value !== f.pw2.value) { $('.login-err').textContent = 'Kata sandi tidak sama.'; return; }
      busy(b, true, 'Menyimpan…');
      const { error } = await sb.auth.updateUser({ password: f.pw.value });
      if (error) { $('.login-err').textContent = /different|same/i.test(error.message) ? 'Kata sandi baru harus berbeda dari yang lama.' : error.message; busy(b, false); return; }
      state.recovery = false; history.replaceState(null, '', location.pathname + '#/');
      toast('Kata sandi baru tersimpan'); document.body.innerHTML = ''; route();
    };
  }
  function viewMenunggu() {
    const p = state.profile || {};
    const pesan = p.status === 'ditolak' ? 'Pendaftaran Anda ditolak' + (p.catatan ? ': ' + esc(p.catatan) : '.') :
      p.status === 'nonaktif' ? 'Akun Anda dinonaktifkan' + (p.catatan ? ': ' + esc(p.catatan) : '.') + ' Hubungi SPV SHE.' :
      'Akun Anda (<b>' + esc(state.user?.email) + '</b>) sedang menunggu persetujuan SPV SHE. Coba masuk lagi setelah disetujui.';
    document.body.innerHTML = loginWrap('<div class="note ' + (p.status === 'menunggu' || !p.status ? 'warn' : 'err') + '">' + pesan + '</div>' +
      '<button class="btn block" id="cekulang">Cek lagi</button> <button class="btn ghost block" id="keluar2">Keluar</button>');
    $('#cekulang').onclick = async () => { await setUser((await sb.auth.getSession()).data.session); document.body.innerHTML = ''; route(); };
    $('#keluar2').onclick = async () => { await sb.auth.signOut(); location.reload(); };
  }

  /* ---------- daftar Mine Permit ---------- */
  async function viewMP(v, params) {
    const f = { q: params.get('q') || '', per: params.get('per') || '', st: params.get('st') || 'aktif', hal: +(params.get('hal') || 0) };
    const N = 40;
    v.innerHTML =
      '<div class="page-head"><h1>Mine Permit' + (isPic() && picPer() ? ' — ' + esc(picPer().nama) : '') + '</h1>' + (canAjukan() ? '<a class="btn primary" href="#/pengajuan/baru">+ Pengajuan baru</a>' : '') + '</div>' +
      '<form class="filters" id="fmp"><input type="search" name="q" placeholder="Cari nama, nomor, atau NIK…" value="' + esc(f.q) + '">' +
      '<select name="per"><option value="">Semua perusahaan</option>' + state.perusahaan.map(p => '<option value="' + p.id + '"' + (String(p.id) === f.per ? ' selected' : '') + '>' + esc(p.nama) + '</option>').join('') + '</select>' +
      '<select name="st">' + [['aktif', 'Aktif'], ['habis30', 'Habis ≤ 30 hari'], ['belumcetak', 'Aktif, belum dicetak'], ['kadaluarsa', 'Kadaluarsa'], ['semua', 'Semua status']].map(([k, t]) => '<option value="' + k + '"' + (k === f.st ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
      '<button class="btn">Cari</button></form>' +
      '<div class="printbar no-print" id="pbar"></div><div id="mplist" class="loading">Memuat…</div>';
    $('#fmp').onsubmit = e => { e.preventDefault(); const d = new FormData(e.target); location.hash = '#/mp?' + new URLSearchParams({ q: d.get('q'), per: d.get('per'), st: d.get('st') }); };
    renderPilih();
    let qy = filterMP(sb.from('v_mine_permit').select('id,nomor,status,berlaku_sampai,akses_kartu,nama,nik,jabatan,perusahaan,foto_path,unit,dicetak_at,jml_pelanggaran', { count: 'exact' }), f)
      .range(f.hal * N, f.hal * N + N - 1);
    const { data, count, error } = await qy; if (error) throw error;
    const urls = await fotoUrls(data.map(r => r.foto_path));
    const L = $('#mplist'); if (!L) return; L.className = '';
    if (!data.length) { L.innerHTML = '<div class="empty">Tidak ada Mine Permit yang cocok.</div>'; return; }
    L.innerHTML = '<div class="list-head"><span class="muted small">' + count + ' Mine Permit' + (isShe() ? ' · centang untuk dicetak' : '') + '</span>' +
      (isShe() ? '<span class="pick-all"><button type="button" class="btn sm ghost" id="pilihhal">Pilih semua di halaman ini (' + data.length + ')</button>' +
        (count > data.length ? '<button type="button" class="btn sm ghost" id="pilihsemua">Pilih semua hasil (' + count + ' → ' + Math.ceil(count / 4) + ' lembar)</button>' : '') + '</span>' : '') +
      '</div><div class="mp-list">' + data.map(r =>
      '<div class="mp-row">' + (isShe() ? '<input type="checkbox" class="pick" data-id="' + r.id + '"' + (state.pilih.has(r.id) ? ' checked' : '') + ' aria-label="Pilih untuk dicetak">' : '') +
      '<a href="#/mp/' + r.id + '" class="mp-link"><span class="thumb">' + (urls[r.foto_path] ? '<img loading="lazy" src="' + esc(urls[r.foto_path]) + '" alt="">' : '') + '</span>' +
      '<span class="mp-main"><b>' + esc(r.nama) + '</b><small>' + esc(r.nomor) + ' · ' + esc(r.perusahaan) + '</small>' +
      '<small class="units">' + esc((r.unit || []).map(u => u.kode + ' (' + u.akses + ')').join(', ')) + '</small></span>' +
      '<span class="mp-side">' + statusBadge(r.status) + (r.akses_kartu === 'RESTRICTED' ? '<span class="badge restr">RESTRICTED</span>' : '') +
      '<small>s/d ' + tgl(r.berlaku_sampai) + '</small>' + (r.jml_pelanggaran ? '<small class="warn">' + r.jml_pelanggaran + ' pelanggaran</small>' : '') +
      (r.status === 'aktif' && !r.dicetak_at ? '<small class="muted">belum dicetak</small>' : '') + '</span></a></div>').join('') + '</div>' +
      pager(f, count, N, 'mp');
    $$('.pick', L).forEach(c => c.onchange = () => { c.checked ? state.pilih.add(c.dataset.id) : state.pilih.delete(c.dataset.id); simpanPilih(); renderPilih(); });
    if ($('#pilihhal')) $('#pilihhal').onclick = () => { data.forEach(r => state.pilih.add(r.id)); $$('.pick', L).forEach(c => c.checked = true); simpanPilih(); renderPilih(); };
    if ($('#pilihsemua')) $('#pilihsemua').onclick = async e => {
      if (count > 400 && !confirm('Pilih ' + count + ' Mine Permit (' + Math.ceil(count / 4) + ' lembar A4)?')) return;
      busy(e.target, true);
      try { for (let i = 0; i < count; i += 1000) (await q(filterMP(sb.from('v_mine_permit').select('id'), f).range(i, i + 999))).forEach(r => state.pilih.add(r.id));
        $$('.pick', L).forEach(c => c.checked = true); simpanPilih(); renderPilih(); toast(state.pilih.size + ' Mine Permit dipilih'); }
      catch (er) { toast(errMsg(er), 'err'); } busy(e.target, false);
    };
  }
  // filter daftar Mine Permit (dipakai daftar & "pilih semua hasil"); urutan sama dengan daftar
  function filterMP(qy, f) {
    if (f.q) { const s = f.q.replace(/[%,()]/g, ' ').trim(); qy = qy.or('nama.ilike.%' + s + '%,nomor.ilike.%' + s + '%,nik.ilike.%' + s + '%,nomor_lama.ilike.%' + s + '%'); }
    if (f.per) qy = qy.eq('perusahaan_id', f.per);
    if (f.st === 'aktif') qy = qy.eq('status', 'aktif');
    if (f.st === 'kadaluarsa') qy = qy.eq('status', 'kadaluarsa');
    if (f.st === 'belumcetak') qy = qy.eq('status', 'aktif').is('dicetak_at', null);
    if (f.st === 'habis30') { const d = new Date(); d.setDate(d.getDate() + 30); qy = qy.eq('status', 'aktif').lte('berlaku_sampai', d.toISOString().slice(0, 10)); }
    return qy.order(f.st === 'habis30' ? 'berlaku_sampai' : 'nama').order('id');
  }
  function pager(f, count, N, base) {
    const pages = Math.ceil(count / N); if (pages <= 1) return '';
    const p = new URLSearchParams(location.hash.split('?')[1] || '');
    const link = h => { p.set('hal', h); return '#/' + base + '?' + p; };
    return '<div class="pager">' + (f.hal > 0 ? '<a class="btn sm" href="' + link(f.hal - 1) + '">‹ Sebelumnya</a>' : '') + '<span>Hal ' + (f.hal + 1) + ' / ' + pages + '</span>' +
      (f.hal < pages - 1 ? '<a class="btn sm" href="' + link(f.hal + 1) + '">Berikutnya ›</a>' : '') + '</div>';
  }
  function renderPilih() {
    const b = $('#pbar'); if (!b || !isShe()) return;
    const n = state.pilih.size;
    b.innerHTML = n ? '<span><b>' + n + '</b> Mine Permit dipilih (' + Math.ceil(n / 4) + ' lembar A4)</span><a class="btn primary sm" href="#/cetak">Cetak terpilih</a><button class="btn sm ghost" id="kosong">Kosongkan</button>' : '';
    if (n) $('#kosong').onclick = () => { state.pilih.clear(); simpanPilih(); renderPilih(); $$('.pick').forEach(c => c.checked = false); };
  }

  /* ---------- detail Mine Permit ---------- */
  async function viewMPDetail(v, id) {
    const [c] = await q(sb.from('v_mine_permit').select('*').eq('id', id));
    if (!c) { v.innerHTML = '<div class="empty">Mine Permit tidak ditemukan.</div>'; return; }
    const [kr, log, acc, plg] = await Promise.all([
      q(sb.from('karyawan').select('id,nik,nama,jabatan,golongan_darah,foto_path,foto_asli_path,foto_status,foto_zoom,foto_x,foto_y,no_hp').eq('id', c.karyawan_id).single()),
      q(sb.from('kimper_log').select('tipe,keterangan,at').eq('kimper_id', id).order('at', { ascending: false }).limit(50)),
      q(sb.from('kimper_accident').select('tgl,tingkat,warna,dilubangi,keterangan').eq('kimper_id', id).order('tgl')),
      q(sb.from('pelanggaran').select('id,nomor,tgl,lokasi,unit_no,tindakan,keterangan,pelanggaran_jenis(nama)').eq('kimper_id', id).order('tgl', { ascending: false }))
    ]);
    const url = await fotoUrl(c.foto_path);
    const FS = { otomatis: '', manual: '', resolusi_rendah: 'Foto kurang tajam', wajah_tidak_terdeteksi: 'Foto perlu dicek', kepala_terpotong: 'Kepala terpotong', perlu_diganti: 'Foto wajib diganti' };
    v.innerHTML =
      '<div class="page-head"><div><a href="#/mp" class="back">‹ Mine Permit</a><h1>' + esc(c.nama) + '</h1><div class="muted">' + esc(c.nomor) + ' · ' + esc(c.perusahaan) + (c.subkon ? ' (' + esc(c.subkon) + ')' : '') + ' · NIK ' + esc(c.nik) + '</div></div>' +
      '<div class="head-badges">' + statusBadge(c.status) + (c.akses_kartu === 'RESTRICTED' ? '<span class="badge restr">RESTRICTED</span>' : '<span class="badge full">FULL ACCESS</span>') + '</div></div>' +
      '<div class="detail-grid"><section class="card-preview"><div class="scaler">' + MPCard.renderCard(c, { foto: url, ktt: state.setting.ktt_nama, persetujuan: state.setting.mp_judul_persetujuan, accident: acc }) + '</div>' +
      (FS[kr.foto_status] ? '<div class="note warn">' + FS[kr.foto_status] + '</div>' : '') +
      (isShe() ? '<div class="actions"><button class="btn primary" id="cetak1">Cetak</button><button class="btn" id="foto">Atur foto</button>' +
        (['aktif', 'kadaluarsa'].includes(c.status) ? '<a class="btn" href="#/pengajuan/baru?karyawan=' + c.karyawan_id + '&jenis=perpanjangan&lama=' + c.id + '">Perpanjang</a><a class="btn" href="#/pengajuan/baru?karyawan=' + c.karyawan_id + '&jenis=tambah_unit&lama=' + c.id + '">Tambah unit</a>' : '') +
        '</div>' : '') + '</section>' +
      '<section class="info">' +
        '<div class="box"><h3>Data</h3><dl>' +
          '<dt>Berlaku sampai</dt><dd>' + tgl(c.berlaku_sampai) + (c.perpanjangan_ke ? ' <span class="muted">(diperpanjang ' + c.perpanjangan_ke + '×)</span>' : '') + '</dd>' +
          '<dt>SIM</dt><dd>' + esc(c.sim_jenis || '-') + ' · ' + esc(c.sim_nomor || '-') + ' · s/d ' + tgl(c.sim_berlaku) + '</dd>' +
          '<dt>Gol. darah</dt><dd>' + (isShe() ? '<select id="gd"><option value="">—</option>' + ['A', 'B', 'AB', 'O', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => '<option' + (g === c.golongan_darah ? ' selected' : '') + '>' + g + '</option>').join('') + '</select>' : esc(c.golongan_darah || '-')) + '</dd>' +
          '<dt>Dicetak</dt><dd>' + (c.dicetak_at ? tgl(c.dicetak_at) + ' (' + c.cetak_ke + '×)' : 'Belum') + '</dd>' +
          '<dt>Unit</dt><dd>' + ((c.unit || []).map(u => esc(u.nama) + ' <b>(' + u.akses + ')</b>').join('<br>') || '-') + '</dd></dl>' +
          (isShe() ? '<div class="actions">' + (c.status === 'aktif' ? '<button class="btn sm" data-st="ditangguhkan">Tangguhkan</button><button class="btn sm danger" data-st="dicabut">Cabut</button>' : '') +
            (c.status === 'ditangguhkan' ? '<button class="btn sm" data-st="aktif">Aktifkan kembali</button><button class="btn sm danger" data-st="dicabut">Cabut</button>' : '') + '</div>' : '') +
        '</div>' +
        '<div class="box"><h3>Accident</h3>' + (acc.length ? '<ul class="plain">' + acc.map(a => '<li><span class="dot ' + a.warna + '"></span>' + tgl(a.tgl) + ' — ' + a.tingkat + (a.dilubangi ? '' : ' <span class="muted">(berulang, tidak dilubangi)</span>') + (a.keterangan ? '<br><small>' + esc(a.keterangan) + '</small>' : '') + '</li>').join('') + '</ul>' : '<p class="muted">Belum ada.</p>') +
          (isShe() ? '<form id="facc" class="inline"><select name="tingkat"><option value="ringan">Ringan — hijau</option><option value="berat">Berat — kuning</option><option value="fatal">Fatal — merah</option></select><input name="ket" placeholder="Keterangan / no. insiden"><button class="btn sm">Catat lubang</button></form>' : '') + '</div>' +
        '<div class="box"><h3>Pelanggaran (' + plg.length + ')</h3>' + (plg.length ? '<ul class="plain">' + plg.map(p => '<li><b>' + esc(p.pelanggaran_jenis?.nama) + '</b><br><small>' + esc(p.nomor) + ' · ' + tgl(p.tgl) + ' ' + jam(p.tgl) + (p.lokasi ? ' · ' + esc(p.lokasi) : '') + (p.unit_no ? ' · ' + esc(p.unit_no) : '') + (p.tindakan ? ' · ' + esc(p.tindakan) : '') + '</small></li>').join('') + '</ul>' : '<p class="muted">Belum ada pelanggaran.</p>') + '</div>' +
        '<div class="box"><h3>Riwayat</h3><ul class="plain log">' + log.map(l => '<li><small>' + tgl(l.at) + ' ' + jam(l.at) + '</small> ' + esc(l.keterangan || l.tipe) + '</li>').join('') + '</ul></div>' +
      '</section></div>';
    fitPreview();
    if (!isShe()) return;
    $('#cetak1').onclick = () => { location.hash = '#/cetak?ids=' + c.id; };
    $('#foto').onclick = () => FotoEditor.open({ karyawan: kr, sb, onSaved: () => route() });
    $('#gd').onchange = async e => { try { await q(sb.from('karyawan').update({ golongan_darah: e.target.value || null }).eq('id', c.karyawan_id)); toast('Golongan darah disimpan'); route(); } catch (er) { toast(errMsg(er), 'err'); } };
    $$('[data-st]').forEach(b => b.onclick = async () => {
      const st = b.dataset.st, label = { ditangguhkan: 'menangguhkan', dicabut: 'mencabut', aktif: 'mengaktifkan kembali' }[st];
      const alasan = prompt('Alasan ' + label + ' Mine Permit ini:'); if (alasan === null) return;
      if (st !== 'aktif' && !alasan.trim()) return toast('Alasan wajib diisi', 'err');
      try { await q(sb.from('kimper').update({ status: st, catatan_status: (st === 'aktif' ? 'Diaktifkan kembali' : st === 'dicabut' ? 'Dicabut' : 'Ditangguhkan') + (alasan.trim() ? ': ' + alasan.trim() : '') }).eq('id', c.id));
        toast('Status diperbarui'); route(); } catch (er) { toast(errMsg(er), 'err'); }
    });
    $('#facc').onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      if (!confirm('Catat Accident ' + f.tingkat.value + ' untuk ' + c.nama + '? Lubangi bulatan di kartu fisik sesuai warnanya.')) return;
      try { await q(sb.from('kimper_accident').insert({ kimper_id: c.id, tingkat: f.tingkat.value, keterangan: f.ket.value || null })); toast('Accident tercatat'); route(); } catch (er) { toast(errMsg(er), 'err'); }
    };
  }
  function fitPreview() {   // perkecil pratinjau kartu agar muat di layar HP
    $$('.scaler').forEach(s => { const card = s.firstElementChild; if (!card) return;
      const cs = getComputedStyle(s.parentElement); const w = s.parentElement.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const k = Math.min(1.6, w / card.offsetWidth);
      s.style.width = card.offsetWidth + 'px'; s.style.transform = 'scale(' + k + ')'; s.style.marginBottom = (card.offsetHeight * (k - 1)) + 'px';
      s.style.marginRight = (card.offsetWidth * (k - 1)) + 'px'; });
  }
  window.addEventListener('resize', fitPreview);

  /* ---------- cetak A4 ---------- */
  async function viewCetak(v, params) {
    const ids = params.get('ids') ? params.get('ids').split(',') : [...state.pilih];
    if (!ids.length) { v.innerHTML = '<div class="empty">Belum ada Mine Permit yang dipilih. Centang di daftar Mine Permit.</div>'; return; }
    const rows = [];
    for (let i = 0; i < ids.length; i += 100) rows.push(...await q(sb.from('v_mine_permit').select('*').in('id', ids.slice(i, i + 100))));
    rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    const urls = await fotoUrls(rows.map(r => r.foto_path));
    const noFoto = rows.filter(r => !urls[r.foto_path]);
    const sheets = []; for (let i = 0; i < rows.length; i += 4) sheets.push(rows.slice(i, i + 4));
    v.innerHTML = '<div class="page-head no-print"><div><a href="#/mp" class="back">‹ Mine Permit</a><h1>Cetak Mine Permit</h1><div class="muted">' + rows.length + ' kartu · ' + sheets.length + ' lembar A4 landscape</div></div>' +
      '<div class="actions"><button class="btn primary" id="print">Cetak / simpan PDF</button></div></div>' +
      '<div class="note no-print">Di jendela cetak pilih <b>kertas A4, orientasi landscape, skala 100% (jangan "Fit to page"), margin: None</b>, dan centang <b>Background graphics</b>. Tiap kartu 11,25 × 9,5 cm, lipat di garis putus-putus.</div>' +
      (noFoto.length ? '<div class="note warn no-print">' + noFoto.length + ' kartu belum punya foto: ' + esc(noFoto.map(r => r.nama).join(', ')) + '</div>' : '') +
      '<div class="print-area">' + sheets.map((s, i) => '<div class="sheet-lbl no-print">Lembar ' + (i + 1) + ' dari ' + sheets.length + '</div><div class="mp-sheet">' + s.map(c => '<div class="cell">' + MPCard.renderCard(c, { foto: urls[c.foto_path], ktt: state.setting.ktt_nama, persetujuan: state.setting.mp_judul_persetujuan }) +
        (params.get('ids') ? '' : '<button class="btn sm danger buang no-print" data-buang="' + c.id + '" title="Keluarkan dari cetakan">×</button>') + '</div>').join('') + '</div>').join('') + '</div>';
    $$('[data-buang]').forEach(b => b.onclick = () => { state.pilih.delete(b.dataset.buang); simpanPilih(); route(); });
    $('#print').onclick = async () => {
      await Promise.all($$('.print-area img').map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
      window.print();
      if (confirm('Tandai ' + rows.length + ' Mine Permit ini sudah dicetak?')) {
        try { await q(sb.rpc('tandai_dicetak', { p_ids: rows.map(r => r.id) })); if (!params.get('ids')) { state.pilih.clear(); simpanPilih(); } toast('Ditandai sudah dicetak'); } catch (e) { toast(errMsg(e), 'err'); }
      }
    };
  }

  /* ---------- pengajuan: daftar ---------- */
  async function viewPengajuanList(v, params) {
    const st = params.get('st') || 'proses';
    v.innerHTML = '<div class="page-head"><h1>Pengajuan Mine Permit</h1>' + (canAjukan() ? '<a class="btn primary" href="#/pengajuan/baru">+ Pengajuan baru</a>' : '') + '</div>' +
      '<div class="tabs">' + [['proses', 'Dalam proses'], ['menunggu_approval', 'Menunggu persetujuan'], ['disetujui', 'Disetujui'], ['ditolak', 'Ditolak'], ['semua', 'Semua']].map(([k, t]) => '<a href="#/pengajuan?st=' + k + '"' + (k === st ? ' class="on"' : '') + '>' + t + '</a>').join('') + '</div><div id="plist" class="loading">Memuat…</div>';
    let qy = sb.from('kimper_pengajuan').select('id,nomor,jenis,status,akses_kartu,created_at,updated_at,karyawan:karyawan_id(nama,nik,perusahaan:perusahaan_id(nama))').order('updated_at', { ascending: false }).limit(100);
    if (st === 'proses') qy = qy.in('status', ['draft', 'diajukan', 'verifikasi_dok', 'uji']);
    else if (st !== 'semua') qy = qy.eq('status', st);
    const data = await q(qy); const L = $('#plist'); if (!L) return; L.className = '';
    L.innerHTML = data.length ? '<div class="mp-list">' + data.map(p => '<a class="mp-row mp-link" href="#/pengajuan/' + p.id + '"><span class="mp-main"><b>' + esc(p.karyawan?.nama) + '</b><small>' + esc(p.nomor) + ' · ' + JENIS_P[p.jenis] + ' · ' + esc(p.karyawan?.perusahaan?.nama) + '</small></span>' +
      '<span class="mp-side"><span class="badge pst-' + p.status + '">' + PST[p.status] + '</span>' + (p.akses_kartu === 'RESTRICTED' ? '<span class="badge restr">RESTRICTED</span>' : '') + '<small>' + tgl(p.updated_at) + '</small></span></a>').join('') + '</div>'
      : '<div class="empty">Tidak ada pengajuan.</div>';
  }

  /* ---------- pengajuan: baru ---------- */
  async function viewPengajuanBaru(v, params) {
    if (!canAjukan()) { v.innerHTML = '<div class="empty">Pengajuan dibuat oleh tim SHE atau PIC SHE kontraktor.</div>'; return; }
    if (isPic() && !picPer()) { v.innerHTML = '<div class="empty">Akun PIC Anda belum terhubung ke perusahaan. Hubungi SPV SHE.</div>'; return; }
    const jenis = params.get('jenis') || 'baru';
    let kr = null, lama = null;
    if (params.get('karyawan')) kr = await q(sb.from('karyawan').select('id,nik,nama,jabatan,perusahaan_id,golongan_darah,perusahaan:perusahaan_id(nama)').eq('id', params.get('karyawan')).single());
    if (params.get('lama')) [lama] = await q(sb.from('v_mine_permit').select('*').eq('id', params.get('lama')));
    const unitAda = new Map((lama?.unit || []).map(u => [u.kode, u.akses]));
    v.innerHTML = '<div class="page-head"><div><a href="#/pengajuan" class="back">‹ Pengajuan</a><h1>Pengajuan Mine Permit</h1></div></div>' +
      '<form id="fbaru" class="form">' +
      '<fieldset><legend>Jenis pengajuan</legend><div class="seg">' + Object.entries(JENIS_P).map(([k, t]) => '<label><input type="radio" name="jenis" value="' + k + '"' + (k === jenis ? ' checked' : '') + '><span>' + t + '</span></label>').join('') + '</div>' +
      (lama ? '<p class="muted small">Mine Permit lama: <b>' + esc(lama.nomor) + '</b>' + (jenis === 'perpanjangan' ? ' — nomor & QR tetap sama setelah diperpanjang.' : '') + '</p>' : '') + '</fieldset>' +
      '<fieldset><legend>Karyawan</legend><div id="krpick">' + (kr ? krChip(kr) : '') + '</div>' +
      (kr ? '' : '<input type="search" id="krcari" placeholder="Ketik nama atau NIK karyawan…" autocomplete="off"><div id="krhasil" class="suggest"></div>' +
        '<details id="krbaru"><summary>Karyawan belum terdaftar? Tambah baru</summary><div class="grid2">' +
        '<label class="lbl">NIK<input name="nik"></label><label class="lbl">Nama lengkap<input name="nama"></label>' +
        '<label class="lbl">Perusahaan<select name="perusahaan_id"><option value="">— pilih —</option>' + (isPic() ? [picPer()] : state.perusahaan).map(p => '<option value="' + p.id + '"' + (isPic() ? ' selected' : '') + '>' + esc(p.nama) + '</option>').join('') + '</select></label>' +
        '<label class="lbl">Jabatan<input name="jabatan"></label>' +
        '<label class="lbl">Subkon / vendor (keterangan)<input name="subkon" placeholder="boleh kosong"></label>' +
        '<label class="lbl">Gol. darah<select name="gd"><option value="">—</option>' + ['A', 'B', 'AB', 'O', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => '<option>' + g + '</option>').join('') + '</select></label>' +
        '</div></details>') + '</fieldset>' +
      '<fieldset><legend>SIM</legend><div class="grid3">' +
        '<label class="lbl">Golongan<select name="sim_jenis"><option value="">— tidak ada —</option>' + ['A', 'B I', 'B I Umum', 'B II', 'B II Umum', 'C'].map(s => '<option' + (s === lama?.sim_jenis ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></label>' +
        '<label class="lbl">Nomor SIM<input name="sim_nomor" inputmode="numeric" value="' + esc(lama?.sim_nomor || '') + '"></label>' +
        '<label class="lbl">Berlaku sampai<input type="date" name="sim_berlaku" value="' + esc(lama?.sim_berlaku || '') + '"></label></div></fieldset>' +
      '<fieldset><legend>Akses Mine Permit</legend><div class="seg">' +
        '<label><input type="radio" name="akses" value="FULL"' + (lama?.akses_kartu !== 'RESTRICTED' ? ' checked' : '') + '><span class="full-t">FULL ACCESS</span></label>' +
        '<label><input type="radio" name="akses" value="RESTRICTED"' + (lama?.akses_kartu === 'RESTRICTED' ? ' checked' : '') + '><span class="restr-t">RESTRICTED</span></label></div></fieldset>' +
      '<fieldset><legend>Unit yang diajukan</legend><p class="muted small">Centang unit, lalu pilih kode akses: <b>F</b> = full access, <b>R</b> = restricted.' + (lama ? ' Unit di kartu lama sudah tercentang.' : '') + '</p><div class="units-pick">' +
        state.jenisUnit.map(u => '<div class="up"><label><input type="checkbox" name="u" value="' + u.kode + '"' + (unitAda.has(u.kode) ? ' checked' : '') + '> ' + esc(u.nama) + (u.sim_min ? ' <small class="muted">(SIM ' + u.sim_min + ')</small>' : '') + '</label>' +
          '<span class="fr"><label><input type="radio" name="a_' + u.kode + '" value="F"' + (unitAda.get(u.kode) !== 'R' ? ' checked' : '') + '>F</label><label><input type="radio" name="a_' + u.kode + '" value="R"' + (unitAda.get(u.kode) === 'R' ? ' checked' : '') + '>R</label></span></div>').join('') +
      '</div></fieldset>' +
      '<label class="lbl">Catatan<textarea name="catatan" rows="2"></textarea></label>' +
      '<div class="actions"><button class="btn primary" id="simpanbaru">Simpan pengajuan</button></div></form>';
    let pilihKr = kr;
    const cari = $('#krcari');
    if (cari) {
      let t; cari.oninput = () => { clearTimeout(t); t = setTimeout(async () => {
        const s = cari.value.replace(/[%,()]/g, ' ').trim(); if (s.length < 2) { $('#krhasil').innerHTML = ''; return; }
        const r = await q(sb.from('karyawan').select('id,nik,nama,jabatan,perusahaan_id,perusahaan:perusahaan_id(nama)').or('nama.ilike.%' + s + '%,nik.ilike.%' + s + '%').eq('aktif', true).match(isPic() ? { perusahaan_id: state.profile.perusahaan_id } : {}).limit(8));
        $('#krhasil').innerHTML = r.map(k => '<button type="button" data-k=\'' + esc(JSON.stringify(k)) + '\'>' + esc(k.nama) + ' <small>' + esc(k.nik) + ' · ' + esc(k.perusahaan?.nama) + '</small></button>').join('') || '<div class="muted small">Tidak ditemukan — tambah karyawan baru di bawah.</div>';
        $$('#krhasil [data-k]').forEach(b => b.onclick = async () => {
          pilihKr = JSON.parse(b.dataset.k); $('#krpick').innerHTML = krChip(pilihKr); $('#krhasil').innerHTML = ''; cari.value = ''; $('#krbaru').open = false;
          // otomatis isi dari Mine Permit terakhir orang ini
          const [last] = await q(sb.from('v_mine_permit').select('*').eq('karyawan_id', pilihKr.id).order('berlaku_sampai', { ascending: false }).limit(1));
          if (last) { lama = last; const f = $('#fbaru'); f.sim_jenis.value = last.sim_jenis || ''; f.sim_nomor.value = last.sim_nomor || ''; f.sim_berlaku.value = last.sim_berlaku || '';
            toast('Data SIM diisi dari Mine Permit terakhir ' + last.nomor); }
        });
      }, 250); };
    }
    $('#fbaru').onsubmit = async e => {
      e.preventDefault(); const f = e.target, b = $('#simpanbaru');
      if (isPic() && pilihKr && pilihKr.perusahaan_id !== state.profile.perusahaan_id) return toast('Karyawan ini bukan dari ' + picPer().nama, 'err');
      const units = $$('input[name=u]:checked', f).map(c => ({ jenis_unit: c.value, akses: (f['a_' + c.value].value || 'F') }));
      if (!units.length) return toast('Pilih minimal satu unit', 'err');
      busy(b, true);
      try {
        let kid = pilihKr?.id;
        if (!kid) {
          if (!f.nik.value.trim() || !f.nama.value.trim() || !f.perusahaan_id.value) throw new Error('Pilih karyawan, atau isi NIK, nama, dan perusahaan karyawan baru');
          const k = await q(sb.from('karyawan').insert({ nik: f.nik.value.trim(), nama: f.nama.value.trim().toUpperCase(), perusahaan_id: +f.perusahaan_id.value, jabatan: f.jabatan.value.trim().toUpperCase() || null,
            subkon: f.subkon.value.trim() || null, golongan_darah: f.gd.value || null, aktif: true }).select('id').single());
          kid = k.id;
        }
        const jn = f.jenis.value;
        const p = await q(sb.from('kimper_pengajuan').insert({ karyawan_id: kid, jenis: jn, kimper_lama_id: jn !== 'baru' && lama ? lama.id : null,
          sim_jenis: f.sim_jenis.value || null, sim_nomor: f.sim_nomor.value.trim() || null, sim_berlaku: f.sim_berlaku.value || null,
          akses_kartu: f.akses.value, catatan: f.catatan.value || null, status: 'draft', dibuat_oleh: state.user.id }).select('id').single());
        await q(sb.from('kimper_pengajuan_unit').insert(units.map(u => ({ ...u, pengajuan_id: p.id }))));
        toast('Pengajuan tersimpan'); location.hash = '#/pengajuan/' + p.id;
      } catch (er) { toast(errMsg(er), 'err'); busy(b, false); }
    };
  }
  const krChip = k => '<div class="chip"><b>' + esc(k.nama) + '</b> <small>' + esc(k.nik) + ' · ' + esc(k.perusahaan?.nama || '') + (k.jabatan ? ' · ' + esc(k.jabatan) : '') + '</small></div>';

  /* ---------- pengajuan: detail & alur ---------- */
  const ALUR = ['draft', 'diajukan', 'verifikasi_dok', 'uji', 'menunggu_approval', 'disetujui'];
  async function viewPengajuan(v, id) {
    const p = await q(sb.from('kimper_pengajuan').select('*,karyawan:karyawan_id(id,nik,nama,jabatan,golongan_darah,foto_path,foto_asli_path,foto_status,foto_zoom,foto_x,foto_y,perusahaan:perusahaan_id(nama))').eq('id', id).single());
    const [units, docs, kurang] = await Promise.all([
      q(sb.from('kimper_pengajuan_unit').select('id,jenis_unit,akses,nilai_teori,nilai_praktik,lulus,catatan').eq('pengajuan_id', id)),
      q(sb.from('kimper_dokumen').select('id,syarat_kode,path,status,catatan').eq('pengajuan_id', id)),
      q(sb.rpc('kimper_kekurangan', { p_id: id }))
    ]);
    const k = p.karyawan, juMap = Object.fromEntries(state.jenisUnit.map(u => [u.kode, u]));
    const adaBerat = units.some(u => ['berat', 'khusus'].includes(juMap[u.jenis_unit]?.kelas));
    const syarat = state.syarat.filter(s => s.berlaku_untuk === 'semua' || (s.berlaku_untuk === 'berat' && adaBerat));
    const docBy = Object.fromEntries(docs.map(d => [d.syarat_kode, d]));
    const fotoU = await fotoUrl(k.foto_path);
    const final = ['disetujui', 'ditolak'].includes(p.status);
    const picBoleh = isPic() && ['draft', 'diajukan', 'verifikasi_dok'].includes(p.status);
    const bisaFoto = (isShe() && !final) || picBoleh;
    const idx = ALUR.indexOf(p.status);
    const nl = state.setting.kimper_nilai_lulus || {};
    v.innerHTML = '<div class="page-head"><div><a href="#/pengajuan" class="back">‹ Pengajuan</a><h1>' + esc(k.nama) + '</h1><div class="muted">' + esc(p.nomor) + ' · ' + JENIS_P[p.jenis] + ' · ' + esc(k.perusahaan?.nama) + ' · NIK ' + esc(k.nik) + '</div></div>' +
      '<span class="badge pst-' + p.status + '">' + PST[p.status] + '</span></div>' +
      (p.status === 'ditolak' ? '<div class="note err">Ditolak: ' + esc(p.alasan_tolak) + '</div>' : '') +
      '<ol class="stepper">' + ALUR.map((s, i) => '<li class="' + (i < idx || p.status === 'disetujui' ? 'done' : i === idx ? 'now' : '') + '">' + PST[s] + '</li>').join('') + '</ol>' +
      '<div class="detail-grid"><section>' +
        '<div class="box"><h3>Pas foto Mine Permit</h3><div class="foto-row"><span class="thumb lg">' + (fotoU ? '<img src="' + esc(fotoU) + '" alt="">' : '') + '</span><div>' +
          (k.foto_path ? '<p class="small">' + ({ otomatis: 'Diatur otomatis dari wajah.', manual: 'Diatur manual.', resolusi_rendah: 'Foto kecil — hasil cetak kurang tajam.', wajah_tidak_terdeteksi: 'Wajah tidak terdeteksi — cek posisi.', kepala_terpotong: 'Kepala terpotong — sebaiknya foto ulang.', perlu_diganti: 'Foto wajib diganti.' }[k.foto_status] || '') + '</p>' : '<p class="small warn">Belum ada foto.</p>') +
          (bisaFoto ? '<button class="btn sm" id="pfoto">' + (k.foto_path ? 'Ganti / atur foto' : 'Ambil / unggah foto') + '</button>' : '') + '</div></div></div>' +
        '<div class="box"><h3>Data pengajuan</h3><dl>' +
          '<dt>Akses</dt><dd>' + ((isShe() && !final) || (isPic() && p.status === 'draft') ? '<select id="pakses"><option' + (p.akses_kartu === 'FULL' ? ' selected' : '') + ' value="FULL">FULL ACCESS</option><option' + (p.akses_kartu === 'RESTRICTED' ? ' selected' : '') + ' value="RESTRICTED">RESTRICTED</option></select>' : esc(p.akses_kartu)) + '</dd>' +
          '<dt>SIM</dt><dd>' + esc(p.sim_jenis || '-') + ' · ' + esc(p.sim_nomor || '-') + ' · s/d ' + tgl(p.sim_berlaku) + '</dd>' +
          '<dt>Gol. darah</dt><dd>' + esc(k.golongan_darah || '-') + '</dd>' +
          (p.catatan ? '<dt>Catatan</dt><dd>' + esc(p.catatan) + '</dd>' : '') +
          (p.kimper_id ? '<dt>Mine Permit</dt><dd><a href="#/mp/' + p.kimper_id + '">Lihat Mine Permit ›</a></dd>' : '') + '</dl></div>' +
        '<div class="box"><h3>Dokumen persyaratan</h3><ul class="docs">' + syarat.map(s => { const d = docBy[s.kode];
          return '<li><div><b>' + esc(s.nama) + '</b>' + (s.wajib ? '' : ' <small class="muted">(bila perlu)</small>') + '<br><small class="doc-st ' + (d?.status || 'belum') + '">' + ({ diunggah: 'Diunggah — menunggu diperiksa', valid: 'Valid', tidak_valid: 'Tidak valid' + (d?.catatan ? ': ' + esc(d.catatan) : '') }[d?.status] || 'Belum diunggah') + '</small></div>' +
            '<div class="doc-act">' + (d?.path ? '<button class="btn sm ghost" data-lihat="' + esc(d.path) + '">Lihat</button>' : '') +
            (picBoleh && d?.status !== 'valid' ? '<label class="btn sm">' + (d ? 'Ganti' : 'Unggah') + '<input type="file" accept="image/*,application/pdf" hidden data-up="' + s.kode + '"></label>' : '') +
            (isShe() && !final ? (s.kode === 'FOTO' && k.foto_path ? '<button class="btn sm" data-pakaifoto="' + s.kode + '">Pakai pas foto</button>' : '') + '<label class="btn sm">Unggah<input type="file" accept="image/*,application/pdf" hidden data-up="' + s.kode + '"></label>' +
              (d && d.status !== 'valid' ? '<button class="btn sm ok" data-valid="' + d.id + '">Valid</button>' : '') + (d && d.status !== 'tidak_valid' ? '<button class="btn sm danger" data-tdk="' + d.id + '">Tidak valid</button>' : '') : '') + '</div></li>'; }).join('') + '</ul></div>' +
      '</section><section>' +
        '<div class="box"><h3>Unit & uji</h3><p class="muted small">Lulus bila nilai teori ≥ ' + (nl.teori ?? 70) + ' dan praktik ≥ ' + (nl.praktik ?? 75) + '. Kode akses: F = full, R = restricted.</p><table class="tbl"><thead><tr><th>Unit</th><th>Akses</th><th>Teori</th><th>Praktik</th><th>Hasil</th></tr></thead><tbody>' +
          units.map(u => '<tr data-uid="' + u.id + '"><td>' + esc(juMap[u.jenis_unit]?.nama || u.jenis_unit) + '</td>' +
            (isShe() && !final ? '<td><select data-f="akses"><option' + (u.akses === 'F' ? ' selected' : '') + '>F</option><option' + (u.akses === 'R' ? ' selected' : '') + '>R</option></select></td><td><input data-f="nilai_teori" type="number" min="0" max="100" value="' + (u.nilai_teori ?? '') + '"></td><td><input data-f="nilai_praktik" type="number" min="0" max="100" value="' + (u.nilai_praktik ?? '') + '"></td>'
              : '<td>' + u.akses + '</td><td>' + (u.nilai_teori ?? '-') + '</td><td>' + (u.nilai_praktik ?? '-') + '</td>') +
            '<td>' + (u.lulus === true ? '<span class="badge st-aktif">Lulus</span>' : u.lulus === false ? '<span class="badge st-dicabut">Tidak lulus</span>' : '<span class="muted">—</span>') + '</td></tr>').join('') + '</tbody></table></div>' +
        '<div class="box"><h3>Kelengkapan</h3><div id="kurang">' + ((kurang || []).length ? '<ul class="plain warn-list">' + kurang.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '<p class="ok-t">Semua syarat lengkap.</p>') + '</div></div>' +
        '<div class="box"><h3>Tindakan</h3><div class="actions" id="pact"></div></div>' +
      '</section></div>';

    // tombol alur
    const act = $('#pact'); const btns = [];
    if ((isShe() || isPic()) && p.status === 'draft') btns.push(['diajukan', isPic() ? 'Kirim ke SHE HM' : 'Ajukan', 'primary']);
    if (isShe() && p.status === 'diajukan') btns.push(['verifikasi_dok', 'Mulai verifikasi dokumen', 'primary']);
    if (isShe() && p.status === 'verifikasi_dok') btns.push(['uji', 'Dokumen selesai → uji unit', 'primary']);
    if (isShe() && p.status === 'uji') btns.push(['menunggu_approval', 'Kirim ke SPV untuk persetujuan', 'primary']);
    if (canApprove() && p.status === 'menunggu_approval') btns.push(['disetujui', p.jenis === 'perpanjangan' ? 'Setujui & perpanjang' : 'Setujui & terbitkan Mine Permit', 'primary']);
    if (isShe() && !final) btns.push(['ditolak', 'Tolak', 'danger']);
    if ((isShe() || isPic()) && p.status === 'draft') btns.push(['hapus', 'Hapus draft', 'ghost']);
    if (p.status === 'disetujui' && p.kimper_id) btns.push(['lihat', 'Buka Mine Permit', 'primary'], ['cetak', 'Cetak', '']);
    act.innerHTML = btns.map(([s, t, c]) => '<button class="btn ' + c + '" data-go="' + s + '">' + t + '</button>').join('') || '<span class="muted">Tidak ada tindakan untuk peran Anda.</span>';
    $$('[data-go]', act).forEach(b => b.onclick = async () => {
      const s = b.dataset.go;
      if (s === 'lihat') return location.hash = '#/mp/' + p.kimper_id;
      if (s === 'cetak') return location.hash = '#/cetak?ids=' + p.kimper_id;
      try {
        if (s === 'hapus') { if (!confirm('Hapus draft pengajuan ini?')) return; await q(sb.from('kimper_pengajuan').delete().eq('id', id)); location.hash = '#/pengajuan'; return; }
        const upd = { status: s };
        if (s === 'ditolak') { const a = prompt('Alasan penolakan:'); if (!a) return; upd.alasan_tolak = a; }
        if (s === 'disetujui' && !confirm('Setujui pengajuan ini?')) return;
        busy(b, true); await q(sb.from('kimper_pengajuan').update(upd).eq('id', id));
        toast(s === 'disetujui' ? 'Disetujui — Mine Permit terbit' : 'Status: ' + PST[s]); route();
      } catch (er) { toast(errMsg(er), 'err'); busy(b, false); }
    });
    if ($('#pfoto')) $('#pfoto').onclick = () => FotoEditor.open({ karyawan: k, sb, onSaved: () => route() });
    if ($('#pakses')) $('#pakses').onchange = async e => { try { await q(sb.from('kimper_pengajuan').update({ akses_kartu: e.target.value }).eq('id', id)); toast('Akses diperbarui'); } catch (er) { toast(errMsg(er), 'err'); } };
    $$('tr[data-uid] [data-f]').forEach(inp => inp.onchange = async () => {
      const tr = inp.closest('tr'), val = inp.dataset.f === 'akses' ? inp.value : (inp.value === '' ? null : +inp.value);
      try {
        const r = await q(sb.from('kimper_pengajuan_unit').update({ [inp.dataset.f]: val }).eq('id', tr.dataset.uid).select('lulus').single());
        tr.lastElementChild.innerHTML = r.lulus === true ? '<span class="badge st-aktif">Lulus</span>' : r.lulus === false ? '<span class="badge st-dicabut">Tidak lulus</span>' : '<span class="muted">—</span>';
        const k2 = await q(sb.rpc('kimper_kekurangan', { p_id: id }));
        const kb = $('#kurang'); if (kb) kb.innerHTML = (k2 || []).length ? '<ul class="plain warn-list">' + k2.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '<p class="ok-t">Semua syarat lengkap.</p>';
      } catch (er) { toast(errMsg(er), 'err'); }
    });
    $$('[data-up]').forEach(inp => inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return; const kode = inp.dataset.up;
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase(); const path = id + '/' + kode + '-' + Date.now() + '.' + ext;
      try { await q(sb.storage.from('kimper').upload(path, file, { contentType: file.type || undefined }));
        await simpanDok(kode, path, 'diunggah', docBy[kode]); toast('Dokumen diunggah'); route(); } catch (er) { toast(errMsg(er), 'err'); }
    });
    $$('[data-pakaifoto]').forEach(b => b.onclick = async () => { try { await simpanDok('FOTO', 'foto:' + k.foto_path, 'valid', docBy.FOTO); toast('Pas foto dipakai sebagai dokumen'); route(); } catch (er) { toast(errMsg(er), 'err'); } });
    $$('[data-valid]').forEach(b => b.onclick = async () => { try { await q(sb.from('kimper_dokumen').update({ status: 'valid', catatan: null, diperiksa_oleh: state.user.id, diperiksa_at: new Date().toISOString() }).eq('id', b.dataset.valid)); route(); } catch (er) { toast(errMsg(er), 'err'); } });
    $$('[data-tdk]').forEach(b => b.onclick = async () => { const c = prompt('Kenapa tidak valid?'); if (c === null) return; try { await q(sb.from('kimper_dokumen').update({ status: 'tidak_valid', catatan: c, diperiksa_oleh: state.user.id, diperiksa_at: new Date().toISOString() }).eq('id', b.dataset.tdk)); route(); } catch (er) { toast(errMsg(er), 'err'); } });
    async function simpanDok(kode, path, status, ada) {
      const row = { pengajuan_id: id, syarat_kode: kode, path, status, catatan: null };
      if (status === 'valid') { row.diperiksa_oleh = state.user.id; row.diperiksa_at = new Date().toISOString(); }
      if (ada) await q(sb.from('kimper_dokumen').update(row).eq('id', ada.id)); else await q(sb.from('kimper_dokumen').insert(row));
    }
  }
  // lihat dokumen
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-lihat]'); if (!b) return;
    const p = b.dataset.lihat;
    const u = p.startsWith('foto:') ? await fotoUrl(p.slice(5)) : await fotoUrl(p, 'kimper');
    if (u) window.open(u, '_blank'); else toast('Dokumen tidak bisa dibuka', 'err');
  });

  /* ---------- akun pemakai (SPV / Admin) ---------- */
  const PERAN = [['staff_she', 'Staff SHE HM — bawahan SPV SHE: proses pengajuan, dokumen, uji, foto, cetak, scan'], ['pic_kontraktor', 'PIC SHE Kontraktor — mengajukan Mine Permit karyawan perusahaannya'], ['pengawas', 'Pengawas — scan & catat pelanggaran'], ['viewer', 'Viewer — hanya melihat (mis. KTT)'],
    ['gudang', 'Admin gudang'], ['pekerja', 'Pekerja — lihat data sendiri'], ['spv', 'SPV SHE — menyetujui Mine Permit & akun'], ['admin', 'Administrator — semua akses']];
  async function viewAkun(v, params) {
    const st = params.get('st') || 'menunggu';
    v.innerHTML = '<div class="page-head"><h1>Akun pemakai</h1></div><div class="tabs">' +
      [['menunggu', 'Menunggu persetujuan'], ['aktif', 'Aktif'], ['ditolak', 'Ditolak / nonaktif']].map(([k, t]) => '<a href="#/akun?st=' + k + '"' + (k === st ? ' class="on"' : '') + '>' + t + '</a>').join('') + '</div><div id="alist" class="loading">Memuat…</div>';
    let qy = sb.from('profiles').select('id,nama,email,role,jabatan,perusahaan_id,perusahaan_teks,no_hp,nik,status,catatan,created_at,karyawan:karyawan_id(nama,nik)').order('created_at', { ascending: false });
    qy = st === 'ditolak' ? qy.in('status', ['ditolak', 'nonaktif']) : qy.eq('status', st);
    const [data, minta] = await Promise.all([q(qy), q(sb.from('reset_sandi_minta').select('user_id,at').is('selesai_at', null))]);
    const mintaBy = Object.fromEntries(minta.map(m => [m.user_id, m.at]));
    if (st === 'aktif') data.sort((x, y) => (mintaBy[y.id] ? 1 : 0) - (mintaBy[x.id] ? 1 : 0));
    const L = $('#alist'); if (!L) return; L.className = '';
    if (!data.length) { L.innerHTML = '<div class="empty">' + (st === 'menunggu' ? 'Tidak ada pendaftaran yang menunggu.' : 'Tidak ada akun.') + '</div>'; return; }
    const isAdmin = role() === 'admin';
    L.innerHTML = '<div class="mp-list">' + data.map(a => {
      const self = a.id === state.user.id, lock = self || (a.role === 'admin' && !isAdmin);
      return '<div class="box akun" data-id="' + a.id + '"><div class="akun-head"><div><b>' + esc(a.nama) + '</b>' + (a.role ? ' <span class="badge">' + esc(ROLE[a.role] || a.role) + (a.role === 'pic_kontraktor' ? ' · ' + esc(state.perusahaan.find(x => x.id === a.perusahaan_id)?.kode || '?') : '') + '</span>' : '') +
        '<br><small class="muted">' + esc(a.email || '') + (a.no_hp ? ' · ' + esc(a.no_hp) : '') + '</small><br><small>' + esc([a.perusahaan_teks, a.jabatan].filter(Boolean).join(' · ') || '-') +
        (a.nik ? ' · NIK ' + esc(a.nik) : '') + (a.karyawan ? ' · terhubung ke ' + esc(a.karyawan.nama) : '') + '</small>' + (a.catatan ? '<br><small class="err">' + esc(a.catatan) + '</small>' : '') + '</div>' +
        '<small class="muted">Daftar ' + tgl(a.created_at) + '</small></div>' + (mintaBy[a.id] ? '<div class="note warn">Minta reset sandi (' + tgl(mintaBy[a.id]) + '). Tekan <b>Reset sandi</b>, lalu kirim sandi sementara ke orangnya.</div>' : '') +
        (lock ? (self ? '<p class="small muted">Akun Anda sendiri.</p>' : '<p class="small muted">Akun Admin hanya bisa diubah Admin.</p>') :
        '<form class="akun-form"><div class="grid3"><label class="lbl">Peran di aplikasi<select name="role" required><option value="">— pilih —</option>' +
          PERAN.filter(([k]) => k !== 'admin' || isAdmin).map(([k, t]) => '<option value="' + k + '"' + (k === a.role ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
          '<label class="lbl per-pic"' + (a.role === 'pic_kontraktor' ? '' : ' hidden') + '>Perusahaan kontraktor<select name="per"><option value="">— pilih —</option>' +
            state.perusahaan.filter(x => x.kode !== 'HM').map(x => '<option value="' + x.id + '" data-kode="' + esc(x.kode || '') + '"' + (x.id === a.perusahaan_id ? ' selected' : '') + '>' + esc(x.nama) + '</option>').join('') + '</select></label>' +
          '<label class="lbl">Jabatan / posisi<input name="jabatan" value="' + esc(a.jabatan || '') + '"></label>' +
          '<label class="lbl">Hubungkan ke data karyawan <small class="muted">(opsional)</small><input name="kcari" placeholder="Ketik NIK / nama" value="' + esc(a.karyawan?.nama || a.nik || '') + '" autocomplete="off"><input type="hidden" name="kid"></label></div>' +
          '<div class="suggest ksug"></div><div class="actions"><button class="btn primary sm" name="ok">' + (a.status === 'aktif' ? 'Simpan perubahan' : 'Setujui akun') + '</button>' +
          (a.status === 'menunggu' ? '<button type="button" class="btn danger sm" data-tolak>Tolak</button>' : a.status === 'aktif' ? '<button type="button" class="btn sm" data-reset>Reset sandi</button><button type="button" class="btn danger sm" data-nonaktif>Nonaktifkan</button>' : '') + '</div></form>') + '</div>';
    }).join('') + '</div>';
    $$('.akun').forEach(box => {
      const f = $('form', box); if (!f) return; const id = box.dataset.id;
      const isiJab = () => { const r = f.role.value, kode = f.per.selectedOptions[0]?.dataset.kode, j = f.jabatan.value.trim();
        const otomatis = !j || /^(PIC SHE|Staff SHE HM|SPV SHE)\b/i.test(j);
        if (!otomatis) return;
        if (r === 'pic_kontraktor') f.jabatan.value = kode ? 'PIC SHE ' + kode : 'PIC SHE';
        else if (r === 'staff_she') f.jabatan.value = 'Staff SHE HM';
        else if (r === 'spv') f.jabatan.value = 'SPV SHE'; };
      f.role.onchange = () => { $('.per-pic', f).hidden = f.role.value !== 'pic_kontraktor'; isiJab(); };
      f.per.onchange = isiJab;
      // tebak perusahaan dari isian pendaftar
      if (!f.per.value) { const a0 = data.find(x => x.id === id), tx = (a0?.perusahaan_teks || '').toUpperCase();
        const g = state.perusahaan.find(x => x.kode && x.kode !== 'HM' && new RegExp('\\b' + x.kode + '\\b').test(tx)); if (g) f.per.value = g.id; }
      let t; f.kcari.oninput = () => { f.kid.value = ''; clearTimeout(t); t = setTimeout(async () => {
        const s2 = f.kcari.value.replace(/[%,()]/g, ' ').trim(); const sug = $('.ksug', box); if (s2.length < 2) { sug.innerHTML = ''; return; }
        const r = await q(sb.from('karyawan').select('id,nik,nama,jabatan,perusahaan:perusahaan_id(nama)').or('nama.ilike.%' + s2 + '%,nik.ilike.%' + s2 + '%').limit(6));
        sug.innerHTML = r.map(k => '<button type="button" data-k="' + k.id + '" data-n="' + esc(k.nama) + '" data-j="' + esc(k.jabatan || '') + '">' + esc(k.nama) + ' <small>' + esc(k.nik) + ' · ' + esc(k.perusahaan?.nama) + '</small></button>').join('');
        $$('[data-k]', sug).forEach(b => b.onclick = () => { f.kid.value = b.dataset.k; f.kcari.value = b.dataset.n; if (!f.jabatan.value && b.dataset.j) f.jabatan.value = b.dataset.j; sug.innerHTML = ''; });
      }, 250); };
      f.onsubmit = async e => { e.preventDefault(); const b = f.ok; busy(b, true);
        try { if (f.role.value === 'pic_kontraktor' && !f.per.value) throw new Error('Pilih perusahaan kontraktor untuk PIC');
          await q(sb.rpc('setujui_akun', { p_id: id, p_role: f.role.value, p_jabatan: f.jabatan.value, p_karyawan: f.kid.value || null, p_perusahaan: f.role.value === 'pic_kontraktor' ? +f.per.value : null })); toast('Akun disimpan'); route(); }
        catch (er) { toast(errMsg(er), 'err'); busy(b, false); } };
      const rs = $('[data-reset]', f);
      if (rs) rs.onclick = async () => { const a0 = data.find(x => x.id === id);
        if (!confirm('Buat sandi sementara baru untuk ' + (a0?.nama || 'akun ini') + '? Sandi lama tidak berlaku lagi.')) return;
        try { const pw = await q(sb.rpc('reset_sandi_akun', { p_id: id }));
          const m = document.createElement('div'); m.className = 'modal';
          m.innerHTML = '<div class="modal-box"><h3>Sandi sementara</h3><p class="small">Berikan ke <b>' + esc(a0?.nama || '') + '</b> (' + esc(a0?.email || '') + '). Minta segera diganti lewat tombol <b>Sandi</b> setelah masuk.</p>' +
            '<p class="pw-box">' + esc(pw) + '</p><div class="actions"><button class="btn" id="salinpw">Salin</button><button class="btn primary" id="tutuppw">Tutup</button></div></div>';
          document.body.appendChild(m);
          $('#salinpw', m).onclick = async () => { try { await navigator.clipboard.writeText(pw); toast('Disalin'); } catch (e) { toast('Salin manual', 'err'); } };
          $('#tutuppw', m).onclick = () => m.remove();
        } catch (er) { toast(errMsg(er), 'err'); } };
      const tolak = $('[data-tolak]', f) || $('[data-nonaktif]', f);
      if (tolak) tolak.onclick = async () => { const nonaktif = tolak.hasAttribute('data-nonaktif');
        const a = prompt(nonaktif ? 'Alasan menonaktifkan akun:' : 'Alasan menolak pendaftaran:'); if (a === null) return;
        try { await q(sb.rpc('tolak_akun', { p_id: id, p_alasan: a, p_status: nonaktif ? 'nonaktif' : 'ditolak' })); toast(nonaktif ? 'Akun dinonaktifkan' : 'Pendaftaran ditolak'); route(); }
        catch (er) { toast(errMsg(er), 'err'); } };
    });
  }

  /* ---------- daftar pelanggaran ---------- */
  async function viewPelanggaran(v, params) {
    const f = { per: params.get('per') || '', dari: params.get('dari') || '', q: params.get('q') || '' };
    v.innerHTML = '<div class="page-head"><h1>Pelanggaran</h1>' + (canScan() ? '<a class="btn primary" href="#/scan">Scan Mine Permit</a>' : '') + '</div>' +
      '<form class="filters" id="fpl"><input type="search" name="q" placeholder="Cari nama…" value="' + esc(f.q) + '"><select name="per"><option value="">Semua perusahaan</option>' + state.perusahaan.map(p => '<option value="' + p.id + '"' + (String(p.id) === f.per ? ' selected' : '') + '>' + esc(p.nama) + '</option>').join('') + '</select>' +
      '<input type="date" name="dari" value="' + esc(f.dari) + '" aria-label="Sejak tanggal"><button class="btn">Tampilkan</button></form><div id="pl" class="loading">Memuat…</div>';
    $('#fpl').onsubmit = e => { e.preventDefault(); const d = new FormData(e.target); location.hash = '#/pelanggaran?' + new URLSearchParams({ q: d.get('q'), per: d.get('per'), dari: d.get('dari') }); };
    let qy = sb.from('pelanggaran').select('id,nomor,tgl,lokasi,unit_no,tindakan,keterangan,kimper_id,pelanggaran_jenis(nama),karyawan:karyawan_id!inner(nama,nik),perusahaan:perusahaan_id(nama),kimper:kimper_id(nomor)').order('tgl', { ascending: false }).limit(200);
    if (f.per) qy = qy.eq('perusahaan_id', f.per);
    if (f.dari) qy = qy.gte('tgl', f.dari);
    if (f.q) qy = qy.ilike('karyawan.nama', '%' + f.q.replace(/[%,()]/g, ' ') + '%');
    const data = await q(qy); const L = $('#pl'); if (!L) return; L.className = '';
    L.innerHTML = data.length ? '<div class="mp-list">' + data.map(p => '<a class="mp-row mp-link" href="' + (p.kimper_id ? '#/mp/' + p.kimper_id : '#/pelanggaran') + '"><span class="mp-main"><b>' + esc(p.karyawan?.nama) + '</b><small>' + esc(p.pelanggaran_jenis?.nama) + '</small><small class="muted">' + esc(p.nomor) + ' · ' + esc(p.kimper?.nomor || '') + ' · ' + esc(p.perusahaan?.nama || '') + '</small></span>' +
      '<span class="mp-side"><small>' + tgl(p.tgl) + ' ' + jam(p.tgl) + '</small>' + (p.lokasi ? '<small>' + esc(p.lokasi) + '</small>' : '') + (p.unit_no ? '<small>' + esc(p.unit_no) + '</small>' : '') + '</span></a>').join('') + '</div>'
      : '<div class="empty">Belum ada pelanggaran tercatat.</div>';
  }

  /* ---------- mulai ---------- */
  async function setUser(session) {
    state.user = session?.user || null;
    if (state.user) {
      const { data, error } = await sb.from('profiles').select('id,nama,role,aktif,status,catatan,jabatan,karyawan_id,perusahaan_id').eq('id', state.user.id).maybeSingle();
      const simpan = bacaLokal('she_profil', null);
      if (error && simpan && simpan.id === state.user.id) state.profile = simpan; // tanpa sinyal: pakai profil terakhir
      else { state.profile = data; if (data) simpanLokal('she_profil', data); }
      try { await loadRef(); } catch (e) { console.error(e); }
    } else state.profile = null;
  }
  window.App = { sb, esc, toast, canAjukan, isPic, fotoUrl, fotoUrls, clearFotoCache, state, q, errMsg, tgl, jam, isShe, canScan, modal, busy, statusBadge, route };
  (async () => {
    state.recovery = new URLSearchParams(location.search).has('reset');
    const { data } = await sb.auth.getSession(); await setUser(data.session);
    sb.auth.onAuthStateChange(async (ev, session) => {
      if (ev === 'PASSWORD_RECOVERY') { state.recovery = true; await setUser(session); return viewSandiBaru(); }
      if (state.recovery) return;
      if (ev === 'SIGNED_IN' && !state.user) { await setUser(session); document.body.innerHTML = ''; route(); }
      if (ev === 'SIGNED_OUT') { state.user = null; ['she_profil', 'mp_offline'].forEach(k => { try { localStorage.removeItem(k); } catch (e) { } }); route(); }
    });
    window.addEventListener('hashchange', route);
    await route(); tandaSinyal();
    if (state.user && window.Scan?.syncOffline) Scan.syncOffline();
  })();
})();
