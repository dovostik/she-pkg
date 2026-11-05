/* Render kartu Mine Permit (HTML) — dipakai untuk pratinjau & cetak */
(function () {
  const BLN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const SIM = { 'B II Umum': 'B II U', 'B I Umum': 'B I U' };
  const UN = {
    'Crane / crane truck': 'CRANE TRUCK', 'Bus / Manhaul': 'BUS / MANHAUL',
    'Truk ringan / lainnya (Dutro, truck PS)': 'TRUK RINGAN (DUTRO / PS)', 'Sepeda motor trail (Honda CRF dsb.)': 'MOTOR TRAIL'
  };
  const PR = { 'PT Hamparan Mulya': 'PT HM' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tglPanjang = s => { if (!s) return '-'; const d = new Date(s + 'T00:00:00'); return String(d.getDate()).padStart(2, '0') + ' ' + BLN[d.getMonth() + 1] + ' ' + d.getFullYear(); };
  const tglPendek = s => { if (!s) return '-'; const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y.slice(2); };
  const tglQr = s => { if (!s) return '-'; const [y, m, d] = s.split('-'); return d + '-' + m + '-' + y; };
  const fs = (t, base, limit) => { const n = String(t || '').length; return n <= limit ? base : +(base * limit / n).toFixed(2); };

  function qrSvg(text) {
    const q = qrcode(0, 'M');
    q.addData(text, 'Byte');
    q.make();
    return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
  }

  function qrText(c) {
    // ringkas agar QR besar & mudah dipindai di kartu 5 x 8 cm (nama & masa berlaku diambil dari data saat scan)
    return 'MINE PERMIT PT HM\nNo: ' + c.nomor + '\nID: ' + String(c.token_qr || '').slice(0, 12).toUpperCase();
  }

  /* c = baris v_mine_permit; opt = {foto: url, ktt: 'AM. HARJANTO', persetujuan: 'MENYETUJUI KTT PT HM', accident: [{warna}]} */
  function renderCard(c, opt) {
    opt = opt || {};
    const full = (c.akses_kartu || 'FULL') === 'FULL';
    const jab = ((c.jabatan || '').toUpperCase() + ' - ' + (PR[c.perusahaan] || c.perusahaan || '')).replace(/^ - /, '');
    const units = (c.unit || []).map(u => (UN[u.nama] || u.nama).toUpperCase() + ' (' + u.akses + ')');
    const ul = units.length ? units.map((u, i) => '<li>' + (i + 1) + '. ' + esc(u) + '</li>').join('') : '<li>-</li>';
    const bolong = new Set((opt.accident || []).filter(a => a.dilubangi !== false).map(a => a.warna));
    return '<div class="mpc">' +
      '<div class="front">' +
        '<div class="hdr"><img src="img/hm.png" class="hm" alt=""><img src="img/k3.png" class="k3" alt=""></div>' +
        '<div class="title">MINE PERMIT</div>' +
        '<div class="acc ' + (full ? 'full' : 'restr') + '">' + (full ? 'FULL ACCESS' : 'RESTRICTED') + '</div>' +
        '<div class="co">PT. HAMPARAN MULYA</div>' +
        '<div class="no" style="font-size:' + fs(c.nomor, 2.18, 24) + 'mm">' + esc(c.nomor) + '</div>' +
        '<div class="foto">' + (opt.foto ? '<img src="' + esc(opt.foto) + '" alt="">' : '') + '</div>' +
        '<div class="nama" style="font-size:' + fs(c.nama, 3.19, 18) + 'mm">' + esc(c.nama) + '</div>' +
        '<div class="jab" style="font-size:' + fs(jab, 2.18, 30) + 'mm">' + esc(jab) + '</div>' +
        '<div class="ber">Berlaku Sampai ' + tglPendek(c.berlaku_sampai) + '</div>' +
      '</div>' +
      '<div class="back">' +
        '<div class="kv r1"><span>SIM POL</span><b>: ' + esc(SIM[c.sim_jenis] || c.sim_jenis || '-') + '</b></div>' +
        '<div class="kv r2"><span>No. SIM</span><b>: ' + esc(c.sim_nomor || '-') + '</b></div>' +
        '<div class="kv r3"><span>Masa Berlaku</span><b>: ' + tglPanjang(c.sim_berlaku) + '</b></div>' +
        '<div class="kv r4"><span>Gol. Darah</span><b>: ' + esc(c.golongan_darah || '') + '</b></div>' +
        '<div class="ops"><div class="opt">MENGOPERASIKAN</div><ul>' + ul + '</ul></div>' +
        '<div class="appr"><div class="wajib">MINE PERMIT wajib dibawa selama mengoperasikan unit</div>' +
          '<div class="mt">' + esc(opt.persetujuan || 'MENYETUJUI KTT PT HM') + '</div><img src="img/ttd.png" class="ttd" alt="">' +
          '<div class="ktt">' + esc(opt.ktt || 'AM. HARJANTO') + '</div></div>' +
        '<div class="qr"><div class="qrimg">' + qrSvg(qrText(c)) + '</div><div class="qi">' +
          '<div class="ql">ID MINE PERMIT</div><div class="qn" style="font-size:' + fs(c.nomor, 1.93, 22) + 'mm">' + esc(c.nomor) + '</div>' +
          '<div class="acd"><div class="acl">Accident</div><div class="dots">' +
            '<i class="g' + (bolong.has('hijau') ? ' bolong' : '') + '"></i><i class="y' + (bolong.has('kuning') ? ' bolong' : '') + '"></i><i class="r' + (bolong.has('merah') ? ' bolong' : '') + '"></i>' +
          '</div></div></div></div>' +
      '</div></div>';
  }

  window.MPCard = { renderCard, qrText, tglPanjang, tglPendek };
})();
