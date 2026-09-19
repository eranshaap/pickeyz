-- declared km vs the two test readings that can answer the question — was the km in the ad false on the day it
-- was observed? — per live listing, with the implied rate since the before reading. Day 19 (Run 5c2, §2.5): the
-- engine no longer reads the car's latest pair (cars.km_at_last_test / mivchan_acharon_dt); it reads the latest
-- car_test_readings row with test_date <= l.km_observed_at, and the months run from that reading to
-- km_observed_at. Run 5c3 (§4): it also reads the EARLIEST row with test_date > l.km_observed_at — the after
-- reading — which contradicts the ad only by more than 5000 + 5000 * days_after / 30: what the car may
-- plausibly have driven between the observation and that test is not held against the ad. One contradiction is
-- enough, before first; no reading at all still gets no comparison.
with x as (
  select c.license_plate, l.id, l.km_declared, r.km as km_at_last_test,
         r.test_date as last_test, c.first_registration::date as first_reg,
         l.km_declared - r.km as diff,
         greatest((extract(year from l.km_observed_at) - extract(year from r.test_date)) * 12
                + (extract(month from l.km_observed_at) - extract(month from r.test_date)), 1) as months_since_test,
         a.km as km_after, a.test_date as after_test,
         l.km_declared - a.km as diff_after,
         greatest(a.test_date - l.km_observed_at::date, 1) as days_after,
         5000 + 5000 * greatest(a.test_date - l.km_observed_at::date, 1) / 30.0 as after_threshold
  from listings l
  join cars c on c.id = l.car_id
  left join lateral (
    select tr.test_date, tr.km
    from car_test_readings tr
    where tr.car_id = c.id and tr.test_date <= l.km_observed_at::date
    order by tr.test_date desc
    limit 1
  ) r on true
  left join lateral (
    select tr.test_date, tr.km
    from car_test_readings tr
    where tr.car_id = c.id and tr.test_date > l.km_observed_at::date
    order by tr.test_date asc
    limit 1
  ) a on true
  where l.delisted_at is null
)
select license_plate, id, km_declared, km_at_last_test, last_test, first_reg, diff, months_since_test,
  km_after, after_test, diff_after, days_after, round(after_threshold, 1) as after_threshold,
  -- the engine's order (checks.ts §1.3): a 0-km reading is the intake record and is set aside; the before
  -- reading is judged on the plain threshold, the after reading on the grown one; otherwise the primary
  -- reading (the usable before, else the after) is what the check records.
  case when km_declared is null then 'no_comparison'
       when coalesce(km_at_last_test, 0) = 0 and coalesce(km_after, 0) = 0
            and (km_at_last_test is not null or km_after is not null) then 'official_is_intake'
       when km_at_last_test is null and km_after is null then 'no_reading'
       when km_at_last_test > 0 and diff < -5000 then 'km_below'
       when km_after > 0 and diff_after < -after_threshold then 'km_below_after'
       when coalesce(diff, diff_after) <= 0 then 'at_or_below_within_tolerance'
       else 'declared_above_official' end as km_check,
  case when km_at_last_test > 0 and diff > 0 then round(diff::numeric / months_since_test) end as km_per_month_since_test
from x
order by km_check, km_per_month_since_test desc nulls last, license_plate;
