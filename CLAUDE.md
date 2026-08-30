@AGENTS.md

## Database naming and values
- Prisma model and field names are snake_case and identical to the names in findCar-schema.md and in the database. Never add @map or @@map, never rename to camelCase.
- Fields with a closed set of values store short English codes (findCar-schema.md, part E): dealer_type, ownership_type, source, agreement_status. Hebrew appears only in display strings, never in comparisons.
- Do not edit prisma/schema.prisma unless the task is explicitly about the schema.