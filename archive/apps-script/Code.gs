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
