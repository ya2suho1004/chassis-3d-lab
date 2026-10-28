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
