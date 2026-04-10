# Nexgen Portfolio – Australian Tax Engine (Stateless)

> COS80029 Capstone Project CW1 · Swinburne University

Stateless, pure-function tax engine for Australian CGT and franking credit calculations.
Input JSON → Engine → Output JSON. No database. No side effects.

---

## Contents

1. [Architecture](#architecture)
2. [Quick Start](#quick-start)
3. [Input JSON Schema](#input-json-schema)
4. [Output JSON Schema](#output-json-schema)
5. [Terminology Glossary](#terminology-glossary)
6. [ATO Rules Reference](#ato-rules-reference)
7. [Parcel Matching Strategies](#parcel-matching-strategies)
8. [CGT Method Selection](#cgt-method-selection)
9. [Validation Errors](#validation-errors)

---

## Architecture

The engine is a three-stage stateless pipeline.
Each stage has a single responsibility and a clean interface.

```
┌─────────────────────┐
│   INPUT  (JSON)     │  Portfolio snapshot: parcels, disposals, dividends, config
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│   validate()        │  Schema + business-rule checks. Returns errors array.
└────────┬────────────┘
         │  valid?  No → return { status: "error", errors: [...] }
         ▼  Yes ↓
┌─────────────────────┐
│   calculate()       │  Parcel matching → CGT computation → FY aggregation → dividends
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│   OUTPUT (JSON)     │  CGT summary, per-event breakdown, dividends, remaining parcels
└─────────────────────┘
```

**File structure:**

```
nexgen-tax-stateless/
├── engine/
│   └── calculate.js          ← Single engine module (validate + calculate + run)
├── examples/
│   ├── example1_individual.json
│   └── example2_smsf.json
├── run.js                    ← CLI runner
└── README.md
```

**Public API (calculate.js):**

| Export        | Signature                        | Description                                          |
|---------------|----------------------------------|------------------------------------------------------|
| `run(input)`  | `object\|string → object`        | Full pipeline. Parse → validate → calculate.         |
| `validate(input)` | `object → { valid, errors? }` | Validation only (pre-flight check).                  |
| `calculate(input)` | `object → object`            | Calculation only (assumes validated input).          |

---

## Quick Start

**CLI:**
```bash
node run.js examples/example1_individual.json
node run.js examples/example1_individual.json output.json
```

**Node.js (programmatic):**
```js
const { run, validate } = require('./engine/calculate');
const fs = require('fs');

const input  = JSON.parse(fs.readFileSync('input.json', 'utf-8'));
const output = run(input);

if (output.status === 'error') {
  console.error(output.errors);
} else {
  console.log(output.cgt_summary);
}
```

---

## Input JSON Schema

The input is a single JSON object with four top-level keys.

```jsonc
{
  "config":    { ... },   // required – engine configuration
  "parcels":   [ ... ],   // required – share purchase parcels
  "disposals": [ ... ],   // required – sale events (can be empty array)
  "dividends": [ ... ]    // required – dividend receipts (can be empty array)
}
```

### `config` object

Controls how the engine runs. All fields are required.

| Field                              | Type     | Allowed Values                                    | Description                                                                    |
|------------------------------------|----------|---------------------------------------------------|--------------------------------------------------------------------------------|
| `entity_type`                      | string   | `"individual"` `"trust"` `"super"` `"company"`   | The taxpayer entity type. Determines the CGT discount rate.                    |
| `parcel_matching`                  | string   | `"fifo"` `"lifo"` `"minimise_tax"`               | Which parcels to consume first when a disposal occurs.                         |
| `cgt_method`                       | string   | `"auto"` `"discount"` `"indexation"` `"other"`   | How to compute the taxable gain. `"auto"` picks the best method per parcel.   |
| `financial_year`                   | string   | e.g. `"FY2024"`                                   | The ATO financial year to report on (1 Jul – 30 Jun). Format: `FY` + 4 digits.|
| `prior_year_carried_forward_loss`  | number   | ≥ 0                                               | Unrecouped capital losses from prior financial years (AUD).                    |

**Example:**
```json
"config": {
  "entity_type": "individual",
  "parcel_matching": "fifo",
  "cgt_method": "auto",
  "financial_year": "FY2024",
  "prior_year_carried_forward_loss": 0
}
```

---

### `parcels` array

Each element represents one lot of shares acquired on a specific date.
A disposal will consume one or more parcels depending on quantity and matching strategy.

| Field                | Type     | Required | Description                                                                                    |
|----------------------|----------|----------|------------------------------------------------------------------------------------------------|
| `parcel_id`          | string   | ✓        | Unique identifier for this parcel. Used in output to trace events back to their source parcel. |
| `symbol`             | string   | ✓        | ASX (or other exchange) ticker symbol. Case-insensitive; normalised to uppercase internally.   |
| `acquired_date`      | string   | ✓        | Date of acquisition. ISO 8601 format: `"YYYY-MM-DD"`.                                         |
| `quantity`           | number   | ✓        | Total number of units acquired. May be fractional (e.g. DRP shares).                          |
| `cost_base`          | number   | ✓        | Total acquisition cost in AUD. **Must include brokerage and stamp duty** (s.110-25 ITAA 1997).|
| `reduced_cost_base`  | number   | ✗        | The reduced cost base (s.110-55 ITAA 1997). Defaults to `cost_base` if omitted. Set lower than `cost_base` when a return of capital or other event has reduced it. Used only to calculate capital losses — not gains. |
| `notes`              | string   | ✗        | Free-text notes. Ignored by the engine; for human reference only.                              |

**Example:**
```json
{
  "parcel_id": "P001",
  "symbol": "CBA",
  "acquired_date": "2021-03-10",
  "quantity": 200,
  "cost_base": 14600,
  "reduced_cost_base": 14600
}
```

> **Cost base tip:** If you paid $14,580 for shares plus $20 brokerage, enter `cost_base: 14600`.
> The engine does not add brokerage separately — the number you enter is the total.

---

### `disposals` array

Each element represents one CGT Event A1 (share disposal / sale).

| Field            | Type     | Required | Description                                                                                           |
|------------------|----------|----------|-------------------------------------------------------------------------------------------------------|
| `disposal_id`    | string   | ✓        | Unique identifier for this disposal event.                                                            |
| `symbol`         | string   | ✓        | Ticker symbol of the shares sold. Must match a symbol present in `parcels`.                           |
| `disposal_date`  | string   | ✓        | Date of sale. ISO 8601 format: `"YYYY-MM-DD"`.                                                        |
| `quantity`       | number   | ✓        | Number of units sold. Must not exceed the total remaining balance for the symbol.                     |
| `gross_proceeds` | number   | ✓        | Total sale proceeds before deducting brokerage (AUD). This is the full amount the buyer paid you.    |
| `brokerage`      | number   | ✗        | Brokerage paid on the sale (AUD). Deducted from `gross_proceeds` to get net capital proceeds. Defaults to `0`. |
| `notes`          | string   | ✗        | Free-text notes. Ignored by the engine.                                                               |

**Net capital proceeds** used in CGT calculation = `gross_proceeds − brokerage`.

**Example:**
```json
{
  "disposal_id": "S001",
  "symbol": "CBA",
  "disposal_date": "2023-09-12",
  "quantity": 100,
  "gross_proceeds": 8200,
  "brokerage": 20
}
```

---

### `dividends` array

Each element represents a dividend payment received. Dividends in a different financial year
to `config.financial_year` are stored internally but excluded from the FY output.

| Field               | Type     | Required | Description                                                                                                        |
|---------------------|----------|----------|--------------------------------------------------------------------------------------------------------------------|
| `dividend_id`       | string   | ✓        | Unique identifier.                                                                                                 |
| `symbol`            | string   | ✓        | Ticker symbol of the paying company.                                                                               |
| `payment_date`      | string   | ✓        | Date the dividend was paid / credited. ISO 8601 format.                                                            |
| `cash_amount`       | number   | ✓        | Cash dividend received (AUD). This is the amount deposited to your account.                                        |
| `franking_percent`  | number   | ✗        | Percentage of the dividend that is franked (0–100). Used to auto-calculate franking credits if `franking_credits` is not provided. |
| `franking_credits`  | number   | ✗        | Franking credits in AUD, taken directly from the dividend statement. **If provided, overrides the `franking_percent` calculation.** |
| `notes`             | string   | ✗        | Free-text notes. Ignored by the engine.                                                                            |

**Franking credit resolution priority:**
1. If `franking_credits` is provided → use it directly.
2. Else if `franking_percent` is provided → calculate: `cash × (pct/100) × (0.30/0.70)`.
3. Else → franking credits = 0 (unfranked).

**Example:**
```json
{
  "dividend_id": "D001",
  "symbol": "CBA",
  "payment_date": "2023-09-28",
  "cash_amount": 840,
  "franking_percent": 100
}
```

---

## Output JSON Schema

The output is a single JSON object. All monetary values are in AUD, rounded to 2 decimal places.

```jsonc
{
  "status": "ok",           // "ok" or "error"
  "meta": { ... },          // Engine metadata
  "cgt_summary": { ... },   // Aggregated CGT figures for the FY
  "dividend_summary": { ... }, // Aggregated dividend / franking figures
  "cgt_events": [ ... ],    // Per-parcel CGT event breakdown
  "dividend_events": [ ... ], // Per-dividend processed records
  "remaining_parcels": [ ... ], // Parcel balances after all disposals
  "method_breakdown": { ... }, // CGT method statistics
  "disposal_errors": [ ... ]   // Any disposals that could not be processed
}
```

### `meta` object

| Field                | Type   | Description                                          |
|----------------------|--------|------------------------------------------------------|
| `engine_version`     | string | Semantic version of the engine that produced this output. |
| `calculated_at`      | string | ISO 8601 UTC timestamp of when the calculation ran.  |
| `financial_year`     | string | The FY from the input config (e.g. `"FY2024"`).      |
| `entity_type`        | string | Entity type from input config.                       |
| `parcel_matching`    | string | Matching strategy from input config.                 |
| `cgt_method_config`  | string | CGT method setting from input config.                |

---

### `cgt_summary` object

ATO Schedule 3 aggregates for the financial year.

| Field                                       | Type   | Description                                                                                            |
|---------------------------------------------|--------|--------------------------------------------------------------------------------------------------------|
| `total_gross_gains`                         | number | Sum of raw gains (before discount/indexation) across all non-loss CGT events in the FY.              |
| `total_cgt_discount_applied`                | number | Total discount amount subtracted from gross gains (50% or 33.33% depending on entity).               |
| `total_net_gains_after_discount`            | number | `total_gross_gains − total_cgt_discount_applied`. Net gains to carry into the loss-offset calculation.|
| `total_capital_losses`                      | number | Sum of capital losses across all loss events in the FY.                                               |
| `prior_year_carried_forward_loss_applied`   | number | Amount of the input `prior_year_carried_forward_loss` that was consumed against current FY net gains. |
| `net_capital_gain`                          | number | **The taxable net capital gain.** Report this at Item 18 of the ATO Individual Tax Return. 0 if losses exceed gains. |
| `new_carried_forward_loss`                  | number | Capital losses to carry forward to the next financial year. 0 if there is a net capital gain.        |

---

### `dividend_summary` object

| Field                      | Type   | Description                                                                |
|----------------------------|--------|----------------------------------------------------------------------------|
| `total_cash_dividends`     | number | Sum of all cash dividends received in the FY.                              |
| `total_franking_credits`   | number | Sum of all franking credits attached to FY dividends. Report as a tax offset (Item T8/T9 in the ITR). |
| `total_grossed_up_income`  | number | `total_cash_dividends + total_franking_credits`. Include this at Item 11 of the ITR. |

---

### `cgt_events` array

One record per matched parcel portion per disposal. A single disposal may produce
multiple CGT events if it spans multiple parcels.
**Only includes events where the disposal date falls in `config.financial_year`.**

| Field               | Type    | Description                                                                                          |
|---------------------|---------|------------------------------------------------------------------------------------------------------|
| `parcel_id`         | string  | The source parcel that was consumed.                                                                 |
| `disposal_id`       | string  | The disposal event that triggered this CGT calculation.                                              |
| `symbol`            | string  | Ticker symbol (uppercase).                                                                           |
| `acquired_date`     | string  | Acquisition date of the source parcel.                                                               |
| `disposal_date`     | string  | Disposal date.                                                                                       |
| `holding_days`      | number  | Number of full days between acquisition and disposal. Used to determine discount eligibility.        |
| `units_disposed`    | number  | Units consumed from this parcel in this CGT event.                                                   |
| `cost_base`         | number  | Proportional cost base for the disposed units (AUD).                                                 |
| `indexed_cost_base` | number  | Cost base after CPI indexation (AUD). Equal to `cost_base` when indexation method is not applied.   |
| `proceeds`          | number  | Proportional net capital proceeds for these units (AUD).                                             |
| `raw_gain`          | number  | `proceeds − cost_base`. Negative if a capital loss.                                                  |
| `cgt_method`        | string  | Method applied: `"discount"` `"indexation"` `"other"` `"loss"`.                                      |
| `discount_rate`     | number  | Discount rate used (e.g. `0.5` for 50%). `0` if no discount or a loss.                              |
| `discount_applied`  | number  | AUD amount removed from the gain by the CGT discount. `0` for losses or non-discount events.        |
| `net_gain`          | number  | Taxable capital gain after method applied. `0` for loss events.                                      |
| `capital_loss`      | number  | Capital loss amount (AUD). `0` for gain events. Calculated against `reduced_cost_base`.             |
| `is_loss`           | boolean | `true` if this event is a capital loss; `false` if a gain.                                           |

---

### `dividend_events` array

One record per dividend that falls within `config.financial_year`.

| Field                  | Type   | Description                                              |
|------------------------|--------|----------------------------------------------------------|
| `dividend_id`          | string | From input.                                              |
| `symbol`               | string | Uppercase ticker.                                        |
| `payment_date`         | string | Payment date.                                            |
| `cash_amount`          | number | Cash received (AUD).                                     |
| `franking_percent`     | number | Effective franking percentage (0–100).                   |
| `franking_credits`     | number | Resolved franking credits (AUD).                         |
| `grossed_up_dividend`  | number | `cash_amount + franking_credits`.                        |

---

### `remaining_parcels` array

Parcel balances after all disposals have been applied.
Only parcels with `remaining_quantity > 0` are included.

| Field                  | Type   | Description                                                     |
|------------------------|--------|-----------------------------------------------------------------|
| `parcel_id`            | string | Parcel identifier.                                              |
| `symbol`               | string | Ticker.                                                         |
| `acquired_date`        | string | Original acquisition date.                                      |
| `original_quantity`    | number | Quantity at the time of the original purchase.                  |
| `remaining_quantity`   | number | Units not yet disposed of.                                      |
| `remaining_cost_base`  | number | Proportional cost base for the remaining units (AUD).           |
| `unit_cost_base`       | number | Cost base per unit (AUD). `cost_base / original_quantity`.      |

---

### `method_breakdown` object

Keyed by CGT method (`"discount"`, `"indexation"`, `"other"`, `"loss"`).
Summarises the aggregate impact of each method across the FY.

```json
"method_breakdown": {
  "discount": {
    "event_count": 2,
    "total_net_gain": 900.00,
    "total_capital_loss": 0.00,
    "total_discount_applied": 900.00
  },
  "loss": {
    "event_count": 2,
    "total_net_gain": 0.00,
    "total_capital_loss": 337.00,
    "total_discount_applied": 0.00
  }
}
```

---

### `disposal_errors` array

If a disposal could not be processed (e.g. no parcels for the symbol, or insufficient balance),
it is recorded here instead of raising a fatal error. The engine continues processing the remaining disposals.

| Field         | Type   | Description                           |
|---------------|--------|---------------------------------------|
| `disposal_id` | string | The disposal that failed.             |
| `error`       | string | Human-readable description of why.   |

---

### Error response

If `status` is `"error"`, the output contains only:

```json
{
  "status": "error",
  "meta": { "engine_version": "1.0.0", "calculated_at": "..." },
  "errors": [
    "config.entity_type: must be \"individual\", \"trust\", \"super\", or \"company\".",
    "parcels[0].cost_base: must be a non-negative number."
  ]
}
```

---

## Terminology Glossary

### Core Tax Terms

**CGT (Capital Gains Tax)**
A tax on the profit made from selling an asset. In Australia, the gain is included in
assessable income and taxed at the taxpayer's marginal rate, potentially reduced by a discount or indexation.

**Capital Gain**
The amount by which the net capital proceeds from a disposal exceed the cost base of the asset.
Formula: `capital gain = proceeds − cost base`.
Reference: s.100-45 ITAA 1997.

**Capital Loss**
The amount by which the reduced cost base of an asset exceeds the net capital proceeds.
Formula: `capital loss = reduced cost base − proceeds`.
Capital losses cannot be offset against ordinary income — they can only reduce capital gains.
Reference: s.100-45 ITAA 1997.

**Net Capital Gain**
The taxable amount after applying the CGT method (discount or indexation), subtracting
current-year capital losses, and applying any carried-forward losses.
This is the amount included in assessable income (Item 18, ITR).
Reference: s.102-5 ITAA 1997.

**Carried-Forward Loss**
Capital losses that exceed capital gains in a given year are not lost — they are carried
forward indefinitely and applied against net capital gains in future years.

**CGT Event A1**
The most common CGT event: occurs when a CGT asset (e.g. shares) is disposed of.
The CGT event date is the date of the contract (disposal date).
Reference: s.104-10 ITAA 1997.

**Financial Year (FY)**
The Australian tax year runs from 1 July to 30 June. "FY2024" means
1 July 2023 to 30 June 2024.

---

### Cost Base Terms

**Cost Base**
The total acquisition cost of an asset, including the price paid plus incidental costs
(brokerage, stamp duty, legal fees). Used to compute capital gains.
The engine requires you to enter the all-in total — do not separate brokerage.
Reference: s.110-25 ITAA 1997.

**Reduced Cost Base**
A modified cost base used only when calculating capital losses. It may be lower than
the cost base if certain tax-deferred distributions or deductible amounts have been received.
If not provided, defaults to the cost base.
Reference: s.110-55 ITAA 1997.

**Unit Cost Base**
The cost base per share: `total cost base ÷ quantity`. Used in display and debugging;
not a separate input.

**Indexed Cost Base**
The cost base after adjustment for inflation using the CPI indexation method.
Only available for assets acquired before 21 September 1999.
The CPI multiplier is capped at the September 1999 quarter (index 114.7).
Formula: `indexed cost base = cost base × (CPI at disposal ÷ CPI at acquisition)`.
Reference: s.114-1 ITAA 1997.

---

### CGT Methods

**CGT Discount Method**
Reduces a capital gain by a fixed percentage before it enters assessable income.
Available when the asset has been held for at least 12 months and was acquired
after 21 September 1999.
- Individuals and trusts: 50%
- SMSFs and complying super funds: 33.33%
- Companies: not eligible (0%)
Reference: s.115-A ITAA 1997.

**Indexation Method**
Adjusts the cost base for CPI inflation, reducing the nominal gain.
Only available for assets acquired before 21 September 1999. The CPI is frozen at
the September 1999 quarter regardless of the actual disposal date.
Super funds (SMSFs) cannot use this method.
Reference: s.114-1 ITAA 1997.

**Other (No Method)**
The full raw gain is taxable. Applies when: the asset was held less than 12 months,
the entity is a company, or neither discount nor indexation conditions are met.

**Auto Method**
When `cgt_method` is set to `"auto"`, the engine evaluates every eligible method
for each parcel and selects the one that produces the **lower taxable gain**.
This is the recommended setting.

---

### Parcel Matching Terms

**Parcel**
A discrete lot of shares with a single acquisition date and cost base.
Buying 100 shares of CBA on three different dates creates three separate parcels.
Parcels are consumed in a defined order when a disposal occurs.

**FIFO (First In, First Out)**
The oldest parcels (by acquisition date) are disposed of first.
Favours use of the CGT discount, since older parcels are more likely to have been
held for more than 12 months.

**LIFO (Last In, First Out)**
The most recently acquired parcels are disposed of first.
Can be useful when recent parcels have a higher cost base (reducing the gain).

**Minimise Tax**
The engine ranks parcels by descending unit cost base (highest cost first), then
by discount eligibility, then by FIFO as a tiebreaker.
Goal: maximise the cost base deducted, minimising the taxable gain.

---

### Dividend and Franking Terms

**Dividend**
A distribution of company profits paid to shareholders. In Australia, dividends may
carry imputation (franking) credits.

**Franking Credit (Imputation Credit)**
A tax credit attached to a dividend, representing company tax already paid on the
underlying profits. Shareholders include franking credits as income but receive a
corresponding tax offset, avoiding double taxation.
Reference: Division 207 ITAA 1997.

**Franking Percent**
The percentage of a dividend that is franked (0–100%). A "fully franked" dividend
is 100% franked. The company tax rate in Australia is 30%.

**Grossed-Up Dividend**
The dividend amount a shareholder must include in their assessable income, grossing up
the cash amount to reflect the pre-tax profit.
Formula: `grossed-up dividend = cash dividend + franking credits`.
Reference: s.207-20 ITAA 1997.

**Franking Credit Offset**
The franking credits are applied as a tax offset against the taxpayer's total tax liability.
If the credits exceed the tax payable, the ATO refunds the excess in cash.

---

### Entity Types

**Individual**
A natural person. Eligible for 50% CGT discount on assets held > 12 months.
Most common entity type for retail investors.

**Trust**
A discretionary or unit trust. Eligible for 50% CGT discount when gains are
distributed to individual beneficiaries.

**SMSF (Self-Managed Super Fund) / Super**
A complying superannuation fund. Eligible for 33.33% CGT discount (not 50%).
Cannot use the indexation method (only discount or other applies).

**Company**
Not eligible for the CGT discount (0%). Capital gains are taxed at the corporate tax rate
of 30% on the full gain. Franking credits can still be used to offset corporate tax.

---

## ATO Rules Reference

| Rule                             | ITAA 1997 Reference | Description                                            |
|----------------------------------|---------------------|--------------------------------------------------------|
| CGT gain/loss definition         | s.100-45            | How capital gains and losses are calculated            |
| Net capital gain calculation     | s.102-5             | Gains minus losses, including carry-forward            |
| CGT Event A1 (share disposal)    | s.104-10            | Definition and date of the most common CGT event       |
| Cost base elements               | s.110-25            | What can be included in the cost base                  |
| Reduced cost base                | s.110-55            | Reduced cost base for capital loss calculations        |
| Indexation method                | s.114-1             | CPI adjustment to cost base (frozen Sep 1999)          |
| CGT discount                     | s.115-A             | 50%/33.33% reduction for qualifying assets             |
| Franking credits (imputation)    | Division 207        | Tax offset for company tax already paid on dividends   |
| Grossed-up dividend income       | s.207-20            | Assessable amount = cash + franking credits            |

---

## Parcel Matching Strategies

The chosen strategy is applied **per disposal event** across available parcels
for the disposal's symbol. Parcels are ranked, then consumed greedily until
the disposal quantity is satisfied.

| Strategy       | Ranking                                           | Best for                                     |
|----------------|---------------------------------------------------|----------------------------------------------|
| `fifo`         | Oldest acquired_date first                        | Maximising CGT discount eligibility          |
| `lifo`         | Newest acquired_date first                        | Using recent high-cost parcels               |
| `minimise_tax` | Highest unit cost base first, then discount-eligible, then FIFO | Minimising taxable gain   |

The ATO does not mandate a specific matching method for listed shares. You may choose
the method that produces the best outcome, subject to your tax agent's advice.

---

## CGT Method Selection

| Config value    | Behaviour                                                                                               |
|-----------------|---------------------------------------------------------------------------------------------------------|
| `"auto"`        | For each parcel portion, evaluates all eligible methods and selects the one with the lower taxable gain.|
| `"discount"`    | Applies the CGT discount where eligible; falls back to `"other"` if conditions are not met.            |
| `"indexation"`  | Applies indexation where eligible; falls back to `"other"` if conditions are not met.                  |
| `"other"`       | Always uses the raw gain with no discount or indexation.                                               |

**Recommended:** Use `"auto"` for production. It produces the most tax-effective result
without requiring knowledge of each parcel's acquisition history.

---

## Validation Errors

The engine validates all inputs before any calculation. Common errors:

| Error message (excerpt)                            | Cause                                                        |
|----------------------------------------------------|--------------------------------------------------------------|
| `config.entity_type: must be "individual"...`      | Invalid or missing entity type.                              |
| `config.financial_year: must be a string like...`  | FY must match `FY` + 4 digits, e.g. `"FY2024"`.             |
| `parcels[0].cost_base: must be a non-negative...`  | Cost base is missing, negative, or not a number.             |
| `parcels: duplicate parcel_id(s): P001`            | Two parcels share the same ID.                               |
| `disposals[2].disposal_date: required valid date`  | Date string cannot be parsed.                                |
| `dividends[0].franking_percent: must be 0–100`     | Franking percentage out of range.                            |

Validation errors are returned as an array in `output.errors` with `status: "error"`.
No calculation is performed when validation fails.

---

## Disclaimer

This engine is provided for educational and informational purposes as part of the
Swinburne ICT Capstone project. Tax calculations should be verified by a registered
tax agent (RTA) before lodging a tax return. Tax law is subject to change; this engine
implements rules applicable as at FY2024.
