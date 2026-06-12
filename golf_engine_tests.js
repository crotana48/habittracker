// Unit tests for the WHS handicap engine inside golf.html.
// Run on macOS (no install):  osascript -l JavaScript golf_engine_tests.js
// Or with Node:               node golf_engine_tests.js
// The engine is a pure block (no DOM) between ENGINE-START/ENGINE-END markers.
'use strict';

var readFile;
if (typeof $ !== 'undefined' && typeof ObjC !== 'undefined') { // JXA (osascript)
  ObjC.import('Foundation');
  readFile = function (p) {
    var abs = p.startsWith('/') ? p : ObjC.unwrap($.NSFileManager.defaultManager.currentDirectoryPath) + '/' + p;
    return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(abs, $.NSUTF8StringEncoding, null));
  };
} else { // Node
  readFile = function (p) { return require('fs').readFileSync(p, 'utf8'); };
}

var html = readFile('golf.html');
var m = html.match(/\/\* ENGINE-START \*\/([\s\S]*?)\/\* ENGINE-END \*\//);
if (!m) throw new Error('ENGINE markers not found in golf.html');
var Engine = new Function(m[1] + '\nreturn Engine;')();

var passed = 0, failed = 0, failures = [];
function eq(actual, expected, label) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error((label || '') + ' expected ' + e + ' got ' + a);
}
function ok(v, label) { if (!v) throw new Error((label || 'expected truthy') + ' was falsy'); }
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS ' + name); }
  catch (err) { failed++; failures.push(name + ': ' + err.message); console.log('  FAIL ' + name + '  →  ' + err.message); }
}

console.log('Score differential');
test('plan example: AGS 90, CR 71.8, slope 128 → 16.1', function () {
  eq(Engine.differential(90, 71.8, 128), 16.1);
});
test('AGS 72, CR 71.8, slope 128 → 0.2', function () {
  eq(Engine.differential(72, 71.8, 128), 0.2);
});
test('slope 113 is neutral: AGS 85, CR 70.0 → 15.0', function () {
  eq(Engine.differential(85, 70, 113), 15);
});

console.log('9-hole expected-score conversion (USGA 2024 worked example)');
test('expected9(14.0) = 8.48', function () {
  eq(Engine.expected9(14.0), 8.48);
});
test('HI 14.0, 9-hole diff 7.2 → 18-hole diff 15.7', function () {
  eq(Engine.differentialFrom9(7.2, 14.0), 15.7);
});

console.log('Course handicap');
test('HI 14.0 at 128/71.8 par 72 → 16', function () {
  eq(Engine.courseHandicap(14.0, 128, 71.8, 72), 16);
});
test('scratch at neutral course → 0', function () {
  eq(Engine.courseHandicap(0, 113, 72, 72), 0);
});
test('plus player: HI −2.0 at slope 113, CR = par → −2', function () {
  eq(Engine.courseHandicap(-2.0, 113, 72, 72), -2);
});

console.log('Stroke allocation');
test('CH 16: stroke on SI 7, none on SI 17', function () {
  eq(Engine.strokesOnHole(16, 7, 18), 1);
  eq(Engine.strokesOnHole(16, 17, 18), 0);
});
test('CH 24: two strokes on SI 6, one on SI 7', function () {
  eq(Engine.strokesOnHole(24, 6, 18), 2);
  eq(Engine.strokesOnHole(24, 7, 18), 1);
});
test('CH 0: no strokes anywhere', function () {
  eq(Engine.strokesOnHole(0, 1, 18), 0);
});
test('plus player CH −2: gives back on SI 18 and 17 only', function () {
  eq(Engine.strokesOnHole(-2, 18, 18), -1);
  eq(Engine.strokesOnHole(-2, 17, 18), -1);
  eq(Engine.strokesOnHole(-2, 16, 18), 0);
});

console.log('Net double bogey (adjusted gross)');
function flat18(score) {
  var out = [];
  for (var i = 0; i < 18; i++) out.push({ par: 4, si: i + 1, score: score });
  return out;
}
test('full 18, CH 16: a 9 on the SI-7 par-4 counts as 7 (par+2+1)', function () {
  var holes = flat18(4);
  holes[6] = { par: 4, si: 7, score: 9 };
  var r = Engine.adjustedGross(holes, 16);
  eq(r.ags, 17 * 4 + 7);
  eq(r.adjustedHoles, 1);
});
test('no index yet (ch null): cap is par+5', function () {
  var holes = flat18(4);
  holes[0] = { par: 4, si: 1, score: 12 };
  eq(Engine.adjustedGross(holes, null).ags, 17 * 4 + 9);
});
test('plus player CH −2: net double bogey is par+1 on SI 17,18', function () {
  eq(Engine.adjustedGross(flat18(8), -2).ags, 16 * 6 + 2 * 5);
});

console.log('Handicap index — WHS small-sample table');
var idx = Engine.indexFromDifferentials;
test('fewer than 3 → null', function () { eq(idx([10, 12]), null); });
test('3 scores: lowest 1 − 2.0', function () { eq(idx([14, 10, 12]), 8.0); });
test('4 scores: lowest 1 − 1.0', function () { eq(idx([14, 10, 12, 16]), 9.0); });
test('5 scores: lowest 1', function () { eq(idx([14, 10, 12, 16, 18]), 10.0); });
test('6 scores: avg lowest 2 − 1.0', function () { eq(idx([14, 10, 12, 16, 18, 11]), 9.5); });
test('7 scores: avg lowest 2', function () { eq(idx([14, 10, 12, 16, 18, 11, 20]), 10.5); });
test('9 scores: avg lowest 3', function () { eq(idx([14, 10, 12, 16, 18, 11, 20, 21, 22]), 11.0); });
test('12 scores: avg lowest 4', function () {
  eq(idx([14, 10, 12, 16, 18, 11, 20, 21, 22, 23, 24, 13]), 11.5);
});
test('15 scores: avg lowest 5', function () {
  eq(idx([10, 11, 12, 13, 14, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20]), 12.0);
});
test('17 scores: avg lowest 6', function () {
  eq(idx([10, 11, 12, 13, 14, 15, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20]), 12.5);
});
test('19 scores: avg lowest 7', function () {
  var d = [10, 11, 12, 13, 14, 15, 16];
  for (var i = 0; i < 12; i++) d.push(20);
  eq(idx(d), 13.0);
});
test('20 scores: avg lowest 8', function () {
  var d = [10, 11, 12, 13, 14, 15, 16, 17];
  for (var i = 0; i < 12; i++) d.push(20);
  eq(idx(d), 13.5);
});
test('more than 20: only the most recent 20 count', function () {
  var d = [0, 0, 0, 0, 0]; // ancient great scores must be ignored
  for (var i = 0; i < 12; i++) d.push(20);
  d.push(10, 11, 12, 13, 14, 15, 16, 17);
  eq(idx(d), 13.5);
});
test('index is capped at 54.0', function () { eq(idx([60, 61, 62]), 54.0); });

console.log('Soft / hard caps');
test('no low HI → uncapped', function () {
  eq(Engine.applyCaps(14.5, null), { index: 14.5, cap: null });
});
test('within 3.0 of low HI → uncapped', function () {
  eq(Engine.applyCaps(12.9, 10.0), { index: 12.9, cap: null });
});
test('soft cap: 50% beyond low HI + 3.0 (low 10.0, calc 14.5 → 13.8)', function () {
  eq(Engine.applyCaps(14.5, 10.0), { index: 13.8, cap: 'soft' });
});
test('hard cap at low HI + 5.0 (low 10.0, calc 20.0 → 15.0)', function () {
  eq(Engine.applyCaps(20.0, 10.0), { index: 15.0, cap: 'hard' });
});

console.log('Helpers');
test('approxHolePars(72,18) = all 4s', function () {
  eq(Engine.approxHolePars(72, 18), [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4]);
});
test('approxHolePars(71,18) sums to 71', function () {
  eq(Engine.approxHolePars(71, 18).reduce(function (a, b) { return a + b; }, 0), 71);
});
test('approxStrokeIndexes: longest holes hardest', function () {
  eq(Engine.approxStrokeIndexes([5, 4, 3]), [1, 2, 3]);
});
test('rerankSI maps a subset onto 1..n preserving order', function () {
  eq(Engine.rerankSI([7, 1, 15]), [2, 1, 3]);
});

/* ── recalcAll integration ── */
console.log('recalcAll — full pipeline');
var PARS = [4, 5, 3, 4, 4, 5, 3, 4, 4, 4, 5, 3, 4, 4, 5, 3, 4, 4]; // 36 + 36 = 72
var SIS = [7, 1, 15, 11, 3, 13, 17, 5, 9, 8, 2, 16, 12, 4, 14, 18, 6, 10];
function mkData() {
  return {
    version: 1,
    courses: [{ id: 'c1', name: 'Test CC', tees: [{ id: 't1', name: 'Blue', holes: 18, par: 72,
      courseRating: 71.8, slopeRating: 128, holePars: PARS, holeHandicaps: SIS }] }],
    rounds: [], rangeSessions: [], settings: {}
  };
}
function fill(n, v) { var a = []; for (var i = 0; i < n; i++) a.push(v); return a; }
function mkRound(id, date, scores, holes, nineStart) {
  return { id: id, date: date, courseId: 'c1', teeId: 't1', holesPlayed: holes || 18,
    nineStart: nineStart, scores: scores, putts: null, fairwaysHit: null, gir: null,
    penalties: null, notes: '', createdAt: 1 };
}

test('3 rounds establish an index (small-sample, par+5 first rounds)', function () {
  var d = mkData();
  d.rounds.push(mkRound('A', '2026-01-05', fill(18, 5)));
  d.rounds.push(mkRound('B', '2026-01-12', fill(18, 5)));
  d.rounds.push(mkRound('C', '2026-01-19', fill(18, 4)));
  var r = Engine.recalcAll(d);
  eq(r.perRound.A.diff, 16.1, 'diff A');     // (113/128)(90−71.8)
  eq(r.perRound.C.diff, 0.2, 'diff C');      // (113/128)(72−71.8)
  eq(r.index, -1.8, 'index');                // lowest 1 (0.2) − 2.0
  eq(r.postedCount, 3, 'posted');
});

test('fewer than 3 rounds → no index, progress reported', function () {
  var d = mkData();
  d.rounds.push(mkRound('A', '2026-01-05', fill(18, 5)));
  var r = Engine.recalcAll(d);
  eq(r.index, null);
  eq(r.postedCount, 1);
});

test('par+5 cap applies before an index exists', function () {
  var d = mkData();
  var scores = fill(18, 5); scores[0] = 12; // hole 1, par 4 → capped at 9
  d.rounds.push(mkRound('A', '2026-01-05', scores));
  var r = Engine.recalcAll(d);
  eq(r.perRound.A.ags, 17 * 5 + 9, 'ags');
  eq(r.perRound.A.adjustedHoles, 1, 'adjusted holes');
});

test('9-hole before an index → pending, does not corrupt index', function () {
  var d = mkData();
  d.rounds.push(mkRound('N', '2026-01-02', fill(9, 4), 9, 1));
  var r = Engine.recalcAll(d);
  eq(r.perRound.N.status, 'pending');
  eq(r.index, null);
  eq(r.postedCount, 0);
  eq(r.pendingCount, 1);
});

test('pending 9-hole converts once 18-hole rounds establish an index', function () {
  var d = mkData();
  d.rounds.push(mkRound('N', '2026-01-02', fill(9, 4), 9, 1));
  d.rounds.push(mkRound('A', '2026-01-05', fill(18, 5)));
  d.rounds.push(mkRound('B', '2026-01-12', fill(18, 5)));
  d.rounds.push(mkRound('C', '2026-01-19', fill(18, 4)));
  var r = Engine.recalcAll(d);
  eq(r.perRound.N.status, 'rated', 'status');
  // at conversion the index is −1.8.  diff9 = (113/128)(36−35.9) = 0.1
  // expected = 0.52×(−1.8)+1.2 = 0.264 → 18-hole diff = round1(0.364) = 0.4
  eq(r.perRound.N.diff9, 0.1, 'diff9');
  eq(r.perRound.N.diff, 0.4, 'diff');
  eq(r.postedCount, 4, 'posted');
  eq(r.index, -0.8, 'index');                // 4 diffs → lowest 1 (0.2) − 1.0
});

test('9-hole after index exists converts immediately (USGA formula)', function () {
  var d = mkData();
  d.rounds.push(mkRound('A', '2026-01-05', fill(18, 5)));
  d.rounds.push(mkRound('B', '2026-01-12', fill(18, 5)));
  d.rounds.push(mkRound('C', '2026-01-19', fill(18, 4)));
  d.rounds.push(mkRound('N', '2026-01-26', fill(9, 4), 9, 1));
  var r = Engine.recalcAll(d);
  eq(r.perRound.N.status, 'rated');
  eq(r.perRound.N.diff, 0.4);
  eq(r.index, -0.8);
});

test('editing a round changes the recalculated index', function () {
  var d = mkData();
  d.rounds.push(mkRound('A', '2026-01-05', fill(18, 5)));
  d.rounds.push(mkRound('B', '2026-01-12', fill(18, 5)));
  d.rounds.push(mkRound('C', '2026-01-19', fill(18, 4)));
  var before = Engine.recalcAll(d).index;
  d.rounds[2].scores = fill(18, 5); // 72 → 90
  var after = Engine.recalcAll(d).index;
  eq(before, -1.8, 'before');
  eq(after, 14.1, 'after'); // lowest 16.1 − 2.0
});

test('deleting a round recalculates (index can disappear)', function () {
  var d = mkData();
  d.rounds.push(mkRound('A', '2026-01-05', fill(18, 5)));
  d.rounds.push(mkRound('B', '2026-01-12', fill(18, 5)));
  d.rounds.push(mkRound('C', '2026-01-19', fill(18, 4)));
  d.rounds.push(mkRound('N', '2026-01-26', fill(9, 4), 9, 1));
  d.rounds = d.rounds.filter(function (x) { return x.id !== 'C'; });
  var r = Engine.recalcAll(d);
  eq(r.index, null, 'index');                  // only 2 18-hole diffs remain
  eq(r.perRound.N.status, 'pending', '9-hole reverts to waiting');
});

test('counting differentials are flagged (lowest of the table count)', function () {
  var d = mkData();
  d.rounds.push(mkRound('A', '2026-01-05', fill(18, 5)));
  d.rounds.push(mkRound('B', '2026-01-12', fill(18, 5)));
  d.rounds.push(mkRound('C', '2026-01-19', fill(18, 4)));
  var r = Engine.recalcAll(d);
  eq(r.perRound.C.counting, true, 'C counts');
  eq(r.perRound.A.counting, false, 'A does not');
});

test('soft + hard caps engage against Low HI in a long record', function () {
  var d = mkData();
  // 20 good weekly rounds (diff 0.2) establish Low HI = 0.2 at score #20
  for (var i = 0; i < 20; i++) {
    var dt = new Date(Date.parse('2026-01-05T12:00:00Z') + i * 7 * 86400000).toISOString().slice(0, 10);
    d.rounds.push(mkRound('G' + i, dt, fill(18, 4)));
  }
  // then 20 bad rounds (diff ≈16.1) — raw index would climb toward 16
  for (var j = 0; j < 20; j++) {
    var dt2 = new Date(Date.parse('2026-05-25T12:00:00Z') + j * 7 * 86400000).toISOString().slice(0, 10);
    d.rounds.push(mkRound('X' + j, dt2, fill(18, 5)));
  }
  var r = Engine.recalcAll(d);
  eq(r.index, 5.2, 'hard-capped index');       // Low HI 0.2 + 5.0
  eq(r.capInfo.cap, 'hard', 'cap type');
});

test('incomplete round is excluded from the record', function () {
  var d = mkData();
  var scores = fill(18, 4); scores[17] = null;
  d.rounds.push(mkRound('A', '2026-01-05', scores));
  var r = Engine.recalcAll(d);
  eq(r.perRound.A.status, 'incomplete');
  eq(r.postedCount, 0);
});

test('round on a deleted tee → error status, ignored by the engine', function () {
  var d = mkData();
  d.rounds.push(mkRound('A', '2026-01-05', fill(18, 5)));
  d.rounds[0].teeId = 'gone';
  var r = Engine.recalcAll(d);
  eq(r.perRound.A.status, 'error');
  eq(r.postedCount, 0);
});

test('quick-add tee (no hole data) still rates rounds, flagged approx', function () {
  var d = mkData();
  d.courses[0].tees[0].holePars = null;
  d.courses[0].tees[0].holeHandicaps = null;
  d.rounds.push(mkRound('A', '2026-01-05', fill(18, 5)));
  var r = Engine.recalcAll(d);
  eq(r.perRound.A.diff, 16.1, 'diff');
  ok(r.perRound.A.flags.indexOf('approx-pars') >= 0, 'approx-pars flag');
  ok(r.perRound.A.flags.indexOf('approx-si') >= 0, 'approx-si flag');
});

test('back 9 on an 18-hole tee uses back-nine pars and half rating', function () {
  var d = mkData();
  d.rounds.push(mkRound('A', '2026-01-05', fill(18, 5)));
  d.rounds.push(mkRound('B', '2026-01-12', fill(18, 5)));
  d.rounds.push(mkRound('C', '2026-01-19', fill(18, 4)));
  d.rounds.push(mkRound('N', '2026-01-26', fill(9, 4), 9, 10));
  var r = Engine.recalcAll(d);
  eq(r.perRound.N.status, 'rated', 'status');
  ok(r.perRound.N.flags.indexOf('approx-9rating') >= 0, 'approx-9rating flag');
  eq(r.perRound.N.diff, 0.4, 'diff');          // back nine mirrors the front in PARS
});

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed) {
  failures.forEach(function (f) { console.log('FAILED: ' + f); });
  throw new Error(failed + ' test(s) failed');
}
