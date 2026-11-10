Migrasi `perpanjangan_cukup_ujian_teori` (10 Nov 2026) — diterapkan langsung ke Supabase:
- kimper_kekurangan(): jenis 'perpanjangan' tidak memeriksa dokumen persyaratan; wajib ada Mine Permit lama (aktif/ditangguhkan/kadaluarsa). PIC kontraktor perusahaan karyawan boleh melihat kekurangan.
- kimper_unit_before(): lulus = nilai teori >= batas DAN (pengajuan perpanjangan ATAU surat kompetensi valid).
- kimper_harian(): pengingat H-30/H-7 menyebut "wajib ujian teori" dan juga dikirim ke PIC SHE kontraktor.
