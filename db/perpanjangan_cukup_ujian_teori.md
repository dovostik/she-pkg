Migrasi `perpanjangan_cukup_ujian_teori` (10 Nov 2026) — diterapkan langsung ke Supabase:
- kimper_kekurangan(): jenis 'perpanjangan' tidak memeriksa dokumen persyaratan; wajib ada Mine Permit lama (aktif/ditangguhkan/kadaluarsa). PIC kontraktor perusahaan karyawan boleh melihat kekurangan.
- kimper_unit_before(): lulus = nilai teori >= batas DAN (pengajuan perpanjangan ATAU surat kompetensi valid).
- kimper_harian(): pengingat H-30/H-7 menyebut "wajib ujian teori" dan juga dikirim ke PIC SHE kontraktor.

Migrasi `perpanjangan_tenggang_telat_tambah_unit` + `v_mine_permit_telat_perpanjang` (10 Nov 2026):
- setting kimper_tenggang_perpanjangan_hari = 30.
- kimper_aturan(p_id) → {telat, hari_lewat, tenggang, dokumen[], kompetensi, kartu_lama}; dipakai kimper_kekurangan & kimper_unit_before.
  baru/ganti_hilang: semua dokumen; tambah_unit: KOMPETENSI saja; perpanjangan ≤ 30 hari setelah habis: tanpa dokumen; > 30 hari: TELAT, semua dokumen.
- kimper_pengajuan.telat_perpanjang / telat_hari dibekukan saat Diajukan (trigger kimper_pengajuan_telat).
- Persetujuan perpanjangan: nomor & ID tetap, dicetak_at = null (cetak ulang), notif SHE "Cetak ulang"; telat → kimper.telat_perpanjang_ke +1, telat_perpanjang_terakhir, log "TELAT PERPANJANG".
- kimper_harian: notif kadaluarsa menyebut batas tenggang; notif 7 hari sebelum tenggang habis ke SHE & PIC kontraktor.
