/**
 * @fileoverview Nexgen Portfolio – Stateless Australian Tax Engine
 * @module engine/calculate
 *
 * Pure stateless pipeline:
 *   Input JSON  →  validate()  →  calculate()  →  Output JSON
 *
 * No side effects. No persistent state. Same input always produces same output.
 *
 * ATO References:
 *   s.100-45   ITAA 1997 – CGT gain/loss definition
 *   s.102-5    ITAA 1997 – Net capital gain / capital loss carry-forward
 *   s.104-10   ITAA 1997 – CGT Event A1 (disposal of shares)
 *   s.110-25   ITAA 1997 – Cost base elements
 *   s.110-55   ITAA 1997 – Reduced cost base
 *   s.114-1    ITAA 1997 – Indexation method (frozen Sep 1999)
 *   s.115-A    ITAA 1997 – CGT discount
 *   Division 207 ITAA 1997 – Franking credits / dividend imputation
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ATO CPI Index Numbers for indexation method.
 * Frozen at Sep 1999 quarter per s.114-1 ITAA 1997.
 * Key format: "YYYY-Qn"  (Q1=Mar, Q2=Jun, Q3=Sep, Q4=Dec)
 */
const CPI_TABLE = {
  '1985-Q3': 71.3,  '1985-Q4': 72.7,
  '1986-Q1': 74.4,  '1986-Q2': 75.6,  '1986-Q3': 77.0,  '1986-Q4': 78.4,
  '1987-Q1': 79.8,  '1987-Q2': 80.9,  '1987-Q3': 81.8,  '1987-Q4': 83.0,
  '1988-Q1': 84.0,  '1988-Q2': 85.5,  '1988-Q3': 87.1,  '1988-Q4': 88.5,
  '1989-Q1': 90.2,  '1989-Q2': 92.0,  '1989-Q3': 93.6,  '1989-Q4': 95.2,
  '1990-Q1': 97.2,  '1990-Q2': 98.8,  '1990-Q3': 99.7,  '1990-Q4': 100.9,
  '1991-Q1': 102.0, '1991-Q2': 102.2, '1991-Q3': 102.7, '1991-Q4': 103.4,
  '1992-Q1': 103.5, '1992-Q2': 103.5, '1992-Q3': 103.6, '1992-Q4': 103.8,
  '1993-Q1': 104.3, '1993-Q2': 104.5, '1993-Q3': 105.2, '1993-Q4': 105.5,
  '1994-Q1': 105.7, '1994-Q2': 106.2, '1994-Q3': 106.9, '1994-Q4': 107.5,
  '1995-Q1': 108.9, '1995-Q2': 110.0, '1995-Q3': 110.5, '1995-Q4': 111.3,
  '1996-Q1': 111.9, '1996-Q2': 112.1, '1996-Q3': 112.0, '1996-Q4': 112.4,
  '1997-Q1': 112.4, '1997-Q2': 112.1, '1997-Q3': 111.9, '1997-Q4': 111.7,
  '1998-Q1': 111.8, '1998-Q2': 112.0, '1998-Q3': 112.3, '1998-Q4': 112.7,
  '1999-Q1': 113.2, '1999-Q2': 113.7, '1999-Q3': 114.7,
};

const CPI_CAP_QUARTER      = '1999-Q3';
const INDEXATION_CUTOFF    = new Date('1999-09-21T00:00:00.000Z');
const CGT_DISCOUNT_MIN_DAYS = 365;
const COMPANY_TAX_RATE     = 0.30;

/** CGT discount rates by entity type (s.115-A ITAA 1997). */
const DISCOUNT_RATES = {
  individual: 0.50,
  trust:      0.50,
  super:      0.3333,
  company:    0.00,
};

/** Financial year start month (July = 7). */
const FY_START_MONTH = 7;

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────

/** Round to 2 decimal places (currency precision). */
const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;

/** Parse any date input to a Date object. */
const toDate = d => {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) throw new Error(`Invalid date: ${d}`);
  return dt;
};

/** Full days between two dates. */
const daysBetween = (a, b) =>
  Math.floor((toDate(b) - toDate(a)) / 86_400_000);

/**
 * Convert a date to an ATO CPI quarter key.
 * Quarter boundaries: Jan–Mar = Q1, Apr–Jun = Q2, Jul–Sep = Q3, Oct–Dec = Q4.
 */
const toCpiQuarter = d => {
  const dt = toDate(d);
  const m  = dt.getUTCMonth() + 1;
  const y  = dt.getUTCFullYear();
  const q  = m <= 3 ? 'Q1' : m <= 6 ? 'Q2' : m <= 9 ? 'Q3' : 'Q4';
  return `${y}-${q}`;
};

/**
 * Get CPI value for a quarter (capped at Sep 1999).
 * @throws {Error} if quarter predates CPI records.
 */
const getCpi = quarter => {
  const q = quarter > CPI_CAP_QUARTER ? CPI_CAP_QUARTER : quarter;
  const v = CPI_TABLE[q];
  if (v === undefined)
    throw new Error(`CPI data unavailable for ${quarter}. Indexation requires acquisition after Sep 1985.`);
  return v;
};

/** Financial year label for a date, e.g. 2024-02-01 → "FY2024". */
const toFY = d => {
  const dt = toDate(d);
  const m  = dt.getUTCMonth() + 1;
  const y  = dt.getUTCFullYear();
  return m >= FY_START_MONTH ? `FY${y + 1}` : `FY${y}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates the input JSON object.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 *
 * @param {object} input
 * @returns {{ valid: boolean, errors?: string[] }}
 */
function validate(input) {
  const errors = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be a JSON object.'] };
  }

  // ── config ──
  const cfg = input.config;
  if (!cfg || typeof cfg !== 'object') {
    errors.push('config: required object.');
  } else {
    if (!['individual', 'trust', 'super', 'company'].includes(cfg.entity_type)) {
      errors.push('config.entity_type: must be "individual", "trust", "super", or "company".');
    }
    if (!['fifo', 'lifo', 'minimise_tax'].includes(cfg.parcel_matching)) {
      errors.push('config.parcel_matching: must be "fifo", "lifo", or "minimise_tax".');
    }
    if (!['auto', 'discount', 'indexation', 'other'].includes(cfg.cgt_method)) {
      errors.push('config.cgt_method: must be "auto", "discount", "indexation", or "other".');
    }
    if (typeof cfg.financial_year !== 'string' || !/^FY\d{4}$/.test(cfg.financial_year)) {
      errors.push('config.financial_year: must be a string like "FY2024".');
    }
    if (typeof cfg.prior_year_carried_forward_loss !== 'number' || cfg.prior_year_carried_forward_loss < 0) {
      errors.push('config.prior_year_carried_forward_loss: must be a non-negative number.');
    }
  }

  // ── parcels ──
  if (!Array.isArray(input.parcels)) {
    errors.push('parcels: must be an array.');
  } else {
    input.parcels.forEach((p, i) => {
      const pre = `parcels[${i}]`;
      if (!p.parcel_id)          errors.push(`${pre}.parcel_id: required string.`);
      if (!p.symbol)             errors.push(`${pre}.symbol: required string.`);
      if (!p.acquired_date || isNaN(new Date(p.acquired_date)))
                                  errors.push(`${pre}.acquired_date: required valid date string.`);
      if (typeof p.quantity !== 'number' || p.quantity <= 0)
                                  errors.push(`${pre}.quantity: must be a positive number.`);
      if (typeof p.cost_base !== 'number' || p.cost_base < 0)
                                  errors.push(`${pre}.cost_base: must be a non-negative number.`);
      if (p.reduced_cost_base !== undefined &&
          (typeof p.reduced_cost_base !== 'number' || p.reduced_cost_base < 0))
                                  errors.push(`${pre}.reduced_cost_base: must be a non-negative number if provided.`);
    });

    // Check for duplicate parcel IDs
    const ids = input.parcels.map(p => p.parcel_id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length) errors.push(`parcels: duplicate parcel_id(s): ${[...new Set(dupes)].join(', ')}.`);
  }

  // ── disposals ──
  if (!Array.isArray(input.disposals)) {
    errors.push('disposals: must be an array.');
  } else {
    input.disposals.forEach((d, i) => {
      const pre = `disposals[${i}]`;
      if (!d.disposal_id)          errors.push(`${pre}.disposal_id: required string.`);
      if (!d.symbol)               errors.push(`${pre}.symbol: required string.`);
      if (!d.disposal_date || isNaN(new Date(d.disposal_date)))
                                    errors.push(`${pre}.disposal_date: required valid date string.`);
      if (typeof d.quantity !== 'number' || d.quantity <= 0)
                                    errors.push(`${pre}.quantity: must be a positive number.`);
      if (typeof d.gross_proceeds !== 'number' || d.gross_proceeds < 0)
                                    errors.push(`${pre}.gross_proceeds: must be a non-negative number.`);
      if (d.brokerage !== undefined &&
          (typeof d.brokerage !== 'number' || d.brokerage < 0))
                                    errors.push(`${pre}.brokerage: must be a non-negative number if provided.`);
    });
  }

  // ── dividends ──
  if (!Array.isArray(input.dividends)) {
    errors.push('dividends: must be an array.');
  } else {
    input.dividends.forEach((d, i) => {
      const pre = `dividends[${i}]`;
      if (!d.dividend_id)            errors.push(`${pre}.dividend_id: required string.`);
      if (!d.symbol)                 errors.push(`${pre}.symbol: required string.`);
      if (!d.payment_date || isNaN(new Date(d.payment_date)))
                                      errors.push(`${pre}.payment_date: required valid date string.`);
      if (typeof d.cash_amount !== 'number' || d.cash_amount < 0)
                                      errors.push(`${pre}.cash_amount: must be a non-negative number.`);
      if (d.franking_percent !== undefined) {
        if (typeof d.franking_percent !== 'number' || d.franking_percent < 0 || d.franking_percent > 100)
          errors.push(`${pre}.franking_percent: must be a number between 0 and 100.`);
      }
      if (d.franking_credits !== undefined &&
          (typeof d.franking_credits !== 'number' || d.franking_credits < 0))
                                      errors.push(`${pre}.franking_credits: must be a non-negative number if provided.`);
    });
  }

  return errors.length ? { valid: false, errors } : { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Parcel matching strategies
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Match parcels against a disposal quantity using the configured strategy.
 * Returns an array of match objects without mutating the original parcels.
 *
 * @param {object[]} availableParcels - Parcels with remaining > 0 for the symbol.
 * @param {number}   quantityNeeded
 * @param {string}   strategy        - "fifo" | "lifo" | "minimise_tax"
 * @param {string}   disposalDate    - ISO date, used by minimise_tax for discount eligibility.
 * @returns {{ parcel: object, units_used: number, cost_base_used: number }[]}
 * @throws {Error} if insufficient balance.
 */
function matchParcels(availableParcels, quantityNeeded, strategy, disposalDate) {
  let sorted;

  if (strategy === 'lifo') {
    sorted = [...availableParcels].sort(
      (a, b) => toDate(b.acquired_date) - toDate(a.acquired_date)
    );
  } else if (strategy === 'minimise_tax') {
    // Priority: highest unit cost base first (maximises cost deduction → smallest gain)
    // Tiebreak: discount-eligible (>12 month hold) first, then FIFO
    sorted = [...availableParcels].sort((a, b) => {
      const aCpu = a.cost_base / a.quantity;
      const bCpu = b.cost_base / b.quantity;
      if (Math.abs(bCpu - aCpu) > 0.0001) return bCpu - aCpu;
      const aDisc = daysBetween(a.acquired_date, disposalDate) >= CGT_DISCOUNT_MIN_DAYS;
      const bDisc = daysBetween(b.acquired_date, disposalDate) >= CGT_DISCOUNT_MIN_DAYS;
      if (aDisc !== bDisc) return bDisc ? 1 : -1;
      return toDate(a.acquired_date) - toDate(b.acquired_date);
    });
  } else {
    // fifo (default)
    sorted = [...availableParcels].sort(
      (a, b) => toDate(a.acquired_date) - toDate(b.acquired_date)
    );
  }

  const matches = [];
  let remaining = quantityNeeded;

  for (const parcel of sorted) {
    if (remaining <= 0) break;
    const units_used     = Math.min(parcel._remaining, remaining);
    const proportion     = units_used / parcel.quantity;
    const cost_base_used = r2(parcel.cost_base * proportion);
    matches.push({ parcel, units_used, cost_base_used });
    remaining -= units_used;
  }

  if (remaining > 0.0001) {
    throw new Error(
      `Insufficient parcel balance for ${availableParcels[0]?.symbol}: ` +
      `needed ${quantityNeeded}, available ${quantityNeeded - remaining}.`
    );
  }

  return matches;
}

// ─────────────────────────────────────────────────────────────────────────────
// CGT calculation for a single matched parcel portion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute CGT for one matched parcel portion against one disposal.
 *
 * @param {object} match         - { parcel, units_used, cost_base_used }
 * @param {string} disposalDate  - ISO date string
 * @param {number} netProceeds   - Total net proceeds for the disposal
 * @param {number} totalQty      - Total units in the disposal event
 * @param {string} entityType    - "individual" | "trust" | "super" | "company"
 * @param {string} cgtMethod     - "auto" | "discount" | "indexation" | "other"
 * @returns {object} CGT event record
 */
function computeCgtEvent(match, disposalDate, netProceeds, totalQty, entityType, cgtMethod) {
  const { parcel, units_used, cost_base_used } = match;
  const discountRate = DISCOUNT_RATES[entityType] ?? 0;
  const holdingDays  = daysBetween(parcel.acquired_date, disposalDate);

  // Proportional proceeds for this parcel portion
  const proceeds  = r2(netProceeds * (units_used / totalQty));
  const raw_gain  = r2(proceeds - cost_base_used);
  const is_loss   = raw_gain < 0;

  let method           = 'other';
  let discount_applied = 0;
  let indexed_cost_base = cost_base_used;
  let net_gain         = 0;
  let capital_loss     = 0;

  if (is_loss) {
    // Capital loss uses reduced cost base (s.110-55 ITAA 1997)
    const rcb_proportion = units_used / parcel.quantity;
    const rcb_used       = r2(parcel.reduced_cost_base * rcb_proportion);
    capital_loss         = r2(Math.max(0, rcb_used - proceeds));
    method               = 'loss';
    net_gain             = 0;
  } else {
    const discount_eligible =
      holdingDays >= CGT_DISCOUNT_MIN_DAYS && discountRate > 0;
    const indexation_eligible =
      toDate(parcel.acquired_date) < INDEXATION_CUTOFF &&
      entityType !== 'super'; // super funds cannot use indexation

    // Determine method
    let resolved = cgtMethod;
    if (cgtMethod === 'auto') {
      if (indexation_eligible && discount_eligible) {
        // Compute both; pick the lower taxable gain
        const idx_cost = _indexedCost(parcel, cost_base_used, disposalDate);
        const idx_gain  = r2(Math.max(0, proceeds - idx_cost));
        const disc_gain = r2(raw_gain * (1 - discountRate));
        resolved = idx_gain <= disc_gain ? 'indexation' : 'discount';
      } else if (indexation_eligible) {
        resolved = 'indexation';
      } else if (discount_eligible) {
        resolved = 'discount';
      } else {
        resolved = 'other';
      }
    }

    if (resolved === 'indexation' && indexation_eligible) {
      indexed_cost_base = _indexedCost(parcel, cost_base_used, disposalDate);
      net_gain          = r2(Math.max(0, proceeds - indexed_cost_base));
      method            = 'indexation';
    } else if (resolved === 'discount' && discount_eligible) {
      discount_applied  = r2(raw_gain * discountRate);
      net_gain          = r2(raw_gain - discount_applied);
      method            = 'discount';
    } else {
      net_gain = raw_gain;
      method   = 'other';
    }
  }

  return {
    parcel_id:          parcel.parcel_id,
    disposal_id:        null, // filled by caller
    symbol:             parcel.symbol,
    acquired_date:      parcel.acquired_date,
    disposal_date:      disposalDate,
    holding_days:       holdingDays,
    units_disposed:     units_used,
    cost_base:          cost_base_used,
    indexed_cost_base:  r2(indexed_cost_base),
    proceeds,
    raw_gain,
    cgt_method:         method,
    discount_rate:      is_loss ? 0 : discountRate,
    discount_applied:   r2(discount_applied),
    net_gain:           r2(net_gain),
    capital_loss:       r2(capital_loss),
    is_loss,
  };
}

/**
 * Internal: compute the indexed cost base for a parcel portion.
 * @private
 */
function _indexedCost(parcel, costBaseUsed, disposalDate) {
  try {
    const acqQ = toCpiQuarter(parcel.acquired_date);
    const disQ = toCpiQuarter(disposalDate);
    const cpiA = getCpi(acqQ);
    const cpiD = getCpi(disQ); // already capped inside getCpi
    return r2(costBaseUsed * (cpiD / cpiA));
  } catch {
    return costBaseUsed; // fall back to no indexation
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Franking credit helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive franking credits for a dividend event.
 * If franking_credits is explicitly provided in the input, use it directly.
 * Otherwise calculate from franking_percent.
 * Formula: credits = cash × (franking% / 100) × (tax_rate / (1 − tax_rate))
 */
function resolveFrankingCredits(dividend) {
  if (typeof dividend.franking_credits === 'number') {
    return r2(dividend.franking_credits);
  }
  const pct = dividend.franking_percent ?? 0;
  return r2(dividend.cash_amount * (pct / 100) * (COMPANY_TAX_RATE / (1 - COMPANY_TAX_RATE)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main calculate() function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full tax calculation pipeline on a validated input object.
 *
 * @param {object} input - Validated input JSON (see README for schema).
 * @returns {object}     - Output JSON (see README for schema).
 */
function calculate(input) {
  const { config, parcels, disposals, dividends } = input;
  const { entity_type, parcel_matching, cgt_method, financial_year, prior_year_carried_forward_loss } = config;

  // ── 1. Build working parcel pool (deep clone + add _remaining) ──
  const parcelPool = parcels.map(p => ({
    ...p,
    reduced_cost_base: p.reduced_cost_base ?? p.cost_base,
    _remaining: p.quantity,
  }));

  const parcelIndex = {}; // symbol → parcel[]
  for (const p of parcelPool) {
    if (!parcelIndex[p.symbol]) parcelIndex[p.symbol] = [];
    parcelIndex[p.symbol].push(p);
  }

  // ── 2. Process disposals in chronological order ──
  const sortedDisposals = [...disposals].sort(
    (a, b) => toDate(a.disposal_date) - toDate(b.disposal_date)
  );

  const cgt_events     = [];
  const disposal_errors = [];

  for (const disposal of sortedDisposals) {
    const sym         = disposal.symbol.toUpperCase();
    const netProceeds = r2((disposal.gross_proceeds ?? 0) - (disposal.brokerage ?? 0));
    const available   = (parcelIndex[sym] ?? []).filter(p => p._remaining > 0.0001);

    if (!available.length) {
      disposal_errors.push({
        disposal_id: disposal.disposal_id,
        error: `No parcels with remaining balance found for symbol ${sym}.`,
      });
      continue;
    }

    let matches;
    try {
      matches = matchParcels(available, disposal.quantity, parcel_matching, disposal.disposal_date);
    } catch (err) {
      disposal_errors.push({ disposal_id: disposal.disposal_id, error: err.message });
      continue;
    }

    // Deduct units from working pool
    for (const m of matches) {
      m.parcel._remaining = r2(m.parcel._remaining - m.units_used);
    }

    // Compute CGT for each matched portion
    for (const m of matches) {
      const event = computeCgtEvent(
        m, disposal.disposal_date, netProceeds, disposal.quantity, entity_type, cgt_method
      );
      event.disposal_id = disposal.disposal_id;
      cgt_events.push(event);
    }
  }

  // ── 3. Filter CGT events to the target financial year ──
  const fy_cgt_events = cgt_events.filter(e => toFY(e.disposal_date) === financial_year);

  // ── 4. Aggregate CGT figures ──
  let total_gross_gains    = 0; // gains before discount/indexation
  let total_discounts      = 0;
  let total_net_gains      = 0; // gains after discount/indexation
  let total_capital_losses = 0;

  for (const e of fy_cgt_events) {
    if (e.is_loss) {
      total_capital_losses += e.capital_loss;
    } else {
      total_gross_gains += r2(e.net_gain + e.discount_applied); // reverse discount to get gross
      total_discounts   += e.discount_applied;
      total_net_gains   += e.net_gain;
    }
  }

  total_gross_gains    = r2(total_gross_gains);
  total_discounts      = r2(total_discounts);
  total_net_gains      = r2(total_net_gains);
  total_capital_losses = r2(total_capital_losses);

  // ── 5. Apply capital losses and carried-forward losses ──
  // Step 1: net current-year gains against current-year losses
  let net_after_current_losses = r2(total_net_gains - total_capital_losses);

  // Step 2: apply prior-year carried-forward losses against remaining net gain
  let cf_loss_applied     = 0;
  let remaining_cf        = prior_year_carried_forward_loss;
  if (net_after_current_losses > 0 && remaining_cf > 0) {
    cf_loss_applied          = r2(Math.min(net_after_current_losses, remaining_cf));
    remaining_cf             = r2(remaining_cf - cf_loss_applied);
    net_after_current_losses = r2(net_after_current_losses - cf_loss_applied);
  }

  const net_capital_gain          = r2(Math.max(0, net_after_current_losses));
  const new_carried_forward_loss  = net_after_current_losses < 0
    ? r2(Math.abs(net_after_current_losses) + remaining_cf)
    : r2(remaining_cf);

  // ── 6. Process dividends ──
  const fy_dividends = dividends.filter(d => toFY(d.payment_date) === financial_year);
  const dividend_events = fy_dividends.map(d => {
    const franking_credits    = resolveFrankingCredits(d);
    const grossed_up_dividend = r2(d.cash_amount + franking_credits);
    const franking_percent    = typeof d.franking_percent === 'number'
      ? d.franking_percent
      : r2((franking_credits / (d.cash_amount * (COMPANY_TAX_RATE / (1 - COMPANY_TAX_RATE)))) * 100) || 0;
    return {
      dividend_id:       d.dividend_id,
      symbol:            d.symbol.toUpperCase(),
      payment_date:      d.payment_date,
      cash_amount:       r2(d.cash_amount),
      franking_percent:  r2(franking_percent),
      franking_credits:  franking_credits,
      grossed_up_dividend,
    };
  });

  const total_cash_dividends    = r2(dividend_events.reduce((s, d) => s + d.cash_amount, 0));
  const total_franking_credits  = r2(dividend_events.reduce((s, d) => s + d.franking_credits, 0));
  const total_grossed_up_income = r2(dividend_events.reduce((s, d) => s + d.grossed_up_dividend, 0));

  // ── 7. Remaining parcel balances ──
  const remaining_parcels = parcelPool
    .filter(p => p._remaining > 0.0001)
    .map(p => ({
      parcel_id:        p.parcel_id,
      symbol:           p.symbol,
      acquired_date:    p.acquired_date,
      original_quantity: p.quantity,
      remaining_quantity: r2(p._remaining),
      remaining_cost_base: r2(p.cost_base * (p._remaining / p.quantity)),
      unit_cost_base:   r2(p.cost_base / p.quantity),
    }));

  // ── 8. Method breakdown summary ──
  const method_breakdown = {};
  for (const e of fy_cgt_events) {
    const m = e.cgt_method;
    if (!method_breakdown[m]) method_breakdown[m] = { event_count: 0, total_net_gain: 0, total_capital_loss: 0, total_discount_applied: 0 };
    method_breakdown[m].event_count++;
    method_breakdown[m].total_net_gain        = r2(method_breakdown[m].total_net_gain        + e.net_gain);
    method_breakdown[m].total_capital_loss    = r2(method_breakdown[m].total_capital_loss    + e.capital_loss);
    method_breakdown[m].total_discount_applied= r2(method_breakdown[m].total_discount_applied+ e.discount_applied);
  }

  // ── 9. Build output ──
  return {
    meta: {
      engine_version: '1.0.0',
      calculated_at:  new Date().toISOString(),
      financial_year,
      entity_type,
      parcel_matching,
      cgt_method_config: cgt_method,
    },
    cgt_summary: {
      total_gross_gains,
      total_cgt_discount_applied:    total_discounts,
      total_net_gains_after_discount: total_net_gains,
      total_capital_losses,
      prior_year_carried_forward_loss_applied: cf_loss_applied,
      net_capital_gain,
      new_carried_forward_loss,
    },
    dividend_summary: {
      total_cash_dividends,
      total_franking_credits,
      total_grossed_up_income,
    },
    cgt_events:        fy_cgt_events,
    dividend_events,
    remaining_parcels,
    method_breakdown,
    disposal_errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline entrypoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full pipeline: validate → calculate → return output JSON.
 * This is the single public entrypoint for the engine.
 *
 * @param {object|string} input - Input JSON object or JSON string.
 * @returns {object} Output JSON. On validation failure, returns error output.
 */
function run(input) {
  // Parse if string
  let parsed;
  try {
    parsed = typeof input === 'string' ? JSON.parse(input) : input;
  } catch (e) {
    return {
      meta: { engine_version: '1.0.0', calculated_at: new Date().toISOString() },
      status: 'error',
      errors: [`JSON parse error: ${e.message}`],
    };
  }

  // Validate
  const validation = validate(parsed);
  if (!validation.valid) {
    return {
      meta: { engine_version: '1.0.0', calculated_at: new Date().toISOString() },
      status: 'error',
      errors: validation.errors,
    };
  }

  // Calculate
  try {
    const output = calculate(parsed);
    return { status: 'ok', ...output };
  } catch (e) {
    return {
      meta: { engine_version: '1.0.0', calculated_at: new Date().toISOString() },
      status: 'error',
      errors: [`Calculation error: ${e.message}`],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  run,        // Primary entrypoint
  validate,   // Validation only (useful for pre-flight checks)
  calculate,  // Calculation only (assumes already-validated input)
  // Exposed for unit testing
  _internals: {
    matchParcels,
    computeCgtEvent,
    resolveFrankingCredits,
    toFY,
    daysBetween,
    toCpiQuarter,
    getCpi,
    r2,
  },
};
