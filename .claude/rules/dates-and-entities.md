# Rule: local dates & slash-separated entities

Applies to: all data handling (`web/src/**`, `scripts/**`, `supabase/**`).

## Local dates — never drift by timezone
- The wire/storage format for any calendar date is local ISO `yyyy-mm-dd`.
  Postgres column type is `date`. User-facing rendering is always `mm/dd/yyyy`.
- **Never** call `new Date(someIsoString)` for a date-only value — it parses as
  UTC midnight and shifts a day in negative-offset timezones.
- Always go through the ported helpers in `web/src/lib/dates.ts`:
  `parseLocalDate`, `toISO`, `formatDateMMDDYYYY`, `addDaysISO`,
  `addRecurringInterval`, the `getLocal*Range` family, `inRange`.
- `<input type="date">` values are already local `yyyy-mm-dd`; commit them as-is.
- Quarter placeholders like `Q2`/`Q3` appear in legacy Potential-trip dates; they
  are not real dates. `import_seed.ts` nulls them out of the `date` column.

## Entities — slash, never comma
- Multi-entity cells (40-Act / Hedge Fund / Private, monitoring visits) are
  joined with `/` (e.g. `ETIHX/IPAY`, `Westwood/Aspenleaf`). Never comma-join.
- Use `web/src/lib/roster.ts` `aliasMulti` when normalizing multi-entity strings.
