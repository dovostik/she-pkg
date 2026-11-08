/* Notifikasi HP (Web Push): notifikasi aplikasi muncul di layar HP walau aplikasi ditutup. */
(function () {
  const VAPID = 'BLWAnFluvYcqabuZ1njTPBY8aGT4lHJcaV5nI4UWlZIi_w5j65sakuzhnZSTGhAPSp66FmWTRdMhxsdGXxMY8R4';
  const AKTIF = () => !!(window.SHE_CONFIG || {}).push;   // dinyalakan setelah database & Edge Function terpasang
  const A = () => window.App, LS = 'push_tunda';
  const didukung = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const iosBelumPasang = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator.standalone || matchMedia('(display-mode: standalone)').matches);
  const u8 = b => { const p = '='.repeat((4 - b.length % 4) % 4), s = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
  const status = () => !didukung() ? (iosBelumPasang() ? 'ios' : 'tidak') : Notification.permission;   // granted | denied | default | ios | tidak

  async function langgan(minta) {
    if (!didukung()) return false;
    if (Notification.permission !== 'granted') { if (!minta) return false; if (await Notification.requestPermission() !== 'granted') return false; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(VAPID) });
    const j = sub.toJSON();
    await A().q(A().sb.rpc('simpan_push', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_perangkat: navigator.userAgent }));
    return true;
  }
  async function aktifkan(btn) {
    try { A().busy?.(btn, true); const ok = await langgan(true); A().busy?.(btn, false);
      if (ok) { A().toast('Notifikasi HP aktif ✓'); hapusBar(); return true; }
      A().toast(Notification.permission === 'denied' ? 'Izin notifikasi ditolak — aktifkan di pengaturan browser/HP' : 'Notifikasi belum diizinkan', 'err');
    } catch (e) { A().busy?.(btn, false); A().toast(A().errMsg(e), 'err'); }
    return false;
  }
  // dipanggil sebelum keluar akun: HP ini berhenti menerima notifikasi akun tsb
  async function lepas() {
    try { if (!AKTIF() || !didukung()) return; const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription();
      if (sub) { await A().sb.from('push_sub').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); } } catch (e) { /* abaikan */ }
  }
  function hapusBar() { document.getElementById('pushbar')?.remove(); }
  // setelah masuk: sinkronkan diam-diam bila sudah diizinkan; bila belum, tampilkan ajakan (bisa ditunda 3 hari)
  async function saatMasuk() {
    if (!AKTIF() || !navigator.onLine) return;
    const st = status();
    if (st === 'granted') { langgan(false).catch(() => {}); return; }
    let tunda = 0; try { tunda = +localStorage.getItem(LS) || 0; } catch (e) {}
    if (st === 'denied' || st === 'tidak' || Date.now() < tunda || document.getElementById('pushbar')) return;
    const bar = document.createElement('div'); bar.id = 'pushbar'; bar.className = 'pushbar no-print';
    bar.innerHTML = st === 'ios'
      ? '<span>📲 Agar notifikasi muncul di iPhone: ketuk <b>Bagikan ⬆</b> → <b>Tambah ke Layar Utama</b>, lalu buka SHE PKG dari ikon itu.</span><button class="btn sm ghost" data-nanti>Nanti</button>'
      : '<span>🔔 Terima notifikasi SHE PKG langsung di HP ini (temuan hazard, pengajuan, Mine Permit & SIM habis).</span><button class="btn sm primary" data-on>Aktifkan</button><button class="btn sm ghost" data-nanti>Nanti</button>';
    document.querySelector('header.top')?.after(bar);
    bar.querySelector('[data-on]')?.addEventListener('click', e => aktifkan(e.target));
    bar.querySelector('[data-nanti]').onclick = () => { try { localStorage.setItem(LS, Date.now() + 3 * 864e5); } catch (e) {} hapusBar(); };
  }
  // kotak status di jendela notifikasi
  function kotak() {
    if (!AKTIF()) return '';
    const st = status();
    if (st === 'granted') return '<div class="pushinfo ok">🔔 Notifikasi HP aktif di perangkat ini.</div>';
    if (st === 'denied') return '<div class="pushinfo warn">Notifikasi HP diblokir. Buka pengaturan browser → izin situs → <b>Notifikasi: Izinkan</b>, lalu muat ulang.</div>';
    if (st === 'ios') return '<div class="pushinfo">iPhone: pasang dulu ke <b>Layar Utama</b> (Bagikan ⬆ → Tambah ke Layar Utama), buka dari ikon, lalu aktifkan di sini. Perlu iOS 16.4 ke atas.</div>';
    if (st === 'tidak') return '';
    return '<div class="pushinfo"><span>Terima notifikasi langsung di HP ini.</span> <button class="btn sm primary" data-pushon>🔔 Aktifkan notifikasi HP</button></div>';
  }
  window.Push = { saatMasuk, aktifkan, lepas, kotak, status };
})();
