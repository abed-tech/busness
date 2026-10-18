-- staff_lookup : « valid » valait NULL (et non false) pour un invité sans réponse (logique à trois valeurs de SQL).
-- Sans effet sur la sécurité (staff_confirm_entry refuse déjà l'entrée), mais une application mobile doit recevoir true ou false.
create or replace function public.staff_lookup(p_token text, p_scan text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.staff_accounts; g public.guests; o public.guest_orders; en public.entries;
begin
  s := private.staff_session(p_token);
  g := private.find_guest(s.event_id, p_scan);
  if s.role = 'controller' then
    select * into en from public.entries where guest_id = g.id;
    return jsonb_build_object('guest_id', g.id, 'name', g.name, 'persons', g.seats, 'table', g.table_no, 'rsvp', g.rsvp,
      'entered_at', en.confirmed_at, 'entered_by', en.staff_name,
      'valid', coalesce(g.rsvp = 'yes' and en.guest_id is null, false));
  end if;
  select * into o from public.guest_orders where guest_id = g.id;
  return jsonb_build_object('guest_id', g.id, 'name', g.name, 'table', g.table_no, 'confirmed', g.rsvp = 'yes',
    'drinks', case when g.rsvp = 'yes' then (select coalesce(jsonb_agg(c.name order by ord), '[]') from unnest(o.drinks) with ordinality u(i, ord) join public.catalog_items c on c.id = u.i) else '[]'::jsonb end,
    'dishes', case when g.rsvp = 'yes' then (select coalesce(jsonb_agg(c.name order by ord), '[]') from unnest(o.dishes) with ordinality u(i, ord) join public.catalog_items c on c.id = u.i) else '[]'::jsonb end,
    'drink_served', (select jsonb_build_object('at', served_at, 'by', staff_name) from public.services where guest_id = g.id and kind = 'drink'),
    'dish_served', (select jsonb_build_object('at', served_at, 'by', staff_name) from public.services where guest_id = g.id and kind = 'dish'));
end $$;
