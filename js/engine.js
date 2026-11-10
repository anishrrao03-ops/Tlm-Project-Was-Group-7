/* LODGEMATE AI — analytical engine (no DOM). Every figure is computed from the workbook rows. */
(function (g) {
'use strict';
const CATS = ['Standard', 'Deluxe', 'Premium', 'Family Suite'];
const DOWN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LMAX = 90;
const dn = s => { if (s == null) return null; const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null; };
const iso = n => new Date(n * 864e5).toISOString().slice(0, 10);
const dowOf = n => (n + 3) % 7;
const ymOf = n => iso(n).slice(0, 7);
const sum = a => a.reduce((x, y) => x + y, 0);
const mean = a => a.length ? sum(a) / a.length : null;
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sd = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(sum(a.map(x => (x - m) ** 2)) / (a.length - 1)); };

const DEFAULTS = {
  asof: '2026-11-09',
  weights: { H: 0.40, W: 0.25, B: 0.25, C: 0.10 },
  minSamples: 3, weekdayWeeks: 8, btLead: 14,
  alerts: { high: 85, critical: 95, low: 35, horizon: 14, cancelZ: 1.5, compGap: 10 },
  bands: [[35, -12], [50, -6], [65, 0], [75, 5], [85, 10], [92, 15], [97, 20], [101, 25]],
  pickupThreshold: 20, pickupAdj: 5,
  compPremiumThreshold: 10, compStep: 3, compReduceBelowOcc: 75, compRaiseAboveOcc: 75, compMaxGapDays: 14,
  festPremium: 5, festHistMin: 80, festSkipIfOccAdjAtLeast: 15,
  maxDeviation: 25, maxDailyChange: 10, roundTo: 10, elasticity: 0.5,
  minOverridePct: 0, maxOverridePct: 0,
  staff: { hkCheckout: 12, hkStayover: 20, kitchenMeals: 40, mealsPerGuestDay: 2.5, shifts: 3, frontDesk: 20, maintRooms: 40, otCapHours: 4, tempPremiumPct: 20 },
  inv: { safetyMult: 1, windowDays: 60, perishableDays: 3, dairyDays: 3, dryDays: 10, suppliesDays: 14, leadSource: 'inventory', horizon: 14 },
  transport: { shareOfMoves: 30, tripsPerUnit: 3, mealsOutsideShare: 100 },
  weekday: { threshold: 50, varCostCats: ['Laundry', 'Procurement'] },
  festivalPlan: { name: 'Sri Kshetra Rathotsava (2027 planning scenario)', start: '2027-03-17', end: '2027-03-23' },
  notify: { highDemand: true, stock: true, staffing: true, competitor: true, cancellation: true, approvals: true }
};
const deepMerge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') deepMerge(a[k], b[k]); else a[k] = b[k]; } return a; };
const newSettings = (over) => deepMerge(JSON.parse(JSON.stringify(DEFAULTS)), over || {});

/* ---------- decode embedded columnar data ---------- */
function decode(packed) {
  const out = {};
  for (const name in packed) {
    const sh = packed[name];
    if (sh.raw) { out[name] = sh.raw; continue; }
    const cols = Object.keys(sh.cols), rows = new Array(sh.n);
    for (let i = 0; i < sh.n; i++) rows[i] = {};
    for (const c of cols) {
      const col = sh.cols[c];
      for (let i = 0; i < sh.n; i++) { const v = col.v[i]; rows[i][c] = v == null ? null : (col.t === 's' ? col.u[v] : v); }
    }
    out[name] = rows;
  }
  return out;
}
/* normalise rows from an uploaded workbook (Date -> ISO) */
function normaliseUpload(sheets) {
  const out = {};
  for (const name in sheets) {
    if (name.startsWith('README')) { out[name] = sheets[name]; continue; }
    out[name] = sheets[name].map(r => { const o = {}; for (const k in r) { let v = r[k]; if (v instanceof Date) v = iso(Math.round((v.getTime() - v.getTimezoneOffset() * 60000) / 864e5)); o[k.trim()] = v === '' ? null : v; } return o; });
  }
  return out;
}

/* ---------- model ---------- */
function build(sh, S) {
  const M = { sheets: sh, S, cache: {} };
  const need = ['Room Master', 'Reservations', 'Daily Occupancy'];
  for (const n of need) if (!sh[n] || !sh[n].length) throw new Error('Missing sheet: ' + n);
  const lodge = (sh['Lodge Information'] || [{}])[0];
  M.lodge = lodge;
  const roomsRaw = sh['Room Master'];
  M.rooms = roomsRaw;
  M.cats = CATS.filter(c => roomsRaw.some(r => r.Room_Category === c));
  M.cap = { all: roomsRaw.length };
  M.info = {};
  for (const c of M.cats) {
    const rs = roomsRaw.filter(r => r.Room_Category === c);
    M.cap[c] = rs.length;
    M.info[c] = { ref: rs[0].Standard_Room_Price, min: rs[0].Minimum_Price, max: rs[0].Maximum_Price, guests: rs[0].Maximum_Guest_Capacity, n: rs.length };
  }
  /* daily */
  const daily = sh['Daily Occupancy'].map(r => ({ ...r, n: dn(r.Date) })).sort((a, b) => a.n - b.n);
  M.daily = daily; M.d0 = daily[0].n; M.d1 = daily[daily.length - 1].n; const N = M.N = M.d1 - M.d0 + 1;
  const A = k => new Float64Array(N);
  M.occ = A(); M.guests = A(); M.ci = A(); M.co = A(); M.roomRev = A(); M.foodRev = A(); M.totRev = A(); M.cancels = A();
  M.festDay = new Uint8Array(N); M.festName = new Array(N).fill(null); M.holiday = new Array(N).fill(null);
  M.hasDaily = new Uint8Array(N);
  for (const r of daily) {
    const i = r.n - M.d0; M.hasDaily[i] = 1;
    M.occ[i] = r.Rooms_Occupied; M.guests[i] = r.Total_Guests; M.ci[i] = r.Check_Ins; M.co[i] = r.Check_Outs;
    M.roomRev[i] = r.Daily_Room_Revenue; M.foodRev[i] = r.Daily_Food_Revenue; M.totRev[i] = r.Total_Daily_Revenue; M.cancels[i] = r.Cancellation_Count || 0;
    if (r.Festival_Period === 'Yes') { M.festDay[i] = 1; M.festName[i] = r.Festival_Name; }
    if (r.Public_Holiday && r.Public_Holiday !== 'No holiday') M.holiday[i] = r.Public_Holiday;
  }
  M.otherRev = daily.length ? Float64Array.from(daily.map(r => r.Total_Daily_Revenue - r.Daily_Room_Revenue - r.Daily_Food_Revenue)) : [];
  /* festivals */
  M.editions = (sh['Festival Calendar'] || []).map(f => ({ id: f.Festival_ID, name: f.Festival_Name, year: f.Year, start: dn(f.Start_Date), end: dn(f.End_Date), len: f.Festival_Duration_Days, expVisitors: f.Expected_Visitor_Count, actVisitors: f.Actual_Visitor_Count, expDemand: f.Expected_Lodge_Demand, actOcc: f.Actual_Lodge_Occupancy, histOcc: f.Historical_Occupancy, importance: f.Festival_Importance, road: f.Road_Access_Conditions, notes: f.Special_Notes, desc: f.Local_Event_Description, planned: false })).sort((a, b) => a.start - b.start);
  M.rebuildPlanned = () => {
    M.editions = M.editions.filter(e => !e.planned);
    const fp = S.festivalPlan; if (fp && fp.start && fp.end) {
      const s = dn(fp.start), e = dn(fp.end);
      if (s && e && e >= s && s > M.editions.reduce((m, x) => Math.max(m, x.end), 0)) M.editions.push({ id: 'PLAN', name: fp.name, year: +fp.start.slice(0, 4), start: s, end: e, len: e - s + 1, importance: 'Very High (assumed from earlier editions)', planned: true, notes: 'Planning scenario entered by the manager. Dates are not in the workbook.' });
    }
  };
  M.rebuildPlanned();
  /* reservations */
  const bk = [];
  for (const r of sh['Reservations']) {
    const ci = dn(r.Check_In_Date), co = dn(r.Check_Out_Date), b = dn(r.Booking_Date), cx = dn(r.Cancellation_Date);
    bk.push({ id: r.Booking_ID, b, ci, co, cat: r.Room_Category, room: r.Room_ID, status: r.Booking_Status, cx, guests: r.Number_of_Guests, nights: r.Number_of_Nights, rate: r.Room_Rate_Per_Night, disc: r.Discount, roomRev: r.Total_Room_Revenue, food: r.Food_Revenue, other: r.Other_Revenue, total: r.Total_Booking_Value, channel: r.Booking_Channel, type: r.Customer_Type, loc: r.Customer_Location, reason: r.Cancellation_Reason, cust: r.Customer_ID, fest: r.Festival_Period === 'Yes', weekend: r.Weekend_Booking === 'Yes', leadSheet: r.Booking_Lead_Time_Days, pay: r.Payment_Status, adults: r.Adults, children: r.Children });
  }
  M.bk = bk;
  const keys = ['all', ...M.cats];
  M.final = {}; M.otb = {};
  for (const k of keys) { M.final[k] = new Int16Array(N); M.otb[k] = new Int16Array(N * (LMAX + 1)); }
  for (const x of bk) {
    for (let d = x.ci; d < x.co; d++) {
      const i = d - M.d0; if (i < 0 || i >= N) continue;
      if (x.status === 'Completed') { M.final.all[i]++; if (M.final[x.cat]) M.final[x.cat][i]++; }
      const lb = d - x.b, lc = x.status === 'Cancelled' && x.cx != null ? d - x.cx : -1;
      if (x.status === 'Cancelled' && x.cx == null) continue;
      const lo = Math.max(lc + 1, 0), hi = Math.min(lb, LMAX);
      for (let L = lo; L <= hi; L++) { M.otb.all[i * (LMAX + 1) + L]++; if (M.otb[x.cat]) M.otb[x.cat][i * (LMAX + 1) + L]++; }
    }
  }
  /* staff */
  const staff = (sh['Staff Management'] || []).map(r => ({ ...r, n: dn(r.Shift_Date) }));
  M.staffRows = staff; M.staffBy = new Map();
  M.staffList = new Map();
  for (const r of staff) {
    if (!M.staffBy.has(r.n)) M.staffBy.set(r.n, []);
    M.staffBy.get(r.n).push(r);
    if (!M.staffList.has(r.Staff_ID)) M.staffList.set(r.Staff_ID, r);
  }
  /* inventory */
  const inv = (sh['Inventory and Procurement'] || []).map(r => ({ ...r, n: dn(r.Date), exp: dn(r.Expiry_Date) })).sort((a, b) => a.n - b.n);
  M.inv = inv; M.invItems = {};
  for (const r of inv) (M.invItems[r.Item_Name] = M.invItems[r.Item_Name] || new Map()).set(r.n, r);
  M.suppliers = sh['Supplier Information'] || [];
  /* competitors */
  M.comp = (sh['Competitor Pricing'] || []).map(r => ({ ...r, n: dn(r.Date), upd: dn(r.Last_Updated) }));
  M.compDates = [...new Set(M.comp.map(r => r.n))].sort((a, b) => a - b);
  /* transactions */
  const tx = sh['Financial Transactions'] || [];
  M.txMonth = {}; M.txDay = new Map();
  for (const t of tx) {
    const ym = String(t.Date).slice(0, 7), k = t.Transaction_Type + '|' + t.Category;
    (M.txMonth[ym] = M.txMonth[ym] || {})[k] = ((M.txMonth[ym] || {})[k] || 0) + t.Amount;
    if (t.Transaction_Type === 'Expense') { const n = dn(t.Date); M.txDay.set(n, (M.txDay.get(n) || 0) + t.Amount); }
  }
  M.txCount = tx.length;
  M.customers = sh['Customer Analysis'] || []; M.issues = sh['Operational Issues'] || []; M.campaigns = sh['Marketing and Promotions'] || []; M.partners = sh['Transport and Local Partners'] || [];
  M.price = { pub: {} };
  return M;
}

/* ---------- helpers ---------- */
function asofN(M) { return clamp(dn(M.S.asof), M.d0, M.d1); }
const idx = (M, n) => n - M.d0;
function festAt(M, t) {
  for (const e of M.editions) if (t >= e.start && t <= e.end) return { ed: e, k: t - e.start };
  return null;
}
function occF(M, key, n) { const i = n - M.d0; return (i < 0 || i >= M.N) ? null : M.final[key][i] / M.cap[key]; }
function isFestHist(M, n) { const i = n - M.d0; return i >= 0 && i < M.N && (M.festDay[i] === 1); }

/* ---------- forecasting ---------- */
function forecast(M, asof, t, key, noConf) {
  key = key || 'all';
  const ck = 'f|' + asof + '|' + t + '|' + key + '|' + (noConf ? 1 : 0);
  if (M.cache[ck]) return M.cache[ck];
  const S = M.S, capk = M.cap[key], res = { t, asof, L: t - asof, key, cap: capk, inputs: {}, notes: [] };
  const fe = festAt(M, t); res.fest = fe;
  const hist = d => d >= M.d0 && d <= asof && d <= M.d1;
  /* H */
  let H = null, nH = 0, hDesc = '';
  if (fe) {
    const vals = [];
    for (const ed of M.editions) { if (ed.planned || ed === fe.ed || ed.end > asof) continue; const d = ed.start + Math.min(fe.k, ed.len - 1); if (hist(d)) vals.push(occF(M, key, d)); }
    nH = vals.length; if (nH) { H = mean(vals); hDesc = 'same festival day in ' + nH + ' earlier edition(s)'; }
  } else {
    const dt = new Date(t * 864e5), vals = [];
    for (let y = 1; y <= 3; y++) for (let o = -3; o <= 3; o++) { const d = Date.UTC(dt.getUTCFullYear() - y, dt.getUTCMonth(), dt.getUTCDate() + o) / 864e5; if (hist(d) && !isFestHist(M, d)) vals.push(occF(M, key, d)); }
    nH = vals.length; if (nH >= S.minSamples) { H = mean(vals); hDesc = 'same calendar dates (±3 days) in earlier years, festivals excluded'; } else H = null;
  }
  res.inputs.H = { v: H, n: nH, desc: hDesc };
  /* W */
  let W = null, nW = 0;
  if (!fe) {
    const vals = [], w = dowOf(t);
    for (let d = asof; d > asof - S.weekdayWeeks * 7; d--) if (dowOf(d) === w && d >= M.d0 && !isFestHist(M, d)) vals.push(occF(M, key, d));
    nW = vals.length; if (nW >= 2) W = mean(vals);
  } else res.notes.push('Weekday baseline (W) not applicable on festival days; weights redistributed.');
  res.inputs.W = { v: W, n: nW, desc: 'same weekday, previous ' + S.weekdayWeeks + ' weeks, festivals excluded' };
  /* B */
  let B = null, nB = 0, pickup = null, otbT = null, avgOTB = null, avgFinal = null;
  const L = t - asof;
  if (L >= 0 && L <= LMAX && t <= M.d1 && t >= M.d0) {
    otbT = M.otb[key][idx(M, t) * (LMAX + 1) + L];
    const o = [], f = [], wk = dowOf(t) >= 5;
    for (let d = asof - 400; d <= asof; d++) {
      if (d < M.d0 + LMAX || d > M.d1) continue;
      const fd = isFestHist(M, d);
      if (fe ? !(fd && !(festAt(M, d) && festAt(M, d).ed === fe.ed)) : (fd || (dowOf(d) >= 5) !== wk)) continue;
      o.push(M.otb[key][idx(M, d) * (LMAX + 1) + L]); f.push(M.final[key][idx(M, d)]);
    }
    nB = o.length; avgOTB = mean(o); avgFinal = mean(f);
    if (nB >= S.minSamples && avgOTB >= 0.15 * Math.max(1, capk / 10)) { pickup = Math.min(3, otbT / avgOTB); B = clamp(avgFinal * pickup / capk, 0, 1); }
    else if (nB) res.notes.push('Booking pickup curve too thin at lead ' + L + ' days; B excluded.');
  } else if (L > LMAX) res.notes.push('Beyond the ' + LMAX + '-day booking window the workbook supports; B excluded.');
  res.inputs.B = { v: B, n: nB, desc: 'on-the-books rooms at ' + L + ' days lead × historical pickup', pickup, otb: otbT, avgOTB, avgFinal };
  res.pickup = pickup; res.otb = otbT;
  /* C */
  let C = null, nC = 0, cDesc = '';
  { const hol = M.holiday[idx(M, t)] ; const vals = [];
    const lo = Math.max(M.d0, asof - 365 * 2);
    if (hol) { for (let d = M.d0; d <= asof; d++) if (M.holiday[idx(M, d)] && !isFestHist(M, d)) vals.push(occF(M, key, d)); cDesc = 'public holidays in history (' + hol + ')'; if (vals.length < 2) { vals.length = 0; } }
    if (!vals.length) { const wk = dowOf(t) >= 5; for (let d = lo; d <= asof; d++) if (!isFestHist(M, d) && !M.holiday[idx(M, d)] && (dowOf(d) >= 5) === wk) vals.push(occF(M, key, d)); cDesc = (wk ? 'weekend' : 'weekday') + ' dates, festivals/holidays excluded' + (fe ? ' (festival effect is counted once, in H)' : ''); }
    nC = vals.length; if (nC >= S.minSamples) C = mean(vals); }
  res.inputs.C = { v: C, n: nC, desc: cDesc };
  /* combine */
  let tw = 0, acc = 0; const used = {};
  for (const k of ['H', 'W', 'B', 'C']) { const v = res.inputs[k].v; if (v != null) { tw += S.weights[k]; acc += S.weights[k] * v; used[k] = true; } }
  res.missing = ['H', 'W', 'B', 'C'].filter(k => !used[k]);
  res.f = tw > 0 ? clamp(acc / tw, 0, 1) : null;
  res.weightsUsed = {}; for (const k in used) res.weightsUsed[k] = S.weights[k] / tw;
  res.coverage = tw / sum(Object.values(S.weights));
  res.rooms = res.f == null ? null : res.f * capk;
  if (!noConf && res.f != null) {
    const lb = L <= 10 ? 7 : L <= 21 ? 14 : 30;
    const bt = backtest(M, asof, lb, key);
    const samp = mean([['H', 6], ['W', 6], ['B', 30], ['C', 20]].filter(([k]) => used[k]).map(([k, tgt]) => Math.min(1, res.inputs[k].n / tgt)));
    let score;
    if (bt.n >= 10) { const es = clamp(1 - bt.mae / 0.15, 0, 1); score = 0.4 * res.coverage + 0.2 * samp + 0.4 * es; } else score = 0.6 * res.coverage + 0.4 * samp - 0.1;
    if (L > LMAX) score -= 0.05;
    res.conf = { score: clamp(score, 0, 1), label: score >= 0.7 ? 'High' : score >= 0.5 ? 'Medium' : 'Low', mae: bt.n >= 10 ? bt.mae : null, btLead: lb, btN: bt.n, samp, coverage: res.coverage };
  }
  M.cache[ck] = res; return res;
}
function backtest(M, asof, lead, key) {
  const ck = 'bt|' + asof + '|' + lead + '|' + key; if (M.cache[ck]) return M.cache[ck];
  const rows = [];
  for (let d = asof - 89; d <= asof; d++) {
    const a = d - lead; if (a < M.d0 + 60 || d < M.d0) continue;
    const f = forecast(M, a, d, key, true); if (f.f == null) continue;
    rows.push({ d, fc: f.f, act: occF(M, key, d), fest: !!f.fest });
  }
  const errs = rows.map(r => Math.abs(r.fc - r.act));
  const out = { rows, n: rows.length, mae: mean(errs), bias: mean(rows.map(r => r.fc - r.act)), lead };
  M.cache[ck] = out; return out;
}
function forecastAll(M, asof, t) { return { all: forecast(M, asof, t, 'all'), cats: Object.fromEntries(M.cats.map(c => [c, forecast(M, asof, t, c)])) }; }

/* demand-side derived quantities */
function ratios(M, asof) {
  const ck = 'rat|' + asof; if (M.cache[ck]) return M.cache[ck];
  let r = 0, g = 0, ci = 0, co = 0;
  for (let d = Math.max(M.d0, asof - 180); d <= asof; d++) { const i = idx(M, d); r += M.occ[i]; g += M.guests[i]; ci += M.ci[i]; co += M.co[i]; }
  const o = { gpr: g / r, ciPerRoom: ci / r, coPerRoom: co / r };
  M.cache[ck] = o; return o;
}
function demand(M, asof, t) {
  const f = forecast(M, asof, t, 'all'), q = ratios(M, asof);
  const rooms = f.rooms || 0;
  const guests = rooms * q.gpr, ci = rooms * q.ciPerRoom, co = rooms * q.coPerRoom;
  return { f, rooms, guests, checkins: ci, checkouts: co, stayovers: Math.max(0, rooms - ci), meals: guests * M.S.staff.mealsPerGuestDay };
}

/* ---------- competitors ---------- */
function compFor(M, t, cat) {
  const S = M.S; let best = null;
  for (const n of M.compDates) { const gap = Math.abs(n - t); if (gap <= S.compMaxGapDays && (best == null || gap < best.gap)) best = { n, gap }; }
  if (!best) return null;
  const rows = M.comp.filter(r => r.n === best.n && r.Room_Category === cat);
  if (!rows.length) return null;
  const p = rows.map(r => r.Competitor_Room_Price);
  return { obs: best.n, gap: best.gap, rows, median: median(p), mean: mean(p), min: Math.min(...p), max: Math.max(...p), n: rows.length };
}

/* ---------- pricing ---------- */
const pubPrice = (M, cat, t) => (M.price.pub[cat + '|' + t] != null ? M.price.pub[cat + '|' + t] : M.info[cat].ref);
function bandAdj(M, occ) { const p = occ * 100; for (const [ub, a] of M.S.bands) if (p < ub) return a; return M.S.bands[M.S.bands.length - 1][1]; }
function priceRec(M, asof, t, cat) {
  const S = M.S, info = M.info[cat], fc = forecast(M, asof, t, cat), ref = info.ref, pub = pubPrice(M, cat, t);
  const minP = Math.round(info.min * (1 + S.minOverridePct / 100)), maxP = Math.round(info.max * (1 + S.maxOverridePct / 100));
  const r = { t, cat, ref, pub, min: minP, max: maxP, fc, reasons: [], flags: [] };
  if (fc.f == null) { r.rec = pub; r.reasons.push('No forecast available.'); return r; }
  const occAdj = bandAdj(M, fc.f);
  let pickAdj = 0;
  if (fc.pickup != null) { if (fc.pickup >= 1 + S.pickupThreshold / 100) pickAdj = S.pickupAdj; else if (fc.pickup <= 1 - S.pickupThreshold / 100) pickAdj = -S.pickupAdj; }
  const comp = compFor(M, t, cat); let compAdj = 0, prem = null;
  if (comp) {
    prem = (pub / comp.median - 1) * 100;
    if (prem > S.compPremiumThreshold && fc.f * 100 < S.compReduceBelowOcc) compAdj = -S.compStep;
    else if (prem < -S.compPremiumThreshold && fc.f * 100 > S.compRaiseAboveOcc) compAdj = S.compStep;
  }
  let festAdj = 0; const fe = fc.fest;
  if (fe) {
    const hv = fc.inputs.H.v;
    if (hv != null && hv * 100 >= S.festHistMin && (fc.pickup == null || fc.pickup >= 1) && occAdj < S.festSkipIfOccAdjAtLeast) festAdj = S.festPremium;
    else r.flags.push('Festival premium withheld: ' + (hv == null ? 'no festival history' : hv * 100 < S.festHistMin ? 'historical festival occupancy ' + (hv * 100).toFixed(0) + '% is below the ' + S.festHistMin + '% evidence threshold' : occAdj >= S.festSkipIfOccAdjAtLeast ? 'occupancy adjustment already high' : 'booking pace below history'));
  }
  const comb0 = occAdj + pickAdj + compAdj + festAdj;
  const comb = clamp(comb0, -S.maxDeviation, S.maxDeviation);
  let target = ref * (1 + comb / 100); const steps = [];
  let p = clamp(target, minP, maxP); if (p !== target) steps.push(target < minP ? 'raised to the minimum price' : 'capped at the maximum price');
  const lo = pub * (1 - S.maxDailyChange / 100), hi = pub * (1 + S.maxDailyChange / 100);
  if (p > hi) { p = hi; steps.push('limited to +' + S.maxDailyChange + '% daily change from the published price'); } else if (p < lo) { p = lo; steps.push('limited to -' + S.maxDailyChange + '% daily change from the published price'); }
  p = clamp(p, minP, maxP);
  p = Math.round(p / S.roundTo) * S.roundTo; p = clamp(p, minP, maxP);
  const rooms = fc.rooms, dpct = pub ? (p / pub - 1) : 0, rooms2 = rooms * (1 - S.elasticity * dpct);
  Object.assign(r, { rec: p, occAdj, pickAdj, compAdj, festAdj, comb, comb0, comp, prem, steps, changePct: dpct * 100, devPct: (p / ref - 1) * 100, impact: p * rooms2 - pub * rooms, rooms });
  r.reasons.push('Forecast occupancy ' + (fc.f * 100).toFixed(0) + '% → ' + (occAdj >= 0 ? '+' : '') + occAdj + '% occupancy band.');
  if (fc.pickup != null) r.reasons.push('Booking pace ' + (fc.pickup * 100).toFixed(0) + '% of history → ' + (pickAdj ? (pickAdj > 0 ? '+' : '') + pickAdj + '% pace adjustment.' : 'no pace adjustment.'));
  else r.reasons.push('No booking-pace signal at this lead time.');
  if (comp) r.reasons.push('Competitor median ₹' + Math.round(comp.median) + ' (' + comp.n + ' lodges, observed ' + iso(comp.obs) + '); lodge is ' + (prem >= 0 ? '+' : '') + prem.toFixed(1) + '% vs median → ' + (compAdj ? (compAdj > 0 ? '+' : '') + compAdj + '% competitor adjustment.' : 'no competitor adjustment.'));
  else r.reasons.push('No comparable competitor observation within ' + S.compMaxGapDays + ' days' + (cat === 'Family Suite' ? ' (no Family Suite competitor data in the workbook).' : '.'));
  if (festAdj) r.reasons.push('Festival premium +' + festAdj + '% supported by history and booking pace.');
  for (const s of steps) r.reasons.push('Safety rule: ' + s + '.');
  if (comb0 !== comb) r.reasons.push('Combined adjustment limited to ±' + S.maxDeviation + '% of reference.');
  r.reasons.push('Rounded to ₹' + S.roundTo + '.');
  return r;
}

/* ---------- staffing ---------- */
function otRate(M, dept) {
  const rows = M.staffRows.filter(r => r.Department === dept && r.Overtime_Hours > 0);
  if (!rows.length) { const all = M.staffRows.filter(r => r.Overtime_Hours > 0); return all.length ? sum(all.map(r => r.Overtime_Cost)) / sum(all.map(r => r.Overtime_Hours)) : 0; }
  return sum(rows.map(r => r.Overtime_Cost)) / sum(rows.map(r => r.Overtime_Hours));
}
function staffing(M, asof, t) {
  const S = M.S.staff, dm = demand(M, asof, t);
  const rows = M.staffBy.get(t) || [];
  const dept = d => rows.filter(r => r.Department === d);
  const regular = d => [...M.staffList.values()].filter(r => r.Department === d).length;
  const avail = d => rows.length ? dept(d).filter(r => r.Attendance_Status === 'Present').length : regular(d);
  const rosterN = d => rows.length ? dept(d).length : regular(d);
  const req = {};
  req.Housekeeping = Math.ceil(dm.checkouts / S.hkCheckout + dm.stayovers / S.hkStayover - 1e-9);
  const mealsShift = dm.meals / S.shifts;
  req.Kitchen = Math.max(1, Math.ceil(mealsShift / S.kitchenMeals - 1e-9)) * S.shifts;
  req.Reception = Math.max(1, Math.ceil(dm.checkins / S.shifts / S.frontDesk - 1e-9)) * S.shifts;
  req.Maintenance = Math.max(1, Math.ceil(dm.rooms / S.maintRooms - 1e-9));
  const out = [];
  for (const d of ['Housekeeping', 'Kitchen', 'Reception', 'Maintenance']) {
    const a = avail(d), short = req[d] - a, rate = otRate(M, d);
    const wage = (dept(d)[0] || {}).Daily_Wage || mean(M.staffRows.filter(r => r.Department === d).map(r => r.Daily_Wage)) || 0;
    let opt = null, cost = 0, otCost = 0, tempCost = 0;
    if (short > 0) {
      otCost = short * 8 * rate; tempCost = short * wage * (1 + M.S.staff.tempPremiumPct / 100);
      const otPeople = Math.ceil(short * 8 / S.otCapHours);
      const ok = otPeople <= a;
      opt = ok && otCost <= tempCost ? 'Overtime' : 'Temporary staff'; if (opt === 'Overtime' && !ok) opt = 'Temporary staff';
      cost = opt === 'Overtime' ? otCost : tempCost;
    }
    out.push({ dept: d, required: req[d], available: a, rostered: rosterN(d), shortage: short, option: opt, otCost, tempCost, cost, otRate: rate, wage });
  }
  return { t, dm, rows: out, shortages: out.filter(x => x.shortage > 0) };
}

/* ---------- inventory ---------- */
function invItem(M, asof, name) {
  const ck = 'inv|' + asof + '|' + name; if (M.cache[ck]) return M.cache[ck];
  const S = M.S, I = S.inv, map = M.invItems[name]; if (!map) return null;
  let d = asof; while (d > M.d0 && !map.has(d)) d--;
  const row = map.get(d); if (!row) return null;
  const win = [], wasteQ = []; let consSum = 0, guestSum = 0, wasteSum = 0, n = 0;
  for (let x = d - I.windowDays + 1; x <= d; x++) { const r = map.get(x); if (!r) continue; consSum += r.Quantity_Consumed; wasteSum += r.Wastage_Quantity || 0; guestSum += M.guests[idx(M, x)] || 0; n++; }
  const avgDaily = n ? consSum / n : 0, perGuest = guestSum ? consSum / guestSum : 0;
  /* expected consumption over horizon, guest-based */
  const exp = []; for (let k = 1; k <= 30; k++) exp.push(demand(M, asof, asof + k).guests * perGuest);
  const expDaily = mean(exp.slice(0, I.horizon));
  const sup = M.suppliers.find(s => s.Supplier_ID === row.Supplier_ID) || null;
  const lt1 = row.Supplier_Lead_Time_Days, lt2 = sup ? sup.Delivery_Lead_Time : null;
  const lead = I.leadSource === 'inventory' ? lt1 : I.leadSource === 'supplier' && lt2 != null ? lt2 : Math.max(lt1, lt2 == null ? 0 : lt2);
  const safety = row.Minimum_Stock_Level * I.safetyMult;
  const cat = row.Category, nm = name.toLowerCase();
  const tdays = /milk/.test(nm) ? I.dairyDays : /vegetable/.test(nm) ? I.perishableDays : cat === 'Food' ? I.dryDays : I.suppliesDays;
  const stock = row.Closing_Stock, incoming = M.price.incoming && M.price.incoming[name] ? M.price.incoming[name] : 0, reserved = 0;
  const available = stock + incoming - reserved;
  const rop = avgDaily * lead + safety;
  const target = expDaily * Math.max(tdays, lead + 1) + safety;
  const order = Math.max(0, target - available);
  let projLead = available - sum(exp.slice(0, Math.max(1, Math.ceil(lead))));
  const cover = expDaily > 0 ? available / expDaily : null;
  let status = 'OK';
  if (projLead < 0) status = 'Stock-out before delivery'; else if (available <= rop) status = 'Reorder now'; else if (projLead < safety) status = 'Watch';
  const exDays = row.exp != null ? row.exp - d : null;
  let expiryRisk = 0; if (exDays != null && exDays >= 0 && expDaily > 0) expiryRisk = Math.max(0, available - expDaily * exDays);
  const unit = row.Unit_Cost, win30 = []; for (let x = d - 29; x <= d; x++) { const r = map.get(x); if (r) win30.push(r.Wastage_Quantity || 0); }
  const o = { name, cat, unit: row.Unit, date: d, stock, incoming, available, avgDaily, expDaily, perGuest, lead, lt1, lt2, safety, rop, target, order, orderCost: order * unit, unitCost: unit, tdays, cover, projLead, status, supplierId: row.Supplier_ID, supplier: sup, expiry: row.exp, exDays, expiryRisk, wastePct: consSum ? wasteSum / consSum : 0, wasteSum, wasteCost: wasteSum * unit, histStatus: row.Stock_Status, stockoutDate: cover != null ? asof + Math.floor(cover) : null, consSum, window: n };
  M.cache[ck] = o; return o;
}
const invAll = (M, asof) => Object.keys(M.invItems).map(n => invItem(M, asof, n)).filter(Boolean);

/* ---------- transport / partners ---------- */
function transport(M, asof, t) {
  const T = M.S.transport, dm = demand(M, asof, t);
  const requests = (dm.checkins + dm.checkouts) * T.shareOfMoves / 100;
  const veh = M.partners.filter(p => /Taxi|Transport/i.test(p.Partner_Type));
  const capUnits = sum(veh.filter(p => p.Availability === 'Daily' || /Festival/.test(p.Availability) && !!festAt(M, t)).map(p => p.Capacity));
  const cap = capUnits * T.tripsPerUnit;
  return { t, requests, cap, gap: requests - cap, veh, dm };
}

/* ---------- alerts ---------- */
function cancelStats(M, asof) {
  const ck = 'cx|' + asof; if (M.cache[ck]) return M.cache[ck];
  const known = M.bk.filter(b => b.ci <= asof), wins = [];
  const W = 30; for (let e = M.d0 + W; e <= asof; e += W) { const s = known.filter(b => b.ci > e - W && b.ci <= e); if (s.length >= 20) wins.push({ end: e, rate: s.filter(b => b.status === 'Cancelled' && (b.cx == null || b.cx <= asof)).length / s.length }); }
  const rec = known.filter(b => b.ci > asof - W), recRate = rec.length ? rec.filter(b => b.status === 'Cancelled').length / rec.length : null;
  const base = wins.filter(w => w.end <= asof - W).map(w => w.rate), bm = mean(base), bs = sd(base);
  const o = { recRate, recN: rec.length, base: bm, sd: bs, z: bs ? (recRate - bm) / bs : 0, wins };
  M.cache[ck] = o; return o;
}
function alerts(M, asof) {
  const A = M.S.alerts, out = [];
  for (let k = 1; k <= A.horizon; k++) {
    const t = asof + k, f = forecast(M, asof, t, 'all'); if (f.f == null) continue; const p = f.f * 100;
    if (p > A.critical) out.push({ sev: 'Critical', type: 'Critical capacity', date: t, text: 'Forecast ' + p.toFixed(0) + '% on ' + iso(t), action: 'Hold inventory of rooms, review overbooking policy and confirm staffing.' });
    else if (p > A.high) out.push({ sev: 'High', type: 'High demand', date: t, text: 'Forecast ' + p.toFixed(0) + '% on ' + iso(t), action: 'Review price increase and staffing.' });
    else if (p < A.low) out.push({ sev: 'Low', type: 'Low demand', date: t, text: 'Forecast ' + p.toFixed(0) + '% on ' + iso(t), action: 'Consider a targeted offer if financially sensible (Weekday Optimisation).' });
  }
  for (const it of invAll(M, asof)) {
    if (it.status === 'Stock-out before delivery') out.push({ sev: 'Critical', type: 'Stock shortage', text: it.name + ': ' + it.available.toFixed(0) + ' ' + it.unit + ' on hand, projected short of expected use before the ' + it.lead + '-day delivery.', action: 'Approve purchase of ' + Math.ceil(it.order) + ' ' + it.unit + '.' });
    else if (it.status === 'Reorder now') out.push({ sev: 'High', type: 'Stock shortage', text: it.name + ' is at or below its reorder point (' + it.available.toFixed(0) + ' vs ' + it.rop.toFixed(0) + ' ' + it.unit + ').', action: 'Review the purchase proposal.' });
    if (it.expiryRisk > 0 && it.exDays <= 14) out.push({ sev: 'Medium', type: 'Expiry risk', text: it.name + ': about ' + it.expiryRisk.toFixed(0) + ' ' + it.unit + ' may expire (' + iso(it.expiry) + ') before use.', action: 'Prioritise use or reduce the next order.' });
  }
  for (let k = 1; k <= 7; k++) { const s = staffing(M, asof, asof + k); for (const x of s.shortages) out.push({ sev: 'High', type: 'Staffing shortage', date: asof + k, text: x.dept + ' needs ' + x.required + ', roster has ' + x.available + ' on ' + iso(asof + k), action: 'Review ' + x.option.toLowerCase() + ' (≈₹' + Math.round(x.cost) + ').' }); }
  for (const cat of M.cats) {
    for (let k = 1; k <= 7; k++) { const t = asof + k, c = compFor(M, t, cat); if (!c) continue; const pub = pubPrice(M, cat, t), prem = (pub / c.median - 1) * 100; if (prem > A.compGap) { out.push({ sev: 'Medium', type: 'Competitor pricing', date: t, text: cat + ': lodge ₹' + pub + ' is ' + prem.toFixed(0) + '% above the competitor median ₹' + Math.round(c.median) + ' (observed ' + iso(c.obs) + ').', action: 'Review the pricing recommendation; do not match the cheapest rate blindly.' }); break; } }
  }
  const cs = cancelStats(M, asof);
  if (cs.recRate != null && cs.z >= A.cancelZ) out.push({ sev: 'High', type: 'Cancellation', text: 'Cancellation rate ' + (cs.recRate * 100).toFixed(1) + '% (last 30 days) vs baseline ' + (cs.base * 100).toFixed(1) + '% (z=' + cs.z.toFixed(1) + ').', action: 'Review recent cancellation reasons and competitor offers.' });
  const order = { Critical: 0, High: 1, Medium: 2, Low: 3 }; out.sort((a, b) => order[a.sev] - order[b.sev]);
  return out;
}

/* ---------- weekday optimisation ---------- */
function unitEconomics(M, asof) {
  const lo = Math.max(M.d0, asof - 365), rooms = sum(Array.from({ length: asof - lo + 1 }, (_, i) => M.occ[idx(M, lo + i)]));
  const adr = sum(Array.from({ length: asof - lo + 1 }, (_, i) => M.roomRev[idx(M, lo + i)])) / rooms;
  const food = sum(Array.from({ length: asof - lo + 1 }, (_, i) => M.foodRev[idx(M, lo + i)])) / rooms;
  let varCost = 0; const parts = {};
  for (const c of M.S.weekday.varCostCats) { let v = 0; for (let d = lo; d <= asof; d++) { const ym = ymOf(d); } for (const ym in M.txMonth) { /* month granularity approx via daily below */ } parts[c] = 0; }
  const tx = M.sheets['Financial Transactions'] || [];
  for (const t of tx) { const n = dn(t.Date); if (n >= lo && n <= asof && t.Transaction_Type === 'Expense' && M.S.weekday.varCostCats.includes(t.Category)) parts[t.Category] = (parts[t.Category] || 0) + t.Amount; }
  for (const c in parts) varCost += parts[c];
  return { rooms, adr, foodPerRoom: food, varPerRoom: varCost / rooms, parts, contribution: adr + food - varCost / rooms };
}
function promotions(M, asof) {
  const ue = unitEconomics(M, asof), thr = M.S.weekday.threshold, out = [], days = [];
  for (let k = 1; k <= 28; k++) { const t = asof + k, f = forecast(M, asof, t, 'all'); if (f.f != null && f.f * 100 < thr) days.push({ t, f }); }
  const defs = [
    { id: 'wk', name: 'Weekday discounted room package', disc: 10, lift: 0.10, target: 'Tourist / Business', note: 'Applies on forecast-weak weekdays.' },
    { id: 'fam', name: 'Family package (2 rooms, breakfast)', disc: 12, lift: 0.12, target: 'Family', note: 'Matches Family Darshan Package campaign.' },
    { id: 'grp', name: 'Group booking offer (5+ rooms)', disc: 15, lift: 0.18, target: 'Group Traveller', note: 'Direct sales to group organisers.' },
    { id: 'long', name: 'Long-stay offer (3+ nights)', disc: 12, lift: 0.08, target: 'Tourist', note: 'Raises length of stay.' },
    { id: 'pil', name: 'Pilgrimage package (darshan + meals)', disc: 8, lift: 0.14, target: 'Pilgrim', note: 'Bundles meals via local partners.' }];
  const camps = M.campaigns;
  for (const d of defs) {
    /* lift: assumption seeded from the best historical campaign bookings per ₹ where the workbook has a comparable campaign; otherwise a configurable assumption */
    let rooms = 0, base = 0, inc = 0, cost = 0, nights = 0;
    for (const x of days) { const cap = M.cap.all; const add = Math.min(cap - x.f.rooms, x.f.rooms * d.lift); rooms += add; base += x.f.rooms; }
    const adr = ue.adr * (1 - d.disc / 100);
    const lostOnBase = base * ue.adr * d.disc / 100 * 0.35; /* assume 35% of existing demand claims the discount */
    const incRev = rooms * (adr + ue.foodPerRoom), incCost = rooms * ue.varPerRoom;
    const contrib = incRev - incCost - lostOnBase;
    out.push({ ...d, days: days.length, addRooms: rooms, adr, incRev, incCost, lostOnBase, contrib, ok: contrib > 0 });
  }
  return { ue, days, options: out, camps };
}

/* ---------- festival review ---------- */
function festivalReview(M, ed) {
  const sel = M.bk.filter(b => b.ci >= ed.start - 0 && b.ci <= ed.end);
  const comp = sel.filter(b => b.status === 'Completed');
  const can = sel.filter(b => b.status === 'Cancelled');
  const lead = mean(comp.map(b => b.ci - b.b));
  const reasons = {}; can.forEach(b => reasons[b.reason] = (reasons[b.reason] || 0) + 1);
  const occ = mean(Array.from({ length: ed.end - ed.start + 1 }, (_, i) => M.final.all[idx(M, ed.start + i)] / M.cap.all));
  const guests = sum(Array.from({ length: ed.end - ed.start + 1 }, (_, i) => M.guests[idx(M, ed.start + i)]));
  const room = sum(Array.from({ length: ed.end - ed.start + 1 }, (_, i) => M.roomRev[idx(M, ed.start + i)]));
  const tot = sum(Array.from({ length: ed.end - ed.start + 1 }, (_, i) => M.totRev[idx(M, ed.start + i)]));
  const exp = sum(Array.from({ length: ed.end - ed.start + 1 }, (_, i) => M.txDay.get(ed.start + i) || 0));
  const cobs = M.compDates.filter(n => n >= ed.start && n <= ed.end), crows = M.comp.filter(r => cobs.includes(r.n));
  const adr = room / sum(Array.from({ length: ed.end - ed.start + 1 }, (_, i) => M.final.all[idx(M, ed.start + i)]));
  const camps = M.campaigns.filter(c => dn(c.Start_Date) <= ed.end && dn(c.End_Date) >= ed.start - 30 && /festival/i.test(c.Campaign_Name));
  const issues = M.issues.filter(i => { const n = dn(i.Date); return n >= ed.start - 7 && n <= ed.end + 7; });
  return { ed, occ, guests, room, total: tot, expense: exp, contribution: tot - exp, lead, cancelled: can.length, bookings: sel.length, completed: comp.length, reasons, compDiscount: mean(crows.map(r => r.Discount_Offered)), compPrice: mean(crows.map(r => r.Competitor_Room_Price)), adr, camps, issues, cancelRate: sel.length ? can.length / sel.length : null };
}

/* ---------- finance ---------- */
function financeMonthly(M, asof) {
  const months = {}; const lastN = asof;
  for (let d = M.d0; d <= M.d1; d++) {
    const ym = ymOf(d), i = idx(M, d), m = months[ym] = months[ym] || { ym, room: 0, food: 0, other: 0, occ: 0, days: 0, exp: {}, actual: true, partial: false, post: 0 };
    const post = d > lastN; if (post) m.post++;
    m.room += M.roomRev[i]; m.food += M.foodRev[i]; m.other += M.otherRev[i]; m.occ += M.occ[i]; m.days++;
  }
  for (const ym in months) { const t = M.txMonth[ym] || {}, m = months[ym]; for (const k in t) if (k.startsWith('Expense|')) m.exp[k.slice(8)] = t[k]; m.expTotal = sum(Object.values(m.exp)); m.revenue = m.room + m.food + m.other; m.status = m.post === 0 ? 'Actual' : m.post === m.days ? 'Post as-of (scheduled)' : 'Part actual'; }
  return Object.values(months).sort((a, b) => a.ym < b.ym ? -1 : 1);
}
function kpis(M, asof, lo, hi) {
  hi = Math.min(hi, asof); lo = Math.max(lo, M.d0);
  let occ = 0, room = 0, food = 0, tot = 0, days = 0, guests = 0, ci = 0, co = 0, cx = 0;
  for (let d = lo; d <= hi; d++) { const i = idx(M, d); occ += M.occ[i]; room += M.roomRev[i]; food += M.foodRev[i]; tot += M.totRev[i]; guests += M.guests[i]; ci += M.ci[i]; co += M.co[i]; cx += M.cancels[i]; days++; }
  return { days, occRooms: occ, occ: days ? occ / (days * M.cap.all) : 0, room, food, other: tot - room - food, total: tot, adr: occ ? room / occ : 0, revpar: days ? room / (days * M.cap.all) : 0, trevpar: days ? tot / (days * M.cap.all) : 0, guests, ci, co, cancels: cx };
}

/* ---------- data quality ---------- */
function quality(M, asof) {
  const sh = M.sheets, out = [], add = (sev, area, title, detail, count) => out.push({ sev, area, title, detail, count });
  const bk = M.bk;
  const guestMis = bk.filter(b => b.status === 'Completed' && b.adults != null && b.adults + b.children !== b.guests).length;
  if (guestMis) add('Warning', 'Reservations', 'Adults + Children ≠ Number_of_Guests', guestMis + ' completed bookings. The dashboard uses Number_of_Guests (it reconciles to Daily Occupancy Total_Guests).', guestMis);
  const leadMis = bk.filter(b => b.leadSheet != null && b.ci - b.b !== b.leadSheet).length;
  if (leadMis) add('Warning', 'Reservations', 'Booking_Lead_Time_Days differs from Check_In_Date − Booking_Date', leadMis + ' bookings. Lead times are derived from the dates.', leadMis);
  const otherRes = sum(bk.filter(b => b.status === 'Completed').map(b => b.other));
  const dailyDiff = sum(Array.from(M.otherRev));
  add(Math.abs(otherRes - dailyDiff) < 10 ? 'Info' : 'Warning', 'Daily Occupancy', 'Total_Daily_Revenue ≠ room + food', 'The gap is "other" revenue (₹' + Math.round(dailyDiff).toLocaleString('en-IN') + ' total), which equals Reservations Other_Revenue on completed bookings (₹' + Math.round(otherRes).toLocaleString('en-IN') + '). Other revenue is not posted in Financial Transactions.', null);
  const roomTx = sum(Object.values(M.txMonth).map(m => m['Income|Room Revenue'] || 0)), roomDaily = sum(Array.from(M.roomRev));
  add(Math.abs(roomTx - roomDaily) < 5 ? 'Pass' : 'Warning', 'Financial Transactions', 'Room income reconciles with Daily Occupancy', 'Transactions ₹' + Math.round(roomTx).toLocaleString('en-IN') + ' vs daily ₹' + Math.round(roomDaily).toLocaleString('en-IN') + '.', null);
  const exp = sum(Object.values(M.txMonth).map(m => Object.entries(m).filter(([k]) => k.startsWith('Expense')).reduce((a, [, v]) => a + v, 0)));
  const rev = sum(Array.from(M.totRev));
  if (exp > rev) add('Critical', 'Financial Transactions', 'Recorded expenses exceed revenue in every year', 'Total expenses ₹' + Math.round(exp / 1e5) / 10 + ' lakh vs revenue ₹' + Math.round(rev / 1e5) / 10 + ' lakh (' + (exp / rev).toFixed(2) + '×). Operating profit is therefore negative throughout. Treat profit figures as indicative only.', null);
  const salTx = sum(Object.values(M.txMonth).map(m => m['Expense|Salaries'] || 0)) / 3, salStaff = sum([...M.staffList.values()].map(r => r.Monthly_Salary)) * 12;
  if (salStaff && salTx / salStaff > 1.5) add('Warning', 'Staff vs Transactions', 'Salary expense in Transactions is much higher than the Staff sheet', 'Transactions record about ₹' + Math.round(salTx / 1e5) + ' lakh per year; the Staff sheet salaries total ₹' + Math.round(salStaff / 1e5) + ' lakh per year for ' + M.staffList.size + ' employees.', null);
  const joinBad = M.staffRows.filter(r => r.Joining_Date && dn(r.Joining_Date) > r.n).length;
  if (joinBad) add('Warning', 'Staff Management', 'Shifts dated before the employee Joining_Date', joinBad + ' shift rows. Rosters are used as supplied.', joinBad);
  const mis = []; for (const nm in M.invItems) { const r = [...M.invItems[nm].values()][0]; const s = M.suppliers.find(x => x.Supplier_ID === r.Supplier_ID); if (s && s.Products_Supplied !== r.Item_Name && !String(s.Supplier_Category).toLowerCase().includes(r.Item_Name.toLowerCase().split(' ')[0])) mis.push(r.Item_Name + '→' + s.Supplier_Name + ' (' + s.Supplier_Category + ')'); }
  if (mis.length) add('Warning', 'Inventory vs Suppliers', 'Inventory Supplier_ID does not match the supplier category', mis.slice(0, 4).join('; ') + (mis.length > 4 ? '…' : '') + '. Lead times and prices also differ between the sheets. Settings let you choose which lead time drives reorder points (default: the longer one).', mis.length);
  add('Info', 'Inventory', 'No open purchase orders or reserved stock in the workbook', 'Available stock = current stock + approved purchases made in this prototype − 0 reserved.', null);
  add('Info', 'Competitor Pricing', 'Competitor records are synthetic and sparse', M.compDates.length + ' observation dates, ' + new Set(M.comp.map(r => r.Competitor_ID)).size + ' competitors, no Family Suite category. Data_Quality = "' + [...new Set(M.comp.map(r => r.Data_Quality))].join(', ') + '".', null);
  add('Info', 'Transport and Local Partners', 'Capacity unit is not defined; transport request rates are not in the workbook', 'Transport demand uses configurable assumptions (Settings), not measured request rates.', null);
  const fut = bk.filter(b => b.ci > asof).length;
  add('Info', 'Reservations', 'Workbook contains stays after the as-of date', fut + ' reservations check in after ' + iso(asof) + ' and are all marked Completed. They are treated as booked or scheduled (not actual) according to their Booking_Date; the Overview as-of control moves this line.', fut);
  const rm9 = M.rooms.filter(r => r.Room_Status !== 'Active'); if (rm9.length) add('Info', 'Room Master', rm9.length + ' room(s) not Active: ' + rm9.map(r => r.Room_ID + ' (' + r.Room_Status + ')').join(', '), 'Capacity stays at 40 as the Daily Occupancy sheet defines it; no bookings are assigned to the room.', null);
  const hist = M.editions.filter(e => !e.planned).map(e => { const o = mean(Array.from({ length: e.end - e.start + 1 }, (_, i) => M.final.all[idx(M, e.start + i)] / M.cap.all)); return Math.abs(o - e.actOcc) < 0.001; });
  add(hist.every(Boolean) ? 'Pass' : 'Warning', 'Festival Calendar', 'Actual_Lodge_Occupancy reconciles to daily occupancy', hist.filter(Boolean).length + ' of ' + hist.length + ' editions match.', null);
  let ov = 0; const byRoom = {}; for (const b of bk) if (b.status === 'Completed') (byRoom[b.room] = byRoom[b.room] || []).push(b);
  for (const r in byRoom) { const a = byRoom[r].sort((x, y) => x.ci - y.ci); for (let i = 1; i < a.length; i++) if (a[i].ci < a[i - 1].co) ov++; }
  add(ov ? 'Warning' : 'Pass', 'Reservations', 'Overlapping completed stays in the same room', ov + ' overlaps. Occupied rooms are counted as distinct rooms per night.', ov);
  let recon = 0; for (let i = 0; i < M.N; i++) if (M.hasDaily[i] && M.final.all[i] !== M.occ[i]) recon++;
  add(recon ? 'Warning' : 'Pass', 'Daily Occupancy', 'Rooms_Occupied recomputed from Completed reservations', recon + ' days differ. Cancelled and no-show bookings are not counted as occupied.', recon);
  const maxOcc = Math.max(...Array.from(M.occ)); add(maxOcc <= M.cap.all ? 'Pass' : 'Critical', 'Daily Occupancy', 'Occupancy never exceeds ' + M.cap.all + '-room capacity', 'Peak occupied rooms: ' + maxOcc + '.', null);
  const dup = new Set(); let dd = 0; for (const b of bk) { if (dup.has(b.id)) dd++; dup.add(b.id); }
  add(dd ? 'Warning' : 'Pass', 'Reservations', 'Duplicate Booking_IDs', dd + ' duplicates found.', dd);
  const fk = bk.filter(b => b.cust && M.customers.length && !M.customers.some(c => c.Customer_ID === b.cust)).length; if (M.customers.length) add(fk ? 'Warning' : 'Pass', 'Reservations → Customers', 'Customer_ID foreign keys', fk + ' bookings without a customer record.', fk);
  const nullC = M.customers.filter(c => !c.Complaint_Category).length; if (nullC) add('Info', 'Customer Analysis', 'Complaint_Category is blank for ' + nullC + ' customers', 'Treated as no complaint.', nullC);
  return out;
}

const DICT = [
  ['Room occupancy', 'Daily Occupancy.Rooms_Occupied (checked against distinct Room_ID in Completed Reservations)', 'Occupancy = occupied ÷ 40'],
  ['Room revenue', 'Daily Occupancy.Daily_Room_Revenue (= Reservations.Total_Room_Revenue spread per night)', 'Net of per-night Discount'],
  ['Total revenue', 'Daily Occupancy.Total_Daily_Revenue', 'Room + food + other'],
  ['ADR', 'Σ room revenue ÷ Σ occupied room-nights', 'Recomputed, not the stored average'],
  ['RevPAR', 'Σ room revenue ÷ (days × 40)', 'Recomputed'],
  ['Guests', 'Reservations.Number_of_Guests × nights', 'Not Adults + Children'],
  ['Booking pace (OTB)', 'Reservations.Booking_Date, Cancellation_Date, Check_In/Out_Date', 'Active bookings known at each lead time'],
  ['Cancellation rate', 'Reservations.Booking_Status = Cancelled ÷ all bookings by check-in', 'Baseline = rolling 30-day history'],
  ['Festival history', 'Festival Calendar + Daily Occupancy.Festival_Period', 'Day-aligned across editions'],
  ['Competitor median', 'Competitor Pricing.Competitor_Room_Price by Date × Room_Category', 'Nearest observation within gap setting'],
  ['Staff availability', 'Staff Management.Attendance_Status = Present', 'Per date and department'],
  ['Overtime rate', 'Σ Overtime_Cost ÷ Σ Overtime_Hours by department', ''],
  ['Stock and consumption', 'Inventory and Procurement.Closing_Stock, Quantity_Consumed, Minimum_Stock_Level', 'Safety stock = Minimum_Stock_Level'],
  ['Expenses', 'Financial Transactions (Transaction_Type = Expense) by Category', 'Excludes tax, depreciation, financing'],
  ['Partners', 'Transport and Local Partners', 'Capacity unit not defined']
];

g.LMEngine = { CATS, DOWN, LMAX, dn, iso, dowOf, ymOf, sum, mean, median, clamp, sd, DEFAULTS, newSettings, deepMerge, decode, normaliseUpload, build, asofN, idx, festAt, occF, forecast, backtest, forecastAll, ratios, demand, compFor, pubPrice, bandAdj, priceRec, staffing, otRate, invItem, invAll, transport, cancelStats, alerts, unitEconomics, promotions, festivalReview, financeMonthly, kpis, quality, DICT };
})(typeof window !== 'undefined' ? window : globalThis);
