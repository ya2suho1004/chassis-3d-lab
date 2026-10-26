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
  var started = Date.parse(p.startedAt), completed = Date.parse(p.completedAt);
  var quality = p.timing && p.timing.timeQuality;
  if (!(isFinite(started) && isFinite(completed))) errors.push('time: unparsable');
  else if (quality !== 'uncertain') { // uncertain(벽시계 변경 감지)은 벽시계 비교를 하지 않는다(04 §7, Codex B3-a)
    if (completed < started) errors.push('time: completedAt before startedAt');
    if (typeof p.durationSeconds === 'number' && p.durationSeconds > (completed - started) / 1000 + 1) errors.push('time: durationSeconds exceeds wall clock');
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
  var seenSub = []; var offDone = false; var completedParents = Object.create(null);
  for (var i = 0; i < events.length; i++) {
    var e = events[i];
    if (e.type !== 'stepCompleted') continue;
    if (allowedStepIds && allowedStepIds.indexOf(e.stepId) < 0) errors.push('steps: unregistered stepId ' + e.stepId);
    if (typeof e.stepId === 'string' && e.stepId.indexOf('off:') !== 0) {
      // parent 단계: 중복 금지, 선행 그래프(해당 과제 버전) 충족(Codex C-P2-2). 중단 기록의 부분 이력은 허용.
      if (completedParents[e.stepId] === true) errors.push('steps: duplicate parent ' + e.stepId);
      if (stepPrerequisites && Object.prototype.hasOwnProperty.call(stepPrerequisites, e.stepId)) {
        var pre = stepPrerequisites[e.stepId];
        for (var q = 0; q < pre.length; q++) if (completedParents[pre[q]] !== true) errors.push('steps: prerequisite ' + pre[q] + ' not completed before ' + e.stepId);
      }
      completedParents[e.stepId] = true;
    }
    if (typeof e.stepId === 'string' && e.stepId.indexOf('off:') === 0) {
      var action = e.stepId.slice(4);
      var order = ['motorOff', 'liftUp', 'exitVehicle'];
      if (offDone) errors.push('steps: sub-action after parent off');
      if (order.indexOf(action) !== seenSub.length) errors.push('steps: off sub-action out of order ' + action);
      seenSub.push(action);
    } else if (e.stepId === 'off') {
      if (allowedStepIds && seenSub.length !== 3) errors.push('steps: off completed without its sub-actions');
      offDone = true;
    }
  }
  return errors;
}

/** 존재하는 달력 날짜의 UTC 시각(…Z)인지: 형식 + 왕복 비교(2026-02-31 같은 값 거절). Codex B4·B5 */
function isValidUtcDateTime_(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(s)) return false;
  var ms = Date.parse(s);
  if (!isFinite(ms)) return false;
  return new Date(ms).toISOString().slice(0, 19) === s.slice(0, 19);
}

/** 일반 record date-time(RFC 3339)의 실제 달력 유효성: 오프셋·소문자 t/z·소수 자릿수 허용, 2000-02-31 같은 값 거절(Codex C-P2-3). 정규화해 수락하지 않는다. */
function isValidDateTimeGeneral_(s) {
  if (typeof s !== 'string') return false;
  var m = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(\.\d+)?([Zz]|[+-](\d{2}):(\d{2}))$/.exec(s);
  if (!m) return false;
  var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]), h = Number(m[4]), mi = Number(m[5]), sec = Number(m[6]);
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || sec > 60) return false;
  var leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  var dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  if (d > dim) return false;
  if (m[9] !== undefined && (Number(m[9]) > 23 || Number(m[10]) > 59)) return false;
  return true;
}
