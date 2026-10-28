// 미니 JSON Schema(2020-12 부분집합) 검증기 — record.schema.json이 쓰는 키워드만 지원한다.
// 지원: type, properties, required, additionalProperties(false), const, enum, format(uuid·date-time), pattern, anyOf, allOf, if/then,
//       minimum, maximum, minLength, maxLength, items, minItems, maxItems, uniqueItems, propertyNames, maxProperties.
// 값을 고치지 않는다. 실패 목록을 돌려줄 뿐 raw 값을 로그에 남기지 않는다.
var UUID_RE = /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
var DATE_TIME_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[Tt ]([01]\d|2[0-3]):[0-5]\d:([0-5]\d|60)(\.\d+)?([Zz]|[+-]([01]\d|2[0-3]):[0-5]\d)$/;

function typeOf_(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return 'number';
  return typeof v;
}

function matchesType_(v, t) {
  if (t === 'integer') return typeof v === 'number' && isFinite(v) && Math.floor(v) === v;
  if (t === 'number') return typeof v === 'number' && isFinite(v);
  return typeOf_(v) === t;
}

function deepEqual_(a, b) { return jcsCanonicalize(a) === jcsCanonicalize(b); }

function validateAgainst(schema, value, path) {
  var errors = [];
  validateNode_(schema, value, path || '$', errors);
  return { ok: errors.length === 0, errors: errors };
}

function validateNode_(s, v, path, errors) {
  if (s === true || s === undefined) return;
  if (s === false) { errors.push(path + ': false schema'); return; }
  if (s.type !== undefined) {
    var types = Array.isArray(s.type) ? s.type : [s.type]; var okT = false;
    for (var i = 0; i < types.length; i++) if (matchesType_(v, types[i])) okT = true;
    if (!okT) { errors.push(path + ': type ' + types.join('|')); return; }
  }
  if (s.const !== undefined && !deepEqual_(v, s.const)) errors.push(path + ': const');
  if (s.enum !== undefined) { var okE = false; for (var e = 0; e < s.enum.length; e++) if (deepEqual_(v, s.enum[e])) okE = true; if (!okE) errors.push(path + ': enum'); }
  if (typeof v === 'number') {
    if (s.minimum !== undefined && v < s.minimum) errors.push(path + ': minimum');
    if (s.maximum !== undefined && v > s.maximum) errors.push(path + ': maximum');
  }
  if (typeof v === 'string') {
    var len = Array.from(v).length; // 코드 포인트 길이(ajv와 동일)
    if (s.minLength !== undefined && len < s.minLength) errors.push(path + ': minLength');
    if (s.maxLength !== undefined && len > s.maxLength) errors.push(path + ': maxLength');
    if (s.pattern !== undefined && !new RegExp(s.pattern, 'u').test(v)) errors.push(path + ': pattern');
    if (s.format === 'uuid' && !UUID_RE.test(v)) errors.push(path + ': format uuid');
    if (s.format === 'date-time' && !isValidDateTimeGeneral_(v)) errors.push(path + ': format date-time');
  }
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) errors.push(path + ': minItems');
    if (s.maxItems !== undefined && v.length > s.maxItems) errors.push(path + ': maxItems');
    if (s.uniqueItems) { var seen = {}; for (var u = 0; u < v.length; u++) { var key = jcsCanonicalize(v[u]); if (seen[key]) { errors.push(path + ': uniqueItems'); break; } seen[key] = true; } }
    if (s.items !== undefined) for (var a = 0; a < v.length; a++) validateNode_(s.items, v[a], path + '[' + a + ']', errors);
  }
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    var keys = Object.keys(v);
    if (s.required) for (var r = 0; r < s.required.length; r++) if (!Object.prototype.hasOwnProperty.call(v, s.required[r])) errors.push(path + ': required ' + s.required[r]);
    if (s.maxProperties !== undefined && keys.length > s.maxProperties) errors.push(path + ': maxProperties');
    for (var k = 0; k < keys.length; k++) {
      var name = keys[k];
      if (s.propertyNames) validateNode_(s.propertyNames, name, path + '.<key>', errors);
      if (s.properties && Object.prototype.hasOwnProperty.call(s.properties, name)) validateNode_(s.properties[name], v[name], path + '.' + name, errors);
      else if (s.additionalProperties === false) errors.push(path + ': additionalProperties ' + name);
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') validateNode_(s.additionalProperties, v[name], path + '.' + name, errors);
    }
  }
  if (s.anyOf) { var any = false; for (var n = 0; n < s.anyOf.length; n++) { var sub = []; validateNode_(s.anyOf[n], v, path, sub); if (sub.length === 0) { any = true; break; } } if (!any) errors.push(path + ': anyOf'); }
  if (s.allOf) for (var al = 0; al < s.allOf.length; al++) validateNode_(s.allOf[al], v, path, errors);
  if (s['if'] !== undefined) { var cond = []; validateNode_(s['if'], v, path, cond); if (cond.length === 0) { if (s.then !== undefined) validateNode_(s.then, v, path, errors); } else if (s['else'] !== undefined) validateNode_(s['else'], v, path, errors); }
}

/** 요청 봉투: {"protocolVersion":"1","payload":{…}} 만 허용. payload 문자열(이중 인코딩)·추가 필드 거절. */
function validateRequestEnvelope(req) {
  if (!req || typeof req !== 'object' || Array.isArray(req)) return { ok: false, code: 'INVALID_PAYLOAD' };
  var keys = Object.keys(req);
  if (keys.length !== 2 || !Object.prototype.hasOwnProperty.call(req, 'protocolVersion') || !Object.prototype.hasOwnProperty.call(req, 'payload')) return { ok: false, code: 'INVALID_PAYLOAD' };
  if (req.protocolVersion !== '1') return { ok: false, code: 'INVALID_PAYLOAD' };
  if (!req.payload || typeof req.payload !== 'object' || Array.isArray(req.payload)) return { ok: false, code: 'INVALID_PAYLOAD' };
  return { ok: true };
}

/** 스키마가 표현하지 못하는 record 의미 조건(04 §5·§7·§8, Codex 검토 B3). 실패 목록을 돌려준다. 값을 고치지 않는다. */
function validateRecordSemantics_(p) {
  var errors = [];
  var order = compareDateTime_(p.startedAt, p.completedAt);
  var quality = p.timing && p.timing.timeQuality;
  if (isNaN(order)) errors.push('time: unparsable');
  else if (quality !== 'uncertain') { // uncertain(벽시계 변경 감지)은 벽시계 비교를 하지 않는다(04 §7, Codex B3-a)
    if (order > 0) errors.push('time: completedAt before startedAt');
    // 활성 학습시간 ≤ 벽시계 경과 + 1초(정수 반올림) + 윤초 여유(UTC 자정 횡단마다 1초). 순서 비교 키와 분리(Codex F)
    if (typeof p.durationSeconds === 'number' && p.durationSeconds > elapsedAllowanceSeconds_(p.startedAt, p.completedAt) + 1) errors.push('time: durationSeconds exceeds wall clock');
  }
  var events = Array.isArray(p.stepEvents) ? p.stepEvents : [];
  var ids = Object.create(null); var lastMs = -1; var hints = 0; var npc = 0;
  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    if (e.sequence !== i + 1) errors.push('events: sequence gap at ' + i);
    if (ids[e.eventId] === true) errors.push('events: duplicate eventId'); ids[e.eventId] = true;
    if (typeof e.elapsedMs === 'number') { if (e.elapsedMs < lastMs) errors.push('events: elapsedMs decreases at ' + i); lastMs = e.elapsedMs; }
    if (e.type === 'hintRequested') hints++;
    if (e.type === 'npcInspected') npc++;
  }
  if (typeof p.hintCount === 'number' && p.hintCount !== hints) errors.push('hintCount != hintRequested events');
  if (typeof p.npcInspectionCount === 'number' && p.npcInspectionCount !== npc) errors.push('npcInspectionCount != npcInspected events');
  var sum = function (o) { var t = 0; if (o && typeof o === 'object') for (var k in o) if (typeof o[k] === 'number') t += o[k]; return t; };
  if (sum(p.errorTypes) !== p.errorCount) errors.push('errorCount != sum(errorTypes)');
  if (sum(p.safetyViolationTypes) !== p.safetyViolationCount) errors.push('safetyViolationCount != sum(safetyViolationTypes)');
  var checkItems = function (arr, firstKey, finalKey, label) {
    if (!Array.isArray(arr)) return;
    for (var j = 0; j < arr.length; j++) {
      var it = arr[j];
      if (it.firstCorrect !== null && it.firstCorrect !== undefined && (it[firstKey] === null || it[firstKey] === undefined)) errors.push(label + ': firstCorrect without first value');
      if (it.finalCorrect !== null && it.finalCorrect !== undefined && (it[finalKey] === null || it[finalKey] === undefined)) errors.push(label + ': finalCorrect without final value');
    }
  };
  checkItems(p.measurementInputs, 'firstInput', 'finalInput', 'measurementInputs');
  checkItems(p.calculationAnswers, 'firstInput', 'finalInput', 'calculationAnswers');
  checkItems(p.judgmentAnswers, 'firstAnswer', 'finalAnswer', 'judgmentAnswers');
  if (Array.isArray(p.experiencedDisplayModes) && p.experiencedDisplayModes.length > 0 && p.experiencedDisplayModes[0] !== p.displayMode) errors.push('experiencedDisplayModes[0] != displayMode');
  // judgmentCorrect = 판정 항목 최초 정오의 allOrNull (04 §5, Codex B3-c)
  if (Array.isArray(p.judgmentAnswers)) {
    var expected = null;
    if (p.judgmentAnswers.length > 0) {
      var anyNull = false, allTrue = true;
      for (var q = 0; q < p.judgmentAnswers.length; q++) { var fc = p.judgmentAnswers[q].firstCorrect; if (fc === null || fc === undefined) anyNull = true; else if (fc !== true) allTrue = false; }
      expected = anyNull ? null : allTrue;
    }
    if (p.judgmentCorrect !== expected) errors.push('judgmentCorrect != allOrNull(judgmentAnswers.firstCorrect)');
  }
  if (p.researchEligible !== false) errors.push('researchEligible must be false for test intake');
  return errors;
}

/** stepCompleted 사건의 등록 단계·하위 행동 순서 검사(docs/17 §2, Codex B3-c). allowedStepIds가 null이면(과거 fixture) 등록 검사를 생략한다. */
function validateStepEvents_(p, allowedStepIds, stepPrerequisites) {
  var errors = [];
  var events = Array.isArray(p.stepEvents) ? p.stepEvents : [];
  var seenSub = []; var offDone = false; var completedParents = Object.create(null); var exitIndex = -1;
  var registry = !!allowedStepIds; // 과거 fixture(null)는 등록·중복·직후 연결 검사를 소급하지 않는다
  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    if (e.type !== 'stepCompleted') continue;
    if (registry && allowedStepIds.indexOf(e.stepId) < 0) errors.push('steps: unregistered stepId ' + e.stepId);
    if (typeof e.stepId === 'string' && e.stepId.indexOf('off:') === 0) {
      var action = e.stepId.slice(4);
      var order = ['motorOff', 'liftUp', 'exitVehicle'];
      if (offDone) errors.push('steps: sub-action after parent off');
      if (order.indexOf(action) !== seenSub.length) errors.push('steps: off sub-action out of order ' + action);
      // parent off의 선행 조건은 첫 하위 행동 시작에 상속된다(producer와 동일, Codex D C-P2-2)
      if (seenSub.length === 0 && stepPrerequisites && Object.prototype.hasOwnProperty.call(stepPrerequisites, 'off')) {
        var preOff = stepPrerequisites['off'];
        for (var r = 0; r < preOff.length; r++) if (completedParents[preOff[r]] !== true) errors.push('steps: prerequisite ' + preOff[r] + ' not completed before off sub-actions');
      }
      seenSub.push(action);
      if (action === 'exitVehicle') exitIndex = i;
    } else if (e.stepId === 'off') {
      if (registry && seenSub.length !== 3) errors.push('steps: off completed without its sub-actions');
      if (registry && exitIndex !== i - 1) errors.push('steps: parent off must immediately follow off:exitVehicle');
      if (registry && completedParents['off'] === true) errors.push('steps: duplicate parent off');
      completedParents['off'] = true; offDone = true;
    } else {
      // parent 단계: 중복 금지(등록 검사 대상일 때), 선행 그래프 충족(Codex C-P2-2). 중단 기록의 부분 이력은 허용.
      if (registry && completedParents[e.stepId] === true) errors.push('steps: duplicate parent ' + e.stepId);
      if (stepPrerequisites && Object.prototype.hasOwnProperty.call(stepPrerequisites, e.stepId)) {
        var pre = stepPrerequisites[e.stepId];
        for (var q = 0; q < pre.length; q++) if (completedParents[pre[q]] !== true) errors.push('steps: prerequisite ' + pre[q] + ' not completed before ' + e.stepId);
      }
      completedParents[e.stepId] = true;
    }
  }
  if (registry && exitIndex >= 0 && !offDone) {
    // exitVehicle 뒤에 parent off가 없으면(중단 꼬리) 허용하되, 그 다음 사건이 다른 것이면 '직후' 규칙 위반
    var nextEv = events[exitIndex + 1];
    if (nextEv && !(nextEv.type === 'stepCompleted' && nextEv.stepId === 'off')) errors.push('steps: event after off:exitVehicle is not parent off');
  }
  return errors;
}

/** RFC 3339 date-time을 원문 그대로 분해(정규화 없음). 유효하지 않으면 null. 윤초 :60은 UTC 23:59에서만(ajv-formats와 같은 범위). Codex C-P2-3·E·F
 *  반환: { minuteMs(해당 UTC 분의 시작 epoch ms, 0~99년 보정 없음), sec(0~60), frac(원문 소수부 0≤f<1), leap(sec===60) } */
function parseDateTimeParts_(s) {
  if (typeof s !== 'string') return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|([+-])(\d{2}):(\d{2}))$/.exec(s);
  if (!m) return null;
  var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]), h = Number(m[4]), mi = Number(m[5]), sec = Number(m[6]);
  var frac = m[7] ? Number(m[7]) : 0;
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || sec > 60) return null;
  var leapYear = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  var dim = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  if (d > dim) return null;
  var offMin = 0;
  if (m[9]) { var oh = Number(m[10]), om = Number(m[11]); if (oh > 23 || om > 59) return null; offMin = (oh * 60 + om) * (m[9] === '-' ? -1 : 1); }
  if (sec === 60) { var utcMin = ((h * 60 + mi - offMin) % 1440 + 1440) % 1440; if (utcMin !== 1439) return null; }
  var base = new Date(0); base.setUTCFullYear(y, mo - 1, d); base.setUTCHours(h, mi, 0, 0);
  return { minuteMs: base.getTime() - offMin * 60000, sec: sec, frac: frac, fracDigits: m[7] ? m[7].slice(1).replace(/0+$/, '') : '', leap: sec === 60 };
}

/** 순서 비교(원문 소수부 그대로): (분 시작 + min(sec,59)초) → 윤초 여부 → 소수부. 윤초 :60.f 는 59.xxx 전부보다 뒤, 다음 00:00:00.000보다 앞. 유효하지 않으면 NaN. */
function compareDateTime_(a, b) {
  var pa = parseDateTimeParts_(a), pb = parseDateTimeParts_(b);
  if (!pa || !pb) return NaN;
  var ka = pa.minuteMs + Math.min(pa.sec, 59) * 1000, kb = pb.minuteMs + Math.min(pb.sec, 59) * 1000;
  if (ka !== kb) return ka < kb ? -1 : 1;
  if (pa.leap !== pb.leap) return pa.leap ? 1 : -1;
  // 소수부는 원문 숫자열로 비교(Number 정밀도 무관, Codex G P3): 우측 0을 뗀 뒤 짧은 쪽을 0으로 채워 사전식 비교
  var fa = pa.fracDigits, fb = pb.fracDigits, len = Math.max(fa.length, fb.length);
  while (fa.length < len) fa += '0';
  while (fb.length < len) fb += '0';
  if (fa !== fb) return fa < fb ? -1 : 1;
  return 0;
}

/** 경과시간 상한(초, Codex F·G·H): 윤초가 '알려진' 끝점(시작·종료가 :60)은 그 윤초를 정확히 세고, 모르는 UTC 자정 횡단마다 1초 여유를 둔다(윤초는 UTC 23:59:60에만 가능).
 *  날짜·윤초 분기는 정수 ms(분 시작 + 초)로만 판정하고 소수부는 마지막에 따로 더한다 — 큰 epoch에 소수를 더할 때의 반올림이 자정 횟수를 바꾸지 않도록(Codex H).
 *  순서 비교 키를 재사용하지 않는다. 윤초표가 없으므로 평범한 자정에도 1초가 붙는 보수적 상한이다. */
function elapsedAllowanceSeconds_(a, b) {
  var pa = parseDateTimeParts_(a), pb = parseDateTimeParts_(b);
  if (!pa || !pb) return NaN;
  var DAY = 86400000;
  var intMs = function (p) { return p.minuteMs + p.sec * 1000; }; // 정수 ms. :60 → 다음 날 00:00:00 자리(epoch에는 윤초 자리가 없음)
  var Ma = pa.leap ? pa.minuteMs + 60000 : null, Mb = pb.leap ? pb.minuteMs + 60000 : null; // 끝점이 속한 윤초의 자정(알려진 윤초)
  var ia = intMs(pa), ib = intMs(pb);
  // 알려진 윤초가 끼워 넣는 1초를 '확장 시간선'으로 반영: 그 자정 이후의 다른 끝점은 +1초(윤초 안의 끝점 자신은 제외)
  var ea = ia + ((Mb !== null && ia >= Mb && !(pa.leap && Ma === Mb)) ? 1000 : 0);
  var eb = ib + ((Ma !== null && ib >= Ma && !(pb.leap && Mb === Ma)) ? 1000 : 0);
  var crossings = Math.floor(ib / DAY) - Math.floor(ia / DAY); // 정수만 사용 — 소수부는 날짜를 넘길 수 없다(초 ≤ 59 또는 윤초 자리)
  var known = (Mb !== null && ia < Mb && !(pa.leap && Ma === Mb)) ? 1 : 0; // 종료 윤초의 자정은 이미 정확히 셈
  var unknown = Math.max(0, crossings - known);
  return (eb - ea) / 1000 + (pb.frac - pa.frac) + unknown; // 소수부는 작은 수끼리 따로
}

function isValidDateTimeGeneral_(s) {
  return parseDateTimeParts_(s) !== null;
}

/** 존재하는 달력 날짜의 UTC 시각(…Z)인지: 형식 + 왕복 비교(2026-02-31 같은 값 거절). Codex B4·B5 */
function isValidUtcDateTime_(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(s)) return false;
  var ms = Date.parse(s);
  if (!isFinite(ms)) return false;
  return new Date(ms).toISOString().slice(0, 19) === s.slice(0, 19);
}

