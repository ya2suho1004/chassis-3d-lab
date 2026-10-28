// 자동 생성: node scripts/build-receiver-core.mjs — 직접 고치지 말 것. 원본: archive/apps-script/Jcs.gs, JsonStrict.gs, Validate.gs, Schemas.gs, DemoSnapshots.gs, Code.gs
// @ts-nocheck
import { createHash } from 'node:crypto'
var Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
  computeDigest: function (_a, value) { return Array.from(createHash('sha256').update(value, 'utf8').digest()).map(function (b) { return b > 127 ? b - 256 : b }) },
  newBlob: function (value) { return { getBytes: function () { return Array.from(new TextEncoder().encode(value)) } } },
}

// ===== Jcs.gs =====
// RFC 8785 JCS 정규화 + SHA-256 (Apps Script V8). 브라우저 src/delivery/jcs.ts 와 같은 결과를 내야 한다(tests/appsScriptPure.test.ts 대조).
// 거절: 비유한 수, 짝 없는 서로게이트, undefined/function. NFC/NFD·trim·대소문자·숫자 재절사는 하지 않는다.
var JCS_LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

function jcsString_(s) {
  if (JCS_LONE_SURROGATE.test(s)) throw new Error('INVALID_UNICODE');
  return JSON.stringify(s);
}

function jcsCanonicalize(value) {
  if (value === null) return 'null';
  var t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') { if (!isFinite(value)) throw new Error('NON_FINITE_NUMBER'); return JSON.stringify(value); }
  if (t === 'string') return jcsString_(value);
  if (t === 'object') {
    if (Array.isArray(value)) { var parts = []; for (var i = 0; i < value.length; i++) parts.push(jcsCanonicalize(value[i])); return '[' + parts.join(',') + ']'; }
    var keys = Object.keys(value);
    for (var j = 0; j < keys.length; j++) if (value[keys[j]] === undefined) throw new Error('UNSUPPORTED_VALUE');
    keys.sort(); // 기본 sort = UTF-16 코드 단위 비교
    var out = [];
    for (var k = 0; k < keys.length; k++) out.push(jcsString_(keys[k]) + ':' + jcsCanonicalize(value[keys[k]]));
    return '{' + out.join(',') + '}';
  }
  throw new Error('UNSUPPORTED_VALUE');
}

function jcsSha256Hex(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) { var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i]; hex += (b < 16 ? '0' : '') + b.toString(16); }
  return hex;
}

function jcsPayloadHash(payload) { return jcsSha256Hex(jcsCanonicalize(payload)); }

function utf8ByteLength_(text) { return Utilities.newBlob(text).getBytes().length; }


// ===== JsonStrict.gs =====
// 엄격한 JSON 파서 — 중복 객체 키·다중 문서·후행 문자·잘못된 문법·짝 없는 서로게이트 이스케이프·원문 제어 문자를 거절한다.
// JSON.parse는 중복 키를 조용히 덮어쓰므로(설계 15 §3 2항) 수신 검증에는 이 파서를 쓴다.
// 객체는 prototype 없이 만들어 '__proto__'·'constructor' 같은 키도 자기 속성으로 보존한다(Codex 검토 B1). 추가 필드 거절은 스키마 단계에서.
var JSON_STRICT_MAX_DEPTH = 64;

function parseJsonStrict(text) {
  if (typeof text !== 'string') throw new Error('INVALID_JSON');
  var p = { s: text, i: 0 };
  skipWs_(p);
  if (p.i >= p.s.length) throw new Error('INVALID_JSON');
  var v = parseValue_(p, 0);
  skipWs_(p);
  if (p.i !== p.s.length) throw new Error('INVALID_JSON'); // 다중 문서·후행 쓰레기
  return v;
}

function skipWs_(p) { while (p.i < p.s.length) { var c = p.s.charCodeAt(p.i); if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) p.i++; else break; } }

function parseValue_(p, depth) {
  if (depth > JSON_STRICT_MAX_DEPTH) throw new Error('INVALID_JSON');
  var c = p.s[p.i];
  if (c === '{') return parseObject_(p, depth + 1);
  if (c === '[') return parseArray_(p, depth + 1);
  if (c === '"') return parseString_(p);
  if (c === 't') return expectWord_(p, 'true', true);
  if (c === 'f') return expectWord_(p, 'false', false);
  if (c === 'n') return expectWord_(p, 'null', null);
  return parseNumber_(p);
}

function expectWord_(p, w, v) { if (p.s.substr(p.i, w.length) !== w) throw new Error('INVALID_JSON'); p.i += w.length; return v; }

function parseObject_(p, depth) {
  p.i++; // {
  var obj = Object.create(null); var seen = Object.create(null);
  skipWs_(p);
  if (p.s[p.i] === '}') { p.i++; return obj; }
  for (;;) {
    skipWs_(p);
    if (p.s[p.i] !== '"') throw new Error('INVALID_JSON');
    var key = parseString_(p);
    if (seen[key] === true) throw new Error('DUPLICATE_KEY');
    seen[key] = true;
    skipWs_(p);
    if (p.s[p.i] !== ':') throw new Error('INVALID_JSON');
    p.i++;
    skipWs_(p);
    obj[key] = parseValue_(p, depth);
    skipWs_(p);
    if (p.s[p.i] === ',') { p.i++; continue; }
    if (p.s[p.i] === '}') { p.i++; return obj; }
    throw new Error('INVALID_JSON');
  }
}

function parseArray_(p, depth) {
  p.i++; // [
  var arr = [];
  skipWs_(p);
  if (p.s[p.i] === ']') { p.i++; return arr; }
  for (;;) {
    skipWs_(p);
    arr.push(parseValue_(p, depth));
    skipWs_(p);
    if (p.s[p.i] === ',') { p.i++; continue; }
    if (p.s[p.i] === ']') { p.i++; return arr; }
    throw new Error('INVALID_JSON');
  }
}

function parseString_(p) {
  p.i++; // "
  var out = '';
  for (;;) {
    if (p.i >= p.s.length) throw new Error('INVALID_JSON');
    var ch = p.s[p.i]; var code = p.s.charCodeAt(p.i);
    if (ch === '"') { p.i++; break; }
    if (code < 0x20) throw new Error('INVALID_JSON'); // 원문 제어 문자
    if (ch === '\\') {
      var e = p.s[p.i + 1]; p.i += 2;
      if (e === '"' || e === '\\' || e === '/') out += e;
      else if (e === 'b') out += '\b'; else if (e === 'f') out += '\f'; else if (e === 'n') out += '\n'; else if (e === 'r') out += '\r'; else if (e === 't') out += '\t';
      else if (e === 'u') {
        var h = p.s.substr(p.i, 4); if (!/^[0-9a-fA-F]{4}$/.test(h)) throw new Error('INVALID_JSON');
        var cu = parseInt(h, 16); p.i += 4;
        if (cu >= 0xd800 && cu <= 0xdbff) {
          if (p.s.substr(p.i, 2) !== '\\u') throw new Error('INVALID_UNICODE');
          var h2 = p.s.substr(p.i + 2, 4); if (!/^[0-9a-fA-F]{4}$/.test(h2)) throw new Error('INVALID_JSON');
          var lo = parseInt(h2, 16); if (lo < 0xdc00 || lo > 0xdfff) throw new Error('INVALID_UNICODE');
          p.i += 6; out += String.fromCharCode(cu, lo);
        } else if (cu >= 0xdc00 && cu <= 0xdfff) throw new Error('INVALID_UNICODE');
        else out += String.fromCharCode(cu);
      } else throw new Error('INVALID_JSON');
      continue;
    }
    if (code >= 0xd800 && code <= 0xdbff) { // 원문 서로게이트 쌍
      var next = p.s.charCodeAt(p.i + 1); if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('INVALID_UNICODE');
      out += ch + p.s[p.i + 1]; p.i += 2; continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) throw new Error('INVALID_UNICODE');
    out += ch; p.i++;
  }
  return out;
}

function parseNumber_(p) {
  var m = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(p.s.substr(p.i, 40));
  if (!m) throw new Error('INVALID_JSON');
  p.i += m[0].length;
  var n = Number(m[0]);
  if (!isFinite(n)) throw new Error('INVALID_JSON');
  return n;
}


// ===== Validate.gs =====
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



// ===== Schemas.gs =====
// 자동 생성: npm run build:gs-schema (원본 docs/design/contracts/record.schema.json, $id urn:chassis-3d-lab:record:1.1.0). 직접 고치지 말 것.
var RECORD_SCHEMAS = { '1.0.0': {"type":"object","properties":{"schemaVersion":{"const":"1.0.0"},"recordId":{"type":"string","format":"uuid"},"anonymousStudentCode":{"type":"string","pattern":"^[A-Za-z0-9_-]{1,32}$"},"classConditionCode":{"type":"string","pattern":"^[A-Za-z0-9_-]{1,32}$"},"sessionCode":{"type":"string","pattern":"^[A-Za-z0-9_-]{1,32}$"},"sessionSnapshotId":{"type":"string","format":"uuid"},"taskId":{"const":"braking-force"},"difficultyMode":{"enum":["guided","unguided","timedAssessment"]},"attemptRole":{"enum":["practice","primary","remediation"]},"retryOfRecordId":{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]},"retryCount":{"type":"integer","minimum":0},"runPurpose":{"enum":["demo","research"]},"researchEligible":{"type":"boolean"},"configurationApproval":{"type":"object","properties":{"taskApproved":{"type":"boolean"},"rulesetApproved":{"type":"boolean"},"layoutConfirmed":{"type":"boolean"},"researchUseApproved":{"type":"boolean"}},"required":["taskApproved","rulesetApproved","layoutConfirmed","researchUseApproved"],"additionalProperties":false},"displayMode":{"enum":["threeD","diagram"]},"experiencedDisplayModes":{"type":"array","items":{"enum":["threeD","diagram"]},"minItems":1,"maxItems":2,"uniqueItems":true},"completionStatus":{"enum":["completed","aborted"]},"startedAt":{"type":"string","format":"date-time"},"completedAt":{"type":"string","format":"date-time"},"durationSeconds":{"type":"number","minimum":0},"timing":{"type":"object","properties":{"pauseCount":{"type":"integer","minimum":0},"resumeCount":{"type":"integer","minimum":0},"timeQuality":{"enum":["continuous","resumed","uncertain"]}},"required":["pauseCount","resumeCount","timeQuality"],"additionalProperties":false},"versions":{"type":"object","properties":{"taskDefinitionVersion":{"type":"string","minLength":1,"maxLength":64},"rulesetVersion":{"type":"string","minLength":1,"maxLength":64},"measurementSetVersion":{"type":"string","minLength":1,"maxLength":64},"layoutVersion":{"type":"string","minLength":1,"maxLength":64},"judgeEngineVersion":{"type":"string","minLength":1,"maxLength":64},"sessionConfigVersion":{"type":"string","minLength":1,"maxLength":64},"researchProtocolVersion":{"type":"string","minLength":1,"maxLength":64},"feedbackPolicyVersion":{"type":"string","minLength":1,"maxLength":64}},"required":["taskDefinitionVersion","rulesetVersion","measurementSetVersion","layoutVersion","judgeEngineVersion","sessionConfigVersion","researchProtocolVersion","feedbackPolicyVersion"],"additionalProperties":false},"stepEvents":{"type":"array","items":{"type":"object","properties":{"eventId":{"type":"string","format":"uuid"},"sequence":{"type":"integer","minimum":1},"elapsedMs":{"type":"integer","minimum":0},"type":{"enum":["taskStarted","stepCompleted","actionBlocked","answerSubmitted","hintRequested","feedbackShown","npcInspected","paused","resumed","displayModeChanged","taskFinalized"]},"stepId":{"type":"string","minLength":1,"maxLength":64},"actionId":{"type":"string","format":"uuid"},"reasonCode":{"type":"string","minLength":1,"maxLength":64},"itemId":{"type":"string","minLength":1,"maxLength":64},"feedbackKey":{"type":"string","minLength":1,"maxLength":64},"feedbackKind":{"enum":["safety","explanatory","hint","guidance"]},"fromDisplayMode":{"enum":["threeD","diagram"]},"toDisplayMode":{"enum":["threeD","diagram"]}},"required":["eventId","sequence","elapsedMs","type"],"additionalProperties":false,"allOf":[{"if":{"properties":{"type":{"const":"feedbackShown"}}},"then":{"required":["feedbackKind","feedbackKey"]}},{"if":{"properties":{"type":{"const":"displayModeChanged"}}},"then":{"required":["fromDisplayMode","toDisplayMode","reasonCode"]}}]},"maxItems":200},"errorCount":{"type":"integer","minimum":0},"errorTypes":{"type":"object","propertyNames":{"pattern":"^[A-Za-z][A-Za-z0-9_]{0,63}$"},"additionalProperties":{"type":"integer","minimum":0},"maxProperties":32},"safetyViolationCount":{"type":"integer","minimum":0},"safetyViolationTypes":{"type":"object","propertyNames":{"pattern":"^[A-Za-z][A-Za-z0-9_]{0,63}$"},"additionalProperties":{"type":"integer","minimum":0},"maxProperties":32},"hintCount":{"type":"integer","minimum":0},"measurementInputs":{"type":"array","items":{"type":"object","properties":{"itemId":{"type":"string","minLength":1,"maxLength":64},"unit":{"anyOf":[{"type":"string","minLength":1,"maxLength":16},{"type":"null"}]},"presentedValue":{"anyOf":[{"type":"number","minimum":0},{"type":"null"}]},"firstInput":{"anyOf":[{"type":"string","minLength":1,"maxLength":24},{"type":"null"}]},"firstCorrect":{"anyOf":[{"type":"boolean"},{"type":"null"}]},"finalInput":{"anyOf":[{"type":"string","minLength":1,"maxLength":24},{"type":"null"}]},"finalCorrect":{"anyOf":[{"type":"boolean"},{"type":"null"}]}},"required":["itemId","unit","presentedValue","firstInput","firstCorrect","finalInput","finalCorrect"],"additionalProperties":false},"maxItems":32},"calculationAnswers":{"type":"array","items":{"type":"object","properties":{"itemId":{"type":"string","minLength":1,"maxLength":64},"unit":{"const":"%"},"computedReferenceValue":{"anyOf":[{"type":"number","minimum":0},{"type":"null"}]},"firstInput":{"anyOf":[{"type":"string","minLength":1,"maxLength":24},{"type":"null"}]},"firstCorrect":{"anyOf":[{"type":"boolean"},{"type":"null"}]},"finalInput":{"anyOf":[{"type":"string","minLength":1,"maxLength":24},{"type":"null"}]},"finalCorrect":{"anyOf":[{"type":"boolean"},{"type":"null"}]}},"required":["itemId","unit","computedReferenceValue","firstInput","firstCorrect","finalInput","finalCorrect"],"additionalProperties":false},"maxItems":32},"vehicleVerdict":{"anyOf":[{"enum":["pass","fail"]},{"type":"null"}]},"judgmentAnswers":{"type":"array","items":{"type":"object","properties":{"itemId":{"type":"string","minLength":1,"maxLength":64},"firstAnswer":{"anyOf":[{"enum":["pass","fail"]},{"type":"null"}]},"firstCorrect":{"anyOf":[{"type":"boolean"},{"type":"null"}]},"finalAnswer":{"anyOf":[{"enum":["pass","fail"]},{"type":"null"}]},"finalCorrect":{"anyOf":[{"type":"boolean"},{"type":"null"}]}},"required":["itemId","firstAnswer","firstCorrect","finalAnswer","finalCorrect"],"additionalProperties":false},"maxItems":32},"judgmentCorrect":{"anyOf":[{"type":"boolean"},{"type":"null"}]},"npcInspectionResult":{"enum":["passed","needsCorrection","notCompleted"]},"npcInspectionCount":{"type":"integer","minimum":0},"clientAppVersion":{"type":"string","minLength":1,"maxLength":64}},"required":["schemaVersion","recordId","anonymousStudentCode","classConditionCode","sessionCode","sessionSnapshotId","taskId","difficultyMode","attemptRole","retryOfRecordId","retryCount","runPurpose","researchEligible","configurationApproval","displayMode","experiencedDisplayModes","completionStatus","startedAt","completedAt","durationSeconds","timing","versions","stepEvents","errorCount","errorTypes","safetyViolationCount","safetyViolationTypes","hintCount","measurementInputs","calculationAnswers","vehicleVerdict","judgmentAnswers","judgmentCorrect","npcInspectionResult","npcInspectionCount","clientAppVersion"],"additionalProperties":false,"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"urn:chassis-3d-lab:record:1.0.0","title":"확정 수행 내용: 검토용 계약, 전송 상태는 별도","$comment":"날짜순서·유형별 합·정오 합계·단위·버전·승인 진위·모드 활성·JCS/용량은 별도 의미검증 필수.","allOf":[{"if":{"properties":{"runPurpose":{"const":"research"}}},"then":{"properties":{"configurationApproval":{"properties":{"taskApproved":{"const":true},"rulesetApproved":{"const":true},"layoutConfirmed":{"const":true},"researchUseApproved":{"const":true}}}}}},{"if":{"properties":{"researchEligible":{"const":true}}},"then":{"properties":{"runPurpose":{"const":"research"},"completionStatus":{"const":"completed"},"configurationApproval":{"properties":{"taskApproved":{"const":true},"rulesetApproved":{"const":true},"layoutConfirmed":{"const":true},"researchUseApproved":{"const":true}}}}}},{"if":{"properties":{"completionStatus":{"const":"completed"}}},"then":{"properties":{"measurementInputs":{"minItems":1},"calculationAnswers":{"minItems":1},"judgmentAnswers":{"minItems":1},"npcInspectionResult":{"const":"passed"},"npcInspectionCount":{"type":"integer","minimum":1}}}}]}, '1.1.0': {"type":"object","properties":{"schemaVersion":{"const":"1.1.0"},"recordId":{"type":"string","format":"uuid"},"anonymousStudentCode":{"type":"string","pattern":"^[A-Za-z0-9_-]{1,32}$"},"classConditionCode":{"type":"string","pattern":"^[A-Za-z0-9_-]{1,32}$"},"sessionCode":{"type":"string","pattern":"^[A-Za-z0-9_-]{1,32}$"},"sessionSnapshotId":{"type":"string","format":"uuid"},"taskId":{"const":"braking-force"},"difficultyMode":{"enum":["guided","unguided","timedAssessment"]},"attemptRole":{"enum":["practice","primary","remediation"]},"retryOfRecordId":{"anyOf":[{"type":"string","format":"uuid"},{"type":"null"}]},"retryCount":{"type":"integer","minimum":0},"runPurpose":{"enum":["demo","research"]},"researchEligible":{"type":"boolean"},"configurationApproval":{"type":"object","properties":{"taskApproved":{"type":"boolean"},"rulesetApproved":{"type":"boolean"},"layoutConfirmed":{"type":"boolean"},"researchUseApproved":{"type":"boolean"}},"required":["taskApproved","rulesetApproved","layoutConfirmed","researchUseApproved"],"additionalProperties":false},"displayMode":{"enum":["threeD","diagram"]},"experiencedDisplayModes":{"type":"array","items":{"enum":["threeD","diagram"]},"minItems":1,"maxItems":2,"uniqueItems":true},"completionStatus":{"enum":["completed","aborted"]},"startedAt":{"type":"string","format":"date-time"},"completedAt":{"type":"string","format":"date-time"},"durationSeconds":{"type":"number","minimum":0},"timing":{"type":"object","properties":{"pauseCount":{"type":"integer","minimum":0},"resumeCount":{"type":"integer","minimum":0},"timeQuality":{"enum":["continuous","resumed","uncertain"]}},"required":["pauseCount","resumeCount","timeQuality"],"additionalProperties":false},"versions":{"type":"object","properties":{"taskDefinitionVersion":{"type":"string","minLength":1,"maxLength":64},"rulesetVersion":{"type":"string","minLength":1,"maxLength":64},"measurementSetVersion":{"type":"string","minLength":1,"maxLength":64},"layoutVersion":{"type":"string","minLength":1,"maxLength":64},"judgeEngineVersion":{"type":"string","minLength":1,"maxLength":64},"sessionConfigVersion":{"type":"string","minLength":1,"maxLength":64},"researchProtocolVersion":{"type":"string","minLength":1,"maxLength":64},"feedbackPolicyVersion":{"type":"string","minLength":1,"maxLength":64}},"required":["taskDefinitionVersion","rulesetVersion","measurementSetVersion","layoutVersion","judgeEngineVersion","sessionConfigVersion","researchProtocolVersion","feedbackPolicyVersion"],"additionalProperties":false},"stepEvents":{"type":"array","items":{"type":"object","properties":{"eventId":{"type":"string","format":"uuid"},"sequence":{"type":"integer","minimum":1},"elapsedMs":{"type":"integer","minimum":0},"type":{"enum":["taskStarted","stepCompleted","actionBlocked","answerSubmitted","hintRequested","feedbackShown","npcInspected","paused","resumed","displayModeChanged","taskFinalized"]},"stepId":{"type":"string","minLength":1,"maxLength":64},"actionId":{"type":"string","format":"uuid"},"reasonCode":{"type":"string","minLength":1,"maxLength":64},"itemId":{"type":"string","minLength":1,"maxLength":64},"feedbackKey":{"type":"string","minLength":1,"maxLength":64},"feedbackKind":{"enum":["safety","explanatory","hint","guidance"]},"fromDisplayMode":{"enum":["threeD","diagram"]},"toDisplayMode":{"enum":["threeD","diagram"]}},"required":["eventId","sequence","elapsedMs","type"],"additionalProperties":false,"allOf":[{"if":{"properties":{"type":{"const":"feedbackShown"}}},"then":{"required":["feedbackKind","feedbackKey"]}},{"if":{"properties":{"type":{"const":"displayModeChanged"}}},"then":{"required":["fromDisplayMode","toDisplayMode","reasonCode"]}}]},"maxItems":200},"errorCount":{"type":"integer","minimum":0},"errorTypes":{"type":"object","propertyNames":{"pattern":"^[A-Za-z][A-Za-z0-9_]{0,63}$"},"additionalProperties":{"type":"integer","minimum":0},"maxProperties":32},"safetyViolationCount":{"type":"integer","minimum":0},"safetyViolationTypes":{"type":"object","propertyNames":{"pattern":"^[A-Za-z][A-Za-z0-9_]{0,63}$"},"additionalProperties":{"type":"integer","minimum":0},"maxProperties":32},"hintCount":{"type":"integer","minimum":0},"measurementInputs":{"type":"array","items":{"type":"object","properties":{"itemId":{"type":"string","minLength":1,"maxLength":64},"unit":{"anyOf":[{"type":"string","minLength":1,"maxLength":16},{"type":"null"}]},"presentedValue":{"anyOf":[{"type":"number","minimum":0},{"type":"null"}]},"firstInput":{"anyOf":[{"type":"string","minLength":1,"maxLength":24},{"type":"null"}]},"firstCorrect":{"anyOf":[{"type":"boolean"},{"type":"null"}]},"finalInput":{"anyOf":[{"type":"string","minLength":1,"maxLength":24},{"type":"null"}]},"finalCorrect":{"anyOf":[{"type":"boolean"},{"type":"null"}]}},"required":["itemId","unit","presentedValue","firstInput","firstCorrect","finalInput","finalCorrect"],"additionalProperties":false},"maxItems":32},"calculationAnswers":{"type":"array","items":{"type":"object","properties":{"itemId":{"type":"string","minLength":1,"maxLength":64},"unit":{"const":"%"},"computedReferenceValue":{"anyOf":[{"type":"number","minimum":0},{"type":"null"}]},"firstInput":{"anyOf":[{"type":"string","minLength":1,"maxLength":24},{"type":"null"}]},"firstCorrect":{"anyOf":[{"type":"boolean"},{"type":"null"}]},"finalInput":{"anyOf":[{"type":"string","minLength":1,"maxLength":24},{"type":"null"}]},"finalCorrect":{"anyOf":[{"type":"boolean"},{"type":"null"}]}},"required":["itemId","unit","computedReferenceValue","firstInput","firstCorrect","finalInput","finalCorrect"],"additionalProperties":false},"maxItems":32},"vehicleVerdict":{"anyOf":[{"enum":["pass","fail"]},{"type":"null"}]},"judgmentAnswers":{"type":"array","items":{"type":"object","properties":{"itemId":{"type":"string","minLength":1,"maxLength":64},"firstAnswer":{"anyOf":[{"enum":["pass","fail"]},{"type":"null"}]},"firstCorrect":{"anyOf":[{"type":"boolean"},{"type":"null"}]},"finalAnswer":{"anyOf":[{"enum":["pass","fail"]},{"type":"null"}]},"finalCorrect":{"anyOf":[{"type":"boolean"},{"type":"null"}]}},"required":["itemId","firstAnswer","firstCorrect","finalAnswer","finalCorrect"],"additionalProperties":false},"maxItems":32},"judgmentCorrect":{"anyOf":[{"type":"boolean"},{"type":"null"}]},"npcInspectionResult":{"enum":["passed","needsCorrection","notCompleted"]},"npcInspectionCount":{"type":"integer","minimum":0},"clientAppVersion":{"type":"string","minLength":1,"maxLength":64},"usagePhase":{"enum":["preview","review","other"]}},"required":["schemaVersion","usagePhase","recordId","anonymousStudentCode","classConditionCode","sessionCode","sessionSnapshotId","taskId","difficultyMode","attemptRole","retryOfRecordId","retryCount","runPurpose","researchEligible","configurationApproval","displayMode","experiencedDisplayModes","completionStatus","startedAt","completedAt","durationSeconds","timing","versions","stepEvents","errorCount","errorTypes","safetyViolationCount","safetyViolationTypes","hintCount","measurementInputs","calculationAnswers","vehicleVerdict","judgmentAnswers","judgmentCorrect","npcInspectionResult","npcInspectionCount","clientAppVersion"],"additionalProperties":false,"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"urn:chassis-3d-lab:record:1.1.0","title":"확정 수행 내용: 검토용 계약, 전송 상태는 별도","$comment":"날짜순서·유형별 합·정오 합계·단위·버전·승인 진위·모드 활성·JCS/용량은 별도 의미검증 필수.","allOf":[{"if":{"properties":{"runPurpose":{"const":"research"}}},"then":{"properties":{"configurationApproval":{"properties":{"taskApproved":{"const":true},"rulesetApproved":{"const":true},"layoutConfirmed":{"const":true},"researchUseApproved":{"const":true}}}}}},{"if":{"properties":{"researchEligible":{"const":true}}},"then":{"properties":{"runPurpose":{"const":"research"},"completionStatus":{"const":"completed"},"configurationApproval":{"properties":{"taskApproved":{"const":true},"rulesetApproved":{"const":true},"layoutConfirmed":{"const":true},"researchUseApproved":{"const":true}}}}}},{"if":{"properties":{"completionStatus":{"const":"completed"}}},"then":{"properties":{"measurementInputs":{"minItems":1},"calculationAnswers":{"minItems":1},"judgmentAnswers":{"minItems":1},"npcInspectionResult":{"const":"passed"},"npcInspectionCount":{"type":"integer","minimum":1}}}}]} };


// ===== DemoSnapshots.gs =====
// 자동 생성: npm run build:gs-snapshots (원본 scripts/build-demo-snapshots.mjs, 규칙 v1). 직접 고치지 말 것.
// 허용 스냅샷 = 시험 배포가 받는 세션 문맥(설계 15 §3 4항·docs/17 §4). status=retired 는 기존 receipt 회수만 허용(신규 접수 불가). anonymousCodePattern 은 시험용 합성 코드 범위.
var ALLOWED_SNAPSHOTS = {"0032a58c-7e66-48b4-8c10-16b0900999c1":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"0032a58c-7e66-48b4-8c10-16b0900999c1","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"preview","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":null}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"72812b57-8a47-4a6a-8500-662e55e6f010":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"72812b57-8a47-4a6a-8500-662e55e6f010","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"preview","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"north"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"5e5948e2-20d9-4a66-8281-c069e477bf04":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"5e5948e2-20d9-4a66-8281-c069e477bf04","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"preview","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"south"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"7187fb6c-836b-4ef3-8390-8b7403fbfa0e":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"7187fb6c-836b-4ef3-8390-8b7403fbfa0e","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"review","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":null}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"f1fc007e-8fcd-45ce-8d1a-1e6a254959ec":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"f1fc007e-8fcd-45ce-8d1a-1e6a254959ec","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"review","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"north"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"f7b00ea2-5f16-4181-8fe6-3977c13ff484":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"f7b00ea2-5f16-4181-8fe6-3977c13ff484","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"review","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"south"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"cb531cfd-522f-47de-8e29-b2e849ff24d8":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"cb531cfd-522f-47de-8e29-b2e849ff24d8","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"other","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":null}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"c514a7d2-477d-488e-80bd-e467c649de23":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"c514a7d2-477d-488e-80bd-e467c649de23","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"other","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"north"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"5abd1ae7-1f29-46de-8e1e-ec1c1bff8a43":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"5abd1ae7-1f29-46de-8e1e-ec1c1bff8a43","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"other","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"south"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"1e3d2084-e9c1-444c-8188-bd28305a1c42":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"1e3d2084-e9c1-444c-8188-bd28305a1c42","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"preview","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":null}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"2d62a519-6008-4495-846a-df33599f89b6":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"2d62a519-6008-4495-846a-df33599f89b6","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"preview","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"north"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"c6b41fee-63d9-42d1-85be-c08d38705014":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"c6b41fee-63d9-42d1-85be-c08d38705014","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"preview","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"south"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"b7b742c7-ef84-483f-8824-a34edae476b5":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"b7b742c7-ef84-483f-8824-a34edae476b5","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"review","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":null}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"af4675ec-47a0-4d07-890e-df22a8c396dd":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"af4675ec-47a0-4d07-890e-df22a8c396dd","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"review","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"north"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"906dac18-7896-49f0-8f45-a033fcea3055":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"906dac18-7896-49f0-8f45-a033fcea3055","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"review","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"south"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"ea6f0e2f-bc89-435a-8f8f-8f8dd1c684ba":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"ea6f0e2f-bc89-435a-8f8f-8f8dd1c684ba","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"other","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":null}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"eb9b5689-ed49-4418-8545-1f422763a4a7":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"eb9b5689-ed49-4418-8545-1f422763a4a7","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"other","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"north"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"7d3e419a-0ac7-4e8b-8170-8432e2c51eeb":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"7d3e419a-0ac7-4e8b-8170-8432e2c51eeb","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"other","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-1-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"south"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"0b562396-097d-43a0-886d-447833524b4c":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"0b562396-097d-43a0-886d-447833524b4c","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"preview","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":null}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"247e85f9-339c-4d63-8ddf-3f5ee479fd7f":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"247e85f9-339c-4d63-8ddf-3f5ee479fd7f","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"preview","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"north"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"4fc6a136-c5c8-4dd3-85d3-bc0297b5bcbf":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"4fc6a136-c5c8-4dd3-85d3-bc0297b5bcbf","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"preview","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"south"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"92eb011b-c01e-49a2-8136-e5e4e3231b15":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"92eb011b-c01e-49a2-8136-e5e4e3231b15","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"review","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":null}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"f3c2f743-2473-4e62-8ea1-dd3871aeefab":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"f3c2f743-2473-4e62-8ea1-dd3871aeefab","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"review","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"north"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"15848dc9-7c90-47f4-8cb7-6b9969ffc776":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"15848dc9-7c90-47f4-8cb7-6b9969ffc776","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"review","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"south"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"0912e3a9-f854-485e-8391-4a7d92e12cc8":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"0912e3a9-f854-485e-8391-4a7d92e12cc8","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"other","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":null}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"e326f490-af9e-4680-8a6f-557abdff0255":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"e326f490-af9e-4680-8a6f-557abdff0255","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"other","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"north"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"69994661-4d80-421f-85a8-12e36a099e33":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"69994661-4d80-421f-85a8-12e36a099e33","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"guided","usagePhase":"other","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"south"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"4dcd9f68-a95a-461c-81cb-576e0ac4796d":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"4dcd9f68-a95a-461c-81cb-576e0ac4796d","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"preview","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":null}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"5a68ef85-9d7f-40c7-8fd8-7c17fc545ce6":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"5a68ef85-9d7f-40c7-8fd8-7c17fc545ce6","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"preview","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"north"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"08b1fdd6-c930-4143-8ac2-d3861f159ced":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"08b1fdd6-c930-4143-8ac2-d3861f159ced","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"preview","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"south"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"94401422-3094-4e37-83d8-79de6066a030":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"94401422-3094-4e37-83d8-79de6066a030","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"review","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":null}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"ad3b67f8-cb37-4c7b-8644-ab852591b19b":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"ad3b67f8-cb37-4c7b-8644-ab852591b19b","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"review","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"north"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"9295618b-1c31-410c-8ac3-b9f89d785ccb":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"9295618b-1c31-410c-8ac3-b9f89d785ccb","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"review","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"south"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"e093caa6-ecc8-4f71-841f-0f1fc75942bc":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"e093caa6-ecc8-4f71-841f-0f1fc75942bc","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"other","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":null}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"9ca8ca92-81fd-453b-8a6c-a63574a687df":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"9ca8ca92-81fd-453b-8a6c-a63574a687df","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"other","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"north"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"66dacdf0-39ed-4d45-8e49-9c4e74de2fa7":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"66dacdf0-39ed-4d45-8e49-9c4e74de2fa7","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","runPurpose":"demo","displayMode":"threeD","difficultyMode":"unguided","usagePhase":"other","configurationApproval":{"taskApproved":false,"rulesetApproved":true,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"1.2.0-review-case-2-2026-10-26","rulesetVersion":"1.1.0-school-0A-2026-10-21","measurementSetVersion":"1.0.0-teacher-2026-10-21","layoutVersion":"dev-provisional-2026-10-26","judgeEngineVersion":"0.1.0","sessionConfigVersion":"1.2.0-design-2026-10-26","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"1.1.0-design-approved-2026-10-26"},"sessionConfiguration":{"vehicleEntryDirection":"south"}},"status":"active","anonymousCodePattern":"^D-[0-9]{2}$","allowedStepIds":["ppe","tire","equip","enter","axle","mode","lower","motor","press","read","off","calc","off:motorOff","off:liftUp","off:exitVehicle"],"stepPrerequisites":{"ppe":[],"tire":["ppe"],"equip":["tire"],"enter":["equip"],"axle":["enter"],"mode":["axle"],"lower":["mode"],"motor":["lower"],"press":["motor"],"read":["press"],"off":["read"],"calc":["off"]}},"00000000-0000-4000-8000-000000000004":{"snapshot":{"schemaVersion":"1.0.0","sessionSnapshotId":"00000000-0000-4000-8000-000000000004","sessionCode":"DEMO-ONLY","classConditionCode":"DEMO","taskId":"braking-force","difficultyMode":"guided","usagePhase":"other","runPurpose":"demo","displayMode":"threeD","configurationApproval":{"taskApproved":false,"rulesetApproved":false,"layoutConfirmed":false,"researchUseApproved":false},"versions":{"taskDefinitionVersion":"0.1.0-draft","rulesetVersion":"unapproved","measurementSetVersion":"unapproved","layoutVersion":"unapproved","judgeEngineVersion":"design-only","sessionConfigVersion":"unapproved","researchProtocolVersion":"unapproved","feedbackPolicyVersion":"unapproved"},"sessionConfiguration":{"vehicleEntryDirection":null}},"status":"active","anonymousCodePattern":"^D-00$","allowedStepIds":null,"stepPrerequisites":null}};


// ===== Code.gs =====
// 직접 제출 수신점(시험 배포용) — 설계 docs/design/docs/15 §3~§5·§7
// 경로: 브라우저 text/plain POST → doPost → 비공개 시험 Sheet 정본 탭(recordId | receiptId | acceptedAt | payloadHash | payloadJson)
// 하지 않는 것: 사용자 입력으로 Sheet/탭 변경, 값 교정·잘림 수락, 같은 ID 덮어쓰기·새 ID 발급, GET 조회, raw body/스택/Sheet ID/이메일 응답·로그.
// 설정(스크립트 속성): SHEET_ID(필수) · TAB_NAME(기본 canonical) · ACCEPT_UNTIL(ISO, 신규 접수 종료, 필수) · MAX_NEW_ROWS(시험당 신규행 상한, 양의 정수, 필수) · LOCK_WAIT_MS(기본 10000)
// 허용 세션 문맥은 DemoSnapshots.gs(ALLOWED_SNAPSHOTS, 자동 생성)에 고정: 스냅샷 ID별 세션·조건·과제·모드·시점·목적·표시·승인·versions·코드 패턴(Codex 검토 B2).
// 설정이 비거나 잘못되면 신규 접수를 닫는다(fail-closed, B4). 기존 정본 행은 저장 payload까지 다시 검증한다(B5). record 1.0.0·1.1.0을 버전별 스키마로 검증한다(B8).
var PROTOCOL_VERSION = '1';
var SUPPORTED_RECORD_VERSIONS = ['1.0.0', '1.1.0'];
var REQUEST_MAX_BYTES = 48 * 1024;
var CANONICAL_MAX_BYTES = 32 * 1024;
var MAX_STEP_EVENTS = 200;
var HEADER = ['recordId', 'receiptId', 'acceptedAt', 'payloadHash', 'payloadJson'];
var HEX64_RE = /^[0-9a-f]{64}$/;

function doPost(e) {
  var rid = null;
  try {
    if (!e || !e.postData || typeof e.postData.contents !== 'string') return fail_('INVALID_PAYLOAD', false, null);
    if (!mimeAllowed_(e.postData.type)) return fail_('INVALID_PAYLOAD', false, null);
    var body = e.postData.contents;
    if (body.length === 0) return fail_('INVALID_PAYLOAD', false, null);
    if (utf8ByteLength_(body) > REQUEST_MAX_BYTES) return fail_('PAYLOAD_TOO_LARGE', false, null);

    var req;
    try { req = parseJsonStrict(body); } catch (err) { return fail_('INVALID_PAYLOAD', false, null); }
    var envCheck = validateRequestEnvelope(req);
    if (!envCheck.ok) return fail_('INVALID_PAYLOAD', false, null);
    var payload = req.payload;
    if (typeof payload.recordId === 'string' && UUID_RE.test(payload.recordId)) rid = payload.recordId;
    if (SUPPORTED_RECORD_VERSIONS.indexOf(payload.schemaVersion) < 0) return fail_('UNSUPPORTED_SCHEMA', false, rid);
    var v = validateAgainst(RECORD_SCHEMAS[payload.schemaVersion], payload);
    if (!v.ok) return fail_('INVALID_PAYLOAD', false, rid);
    if (payload.stepEvents.length > MAX_STEP_EVENTS) return fail_('PAYLOAD_TOO_LARGE', false, rid);
    if (validateRecordSemantics_(payload).length > 0) return fail_('INVALID_PAYLOAD', false, rid);

    var cfg = loadConfig_();
    var entry = sessionAllowed_(payload);
    if (!entry) return fail_('SESSION_NOT_ALLOWED', false, rid);
    if (validateStepEvents_(payload, entry.allowedStepIds || null, entry.stepPrerequisites || null).length > 0) return fail_('INVALID_PAYLOAD', false, rid);

    var canonical;
    try { canonical = jcsCanonicalize(payload); } catch (err) { return fail_('INVALID_PAYLOAD', false, rid); }
    if (utf8ByteLength_(canonical) > CANONICAL_MAX_BYTES) return fail_('PAYLOAD_TOO_LARGE', false, rid);
    var hash = jcsSha256Hex(canonical);

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(cfg.LOCK_WAIT_MS)) return fail_('LOCK_BUSY', true, rid);
    try {
      return acceptInLock_(cfg, rid, canonical, hash, entry);
    } catch (err) {
      return fail_('UPSTREAM_UNAVAILABLE', true, rid);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return fail_('UPSTREAM_UNAVAILABLE', true, rid);
  }
}

/** 잠금 안: 정본 검색 → 중복/충돌/이상 판정 → 신규면 접수 창·상한 확인 뒤 1행 쓰기·flush·재읽기 검증 */
function acceptInLock_(cfg, rid, canonical, hash, entry) {
  var sheet = openCanonicalSheet_(cfg);
  var found = findRowsById_(sheet, rid);
  if (found.length > 1) return fail_('CANONICAL_STORE_INVALID', false, rid);
  if (found.length === 1) {
    var row = found[0].values;
    var storedReceipt = String(row[1]), storedAt = String(row[2]), storedHash = String(row[3]), storedJson = String(row[4]);
    if (!storedReceipt || !storedAt || !HEX64_RE.test(storedHash) || !storedJson) return fail_('CANONICAL_STORE_INVALID', false, rid);
    if (storedReceipt.length > 128 || !isValidUtcDateTime_(storedAt)) return fail_('CANONICAL_STORE_INVALID', false, rid);
    var storedObj;
    try { storedObj = parseJsonStrict(storedJson); } catch (err) { return fail_('CANONICAL_STORE_INVALID', false, rid); }
    if (!storedObj || typeof storedObj !== 'object' || Array.isArray(storedObj)) return fail_('CANONICAL_STORE_INVALID', false, rid);
    if (jcsCanonicalize(storedObj) !== storedJson || jcsSha256Hex(storedJson) !== storedHash) return fail_('CANONICAL_STORE_INVALID', false, rid);
    if (storedObj.recordId !== rid || SUPPORTED_RECORD_VERSIONS.indexOf(storedObj.schemaVersion) < 0) return fail_('CANONICAL_STORE_INVALID', false, rid);
    if (!validateAgainst(RECORD_SCHEMAS[storedObj.schemaVersion], storedObj).ok || validateRecordSemantics_(storedObj).length > 0) return fail_('CANONICAL_STORE_INVALID', false, rid);
    if (storedJson === canonical && storedHash === hash) return ok_(rid, storedReceipt, storedAt, storedHash, true);
    return fail_('RECORD_ID_CONFLICT', false, rid);
  }
  // 신규 접수 — 잠금 안에서 설정을 다시 읽고, 설정이 없거나 잘못되면 닫는다(fail-closed)
  cfg = loadConfig_();
  if (!cfg.intakeValid) return fail_('SESSION_NOT_ALLOWED', false, rid);
  if (!entry || entry.status !== 'active') return fail_('SESSION_NOT_ALLOWED', false, rid); // retired 스냅샷은 기존 receipt 회수만
  if (Date.now() > cfg.ACCEPT_UNTIL) return fail_('SESSION_NOT_ALLOWED', false, rid);
  var dataRows = sheet.getLastRow() - 1;
  if (dataRows >= cfg.MAX_NEW_ROWS) return fail_('RATE_LIMITED', true, rid); // 시험당 누적 상한: 시간이 지나도 회복하지 않음(교사 설정 변경 필요, 15 §7)
  var receipt = Utilities.getUuid();
  var acceptedAt = new Date().toISOString();
  var r = sheet.getLastRow() + 1;
  var values = [[rid, receipt, acceptedAt, hash, canonical]];
  sheet.getRange(r, 1, 1, 5).setNumberFormat('@').setValues(values); // '@' = 텍스트 서식(날짜 자동 변환·수식 해석 방지)
  SpreadsheetApp.flush();
  var back = sheet.getRange(r, 1, 1, 5).getValues()[0];
  var same = String(back[0]) === rid && String(back[1]) === receipt && String(back[2]) === acceptedAt && String(back[3]) === hash && String(back[4]) === canonical && jcsSha256Hex(String(back[4])) === hash;
  if (!same) return fail_('UPSTREAM_UNAVAILABLE', true, rid);
  return ok_(rid, receipt, acceptedAt, hash, false);
}

function mimeAllowed_(type) {
  if (typeof type !== 'string') return false;
  return type.split(';')[0].trim().toLowerCase() === 'text/plain';
}

/** 설정 읽기: 스크립트 속성 우선, 비어 있으면 Config.gs의 CONFIG(배포 시 생성, Git 제외) */
function cfgValue_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (v !== null && v !== undefined && String(v) !== '') return v;
  if (typeof CONFIG === 'object' && CONFIG && Object.prototype.hasOwnProperty.call(CONFIG, key)) return CONFIG[key];
  return null;
}

function loadConfig_() {
  var p = { getProperty: cfgValue_ };
  var untilRaw = String(p.getProperty('ACCEPT_UNTIL') || '');
  var until = isValidUtcDateTime_(untilRaw) ? Date.parse(untilRaw) : NaN; // 실제 달력 날짜의 UTC(…Z)만(Codex B4)
  var maxRows = Number(p.getProperty('MAX_NEW_ROWS'));
  var intakeValid = isFinite(until) && isFinite(maxRows) && Math.floor(maxRows) === maxRows && maxRows > 0 && maxRows <= 100000;
  return {
    SHEET_ID: p.getProperty('SHEET_ID'),
    TAB_NAME: p.getProperty('TAB_NAME') || 'canonical',
    ACCEPT_UNTIL: until,
    MAX_NEW_ROWS: maxRows,
    intakeValid: intakeValid,
    LOCK_WAIT_MS: Number(p.getProperty('LOCK_WAIT_MS') || 10000)
  };
}

var VERSION_KEYS = ['taskDefinitionVersion', 'rulesetVersion', 'measurementSetVersion', 'layoutVersion', 'judgeEngineVersion', 'sessionConfigVersion', 'researchProtocolVersion', 'feedbackPolicyVersion'];
var APPROVAL_KEYS = ['taskApproved', 'rulesetApproved', 'layoutConfirmed', 'researchUseApproved'];

/** 허용 스냅샷과 record 문맥 대조(B2): 클라이언트 주장(모드·버전·승인)을 그대로 믿지 않는다. 1.0.0 record는 usagePhase가 없으므로 그 항목만 건너뛴다.
 *  맞으면 허용 목록 항목(status·allowedStepIds 포함)을, 아니면 null을 돌려준다. retired 항목도 돌려주되 신규 접수는 잠금 안에서 막는다. */
function sessionAllowed_(payload) {
  if (typeof ALLOWED_SNAPSHOTS !== 'object' || !ALLOWED_SNAPSHOTS) return null;
  var entry = Object.prototype.hasOwnProperty.call(ALLOWED_SNAPSHOTS, payload.sessionSnapshotId) ? ALLOWED_SNAPSHOTS[payload.sessionSnapshotId] : null;
  if (!entry || !entry.snapshot) return null;
  var snap = entry.snapshot;
  if (payload.sessionCode !== snap.sessionCode || payload.classConditionCode !== snap.classConditionCode || payload.taskId !== snap.taskId) return null;
  if (payload.difficultyMode !== snap.difficultyMode || payload.runPurpose !== snap.runPurpose || payload.displayMode !== snap.displayMode) return null;
  if (payload.schemaVersion !== '1.0.0' && payload.usagePhase !== snap.usagePhase) return null;
  if (payload.runPurpose !== 'demo' || payload.researchEligible !== false) return null;
  if (!payload.configurationApproval || !snap.configurationApproval) return null;
  for (var a = 0; a < APPROVAL_KEYS.length; a++) if (payload.configurationApproval[APPROVAL_KEYS[a]] !== snap.configurationApproval[APPROVAL_KEYS[a]]) return null;
  if (!payload.versions || !snap.versions) return null;
  for (var k = 0; k < VERSION_KEYS.length; k++) if (payload.versions[VERSION_KEYS[k]] !== snap.versions[VERSION_KEYS[k]]) return null;
  if (typeof entry.anonymousCodePattern !== 'string' || !new RegExp(entry.anonymousCodePattern).test(String(payload.anonymousStudentCode))) return null;
  return entry;
}

function openCanonicalSheet_(cfg) {
  if (!cfg.SHEET_ID) throw new Error('CONFIG');
  var ss = SpreadsheetApp.openById(cfg.SHEET_ID);
  var sheet = ss.getSheetByName(cfg.TAB_NAME);
  if (!sheet) throw new Error('CONFIG');
  var header = sheet.getRange(1, 1, 1, 5).getValues()[0];
  for (var i = 0; i < 5; i++) if (String(header[i]) !== HEADER[i]) throw new Error('CONFIG');
  return sheet;
}

function findRowsById_(sheet, rid) {
  var last = sheet.getLastRow();
  var out = [];
  if (last < 2) return out;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === rid) out.push({ rowIndex: i + 2, values: sheet.getRange(i + 2, 1, 1, 5).getValues()[0] });
  }
  return out;
}

function ok_(rid, receipt, acceptedAt, hash, duplicate) {
  return json_({ protocolVersion: PROTOCOL_VERSION, ok: true, recordId: rid, receiptId: receipt, acceptedAt: acceptedAt, payloadHash: hash, duplicate: duplicate });
}

function fail_(code, retryable, rid) {
  var body = { protocolVersion: PROTOCOL_VERSION, ok: false, code: code, retryable: retryable };
  if (rid) body.recordId = rid;
  return json_(body);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** GET는 조회 경로를 제공하지 않는다(설계 15 §2). */
function doGet() {
  return json_({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'INVALID_PAYLOAD', retryable: false });
}

/** 배포자가 편집기에서 한 번 실행: 정본 탭 'canonical'과 머리글 5개를 만들고, 이때 Sheet 권한을 승인한다(웹 앱 실행 전 필요). 요청으로는 호출되지 않는다. */
function setupOnce() {
  var cfg = loadConfig_();
  if (!cfg.SHEET_ID) throw new Error('SHEET_ID 없음');
  var ss = SpreadsheetApp.openById(cfg.SHEET_ID);
  var sheet = ss.getSheetByName(cfg.TAB_NAME);
  if (!sheet) { var first = ss.getSheets()[0]; if (first && first.getLastRow() <= 1 && ss.getSheets().length === 1) { first.setName(cfg.TAB_NAME); sheet = first; } else sheet = ss.insertSheet(cfg.TAB_NAME); }
  sheet.getRange(1, 1, 1, 5).setNumberFormat('@').setValues([HEADER]);
  SpreadsheetApp.flush();
  return 'ok: ' + ss.getName() + ' / ' + cfg.TAB_NAME + ' / intake until ' + new Date(cfg.ACCEPT_UNTIL).toISOString();
}

export { parseJsonStrict, validateRequestEnvelope, validateAgainst, validateRecordSemantics_, validateStepEvents_, jcsCanonicalize, jcsSha256Hex, utf8ByteLength_, isValidUtcDateTime_, sessionAllowed_, RECORD_SCHEMAS, ALLOWED_SNAPSHOTS, UUID_RE, HEX64_RE, PROTOCOL_VERSION, SUPPORTED_RECORD_VERSIONS, REQUEST_MAX_BYTES, CANONICAL_MAX_BYTES, MAX_STEP_EVENTS }
