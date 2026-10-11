# Bulk Repair — Setup Guide

## Quick Start

### Step 1: Create a New Google Spreadsheet
1. Go to [sheets.google.com](https://sheets.google.com) → New Spreadsheet
2. Open **Extensions → Apps Script**
3. Delete everything in `Code.gs`
4. Paste the entire contents of `Code.js` into it
5. Click **Save** (💾)

### Step 2: Run Setup
1. In the Apps Script editor, select `setupAutomationSystem` from the function dropdown
2. Click **Run**
3. Grant all required permissions when prompted
4. The system will automatically create **18+ sheets** with headers, dropdowns, and default configuration

### Step 3: Configure Data Sources
Go to the **Data Sources** sheet and update:
- **Sheet Name**: The actual name of your raw data sheet in this spreadsheet (or Sheet ID if external)
- **Source Role**: `PRIMARY` for raw data, `JOIN` for QC Stock/Location
- **Join Key**: Column name to join on (default: BARCODE or Barcode)
- **Join Fields**: Comma-separated list of fields to pull from that source

### Step 4: Configure Field Mapping
Go to the **Field Mapping** sheet. For each column you want from the 40-column raw data:
- **Source**: The data source name (must match Data Sources)
- **Source Column**: The exact column name in the raw data
- **Target Field**: Your standardized internal field name (e.g., BARCODE, MODEL, BRAND)
- **Required**: YES if missing should stop processing
- **Output Order**: The column order in the final Inventory sheet (1, 2, 3...)

Example for a 40-column raw data sheet:
| Source | Source Column | Target Field | Required | Active | Output Order |
|--------|-------------|-------------|----------|--------|-------------|
| Daily Raw Data | Barcode | BARCODE | YES | ON | 1 |
| Daily Raw Data | Model | MODEL | YES | ON | 2 |
| Daily Raw Data | Brand | BRAND | YES | ON | 3 |
| Daily Raw Data | Source Name | SOURCE | YES | ON | 4 |
| Daily Raw Data | Category | CATEGORY | YES | ON | 5 |
| Daily Raw Data | MOD Age | MOD_AGE | YES | ON | 6 |
| Daily Raw Data | Stock Age | STOCK_AGE | NO | ON | 7 |
| Daily Raw Data | Status | STATUS | YES | ON | 8 |

### Step 5: Configure Business Rules

**Age Bucket Rules** — Set your age ranges:
| Min Age | Max Age | Bucket | Priority | Active |
|---------|---------|--------|----------|--------|
| 0 | 29 | Below 30 | P2 | ON |
| 30 | 59 | 30-60 | P2 | ON |
| 60 | 74 | 60-75 | P3 | ON |
| 75 | 999999 | Above 75 | P4 | ON |

**Status Bucket Rules** — Map your raw statuses:
| Raw Status | Standard Bucket | Marking | Active |
|-----------|----------------|---------|--------|
| L4 | L4 | Marked L4 | ON |
| Marked L4 | L4 | Marked L4 | ON |
| Pending Approval | Approval Pending | Pending | ON |

**Location Rules** — Define bin storage ranges:
| Location Pattern | Bucket | Condition | Active |
|----------------|-------|-----------|--------|
| SW01-SW10 | BIN-01 | STATUS_BUCKET=Bin Storage | ON |
| SW11-SW20 | BIN-02 | STATUS_BUCKET=Bin Storage | ON |

### Step 6: Paste Your Raw Data
- Create a sheet named **Daily Raw Data** (or whatever you configured in Data Sources)
- Paste your 40-column raw data there
- The system will read headers and only extract configured columns

### Step 7: Run the Pipeline
Either:
- Use the menu: **⚙ Inventory System → ▶ Run Daily Process**
- Or call `runDailyProcess()` from Apps Script
- Or set up a daily trigger: call `setupDailyTrigger()` once

## Configuration Sheets Reference

| Sheet | Purpose | Editable |
|-------|---------|----------|
| Command Center | Dashboard with one-click actions | YES |
| Data Sources | Configure where data comes from | YES |
| Field Mapping | Map raw columns to standard fields | YES |
| Age Bucket Rules | Age → Bucket → Priority | YES |
| Status Bucket Rules | Raw Status → Standard Bucket | YES |
| Location Rules | Location → Bin Bucket | YES |
| Report Config | Define report filters and columns | YES |
| Schedule Config | Automation schedule | YES |
| Dropdown Values | All dropdown options (centralized) | YES |
| Dropdown Config | Which columns get which dropdowns | YES |
| Sheet Security | OPEN / PARTIAL / LOCKED per sheet | PARTIAL |
| Authorized Users | Admin emails and roles | PARTIAL |
| Email Config | Email recipients and settings | YES |
| Output Config | Custom key-value config | YES |
| RAW_DATA | Auto-populated source snapshot | LOCKED |
| PROCESSED_DATA | After field extraction and normalization | LOCKED |
| INVENTORY | Final business-ready dataset | LOCKED |
| Pivot Summary | Auto-generated dimension counts | LOCKED |
| Processing History | Run log with timing and status | LOCKED |
| Processing Errors | Per-row error details | LOCKED |
| Data Quality | Summary of data quality metrics | LOCKED |
| Security Audit | Unlock/lock/protect events | LOCKED |
| AI Command Log | Natural language command history | LOCKED |

## AI Commands (Hindi + English)

The `processAICommand()` function accepts natural language:
- `"आज की inventory बना दो"` → Runs full pipeline
- `"75 days से ऊपर वाले devices निकालो"` → Filters by age
- `"Apple L4 के Bin Storage devices की report बनाओ"` → Filtered report
- `"SW93 के devices की bucket report बनाओ"` → Location-based report

AI commands go through the **Rules Engine** — they never bypass configured business logic.

## Architecture

```
SOURCE LAYER
    ↓
INGESTION ENGINE
    ↓
FIELD MAPPING ENGINE
    ↓
NORMALIZATION ENGINE
    ↓
JOIN / LOOKUP ENGINE
    ↓
BUSINESS RULE ENGINE (Age + Status + Location)
    ↓
CLASSIFICATION ENGINE
    ↓
INVENTORY DATASET
    ↓
SUMMARY / PIVOT ENGINE
    ↓
REPORT ENGINE
    ↓
EMAIL / EXPORT ENGINE
```

## Reusability

This system is **not** hard-coded for any specific business. To adapt it for a different organization:

1. Change **Data Sources** → point to their sheets
2. Change **Field Mapping** → map their column names
3. Change **Age/Status/Location Rules** → their business rules
4. Change **Report Config** → their report needs
5. Change **Email Config** → their recipients

**No code changes required.**

## Testing

Run `runAllTests()` from the Apps Script editor to verify core engines (10 tests covering normalization, extraction, age buckets, status mapping, duplicates, location rules, etc.).

## Assumptions

- Primary data source has a barcode/key column
- QC Stock and Location sheets are in the same spreadsheet (or accessible via Sheet ID)
- Google Sheets API permissions are granted
- Email sending requires MailApp permissions

## Functions Reference

| Function | Purpose |
|----------|---------|
| `setupAutomationSystem()` | One-time setup — creates all sheets, dropdowns, security |
| `runDailyProcess()` | Full pipeline: extract → join → rules → inventory → reports |
| `runReportsOnly()` | Generate reports from existing inventory data |
| `sendReportsByEmail()` | Email configured reports |
| `refreshPivot()` | Rebuild pivot summary |
| `setupDailyTrigger()` | Set 7 PM daily trigger |
| `processAICommand(text)` | Natural language command processing |
| `runAllTests()` | Run 10 unit tests |
| `lockAllSystemSheets()` | Re-apply all security policies |
## Multi-Source Import (Architecture v2)

This upgrade turns the system from single-source into a multi-source pipeline:
multiple sources (QC Stock, TRC, Inventory, Location, Other) ? source
classification ? consolidation into **SOURCE_DATA** (source identity preserved)
? conflict resolution (priority rules) ? one logical device record per barcode
in **INVENTORY**.

### New sheets (auto-created by \setupAutomationSystem()\)

| Sheet | Purpose |
|-------|---------|
| \SOURCE_DATA\ | Consolidated imported source rows (SOURCE_TYPE, SOURCE_ID, SOURCE_ROW, + standard fields) |
| \Data Conflicts\ | Audit log of conflicting field values (barcode, field, source A/B, final value, rule used) |
| \Source Priority Rules\ | Per-field priority order (e.g. STATUS: QC_STOCK > TRC > INVENTORY > LOCATION > OTHER) |
| \Source Import History\ | Per-source import result (run, source, rows, success/error, duration) |
| \Import Jobs\ | Job lifecycle (READY ? RUNNING ? COMPLETE / PARTIAL_FAILURE) with progress |

### How to use (Web UI)

1. Open **Multi-Source Import** (new nav item).
2. **+ Add Source** ? set the **Source Type** (QC_STOCK / TRC / INVENTORY / LOCATION / OTHER), a name, and the **sheet name** in this spreadsheet (or use an external Sheet ID in the API).
3. **Validate All** ? checks each source and required mapped columns.
4. **Import All** ? creates an import job, consolidates every source into SOURCE_DATA, resolves conflicts by priority, and builds one device record per barcode into INVENTORY.

### Field Mapping is now source-aware

The **Field Mapping** sheet's \Source\ column is the **source type** (e.g.
\QC_STOCK\). Map each source's own column names to the standard target fields
(BARCODE, MODEL, BRAND, STATUS, STOCK_AGE, LOCATION, BIN_BUCKET, ...). Different
sources can map different column names into the same target field.

### Migration (existing single-source setups)

- **Nothing is deleted.** Existing Data Sources, Field Mapping, Inventory, reports
  and triggers keep working.
- Re-run \setupAutomationSystem()\ once to create the five new sheets (it is
  idempotent � safe to re-run).
- For multi-source runs, add source types to Field Mapping and use the
  Multi-Source Import screen; single-source imports via the existing Import Data
  screen still work unchanged.

### API endpoints (added)

\sources.types\, \import.multiSource.validate\, \import.multiSource.create\,
\import.multiSource.run\, \import.multiSource.status\, \sourceData.list\,
\sourceData.history\, \conflicts.list\, \conflicts.clear\,
\priorityRules.list\, \priorityRules.save\.


---

## v1.1 Update (Oct 2026) - Login System + React Portal

New files: **code-auth.gs** (login/session system) and **App.html** (React portal).
Updated: **code-api.gs** (all API actions now require a login) and **code-ui.gs** (serves the portal; use ?ui=classic for the old UI).

See **docs/DEPLOY.md** for the current step-by-step deployment (it supersedes the setup steps above where they differ).
