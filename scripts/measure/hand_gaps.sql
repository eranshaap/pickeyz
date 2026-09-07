-- every live listing whose declared hand differs from the record, with the record
select c.license_plate, l.id, l.hand_declared, c.hand,
       case when l.source = 'yad2' then 'https://www.yad2.co.il/vehicles/item/' || l.external_id end as url,
       c.ownership_history -> -1 ->> 'ym' as last_transfer,
       c.ownership_history
from listings l
join cars c on c.id = l.car_id
where l.delisted_at is null
  and l.hand_declared is not null and c.hand is not null
  and l.hand_declared <> c.hand
order by c.hand - l.hand_declared, c.license_plate;
