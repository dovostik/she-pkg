/* Tombol "Pasang aplikasi" — tidak bergantung pada ajakan otomatis browser (yang hanya muncul sekali). */
(function () {
  let tunda = null;   // event beforeinstallprompt (Chrome/Edge Android & komputer)
  const terpasang = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const LS = 'pasang_nanti';
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); tunda = e; render(); });
  addEventListener('appinstalled', () => { tunda = null; document.querySelectorAll('.pasang').forEach(x => x.remove()); window.App?.toast?.('Aplikasi terpasang di layar utama ✓'); });

  function petunjuk() {
    const m = document.createElement('div'); m.className = 'modal';
    const isi = ios()
      ? '<ol class="pasang-langkah"><li>Buka web ini di <b>Safari</b>.</li><li>Ketuk tombol <b>Bagikan</b> <span class="ikon-share">⬆</span> di bawah layar.</li><li>Pilih <b>Tambah ke Layar Utama</b> → <b>Tambah</b>.</li><li>Buka SHE PKG dari ikon baru di layar utama.</li></ol>'
      : '<ol class="pasang-langkah"><li>Buka web ini di <b>Chrome</b>.</li><li>Ketuk menu <b>⋮</b> di kanan atas.</li><li>Pilih <b>Instal aplikasi</b> atau <b>Tambahkan ke layar utama</b>.</li><li>Bila tidak ada: hapus dulu ikon SHE PKG lama di layar utama, lalu muat ulang halaman ini.</li></ol>';
    m.innerHTML = '<div class="modal-box"><div class="modal-head"><b>Pasang SHE PKG di HP</b><button class="icon-btn" data-x aria-label="Tutup">✕</button></div>' + isi +
      '<p class="muted" style="font-size:.85rem">Setelah terpasang, aplikasi bisa dibuka dari layar utama dan tetap jalan tanpa sinyal.</p></div>';
    m.onclick = e => { if (e.target === m || e.target.closest('[data-x]')) m.remove(); };
    document.body.appendChild(m);
  }
  async function pasang() {
    if (tunda) { tunda.prompt(); const r = await tunda.userChoice.catch(() => null); if (r?.outcome === 'accepted') tunda = null; render(); return; }
    petunjuk();
  }
  // tampilkan tombol di halaman masuk (#pasang) dan pita setelah masuk
  function render() {
    if (terpasang()) return;
    const slot = document.getElementById('pasang');
    if (slot && !slot.firstChild) {
      slot.innerHTML = '<button type="button" class="btn block pasang pasang-btn">📲 Pasang aplikasi di HP</button>';
      slot.firstChild.onclick = pasang;
    }
    const top = document.querySelector('header.top');
    let nanti = 0; try { nanti = +localStorage.getItem(LS) || 0; } catch (e) {}
    if (top && !document.getElementById('pasangbar') && Date.now() > nanti && (tunda || ios() || /android/i.test(navigator.userAgent))) {
      const bar = document.createElement('div'); bar.id = 'pasangbar'; bar.className = 'pushbar pasang no-print';
      bar.innerHTML = '<span>📲 Pasang SHE PKG di layar utama HP agar cepat dibuka & bisa dipakai tanpa sinyal.</span><button class="btn sm primary" data-p>Pasang</button><button class="btn sm ghost" data-n>Nanti</button>';
      top.after(bar);
      bar.querySelector('[data-p]').onclick = pasang;
      bar.querySelector('[data-n]').onclick = () => { try { localStorage.setItem(LS, Date.now() + 7 * 864e5); } catch (e) {} bar.remove(); };
    }
  }
  new MutationObserver(() => render()).observe(document.body, { childList: true });
  window.Pasang = { render, pasang, terpasang };
})();
