(function () {
  "use strict";

  var CFG = window.APP_CONFIG || {};
  var START = new Date(2026, 8, 21);
  var END   = new Date(2027, 2, 21);
  var WEEKS = 26;
  var P_TARGET = CFG.PROTEIN_TARGET || 75;
  var P_TOP = CFG.PROTEIN_TOP || 90;
  var PRESETS = CFG.PROTEIN_PRESETS || [];
  var PHASES = [ {to:4,name:"Build the habit"}, {to:17,name:"Main block"}, {to:23,name:"Sharpen"}, {to:26,name:"Hold"} ];
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var SHORT  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  var METRICS = {
    weight: { label: "Weight", unit: "lb", suffix: " lb" },
    fat:    { label: "Body fat", unit: "%", suffix: "%" },
    waist:  { label: "Waist", unit: "in", suffix: " in" }
  };

  // The two lift days. lo/hi = rep range; "top of range" is hi.
  // bw = bodyweight (no weight box); unit "sec" = timed.
  var PROGRAM = {
    A: [
      { id: "goblet_squat", name: "Goblet squat or leg press", tip: "Machine first if depth bothers your hips", lo: 8, hi: 10 },
      { id: "db_bench", name: "Dumbbell bench or chest press", lo: 8, hi: 10 },
      { id: "cable_row", name: "Seated cable row", tip: "Squeeze, don’t yank", lo: 10, hi: 12 },
      { id: "db_rdl", name: "Dumbbell Romanian deadlift", tip: "Hinge at the hip, stop at mid-shin", lo: 10, hi: 10 },
      { id: "pallof", name: "Pallof press", tip: "Anti-rotation core", lo: 10, hi: 10, per: "side" },
      { id: "dead_bug", name: "Dead bug", tip: "Low back flat on the floor throughout", lo: 8, hi: 8, per: "side", bw: true }
    ],
    B: [
      { id: "hip_thrust", name: "Hip thrust", tip: "Your heaviest, most hip-friendly loading", lo: 8, hi: 10 },
      { id: "lat_pulldown", name: "Lat pulldown", lo: 8, hi: 10 },
      { id: "db_ohp", name: "Dumbbell overhead press", tip: "Seated with back support is fine", lo: 8, hi: 10 },
      { id: "split_squat", name: "Split squat or step-up", tip: "Clear this one with your PT first", lo: 8, hi: 8, per: "leg" },
      { id: "ab_wheel", name: "Ab wheel rollout or long plank", tip: "Anti-extension core", lo: 6, hi: 8, bw: true },
      { id: "suitcase", name: "Suitcase carry", tip: "Walk tall, don’t lean", lo: 30, hi: 40, unit: "sec" }
    ]
  };

  var S = {
    uid: null, email: "",
    days: {}, measures: {},
    dirty: { days: {}, measures: {} },
    selected: null, viewYear: 0, viewMonth: 0, metric: "weight"
  };
  var sb = null, recovering = false, flushing = false, flushTimer = null, retryTimer = null, dirtySeq = 0;
  var noteKey = null, noteTimer = null, setTimer = null;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function sameDay(a, b) { return iso(a) === iso(b); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  // Weeks run Sunday to Saturday. Week 1 is the week the plan starts in.
  function weekStart(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return addDays(x, -x.getDay()); }
  function weekNum(d) {
    var w = Math.round((weekStart(d) - weekStart(START)) / 604800000) + 1;
    // The last day (Sun Mar 21) begins a 27th Sunday-week; count it as week 26.
    return d <= addDays(END, 1) && w > WEEKS ? WEEKS : w;
  }
  function phaseOf(w) { for (var i = 0; i < PHASES.length; i++) if (w <= PHASES[i].to) return PHASES[i].name; return ""; }
  function inPlan(d) { return d >= START && d <= addDays(END, 1); }
  function shortDate(k) { var d = parse(k); return SHORT[d.getMonth()] + " " + d.getDate(); }
  function num(v) { return typeof v === "number" && isFinite(v); }
  function fmt(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function say(m) { $("status").textContent = m || ""; }

  // ---------- day records ----------
  function blank() {
    return { lift: null, sculpt: false, bonus: false, walk: false, creatine: false, pt: false, protein: false, protein_log: [], sets: {}, note: "" };
  }
  function norm(r) {
    var b = blank();
    Object.keys(b).forEach(function (k) { if (r[k] === undefined || r[k] === null) r[k] = b[k]; });
    if (r.lift !== "A" && r.lift !== "B") r.lift = null;
    return r;
  }
  function rec(k) { if (!S.days[k]) S.days[k] = blank(); return norm(S.days[k]); }
  function pTotal(r) { return (r.protein_log || []).reduce(function (s, x) { return s + (+x.g || 0); }, 0); }
  function pMet(r) { return !!r && (r.protein || pTotal(r) >= P_TARGET); }
  function hasSets(r) {
    return Object.keys(r.sets || {}).some(function (id) { return (r.sets[id] || []).some(function (s) { return s && (num(s.w) || num(s.r)); }); });
  }
  function setsFor(k) { var w = weekNum(parse(k)); return w >= 1 && w <= 4 ? 2 : 3; }

  function nextLetter(k) {
    var n = 0;
    Object.keys(S.days).forEach(function (d) { if (d < k && S.days[d].lift) n++; });
    return n % 2 === 0 ? "A" : "B";
  }

  // ---------- this-device storage ----------
  function key(name) { return "w26:" + S.uid + ":" + name; }
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function persist() { lsSet(key("days"), S.days); lsSet(key("measures"), S.measures); lsSet(key("dirty"), S.dirty); }
  function loadLocal() {
    S.days = lsGet(key("days")) || {};
    S.measures = lsGet(key("measures")) || {};
    S.dirty = lsGet(key("dirty")) || { days: {}, measures: {} };
    // Bring over data saved by the original single-file version, if any.
    if (S.uid === "local" && !Object.keys(S.days).length) {
      var oldDays = lsGet("days"), oldM = lsGet("measures");
      if (oldDays) S.days = oldDays;
      if (Array.isArray(oldM)) oldM.forEach(function (m) { S.measures[m.date] = m; });
    }
    Object.keys(S.days).forEach(function (k) { norm(S.days[k]); });
  }

  // ---------- syncing with the database ----------
  function hasDirty() { return Object.keys(S.dirty.days).length + Object.keys(S.dirty.measures).length > 0; }
  function setSync(text, warn) { var s = $("sync"); s.textContent = text || ""; s.classList.toggle("warn", !!warn); }

  function markDay(k) { S.dirty.days[k] = ++dirtySeq; persist(); scheduleFlush(); }
  function markMeasure(k) { S.dirty.measures[k] = ++dirtySeq; persist(); scheduleFlush(); }

  function scheduleFlush() {
    if (!sb) return;
    setSync("Saving…");
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 600);
  }

  function dayRow(k, r) {
    return {
      user_id: S.uid, date: k, lift: r.lift, sculpt: !!r.sculpt, bonus: !!r.bonus, walk: !!r.walk,
      creatine: !!r.creatine, pt: !!r.pt, protein: !!r.protein, protein_log: r.protein_log || [], sets: r.sets || {},
      note: r.note || "", updated_at: new Date().toISOString()
    };
  }
  function fromDayRow(row) {
    return norm({
      lift: row.lift, sculpt: row.sculpt, bonus: row.bonus, walk: row.walk, creatine: row.creatine, pt: row.pt,
      protein: row.protein, protein_log: row.protein_log, sets: row.sets, note: row.note
    });
  }
  function measureRow(m) {
    return {
      user_id: S.uid, date: m.date,
      weight: num(m.weight) ? m.weight : null, fat: num(m.fat) ? m.fat : null, waist: num(m.waist) ? m.waist : null,
      updated_at: new Date().toISOString()
    };
  }
  function fromMeasureRow(row) {
    var m = { id: row.date, date: row.date };
    ["weight", "fat", "waist"].forEach(function (f) { if (row[f] !== null && row[f] !== undefined) m[f] = +row[f]; });
    return m;
  }

  function flush() {
    if (!sb || !S.uid || flushing) return Promise.resolve();
    if (!hasDirty()) { setSync("Synced"); return Promise.resolve(); }
    if (navigator.onLine === false) { setSync("Offline — saved on this device", true); return Promise.resolve(); }
    flushing = true;
    var failed = false;
    var snapD = Object.assign({}, S.dirty.days), snapM = Object.assign({}, S.dirty.measures);
    var dKeys = Object.keys(snapD), mKeys = Object.keys(snapM);
    var mUp = mKeys.filter(function (k) { return S.measures[k]; });
    var mDel = mKeys.filter(function (k) { return !S.measures[k]; });
    var jobs = [];
    if (dKeys.length) jobs.push(sb.from("days").upsert(dKeys.map(function (k) { return dayRow(k, rec(k)); }), { onConflict: "user_id,date" }));
    if (mUp.length) jobs.push(sb.from("measures").upsert(mUp.map(function (k) { return measureRow(S.measures[k]); }), { onConflict: "user_id,date" }));
    if (mDel.length) jobs.push(sb.from("measures").delete().in("date", mDel));
    return Promise.all(jobs).then(function (res) {
      var err = res.filter(function (r) { return r.error; })[0];
      if (err) throw err.error;
      // Only clear what we sent; anything edited mid-flight stays queued.
      dKeys.forEach(function (k) { if (S.dirty.days[k] === snapD[k]) delete S.dirty.days[k]; });
      mKeys.forEach(function (k) { if (S.dirty.measures[k] === snapM[k]) delete S.dirty.measures[k]; });
      persist();
      setSync(hasDirty() ? "Saving…" : "Synced");
    }).catch(function (e) {
      console.warn("Sync failed", e);
      failed = true;
      setSync("Couldn’t reach the database — saved on this device, will retry", true);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(flush, 15000);
    }).then(function () {
      flushing = false;
      if (!failed && hasDirty()) scheduleFlush();
    });
  }

  function pull() {
    if (!sb || !S.uid) return Promise.resolve();
    if (navigator.onLine === false) { setSync("Offline — saved on this device", true); return Promise.resolve(); }
    return Promise.all([sb.from("days").select("*"), sb.from("measures").select("*")]).then(function (res) {
      if (res[0].error || res[1].error) throw (res[0].error || res[1].error);
      var days = {}, measures = {};
      res[0].data.forEach(function (row) { days[row.date] = fromDayRow(row); });
      res[1].data.forEach(function (row) { measures[row.date] = fromMeasureRow(row); });
      // Unsynced edits on this device win over what the database had.
      Object.keys(S.dirty.days).forEach(function (k) { if (S.days[k]) days[k] = S.days[k]; });
      Object.keys(S.dirty.measures).forEach(function (k) { if (S.measures[k]) measures[k] = S.measures[k]; else delete measures[k]; });
      S.days = days; S.measures = measures;
      persist();
      var a = document.activeElement;
      var typing = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA");
      if (typing) { renderRunway(); renderMonth(); renderWeek(); renderTotals(); renderMeasures(); }
      else renderAll();
      return flush();
    }).catch(function (e) {
      console.warn("Load failed", e);
      setSync("Couldn’t reach the database — showing what’s on this device", true);
    });
  }

  // ---------- rendering ----------
  function renderRunway() {
    var today = new Date();
    var w = inPlan(today) ? weekNum(today) : (today < START ? 0 : WEEKS);
    $("fill").style.width = Math.max(0, Math.min(100, (w / WEEKS) * 100)) + "%";
    $("capLeft").textContent = w < 1 ? "Starts Sep 21" : "Week " + w + " of 26";
    var left = WEEKS - w, cap = $("capRight");
    cap.textContent = "";
    if (left <= 0) cap.appendChild(el("b", null, "Wedding week"));
    else { cap.appendChild(el("b", null, String(left))); cap.appendChild(document.createTextNode(" " + (left === 1 ? "week" : "weeks") + " to go")); }
  }

  function renderMonth() {
    var first = new Date(S.viewYear, S.viewMonth, 1), today = new Date();
    $("monthTitle").textContent = MONTHS[S.viewMonth] + " " + S.viewYear;
    $("monthMeta").textContent = inPlan(today) ? phaseOf(weekNum(today)) : "Plan runs Sep 21 – Mar 21";
    var gridStart = weekStart(first), grid = $("grid");
    grid.textContent = "";
    for (var i = 0; i < 42; i++) {
      var d = addDays(gridStart, i);
      if (i >= 35 && d.getMonth() !== S.viewMonth) break;
      var k = iso(d), r = S.days[k] || {};
      var b = el("button", "day"
        + (d.getMonth() !== S.viewMonth ? " outside" : "")
        + (sameDay(d, today) ? " today" : "")
        + (S.selected && sameDay(d, S.selected) ? " sel" : ""));
      b.type = "button";
      var bits = [];
      if (r.lift) bits.push("Lift " + r.lift);
      if (r.sculpt) bits.push("Sculpt");
      if (r.bonus) bits.push("Lagree or core");
      if (r.walk) bits.push("Walk");
      if (r.creatine) bits.push("Creatine");
      if (r.pt) bits.push("Physical therapy");
      if (pMet(r)) bits.push("Protein goal");
      b.setAttribute("aria-label", DAYS[d.getDay()] + " " + SHORT[d.getMonth()] + " " + d.getDate() + (bits.length ? ": " + bits.join(", ") : ""));
      b.appendChild(el("span", "num", String(d.getDate())));
      var marks = el("span", "marks");
      if (r.lift) marks.appendChild(el("span", "g lift", r.lift));
      if (r.sculpt) marks.appendChild(el("span", "g sculpt"));
      if (r.bonus) marks.appendChild(el("span", "g core"));
      b.appendChild(marks);
      if (r.walk) b.appendChild(el("span", "walkbar"));
      if (pMet(r)) b.appendChild(el("span", "pdot"));
      if (r.creatine) b.appendChild(el("span", "cdot"));
      if (r.pt) b.appendChild(el("span", "xdot"));
      if (r.note && r.note.trim()) b.appendChild(el("span", "ndot"));
      (function (dd) { b.addEventListener("click", function () { S.selected = dd; renderAll(); }); })(d);
      grid.appendChild(b);
    }
    $("prev").disabled = (S.viewYear === 2026 && S.viewMonth <= 8);
    $("next").disabled = (S.viewYear === 2027 && S.viewMonth >= 2);
  }

  function changed(k) { markDay(k); renderMonth(); renderWeek(); renderTotals(); }

  function renderEditor() {
    var k = iso(S.selected), r = rec(k), today = new Date();
    $("edTitle").textContent = (sameDay(S.selected, today) ? "Today · " : "") + DAYS[S.selected.getDay()] + " " + SHORT[S.selected.getMonth()] + " " + S.selected.getDate();
    $("edHint").textContent = inPlan(S.selected)
      ? "Tap what you did. Walking or jogging stacks with anything else."
      : "Outside the 26 weeks, but you can still log it.";
    $("mFor").textContent = "Saves for " + shortDate(k) + ". Tap another day on the calendar to log a different date.";

    var defs = [
      { cls: "lift", label: r.lift ? "Lift " + r.lift : "Lift", on: !!r.lift,
        act: function () {
          if (r.lift === null) r.lift = nextLetter(k);
          else if (r.lift === "A") r.lift = "B";
          else if (hasSets(r) && !confirm("Turn off Lift for this day? The sets you logged will be kept but hidden.")) return false;
          else r.lift = null;
        } },
      { cls: "sculpt round", label: "Sculpt", on: r.sculpt, act: function () { r.sculpt = !r.sculpt; } },
      { cls: "core round", label: "Lagree or core", on: r.bonus, act: function () { r.bonus = !r.bonus; } },
      { cls: "walk bar", label: "Walk or jog", on: r.walk, act: function () { r.walk = !r.walk; } },
      { cls: "creatine", label: "Creatine", habit: true, on: r.creatine, act: function () { r.creatine = !r.creatine; } },
      { cls: "protein round", label: "Protein goal", habit: true, on: pMet(r),
        act: function () {
          if (pTotal(r) >= P_TARGET) { say("Goal already met from the grams you logged."); return false; }
          r.protein = !r.protein;
        } },
      { cls: "pt", label: "PT", habit: true, on: r.pt, act: function () { r.pt = !r.pt; } }
    ];
    var box = $("toggles");
    box.textContent = "";
    var rowA = el("div", "tgrow four"), rowB = el("div", "tgrow three");
    box.appendChild(rowA); box.appendChild(rowB);
    defs.forEach(function (def) {
      var b = el("button", "tg " + def.cls);
      b.type = "button";
      b.setAttribute("aria-pressed", def.on ? "true" : "false");
      b.appendChild(el("span", "glyph"));
      b.appendChild(el("span", null, def.label));
      b.addEventListener("click", function () {
        if (def.act() === false) return;
        say("");
        changed(k);
        renderEditor();
      });
      (def.habit ? rowB : rowA).appendChild(b);
    });

    renderProtein(k, r);
    renderWorkout(k, r);

    var ta = $("dayNote");
    if (noteKey !== k) { ta.value = r.note || ""; noteKey = k; }
    else if (document.activeElement !== ta && ta.value !== (r.note || "")) ta.value = r.note || "";
  }

  // ---------- protein ----------
  function renderProtein(k, r) {
    var total = pTotal(r), tEl = $("pTotal");
    tEl.textContent = "";
    tEl.appendChild(el("b", null, String(total)));
    tEl.appendChild(document.createTextNode(" / " + P_TARGET + "–" + P_TOP + " g"));
    $("pFill").style.width = Math.min(100, total / P_TARGET * 100) + "%";

    var pre = $("presets");
    pre.textContent = "";
    PRESETS.forEach(function (p) {
      var b = el("button", "pbtn");
      b.type = "button";
      b.appendChild(el("b", null, "+" + p.g));
      b.appendChild(document.createTextNode(" " + p.label));
      b.addEventListener("click", function () { addProtein(k, p.g, p.label); });
      pre.appendChild(b);
    });

    var log = $("pLog");
    log.textContent = "";
    (r.protein_log || []).forEach(function (x, i) {
      var item = el("span", "pitem", x.g + " g" + (x.label ? " " + x.label : ""));
      var rm = el("button", null, "×");
      rm.type = "button";
      rm.setAttribute("aria-label", "Remove " + x.g + " g " + (x.label || ""));
      rm.addEventListener("click", function () {
        r.protein_log.splice(i, 1);
        changed(k); renderEditor();
      });
      item.appendChild(rm);
      log.appendChild(item);
    });
  }

  function addProtein(k, g, label) {
    var r = rec(k), before = pTotal(r);
    r.protein_log.push({ g: g, label: label || "" });
    changed(k); renderEditor();
    if (before < P_TARGET && pTotal(r) >= P_TARGET) say("Protein goal hit for " + shortDate(k) + ".");
  }

  // ---------- workout log ----------
  function rangeText(ex) {
    var reps = ex.lo === ex.hi ? String(ex.lo) : ex.lo + "–" + ex.hi;
    if (ex.unit === "sec") return reps + " sec";
    return reps + (ex.per ? " / " + ex.per : "");
  }
  function filled(sets) { return (sets || []).filter(function (s) { return s && num(s.r); }); }

  function lastSession(exId, beforeK) {
    var ks = Object.keys(S.days).filter(function (d) { return d < beforeK; }).sort().reverse();
    for (var i = 0; i < ks.length; i++) {
      var sets = filled((S.days[ks[i]].sets || {})[exId]);
      if (sets.length) return { date: ks[i], sets: sets };
    }
    return null;
  }
  function describe(ex, sets) {
    var ws = sets.map(function (s) { return s.w; }).filter(num);
    var same = ws.length === sets.length && ws.every(function (w) { return w === ws[0]; });
    var unit = ex.unit === "sec" ? "s" : "";
    var reps = sets.map(function (s) { return s.r + unit; }).join(", ");
    if (!ws.length) return reps;
    if (same) return ws[0] + " lb × " + reps;
    return sets.map(function (s) { return (num(s.w) ? s.w + "×" : "") + s.r + unit; }).join(", ");
  }
  function readyToGoUp(ex, last, k) {
    return !!last && last.sets.length >= Math.min(setsFor(last.date), setsFor(k)) &&
      last.sets.every(function (s) { return s.r >= ex.hi; });
  }

  function renderWorkout(k, r) {
    var box = $("workout");
    if (!r.lift) { box.hidden = true; box.textContent = ""; return; }
    box.hidden = false;
    box.textContent = "";
    var n = setsFor(k);
    var head = el("div", "panel-head");
    head.appendChild(el("span", "panel-title", "Lift " + r.lift));
    head.appendChild(el("span", "ptotal", n + " sets each"));
    box.appendChild(head);
    box.appendChild(el("p", "wsub", n === 2
      ? "Weeks 1–4: 2 sets while you learn the movements. Last time’s numbers show in grey."
      : "Rest 60–90 seconds between sets. Last time’s numbers show in grey."));

    PROGRAM[r.lift].forEach(function (ex) {
      var blk = el("div", "ex-block");
      var h = el("div", "ex-head");
      h.appendChild(el("span", "ex-name", ex.name));
      h.appendChild(el("span", "ex-target", n + " × " + rangeText(ex)));
      blk.appendChild(h);
      if (ex.tip) blk.appendChild(el("div", "ex-tip", ex.tip));

      var last = lastSession(ex.id, k);
      if (last) {
        blk.appendChild(el("div", "ex-last", "Last time (" + shortDate(last.date) + "): " + describe(ex, last.sets)));
        if (readyToGoUp(ex, last, k)) {
          blk.appendChild(el("span", "upnote", ex.bw
            ? "↑ Top of the range every set — make it a little harder"
            : "↑ Top of the range every set — go up by the smallest step"));
        }
      }

      var rows = el("div", "setrows");
      var cur = (r.sets[ex.id] = r.sets[ex.id] || []);
      for (var i = 0; i < n; i++) rows.appendChild(setRow(k, ex, i, cur, last));
      blk.appendChild(rows);

      if (last && !filled(cur).length) {
        var cp = el("button", "linkbtn copybtn", "Copy last time");
        cp.type = "button";
        cp.addEventListener("click", function () {
          r.sets[ex.id] = last.sets.slice(0, n).map(function (s) { return { w: s.w, r: s.r }; });
          changed(k); renderEditor();
        });
        blk.appendChild(cp);
      }
      box.appendChild(blk);
    });
  }

  function setRow(k, ex, i, cur, last) {
    var row = el("div", "setrow");
    row.appendChild(el("span", "sn", "Set " + (i + 1)));
    var s = cur[i] || {}, prev = last && last.sets[i];
    function field(prop, unit, ph) {
      var lab = el("label");
      var inp = el("input");
      inp.type = "number"; inp.inputMode = "decimal"; inp.min = "0"; inp.step = prop === "w" ? "0.5" : "1";
      inp.value = num(s[prop]) ? s[prop] : "";
      if (ph != null) inp.placeholder = ph;
      inp.setAttribute("aria-label", ex.name + " set " + (i + 1) + " " + (prop === "w" ? "weight in pounds" : unit));
      inp.addEventListener("input", function () {
        var v = parseFloat(inp.value);
        cur[i] = cur[i] || {};
        if (isNaN(v)) delete cur[i][prop]; else cur[i][prop] = v;
        clearTimeout(setTimer);
        setTimer = setTimeout(function () { changed(k); }, 500);
      });
      inp.addEventListener("blur", function () { clearTimeout(setTimer); changed(k); });
      lab.appendChild(inp);
      lab.appendChild(document.createTextNode(unit));
      return lab;
    }
    if (!ex.bw) row.appendChild(field("w", "lb", prev && num(prev.w) ? prev.w : null));
    row.appendChild(field("r", ex.unit === "sec" ? "sec" : "reps", prev && num(prev.r) ? prev.r : null));
    return row;
  }

  // ---------- week + totals ----------
  function renderWeek() {
    var mon = weekStart(S.selected), w = weekNum(S.selected);
    var L = 0, Sc = 0, C = 0, W = 0, P = 0, Cr = 0, Pt = 0;
    for (var i = 0; i < 7; i++) {
      var r = S.days[iso(addDays(mon, i))];
      if (!r) continue;
      if (r.lift) L++;
      if (r.sculpt) Sc++;
      if (r.bonus) C++;
      if (r.walk) W++;
      if (pMet(r)) P++;
      if (r.creatine) Cr++;
      if (r.pt) Pt++;
    }
    $("wkLead").textContent = (w >= 1 && w <= WEEKS) ? "Week " + w + " of 26" : "Outside the plan";
    var q = $("wkQuota");
    q.textContent = "";
    [["l", L >= 2, "Lifts", L + "/2"], ["s", Sc >= 2, "Sculpt", Sc + "/2"], ["c", C >= 1, "Lagree or core", String(C)],
     ["w", W >= 3, "Walk or jog", String(W)], ["p", P >= 5, "Protein", P + "/7"], ["cr", Cr >= 7, "Creatine", Cr + "/7"], ["pt", Pt >= 1, "PT", String(Pt)]]
      .forEach(function (c) {
        var chip = el("span", "chip " + c[0] + (c[1] ? " met" : ""), c[2] + " ");
        chip.appendChild(el("b", null, c[3]));
        q.appendChild(chip);
      });
    $("bravo").textContent = (L >= 2 && Sc >= 2) ? "Full quota this week." : "";
  }

  function renderTotals() {
    var lifts = 0, studio = 0, walk = 0, prot = 0, crea = 0, pt = 0, full = 0;
    Object.keys(S.days).forEach(function (k) {
      var r = S.days[k];
      if (r.lift) lifts++;
      if (r.sculpt) studio++;
      if (r.bonus) studio++;
      if (r.walk) walk++;
      if (pMet(r)) prot++;
      if (r.creatine) crea++;
      if (r.pt) pt++;
    });
    for (var w = 1; w <= WEEKS; w++) {
      var mon = addDays(weekStart(START), (w - 1) * 7), L = 0, Sc = 0;
      for (var i = 0; i < 7; i++) {
        var r = S.days[iso(addDays(mon, i))];
        if (!r) continue;
        if (r.lift) L++;
        if (r.sculpt) Sc++;
      }
      if (L >= 2 && Sc >= 2) full++;
    }
    var t = $("totals");
    t.textContent = "";
    [[lifts, "lifts", "--lift"], [studio, "studio sessions", "--sculpt"], [walk, "walk or jog days", "--walk"],
     [prot, "protein days", "--protein"], [crea, "creatine days", "--creatine"], [pt, "PT days", "--pt"], [full, "weeks at full quota", "--gold"]]
      .forEach(function (p) {
        var d = el("div", "tot");
        var big = el("div", "big", String(p[0]));
        big.style.color = "var(" + p[2] + ")";
        d.appendChild(big);
        d.appendChild(el("div", "cap", p[1]));
        t.appendChild(d);
      });
  }

  // ---------- measurements ----------
  function sortedMeasures() {
    return Object.keys(S.measures).sort().map(function (k) { return S.measures[k]; });
  }

  function renderMeasures() { renderHist(); renderChart(); }

  function firstOf(field) {
    var first = sortedMeasures().filter(function (m) { return num(m[field]); })[0];
    return first ? first[field] : null;
  }

  function renderHist() {
    var wrap = $("histWrap"), all = sortedMeasures();
    wrap.textContent = "";
    if (!all.length) {
      wrap.appendChild(el("p", "empty-note", "No entries yet. Your first entry becomes your starting point."));
      return;
    }
    var table = el("table", "hist"), thead = el("thead"), hr = el("tr");
    ["Date", "Weight", "Body fat", "Waist", ""].forEach(function (h) { hr.appendChild(el("th", null, h)); });
    thead.appendChild(hr); table.appendChild(thead);
    var tb = el("tbody");
    all.slice().reverse().slice(0, 8).forEach(function (m) {
      var tr = el("tr");
      tr.appendChild(el("td", null, shortDate(m.date)));
      [["weight", "", firstOf("weight")], ["fat", "%", firstOf("fat")], ["waist", "", firstOf("waist")]].forEach(function (f) {
        var td = el("td");
        if (num(m[f[0]])) {
          td.appendChild(document.createTextNode(fmt(m[f[0]]) + f[1]));
          if (f[2] !== null) {
            var dv = m[f[0]] - f[2];
            td.appendChild(document.createTextNode(" "));
            td.appendChild(el("span", "delta" + (dv < 0 ? " down" : ""), (dv >= 0 ? "+" : "") + fmt(dv)));
          }
        } else td.textContent = "—";
        tr.appendChild(td);
      });
      var x = el("td", "x"), del = el("button", null, "×");
      del.type = "button";
      del.setAttribute("aria-label", "Delete entry for " + shortDate(m.date));
      del.addEventListener("click", function () {
        if (!confirm("Delete the entry for " + shortDate(m.date) + "?")) return;
        delete S.measures[m.date];
        markMeasure(m.date);
        renderMeasures();
      });
      x.appendChild(del);
      tr.appendChild(x);
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    wrap.appendChild(table);
  }

  // 7-day average: each point averages every reading in the 7 days ending that day.
  function withAverage(pts) {
    return pts.map(function (p, i) {
      var from = addDays(p.d, -6), sum = 0, n = 0;
      for (var j = i; j >= 0 && pts[j].d >= from; j--) { sum += pts[j].v; n++; }
      return { d: p.d, k: p.k, v: p.v, avg: sum / n };
    });
  }

  function renderChart() {
    var M = METRICS[S.metric], box = $("chart"), sum = $("tSum");
    document.querySelectorAll(".seg button").forEach(function (b) {
      b.setAttribute("aria-selected", b.dataset.metric === S.metric ? "true" : "false");
    });
    var pts = sortedMeasures().filter(function (m) { return num(m[S.metric]); })
      .map(function (m) { return { d: parse(m.date), k: m.date, v: m[S.metric] }; });
    pts = withAverage(pts);
    box.textContent = ""; sum.textContent = "";

    // "Start" is her first entry for this measurement.
    var base = pts.length ? pts[0].v : null;
    if (pts.length) {
      var lastP = pts[pts.length - 1];
      function stat(big, cap, cls) {
        var d = el("div"); var b = el("div", "big" + (cls ? " " + cls : ""), big);
        d.appendChild(b); d.appendChild(el("div", "cap", cap)); sum.appendChild(d);
      }
      stat(fmt(lastP.avg) + M.suffix, "7-day average");
      if (base !== null) {
        var dv = lastP.avg - base;
        stat((dv > 0 ? "+" : dv < 0 ? "−" : "") + fmt(Math.abs(dv)) + M.suffix, "since start", dv < 0 ? "down" : "");
      }
      stat(String(pts.length), pts.length === 1 ? "entry" : "entries");
    }
    if (pts.length < 2) {
      box.appendChild(el("p", "empty-note", pts.length ? "Log one more to start the trend line." : "No " + M.label.toLowerCase() + " entries yet."));
      return;
    }

    var W = Math.max(280, box.clientWidth || 340), H = 190;
    var L = 38, R = 10, T = 10, B = 24;
    var x0 = pts[0].d.getTime(), x1 = Math.max(pts[pts.length - 1].d.getTime(), x0 + 6 * 864e5);
    var vals = pts.map(function (p) { return p.v; });
    if (base !== null) vals.push(base);
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var span = Math.max(hi - lo, S.metric === "weight" ? 2 : 1);
    var mid = (hi + lo) / 2; lo = mid - span * 0.6; hi = mid + span * 0.6;
    function X(t) { return L + (t - x0) / (x1 - x0) * (W - L - R); }
    function Y(v) { return T + (hi - v) / (hi - lo) * (H - T - B); }

    var NS = "http://www.w3.org/2000/svg";
    function s(tag, attrs, cls) {
      var e = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (a) { e.setAttribute(a, attrs[a]); });
      if (cls) e.setAttribute("class", cls);
      return e;
    }
    var svg = s("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img",
      "aria-label": M.label + " trend: latest 7-day average " + fmt(pts[pts.length - 1].avg) + M.suffix });

    // y gridlines at 3 even steps
    for (var g = 0; g < 3; g++) {
      var gv = lo + (hi - lo) * (0.15 + g * 0.35), gy = Y(gv);
      svg.appendChild(s("line", { x1: L, x2: W - R, y1: gy, y2: gy }, "gridline"));
      var tl = s("text", { x: L - 6, y: gy + 4, "text-anchor": "end" }, "axis");
      tl.textContent = fmt(gv);
      svg.appendChild(tl);
    }
    if (base !== null) {
      var by = Y(base);
      svg.appendChild(s("line", { x1: L, x2: W - R, y1: by, y2: by }, "baseline"));
      var bl = s("text", { x: W - R, y: by - 5, "text-anchor": "end" }, "axis");
      bl.textContent = "Start " + fmt(base);
      svg.appendChild(bl);
    }
    [[pts[0], "start"], [pts[pts.length - 1], "end"]].forEach(function (a) {
      var t = s("text", { x: X(a[0].d.getTime()), y: H - 6, "text-anchor": a[1] }, "axis");
      t.textContent = shortDate(a[0].k);
      svg.appendChild(t);
    });

    pts.forEach(function (p) { svg.appendChild(s("circle", { cx: X(p.d.getTime()), cy: Y(p.v), r: 4 }, "pt")); });
    var dstr = pts.map(function (p, i) { return (i ? "L" : "M") + X(p.d.getTime()).toFixed(1) + " " + Y(p.avg).toFixed(1); }).join(" ");
    svg.appendChild(s("path", { d: dstr }, "avg"));

    // hover / tap layer
    var cross = s("line", { y1: T, y2: H - B, visibility: "hidden" }, "cross");
    var hot = s("circle", { r: 5, visibility: "hidden" }, "hot");
    svg.appendChild(cross); svg.appendChild(hot);
    var hit = s("rect", { x: L, y: 0, width: W - L - R, height: H, fill: "transparent" });
    svg.appendChild(hit);
    var tip = el("div", "tip"); tip.hidden = true;
    function show(evt) {
      var rect = svg.getBoundingClientRect(), mx = (evt.clientX - rect.left) * (W / rect.width);
      var best = pts[0], bd = Infinity;
      pts.forEach(function (p) { var dd = Math.abs(X(p.d.getTime()) - mx); if (dd < bd) { bd = dd; best = p; } });
      var px = X(best.d.getTime());
      cross.setAttribute("x1", px); cross.setAttribute("x2", px); cross.setAttribute("visibility", "visible");
      hot.setAttribute("cx", px); hot.setAttribute("cy", Y(best.v)); hot.setAttribute("visibility", "visible");
      tip.textContent = "";
      tip.appendChild(el("div", "muted", shortDate(best.k)));
      var l1 = el("div"); l1.appendChild(el("b", null, fmt(best.v) + M.suffix)); tip.appendChild(l1);
      tip.appendChild(el("div", "muted", "7-day avg " + fmt(best.avg) + M.suffix));
      tip.hidden = false;
      var left = px * (rect.width / W);
      tip.style.left = Math.max(60, Math.min(rect.width - 60, left)) + "px";
      tip.style.top = "-6px";
    }
    function hide() { cross.setAttribute("visibility", "hidden"); hot.setAttribute("visibility", "hidden"); tip.hidden = true; }
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", hide);

    box.appendChild(svg);
    box.appendChild(tip);
    var leg = el("div", "legend");
    var a = el("span"); a.appendChild(el("i", "ld")); a.appendChild(document.createTextNode("Each morning")); leg.appendChild(a);
    var b2 = el("span"); b2.appendChild(el("i", "ll")); b2.appendChild(document.createTextNode("7-day average")); leg.appendChild(b2);
    box.appendChild(leg);
  }

  function renderReference() {
    var wrap = $("refLifts");
    wrap.textContent = "";
    ["A", "B"].forEach(function (letter) {
      var det = el("details", "card " + letter.toLowerCase());
      var sm = el("summary"); sm.appendChild(el("span", "tab")); sm.appendChild(document.createTextNode("Lift " + letter));
      det.appendChild(sm);
      var body = el("div", "body"), table = el("table", "ex");
      PROGRAM[letter].forEach(function (ex) {
        var tr = el("tr"), td = el("td", null, ex.name);
        if (ex.tip) td.appendChild(el("span", "tipline", ex.tip));
        tr.appendChild(td);
        tr.appendChild(el("td", "sets", "3 × " + rangeText(ex)));
        table.appendChild(tr);
      });
      body.appendChild(table);
      var p = el("p");
      if (letter === "A") p.textContent = "Weeks 1–4, do 2 sets instead of 3 while you learn the movements.";
      else {
        p.appendChild(el("b", null, "Adding weight: "));
        p.appendChild(document.createTextNode("once you hit the top of the rep range on every set, go up by the smallest increment available and drop back to the bottom of the range. The app flags this for you."));
      }
      body.appendChild(p);
      det.appendChild(body);
      wrap.appendChild(det);
    });
  }

  function renderAll() { renderRunway(); renderMonth(); renderEditor(); renderWeek(); renderTotals(); renderMeasures(); }

  // ---------- wiring ----------
  function wire() {
    var ta = $("dayNote");
    function commit() {
      var k = iso(S.selected), r = rec(k);
      if (r.note === ta.value) return;
      r.note = ta.value;
      markDay(k); renderMonth();
    }
    ta.addEventListener("input", function () { clearTimeout(noteTimer); noteTimer = setTimeout(commit, 700); });
    ta.addEventListener("blur", function () { clearTimeout(noteTimer); commit(); });

    $("prev").addEventListener("click", function () { S.viewMonth--; if (S.viewMonth < 0) { S.viewMonth = 11; S.viewYear--; } renderMonth(); });
    $("next").addEventListener("click", function () { S.viewMonth++; if (S.viewMonth > 11) { S.viewMonth = 0; S.viewYear++; } renderMonth(); });

    $("pAddForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var g = parseInt($("pCustom").value, 10);
      if (!(g > 0 && g <= 200)) { say("Enter grams between 1 and 200."); return; }
      $("pCustom").value = "";
      addProtein(iso(S.selected), g, "");
    });

    $("mSave").addEventListener("click", function () {
      var w = parseFloat($("mWeight").value), f = parseFloat($("mFat").value), wa = parseFloat($("mWaist").value);
      if (isNaN(w) && isNaN(f) && isNaN(wa)) { say("Fill in at least one number first."); return; }
      var k = iso(S.selected), m = Object.assign({ id: k, date: k }, S.measures[k] || {});
      if (!isNaN(w)) m.weight = w;
      if (!isNaN(f)) m.fat = f;
      if (!isNaN(wa)) m.waist = wa;
      S.measures[k] = m;
      markMeasure(k);
      ["mWeight", "mFat", "mWaist"].forEach(function (id) { $(id).value = ""; });
      renderMeasures();
      say("Saved for " + shortDate(k) + ".");
    });

    document.querySelectorAll(".seg button").forEach(function (b) {
      b.addEventListener("click", function () { S.metric = b.dataset.metric; renderChart(); });
    });

    var rz;
    window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(renderChart, 150); });
    window.addEventListener("online", function () { flush(); });
    window.addEventListener("offline", function () { setSync("Offline — saved on this device", true); });
    document.addEventListener("visibilitychange", function () {
      // Coming back to the app: pick up anything logged on the other device.
      if (document.visibilityState === "visible") pull();
      else flush();
    });

    $("signOut").addEventListener("click", function () {
      var go = function () { sb.auth.signOut(); };
      if (hasDirty()) {
        flush().then(function () {
          if (!hasDirty() || confirm("Some changes haven’t reached the database yet and will be lost on this device. Sign out anyway?")) go();
        });
      } else go();
    });
  }

  function startApp(user) {
    S.uid = user ? user.id : "local";
    S.email = user ? user.email : "";
    var today = new Date();
    S.selected = inPlan(today) ? today : new Date(START);
    S.viewYear = S.selected.getFullYear();
    S.viewMonth = S.selected.getMonth();
    loadLocal();
    $("login").hidden = true;
    $("app").hidden = false;
    $("who").textContent = user ? "Signed in as " + user.email : "Saving on this device only — not connected to a database yet.";
    $("signOut").hidden = !user;
    renderReference();
    renderAll();
    if (sb) { setSync("Loading…"); pull(); }
  }

  // ---------- sign in ----------
  function ls(m) { $("loginStatus").textContent = m || ""; }

  function showLogin() {
    $("app").hidden = true;
    $("login").hidden = false;
    $("signInForm").hidden = false;
    $("resetForm").hidden = true;
    $("loginLede").textContent = "Sign in once and this device stays signed in.";
  }

  // Reached from the "reset your password" email link.
  function showReset() {
    $("app").hidden = true;
    $("login").hidden = false;
    $("signInForm").hidden = true;
    $("resetForm").hidden = false;
    $("loginLede").textContent = "Choose a new password.";
    ls("");
  }

  function wireLogin() {
    $("signInForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = $("signInForm").querySelector("button.save");
      btn.disabled = true; ls("Signing in…");
      sb.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value }).then(function (res) {
        btn.disabled = false;
        if (res.error) { ls("Couldn’t sign in: " + res.error.message); return; }
        ls(""); $("password").value = "";
      });
    });
    $("forgot").addEventListener("click", function () {
      var email = $("email").value.trim();
      if (!email) { ls("Type your email above first, then tap Forgot password."); $("email").focus(); return; }
      ls("Sending…");
      sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function (res) {
        ls(res.error ? "Couldn’t send the email: " + res.error.message
          : "Check " + email + " for a reset link. Open it, choose a new password, then come back here and sign in.");
      });
    });
    $("resetForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = $("resetForm").querySelector("button.save");
      btn.disabled = true; ls("Saving…");
      sb.auth.updateUser({ password: $("newPassword").value }).then(function (res) {
        btn.disabled = false;
        if (res.error) { ls("Couldn’t save it: " + res.error.message); return; }
        $("newPassword").value = "";
        ls("Password saved. If you use the app from your home screen, open it there and sign in with the new password.");
        sb.auth.getUser().then(function (u) { if (u.data && u.data.user) { recovering = false; startApp(u.data.user); } });
      });
    });
  }

  function init() {
    wire();
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || !window.supabase) { startApp(null); return; }

    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    wireLogin();
    var started = false;
    sb.auth.onAuthStateChange(function (event, session) {
      // Supabase warns against awaiting other calls inside this callback, so defer.
      setTimeout(function () {
        if (event === "PASSWORD_RECOVERY") { recovering = true; showReset(); return; }
        if (recovering) return;
        if (session && session.user && (!started || S.uid !== session.user.id)) { started = true; startApp(session.user); }
        else if (!session && event === "SIGNED_OUT") { started = false; S.uid = null; showLogin(); }
      }, 0);
    });
    sb.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) showLogin();
    });
  }

  init();
})();
