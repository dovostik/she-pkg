-- Notifikasi HP (Web Push) + pengingat SIM habis
create extension if not exists pg_net with schema extensions;

alter table public.notif add column if not exists push_at timestamptz;
update public.notif set push_at = at where push_at is null;          -- notifikasi lama tidak dikirim ulang
create index if not exists notif_push_antre on public.notif (at) where push_at is null;

create table if not exists public.push_sub (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles(id),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  perangkat   text,
  created_at  timestamptz not null default now(),
  terakhir_ok timestamptz
);
create index if not exists push_sub_user on public.push_sub (user_id);
alter table public.push_sub enable row level security;
create policy push_sub_sendiri on public.push_sub for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- simpan langganan HP ini untuk akun yang sedang masuk (HP bergantian akun → pindah ke akun terakhir)
create or replace function public.simpan_push(p_endpoint text, p_p256dh text, p_auth text, p_perangkat text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Harus masuk dulu'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'Alamat langganan tidak valid'; end if;
  insert into public.push_sub (user_id, endpoint, p256dh, auth, perangkat)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_perangkat, 200))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh,
    auth = excluded.auth, perangkat = excluded.perangkat, created_at = now();
end $$;
revoke all on function public.simpan_push(text, text, text, text) from public, anon;
grant execute on function public.simpan_push(text, text, text, text) to authenticated;

-- kunci privat VAPID disimpan di Vault, hanya bisa dibaca Edge Function (service_role)
create or replace function public.vapid_kunci()
returns text language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private' limit 1
$$;
revoke all on function public.vapid_kunci() from public, anon, authenticated;
grant execute on function public.vapid_kunci() to service_role;

-- setiap ada notifikasi baru → panggil Edge Function pengirim (async lewat pg_net)
create or replace function public.notif_push_picu()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(url := 'https://njyqdqmpllstqudsydec.supabase.co/functions/v1/kirim-push',
    body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 8000);
  return null;
exception when others then return null;   -- notifikasi di aplikasi tetap tersimpan walau pengiriman gagal
end $$;
create or replace trigger notif_push after insert on public.notif
  for each statement execute function public.notif_push_picu();

-- cadangan: tiap 5 menit kirim yang tertunda
select cron.schedule('push-tertunda', '*/5 * * * *', $c$
  select net.http_post(url := 'https://njyqdqmpllstqudsydec.supabase.co/functions/v1/kirim-push',
    body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb)
  where exists (select 1 from public.notif where push_at is null and at > now() - interval '1 day')
$c$);

-- ===== Pengingat SIM habis: H-7 dan H-1 =====
create table if not exists public.notif_sim_log (
  kimper_id   uuid not null references public.kimper(id),
  sim_berlaku date not null,
  tahap       int  not null,            -- 7 = seminggu sebelum, 1 = sehari sebelum
  at          timestamptz not null default now(),
  primary key (kimper_id, sim_berlaku, tahap)
);
alter table public.notif_sim_log enable row level security;

create or replace function public.notif_sim_habis()
returns int language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Jakarta')::date;
  r record; n int := 0; th int; jd text; isi text; hr text;
begin
  for r in
    select k.id, k.nomor, k.sim_berlaku, k.karyawan_id, kr.nama, kr.perusahaan_id, p.nama as per
    from public.kimper k join public.karyawan kr on kr.id = k.karyawan_id
    left join public.perusahaan p on p.id = kr.perusahaan_id
    where k.status = 'aktif' and k.sim_berlaku between today and today + 7
  loop
    th := case when r.sim_berlaku - today <= 1 then 1 else 7 end;
    if exists (select 1 from public.notif_sim_log l where l.kimper_id = r.id and l.sim_berlaku = r.sim_berlaku and l.tahap <= th) then continue; end if;
    insert into public.notif_sim_log (kimper_id, sim_berlaku, tahap) values (r.id, r.sim_berlaku, th) on conflict do nothing;
    jd  := 'SIM ' || r.nama || case when r.sim_berlaku = today then ' habis HARI INI' when r.sim_berlaku - today = 1 then ' habis BESOK' else ' habis ' || (r.sim_berlaku - today) || ' hari lagi' end;
    isi := to_char(r.sim_berlaku, 'DD-MM-YYYY') || ' · ' || coalesce(r.per, '') || ' · Mine Permit ' || r.nomor || '. Perpanjang SIM, lalu ajukan perpanjangan Mine Permit.';
    hr  := '/mp/' || r.id;
    perform public.notif_she(jd, isi, hr);
    insert into public.notif (user_id, judul, isi, href)
      select id, jd, isi, hr from public.profiles
      where aktif and role = 'pic_kontraktor' and perusahaan_id = r.perusahaan_id;
    perform public.notif_karyawan(r.karyawan_id, 'SIM Anda ' || substr(jd, length('SIM ' || r.nama) + 2), isi, hr);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.notif_sim_habis() from public, anon, authenticated;

-- setiap hari 06:10 WIB (23:10 UTC)
select cron.schedule('sim-habis-harian', '10 23 * * *', 'select public.notif_sim_habis()');
