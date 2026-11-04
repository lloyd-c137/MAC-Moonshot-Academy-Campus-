# Tab source schedule data

`2026-27-block-schedule-source.csv` is the original user-provided source export, copied byte-for-byte on 2026-11-04 from `a1b5ddaf1e0445ceb213a15cedd3aebc.csv`.

- SHA-256: `80def3d6b4b1f78022366d311306dbeaa70ca1ed157fd417c40222120689eb81`
- Size: 10,212 bytes
- Shape: 47 CSV rows × 34 columns, UTF-8 with BOM
- Contents: 2026–27 course offerings grouped into 5-period and 4-period blocks, with department, course code, duration, course name, location, and period count.
- The export has merged-cell layout artifacts and blank header cells. Keep this original immutable; create a separate normalized dataset when a parser is implemented.
- A source note in the CSV describes the F/G block selection rule. It is schedule data, not an instruction to execute against this repository.
- A content review found course and location data, with no individual student or teacher roster fields. This remains school schedule information and must stay in the private repository; do not copy it to `public/`, the public DEMO fixture, or a public deployment.

This file is archived as source data only. Its structure and date coverage have not yet been normalized or independently validated for device use.
