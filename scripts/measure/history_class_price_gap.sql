-- median asking-price deviation from the cell median, per history class; the gaps between classes are the market's deductions
with norm as (
  select distinct on (comparison_group, year) comparison_group, year, median_price, sample_size
  from market_stats where group_version = 2
  order by comparison_group, year, computed_at desc
),
h as (
  select l.price, n.median_price,
         c.ownership_history -> 0 ->> 'type' as first_type,
         c.ownership_history -> 0 ->> 'ym'   as first_ym,
         (select e ->> 'ym' from jsonb_array_elements(c.ownership_history) with ordinality as t(e, o)
           where e ->> 'type' = 'private' order by o limit 1) as first_private_ym
  from listings l
  join cars c on c.id = l.car_id
  join models mo on mo.id = c.model_id
  join norm n on n.comparison_group = mo.comparison_group and n.year = c.year
  where l.delisted_at is null and n.sample_size >= 5 and c.ownership_history is not null
),
classified as (
  select 100.0 * (price - median_price) / median_price as price_dev_pct,
    case when first_type = 'leasing' and first_private_ym is not null
           and (split_part(first_private_ym, '-', 1)::int * 12 + split_part(first_private_ym, '-', 2)::int)
             - (split_part(first_ym, '-', 1)::int * 12 + split_part(first_ym, '-', 2)::int) <= 12
         then 'zero_km' else first_type end as history_class
  from h
)
select history_class, count(*) as listings,
       round(percentile_cont(0.5) within group (order by price_dev_pct)::numeric, 1) as median_price_dev_pct
from classified group by 1 order by 2 desc;
