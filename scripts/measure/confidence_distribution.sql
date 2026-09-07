-- live listings by confidence level, reasons counted once (§18.17), with what put each group where
with norm as (
  select distinct on (comparison_group, year) comparison_group, year, sample_size
  from market_stats where group_version = 2
  order by comparison_group, year, computed_at desc
),
base as (
  select c.license_plate, l.hand_declared, c.hand, l.km_declared, c.km_at_last_test, c.ownership_history,
         (d.dealer_type <> 'private') as is_dealer, n.sample_size,
         c.ownership_history -> -1 ->> 'type' as last_type,
         c.ownership_history -> -1 ->> 'ym'   as last_ym,
         exists (select 1 from jsonb_array_elements(c.ownership_history) with ordinality as e1(v, o)
                 join jsonb_array_elements(c.ownership_history) with ordinality as e2(v, o) on e2.o = e1.o + 1
                 where e1.v ->> 'type' = 'private' and e2.v ->> 'type' = 'private'
                   and (split_part(e2.v ->> 'ym', '-', 1)::int * 12 + split_part(e2.v ->> 'ym', '-', 2)::int)
                     - (split_part(e1.v ->> 'ym', '-', 1)::int * 12 + split_part(e1.v ->> 'ym', '-', 2)::int) <= 1) as private_pair,
         exists (select 1 from jsonb_array_elements(c.ownership_history) e(v) where e.v ->> 'type' = 'dealer') as has_dealer_row
  from listings l
  join cars c on c.id = l.car_id
  join models mo on mo.id = c.model_id
  join dealers d on d.id = l.dealer_id
  left join norm n on n.comparison_group = mo.comparison_group and n.year = c.year
  where l.delisted_at is null
),
flags as (
  select *,
    (sample_size is null or sample_size < 5) as thin,
    (ownership_history is null) as no_history,
    (is_dealer and last_type = 'private' and has_dealer_row
       and last_ym >= to_char(now() - interval '3 months', 'YYYY-MM')) as possibly_sold,
    (hand_declared is not null and hand is not null and hand_declared <> hand
       and not (hand_declared = hand - 1 and private_pair)) as hand_gap,
    (km_declared is not null and km_at_last_test > 0 and km_declared - km_at_last_test < -5000) as km_gap
  from base
),
items as (
  select *,
      (thin::int) + (case when not thin and km_declared is null then 1 else 0 end) + (no_history::int)
    + (possibly_sold::int)
    + (case when not possibly_sold and hand_gap then 1 else 0 end)
    + (case when not possibly_sold and km_gap then 1 else 0 end) as n_items
  from flags
)
select case when n_items = 0 then 'high' when n_items = 1 then 'medium' else 'low' end as level,
       count(*) as listings,
       sum(thin::int) as thin_cell, sum(possibly_sold::int) as possibly_sold,
       sum((not possibly_sold and hand_gap)::int) as hand_gap, sum((not possibly_sold and km_gap)::int) as km_gap
from items group by 1 order by min(n_items);
