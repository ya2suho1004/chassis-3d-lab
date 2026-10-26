// 엄격한 JSON 파서 — 중복 객체 키·다중 문서·후행 문자·잘못된 문법·짝 없는 서로게이트 이스케이프·원문 제어 문자를 거절한다.
// JSON.parse는 중복 키를 조용히 덮어쓰므로(설계 15 §3 2항) 수신 검증에는 이 파서를 쓴다.
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
  var obj = {}; var seen = {};
  skipWs_(p);
  if (p.s[p.i] === '}') { p.i++; return obj; }
  for (;;) {
    skipWs_(p);
    if (p.s[p.i] !== '"') throw new Error('INVALID_JSON');
    var key = parseString_(p);
    if (Object.prototype.hasOwnProperty.call(seen, key)) throw new Error('DUPLICATE_KEY');
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
