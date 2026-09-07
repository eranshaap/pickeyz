-- months from the leasing registration to the first private owner, per car; two clusters expected
with base as (
  select c.license_plate, c.hand,
         c.ownership_history -> 0 ->> 'ym' as first_ym,
         (select e ->> 'ym' from jsonb_array_elements(c.ownership_history) with ordinality as t(e, ord)
           where e ->> 'type' = 'private' order by ord limit 1) as first_private_ym
  from cars c
  where c.ownership_history -> 0 ->> 'type' = 'leasing'
),
gaps as (
  select license_plate, hand,
         (split_part(first_private_ym, '-', 1)::int * 12 + split_part(first_private_ym, '-', 2)::int)
       - (split_part(first_ym, '-', 1)::int * 12 + split_part(first_ym, '-', 2)::int) as months_to_first_private
  from base where first_private_ym is not null
)
select months_to_first_private, count(*) as cars,
       string_agg(license_plate || ' (hand ' || hand || ')', ', ' order by license_plate) as plates
from gaps group by 1 order by 1;
