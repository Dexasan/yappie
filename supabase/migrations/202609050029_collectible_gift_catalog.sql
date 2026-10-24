begin;

update public.gift_catalog
set name = case slug
  when 'rose' then 'Signal Rose'
  when 'coffee' then 'Midnight Fuel'
  when 'heart' then 'Neon Heart'
  when 'fire' then 'Wild Frequency'
  when 'crown' then 'Royal Broadcast'
  else name
end,
emoji = case slug
  when 'rose' then '✿'
  when 'coffee' then '≈'
  when 'heart' then '♥'
  when 'fire' then '↯'
  when 'crown' then '♛'
  else emoji
end
where slug in ('rose', 'coffee', 'heart', 'fire', 'crown');

insert into public.gift_catalog (slug, name, emoji, coin_cost, sort_order)
values
  ('mixtape', 'Mixtape Memory', '▶', 45, 25),
  ('moon_ticket', 'Moon Ticket', '☾', 60, 28),
  ('golden_mic', 'Golden Mic', '◉', 150, 45)
on conflict (slug) do update
set name = excluded.name,
    emoji = excluded.emoji,
    coin_cost = excluded.coin_cost,
    sort_order = excluded.sort_order,
    active = true;

commit;
