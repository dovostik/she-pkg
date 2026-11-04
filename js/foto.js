/* Editor pas foto 3x4: deteksi wajah otomatis (MediaPipe), zoom & geser tanpa melar.
   Parameter disimpan sebagai pecahan foto asli: zoom = lebar bingkai / lebar foto, x = kiri / lebar, y = atas / tinggi. */
(function () {
  const OUT_W = 600, OUT_H = 800, RATIO = 4 / 3;
  const FACE_H = 0.34, FACE_CY = 0.42;   // tinggi wajah 34% bingkai, pusat wajah 42% dari atas
  let detectorPromise = null;

  function getDetector() {
    if (!detectorPromise) {
      detectorPromise = (async () => {
        const v = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
        const files = await v.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
        return v.FaceDetector.createFromOptions(files, {
          baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite', delegate: 'CPU' },
          runningMode: 'IMAGE', minDetectionConfidence: 0.5
        });
      })().catch(e => { detectorPromise = null; throw e; });
    }
    return detectorPromise;
  }

  async function loadBitmap(src) {
    const blob = src instanceof Blob ? src : await (await fetch(src)).blob();
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
    catch (e) {
      const url = URL.createObjectURL(blob); const img = new Image(); img.src = url; await img.decode();
      return img;
    }
  }

  function bgColor(bmp) {
    const c = document.createElement('canvas'); c.width = 60; c.height = 80;
    const g = c.getContext('2d'); g.drawImage(bmp, 0, 0, 60, 80);
    const d = g.getImageData(0, 0, 60, 80).data; const px = [];
    const take = (x, y) => { const i = (y * 60 + x) * 4; px.push([d[i], d[i + 1], d[i + 2]]); };
    for (let y = 0; y < 8; y++) for (let x = 0; x < 60; x++) take(x, y);
    for (let y = 8; y < 80; y++) { for (let x = 0; x < 4; x++) take(x, y); for (let x = 56; x < 60; x++) take(x, y); }
    const med = k => { const a = px.map(p => p[k]).sort((a, b) => a - b); return a[a.length >> 1]; };
    return 'rgb(' + med(0) + ',' + med(1) + ',' + med(2) + ')';
  }

  async function detectParams(bmp) {
    const W = bmp.width, H = bmp.height;
    let det;
    try { det = await getDetector(); } catch (e) { return { ok: false, alasan: 'Model deteksi wajah gagal dimuat (cek internet)' }; }
    // perkecil dulu agar cepat
    const s = Math.min(1, 800 / Math.max(W, H));
    const c = document.createElement('canvas'); c.width = Math.round(W * s); c.height = Math.round(H * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const r = det.detect(c);
    const faces = (r.detections || []).map(d => d.boundingBox).filter(b => b && b.width > 0)
      .filter(b => (b.originY + b.height / 2) / c.height < 0.7);
    if (!faces.length) return { ok: false, alasan: 'Wajah tidak terdeteksi' };
    const b = faces.sort((a, z) => z.width * z.height - a.width * a.height)[0];
    const x = b.originX / s, y = b.originY / s, w = b.width / s, h = b.height / s;
    const fh = h / FACE_H, fw = fh / RATIO;
    const left = x + w / 2 - fw / 2, top = y + h / 2 - FACE_CY * fh;
    let status = 'otomatis';
    if (y < 0.12 * h) status = 'kepala_terpotong';
    else if (h < 70) status = 'resolusi_rendah';
    return { ok: true, zoom: fw / W, x: left / W, y: top / H, status };
  }

  function draw(canvas, bmp, p, bg) {
    const W = bmp.width, H = bmp.height, g = canvas.getContext('2d');
    const fw = p.zoom * W, fh = fw * RATIO, sx = p.x * W, sy = p.y * H;
    g.fillStyle = bg; g.fillRect(0, 0, canvas.width, canvas.height);
    const k = canvas.width / fw;
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, -sx * k, -sy * k, W * k, H * k);
  }

  function fullParams(bmp) {  // cadangan: selebar bingkai, rata atas
    const W = bmp.width, H = bmp.height; const fh = W * RATIO;
    return { zoom: 1, x: 0, y: H > fh ? 0 : -(fh - H) / H };
  }

  /* Buka editor. opt: {karyawan:{id,nik,nama,foto_path,foto_asli_path,foto_zoom,foto_x,foto_y}, sb, onSaved} */
  function open(opt) {
    const k = opt.karyawan, sb = opt.sb;
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML =
      '<div class="modal-box foto-box"><div class="modal-head"><b>Pas foto — ' + App.esc(k.nama) + '</b><button class="icon-btn" data-x aria-label="Tutup">✕</button></div>' +
      '<div class="foto-ed"><div class="foto-canvas-wrap"><canvas width="300" height="400"></canvas><div class="foto-hint">Geser foto untuk mengatur posisi</div></div>' +
      '<div class="foto-ctrl">' +
        '<label class="btn">Pilih / ambil foto<input type="file" accept="image/*" capture="user" hidden></label>' +
        '<button class="btn" data-auto>Atur otomatis (wajah)</button>' +
        '<label class="lbl">Zoom <input type="range" min="0.15" max="2.5" step="0.01" data-zoom></label>' +
        '<div class="foto-status muted"></div>' +
        '<button class="btn primary" data-save disabled>Simpan foto</button>' +
      '</div></div></div>';
    document.body.appendChild(m);
    const cv = m.querySelector('canvas'), st = m.querySelector('.foto-status'), zoom = m.querySelector('[data-zoom]'), save = m.querySelector('[data-save]');
    let bmp = null, p = null, bg = '#c00', status = 'manual', fileBlob = null;
    const close = () => m.remove();
    m.querySelector('[data-x]').onclick = close;
    m.addEventListener('click', e => { if (e.target === m) close(); });
    const redraw = () => { if (bmp && p) { draw(cv, bmp, p, bg); zoom.value = p.zoom; } };

    async function setImage(src, initial) {
      st.textContent = 'Memuat foto…';
      bmp = await loadBitmap(src); bg = bgColor(bmp);
      if (initial && initial.zoom) { p = { ...initial }; status = k.foto_status || 'manual'; st.textContent = ''; redraw(); }
      else await auto();
      save.disabled = false;
    }
    async function auto() {
      if (!bmp) return;
      st.textContent = 'Mencari wajah…';
      const r = await detectParams(bmp);
      if (r.ok) { p = { zoom: r.zoom, x: r.x, y: r.y }; status = r.status;
        st.textContent = r.status === 'otomatis' ? 'Wajah ditemukan, foto diatur otomatis.' : r.status === 'kepala_terpotong' ? 'Kepala terpotong di foto asli — sebaiknya foto ulang.' : 'Foto kecil, hasil cetak bisa kurang tajam.'; }
      else { p = fullParams(bmp); status = 'wajah_tidak_terdeteksi'; st.textContent = r.alasan + ' — atur manual dengan zoom & geser.'; }
      redraw();
    }
    m.querySelector('input[type=file]').onchange = e => { const f = e.target.files[0]; if (f) { fileBlob = f; setImage(f); } };
    m.querySelector('[data-auto]').onclick = auto;
    zoom.oninput = () => { if (!p) return; const cx = p.x + p.zoom / 2, cyH = p.y * bmp.height + p.zoom * bmp.width * RATIO / 2;
      p.zoom = +zoom.value; p.x = cx - p.zoom / 2; p.y = (cyH - p.zoom * bmp.width * RATIO / 2) / bmp.height; status = 'manual'; redraw(); };
    // geser dengan mouse / jari
    let drag = null;
    cv.addEventListener('pointerdown', e => { if (!p) return; drag = { x: e.clientX, y: e.clientY, p: { ...p } }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!drag) return; const r = cv.getBoundingClientRect();
      const fw = drag.p.zoom * bmp.width, k2 = r.width / fw;
      p.x = drag.p.x - (e.clientX - drag.x) / k2 / bmp.width; p.y = drag.p.y - (e.clientY - drag.y) / k2 / bmp.height; status = 'manual'; redraw(); });
    cv.addEventListener('pointerup', () => drag = null);

    save.onclick = async () => {
      save.disabled = true; st.textContent = 'Menyimpan…';
      try {
        const out = document.createElement('canvas'); out.width = OUT_W; out.height = OUT_H; draw(out, bmp, p, bg);
        const kartu = await new Promise(r => out.toBlob(r, 'image/jpeg', 0.9));
        const nik = k.nik;
        if (fileBlob) {   // simpan foto asli (diperkecil maks 1600 px)
          const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
          const a = document.createElement('canvas'); a.width = Math.round(bmp.width * s); a.height = Math.round(bmp.height * s);
          a.getContext('2d').drawImage(bmp, 0, 0, a.width, a.height);
          const asli = await new Promise(r => a.toBlob(r, 'image/jpeg', 0.88));
          const e1 = (await sb.storage.from('foto').upload('asli/' + nik + '.jpg', asli, { upsert: true, contentType: 'image/jpeg' })).error;
          if (e1) throw e1;
          // parameter dihitung dari foto asli; skala tidak berubah karena pecahan
        }
        const e2 = (await sb.storage.from('foto').upload('kartu/' + nik + '.jpg', kartu, { upsert: true, contentType: 'image/jpeg' })).error;
        if (e2) throw e2;
        const upd = { foto_path: 'kartu/' + nik + '.jpg', foto_asli_path: 'asli/' + nik + '.jpg', foto_status: status,
          foto_zoom: +p.zoom.toFixed(4), foto_x: +p.x.toFixed(4), foto_y: +p.y.toFixed(4), foto_rot: 0 };
        const e3 = (await sb.from('karyawan').update(upd).eq('id', k.id)).error;
        if (e3) throw e3;
        App.clearFotoCache('kartu/' + nik + '.jpg');
        App.toast('Foto tersimpan');
        close(); opt.onSaved && opt.onSaved(upd);
      } catch (e) { st.textContent = 'Gagal menyimpan: ' + (e.message || e); save.disabled = false; }
    };

    // muat foto asli yang sudah ada
    if (k.foto_asli_path) {
      App.fotoUrl(k.foto_asli_path).then(u => u && setImage(u, k.foto_zoom ? { zoom: +k.foto_zoom, x: +k.foto_x, y: +k.foto_y } : null))
        .catch(() => st.textContent = 'Belum ada foto. Pilih / ambil foto.');
    } else st.textContent = 'Belum ada foto. Pilih / ambil foto.';
  }

  window.FotoEditor = { open, detectParams, loadBitmap };
})();
