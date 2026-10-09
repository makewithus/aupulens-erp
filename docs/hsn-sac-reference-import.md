# HSN/SAC Reference Data Import

HSN/SAC classification must be maintained as reference data, not application logic.

Production data should be imported from an authoritative GST/HSN/SAC source approved by the business or tax advisor. The importer intentionally does not generate or infer regulatory rows.

Required CSV columns:

```csv
code,type,description,gstRate,gstTreatment,sourceId,sourceName,version,effectiveFrom,effectiveTo,active
```

Run:

```bash
npx tsx scripts/import-hsn-sac-reference.ts ./hsn-sac-reference.csv
```

The import upserts by `code + type + sourceId + effectiveFrom`, allowing effective-date/versioned tax rules to coexist. Product and transaction records store the accepted reference source/effective date as a tax snapshot.
