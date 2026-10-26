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
    if (s.format === 'date-time' && !(DATE_TIME_RE.test(v) && !isNaN(Date.parse(v)))) errors.push(path + ': format date-time');
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
