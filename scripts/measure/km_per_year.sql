-- km per year from the tester's own readings: km between consecutive readings of the same car divided by the
-- years between them, grouped by comparison_group and model year, with the count of cars.
-- Empty until an MOT refresh adds a second reading per car (car_test_readings, BRIEF §21); that is expected.
with readings as (
  select r.car_id, r.test_date, r.km,
         lag(r.test_date) over (partition by r.car_id order by r.test_date) as prev_date,
         lag(r.km)        over (partition by r.car_id order by r.test_date) as prev_km
  from car_test_readings r
),
rates as (
  select x.car_id,
         (x.km - x.prev_km) / ((x.test_date - x.prev_date) / 365.25) as km_per_year
  from readings x
  where x.prev_date is not null and x.test_date > x.prev_date
)
select mo.comparison_group, c.year,
       count(distinct rt.car_id) as cars,
       count(*) as intervals,
       round(percentile_cont(0.5) within group (order by rt.km_per_year)::numeric) as median_km_per_year,
       round(min(rt.km_per_year)::numeric) as min_km_per_year,
       round(max(rt.km_per_year)::numeric) as max_km_per_year
from rates rt
join cars c on c.id = rt.car_id
join models mo on mo.id = c.model_id
group by mo.comparison_group, c.year
order by mo.comparison_group, c.year;
