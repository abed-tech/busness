-- =====================================================================
-- DONNÉES DE DÉMONSTRATION — ENVIRONNEMENT LOCAL UNIQUEMENT
-- Chargées par « pnpm db:seed » (ou « pnpm db:start ») sur votre machine, refusé sur toute base non locale.
-- Jamais envoyées en production : le démarrage sur Render n'applique que les migrations.
-- =====================================================================
do $$
declare
  org uuid := '11111111-1111-4111-8111-111111111111';
  adm uuid := '22222222-2222-4222-8222-222222222222';
  ev uuid := '33333333-3333-4333-8333-333333333333';
  u record;
begin
  for u in select * from (values
      (org, 'organisateur@demo.local', 'Demo-Organisateur-1', '{"username":"Organisateur démo"}'::jsonb),
      (adm, 'admin@demo.local', 'Demo-Admin-1', '{}'::jsonb)) v(id, email, pw, meta)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, extensions.crypt(u.pw, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', u.meta, now(), now(), '', '', '', '')
    on conflict (id) do nothing;
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now())
    on conflict do nothing;
  end loop;

  insert into public.profiles (id, username, full_name, phone, email) values (org, 'Organisateur démo', 'Compte de démonstration', '+243810000000', 'organisateur@demo.local') on conflict do nothing;
  insert into public.admin_users (user_id, role, display_name) values (adm, 'super', 'Admin démo') on conflict do nothing;

  insert into public.events (id, owner_id, type, host_a, host_b, title, event_date, event_time, venue, address, dress, message, program, expected, table_capacity, offer, short_id, service_key)
  values (ev, org, 'mariage', 'Patrick', 'Grâce', 'Patrick & Grâce', current_date + 45, '16:00', 'Salle Le Prestige', 'Boulevard du 30 Juin, Gombe, Kinshasa',
          'Tenue de soirée, tons bleu nuit et or',
          'Nos familles ont la joie de vous convier à la célébration de notre union. Votre présence rendra cette journée inoubliable.',
          E'14:00 | Cérémonie civile\n16:00 | Bénédiction nuptiale\n18:30 | Cocktail et photos\n20:00 | Dîner de gala\n22:30 | Première danse',
          20, 6, 'both', 'DEMO2026', 'demoservice')
  on conflict do nothing;

  insert into public.catalog_items (event_id, kind, name) values
    (ev, 'drink', 'Coca-Cola'), (ev, 'drink', 'Fanta'), (ev, 'drink', 'Primus'), (ev, 'drink', 'Eau minérale'),
    (ev, 'dish', 'Poulet braisé'), (ev, 'dish', 'Poisson'), (ev, 'dish', 'Plat végétarien')
  on conflict do nothing;

  insert into public.guests (event_id, name, kind, whatsapp, table_no, code, invite_token) values
    (ev, 'Couple Mbuyi', 'couple', '+243810000001', 1, 'MBUYI1', 'demo-invitation-mbuyi-01'),
    (ev, 'Mr Luc Kabeya', 'mr', '+243810000002', 1, 'LUCK02', 'demo-invitation-luc-0002'),
    (ev, 'Mme Lucie Ilunga', 'mme', '+243810000003', 1, 'LUCI03', 'demo-invitation-lucie-003'),
    (ev, 'Couple Bola', 'couple', '+243810000004', 2, 'BOLA04', 'demo-invitation-bola-0004'),
    (ev, 'Mr Paul Tshibanda', 'mr', '+243810000005', 2, 'PAUL05', 'demo-invitation-paul-0005'),
    (ev, 'Mme Sarah Ngalula', 'mme', '', null, 'SARA06', 'demo-invitation-sarah-006')
  on conflict do nothing;

  -- accès du jour J (mots de passe : voir docs/DEMARRAGE.md)
  insert into public.staff_accounts (id, event_id, role, name, access_code, password_hash) values
    ('44444444-4444-4444-8444-444444444441', ev, 'controller', 'Jean (entrée)', 'CTL234', extensions.crypt('controle1', extensions.gen_salt('bf', 10))),
    ('44444444-4444-4444-8444-444444444442', ev, 'server', 'Marie (salle)', 'SRV234', extensions.crypt('service1', extensions.gen_salt('bf', 10)))
  on conflict do nothing;
end $$;
