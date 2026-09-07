-- declared km vs the last test reading, per live listing, with the implied rate since the test
with x as (
  select c.license_plate, l.id, l.km_declared, c.km_at_last_test,
         c.mivchan_acharon_dt::date as last_test, c.first_registration::date as first_reg,
         l.km_declared - c.km_at_last_test as diff,
         greatest((extract(year from l.first_seen_at) - extract(year from c.mivchan_acharon_dt)) * 12
                + (extract(month from l.first_seen_at) - extract(month from c.mivchan_acharon_dt)), 1) as months_since_test
  from listings l join cars c on c.id = l.car_id
  where l.delisted_at is null
)
select license_plate, id, km_declared, km_at_last_test, last_test, first_reg, diff, months_since_test,
  case when km_declared is null or km_at_last_test is null then 'no_comparison'
       when km_at_last_test = 0 then 'official_is_intake'
       when diff < -5000 then 'km_below'
       when diff <= 0 then 'at_or_below_within_tolerance'
       else 'declared_above_official' end as km_check,
  case when km_at_last_test > 0 and diff > 0 then round(diff::numeric / months_since_test) end as km_per_month_since_test
from x
order by km_check, km_per_month_since_test desc nulls last, license_plate;
