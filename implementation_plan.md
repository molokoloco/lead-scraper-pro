# Update Merge Logic: Email Deduplication

This plan updates the final merging process to ensure multiple emails are comma-separated and that businesses sharing the same email are consolidated into a single record.

## Proposed Changes

### [MODIFY] [merge.js](file:///d:/Google%20Drive/_WWW_/Julienweb.fr/Claude/scraper/merge.js)

#### 1. Update `cleanEmails` function
- Change the input splitting to handle `,`, `;`, and `/`.
- Change the output joining to use `,`.

#### 2. Update CSV generation loop
- Add a pre-processing step before writing the CSV to find and merge rows with duplicate emails.
- Logic:
    - Iterate through all collected rows.
    - If a row has an email that was already seen in a previous row, merge the current row's data (Sources, Telephones, Emails) into the existing row.
    - If no duplicate email is found, keep the row as unique.

## Verification Plan

### Manual Verification
- Run `node merge.js`.
- Check `results_final.csv` to ensure:
    - Multiple emails are separated by `,`.
    - No two rows share the same email address.
    - Sources and phones are combined when a merge occurs.
