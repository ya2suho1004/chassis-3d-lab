// 직접 제출 수신점(시험 배포용) — 설계 docs/design/docs/15 §3~§5·§7
// 경로: 브라우저 text/plain POST → doPost → 비공개 시험 Sheet 정본 탭(recordId | receiptId | acceptedAt | payloadHash | payloadJson)
// 하지 않는 것: 사용자 입력으로 Sheet/탭 변경, 값 교정·잘림 수락, 같은 ID 덮어쓰기·새 ID 발급, GET 조회, raw body/스택/Sheet ID/이메일 응답·로그.
// 설정(스크립트 속성): SHEET_ID(필수) · TAB_NAME(기본 canonical) · ALLOWED_SESSION_CODES(쉼표) · ALLOWED_SNAPSHOT_IDS(쉼표)
//                     · ALLOWED_CLASS_CONDITIONS(기본 DEMO) · ACCEPT_UNTIL(ISO, 신규 접수 종료) · MAX_NEW_ROWS(시험당 신규행 상한) · LOCK_WAIT_MS(기본 10000)
var PROTOCOL_VERSION = '1';
var SUPPORTED_RECORD_VERSIONS = ['1.1.0'];
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

    var cfg = loadConfig_();
    if (!sessionAllowed_(payload, cfg)) return fail_('SESSION_NOT_ALLOWED', false, rid);

    var canonical;
    try { canonical = jcsCanonicalize(payload); } catch (err) { return fail_('INVALID_PAYLOAD', false, rid); }
    if (utf8ByteLength_(canonical) > CANONICAL_MAX_BYTES) return fail_('PAYLOAD_TOO_LARGE', false, rid);
    var hash = jcsSha256Hex(canonical);

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(cfg.LOCK_WAIT_MS)) return fail_('LOCK_BUSY', true, rid);
    try {
      return acceptInLock_(cfg, rid, canonical, hash);
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
function acceptInLock_(cfg, rid, canonical, hash) {
  var sheet = openCanonicalSheet_(cfg);
  var found = findRowsById_(sheet, rid);
  if (found.length > 1) return fail_('CANONICAL_STORE_INVALID', false, rid);
  if (found.length === 1) {
    var row = found[0].values;
    var storedReceipt = String(row[1]), storedAt = String(row[2]), storedHash = String(row[3]), storedJson = String(row[4]);
    if (!storedReceipt || !storedAt || !HEX64_RE.test(storedHash) || !storedJson) return fail_('CANONICAL_STORE_INVALID', false, rid);
    var storedObj;
    try { storedObj = parseJsonStrict(storedJson); } catch (err) { return fail_('CANONICAL_STORE_INVALID', false, rid); }
    if (jcsCanonicalize(storedObj) !== storedJson || jcsSha256Hex(storedJson) !== storedHash) return fail_('CANONICAL_STORE_INVALID', false, rid);
    if (storedJson === canonical && storedHash === hash) return ok_(rid, storedReceipt, storedAt, storedHash, true);
    return fail_('RECORD_ID_CONFLICT', false, rid);
  }
  // 신규 접수
  if (cfg.ACCEPT_UNTIL && Date.now() > cfg.ACCEPT_UNTIL) return fail_('SESSION_NOT_ALLOWED', false, rid);
  var dataRows = sheet.getLastRow() - 1;
  if (dataRows >= cfg.MAX_NEW_ROWS) return fail_('RATE_LIMITED', true, rid);
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

function loadConfig_() {
  var p = PropertiesService.getScriptProperties();
  var list = function (k, def) { var s = p.getProperty(k); if (s === null || s === undefined || s === '') return def; return s.split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 0; }); };
  var until = p.getProperty('ACCEPT_UNTIL');
  return {
    SHEET_ID: p.getProperty('SHEET_ID'),
    TAB_NAME: p.getProperty('TAB_NAME') || 'canonical',
    ALLOWED_SESSION_CODES: list('ALLOWED_SESSION_CODES', []),
    ALLOWED_SNAPSHOT_IDS: list('ALLOWED_SNAPSHOT_IDS', []),
    ALLOWED_CLASS_CONDITIONS: list('ALLOWED_CLASS_CONDITIONS', ['DEMO']),
    ACCEPT_UNTIL: until ? Date.parse(until) : null,
    MAX_NEW_ROWS: Number(p.getProperty('MAX_NEW_ROWS') || 200),
    LOCK_WAIT_MS: Number(p.getProperty('LOCK_WAIT_MS') || 10000)
  };
}

/** 시험 배포 허용 조건: 허용 세션·스냅샷·조건 코드, 시연 목적, 연구 적격·연구 승인 주장 없음 */
function sessionAllowed_(payload, cfg) {
  if (cfg.ALLOWED_SESSION_CODES.indexOf(payload.sessionCode) < 0) return false;
  if (cfg.ALLOWED_SNAPSHOT_IDS.indexOf(payload.sessionSnapshotId) < 0) return false;
  if (cfg.ALLOWED_CLASS_CONDITIONS.indexOf(payload.classConditionCode) < 0) return false;
  if (payload.runPurpose !== 'demo') return false;
  if (payload.researchEligible !== false) return false;
  if (!payload.configurationApproval || payload.configurationApproval.researchUseApproved !== false) return false;
  return true;
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
