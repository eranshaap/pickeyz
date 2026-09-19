-- declared km vs the last test reading dated ON OR BEFORE the day that km was observed, per live listing,
-- with the implied rate since that test. Day 19 (Run 5c2, §2.5): the engine no longer reads the car's latest
-- pair (cars.km_at_last_test / mivchan_acharon_dt) — it reads the latest car_test_readings row of the car with
-- test_date <= l.km_observed_at, and the months run from that reading to km_observed_at. A car with no reading
-- on or before that day gets no comparison at all ('test_after_observation').
with x as (
  select c.license_plate, l.id, l.km_declared, r.km as km_at_last_test,
         r.test_date as last_test, c.first_registration::date as first_reg,
         l.km_declared - r.km as diff,
         greatest((extract(year from l.km_observed_at) - extract(year from r.test_date)) * 12
                + (extract(month from l.km_observed_at) - extract(month from r.test_date)), 1) as months_since_test
  from listings l
  join cars c on c.id = l.car_id
  left join lateral (
    select tr.test_date, tr.km
    from car_test_readings tr
    where tr.car_id = c.id and tr.test_date <= l.km_observed_at::date
    order by tr.test_date desc
    limit 1
  ) r on true
  where l.delisted_at is null
)
select license_plate, id, km_declared, km_at_last_test, last_test, first_reg, diff, months_since_test,
  case when km_declared is null then 'no_comparison'
       when km_at_last_test is null then 'test_after_observation'
       when km_at_last_test = 0 then 'official_is_intake'
       when diff < -5000 then 'km_below'
       when diff <= 0 then 'at_or_below_within_tolerance'
       else 'declared_above_official' end as km_check,
  case when km_at_last_test > 0 and diff > 0 then round(diff::numeric / months_since_test) end as km_per_month_since_test
from x
order by km_check, km_per_month_since_test desc nulls last, license_plate;
