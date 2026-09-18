-- price deviation vs km deviation per year of age; slope in % per 1,000 km/yr, overall and per model year
with norm as (
  select distinct on (comparison_group, year) comparison_group, year, median_price, median_km, sample_size
  from market_stats where group_version = 2
  order by comparison_group, year, computed_at desc
),
x as (
  select c.year,
         100.0 * (l.price - n.median_price) / n.median_price as price_dev_pct,
         (l.km_declared - n.median_km)
           / greatest(extract(epoch from (l.km_observed_at - c.first_registration)) / 31557600.0, 0.5) / 1000.0 as km_dev_k_per_year
  from listings l
  join cars c on c.id = l.car_id
  join models mo on mo.id = c.model_id
  join norm n on n.comparison_group = mo.comparison_group and n.year = c.year
  where l.delisted_at is null and l.km_declared is not null and n.median_km is not null and n.sample_size >= 5
)
select 'all' as scope, count(*) as n,
       round(regr_slope(price_dev_pct, km_dev_k_per_year)::numeric, 3) as slope_pct_per_1000_km_per_year,
       round(regr_r2(price_dev_pct, km_dev_k_per_year)::numeric, 3) as r2
from x
union all
select year::text, count(*),
       round(regr_slope(price_dev_pct, km_dev_k_per_year)::numeric, 3),
       round(regr_r2(price_dev_pct, km_dev_k_per_year)::numeric, 3)
from x group by year
order by 1;
