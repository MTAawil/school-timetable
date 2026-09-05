select
  id,
  "createdAt",
  details->>'status' as status,
  jsonb_pretty(details->'diagnostics') as diagnostics
from "AuditLog"
where action = 'PART_TIME_AVAILABILITY_CHECK_RUN'
order by "createdAt" desc
limit 1;
