// Edge Function kirim-push: kirim notifikasi baru (notif.push_at kosong) ke HP lewat Web Push.
// Tidak menerima data dari luar — hanya menguras antrean, jadi aman dipanggil tanpa JWT.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const PUB = 'BLWAnFluvYcqabuZ1njTPBY8aGT4lHJcaV5nI4UWlZIi_w5j65sakuzhnZSTGhAPSp66FmWTRdMhxsdGXxMY8R4';
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
let siap = false;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async () => {
  if (!siap) {
    const { data, error } = await sb.rpc('vapid_kunci');
    if (error || !data) return json({ error: 'kunci VAPID belum ada' }, 500);
    webpush.setVapidDetails('https://dovostik.github.io/she-pkg/', PUB, data as string);
    siap = true;
  }
  const kini = new Date().toISOString(), sejak = new Date(Date.now() - 864e5).toISOString();
  // klaim antrean secara atomik (push_at diisi) agar tidak terkirim dua kali
  const { data: rows, error } = await sb.from('notif').update({ push_at: kini }).is('push_at', null).gte('at', sejak).select('id,user_id,judul,isi,href');
  if (error) return json({ error: error.message }, 500);
  if (!rows?.length) return json({ notif: 0 });
  const uids = [...new Set(rows.map(r => r.user_id))];
  const { data: subs } = await sb.from('push_sub').select('id,user_id,endpoint,p256dh,auth').in('user_id', uids);
  const { data: belum } = await sb.from('notif').select('user_id').in('user_id', uids).is('dibaca_at', null).limit(5000);
  const hitung: Record<string, number> = {}; (belum || []).forEach(b => hitung[b.user_id] = (hitung[b.user_id] || 0) + 1);
  // per akun: maks 3 notifikasi terpisah; lebih dari itu digabung jadi satu ringkasan
  const pesan: { uid: string; body: Record<string, unknown> }[] = [];
  for (const uid of uids) {
    const ns = rows.filter(r => r.user_id === uid), belumN = hitung[uid] || ns.length;
    if (ns.length <= 3) ns.forEach(n => pesan.push({ uid, body: { id: n.id, judul: n.judul, isi: n.isi, href: n.href, belum: belumN } }));
    else pesan.push({ uid, body: { id: 'ringkas-' + kini, judul: ns.length + ' notifikasi baru', isi: ns.slice(0, 4).map(n => '• ' + n.judul).join('\n') + (ns.length > 4 ? '\n…dan ' + (ns.length - 4) + ' lainnya' : ''), href: '/', belum: belumN } });
  }
  let ok = 0, gagal = 0; const mati = new Set<number>(), hidup = new Set<number>();
  await Promise.all(pesan.flatMap(m => (subs || []).filter(s => s.user_id === m.uid).map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m.body), { TTL: 86400, urgency: 'high' });
      ok++; hidup.add(s.id);
    } catch (e) { gagal++; const k = (e as { statusCode?: number }).statusCode; if (k === 404 || k === 410) mati.add(s.id); }
  })));
  if (mati.size) await sb.from('push_sub').delete().in('id', [...mati]);
  if (hidup.size) await sb.from('push_sub').update({ terakhir_ok: kini }).in('id', [...hidup]);
  return json({ notif: rows.length, ok, gagal, langganan_dihapus: mati.size });
});
