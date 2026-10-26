#!/usr/bin/env node
/** Local JSON contract and synthetic-data validation only. Never imports app code. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';

const args = Object.fromEntries(process.argv.slice(2).reduce((out, arg, i, all) => {
  if (arg.startsWith('--')) out.push([arg.slice(2), all[i + 1]]);
  return out;
}, []));
const root = path.resolve(args.root || path.join(import.meta.dirname, '..'));
const project = path.resolve(args.project || '/Users/jamingchu/claude code/chassis-3d-lab');
const output = path.resolve(args.out || path.join(root, 'validation/results.uitems.json'));
const require = createRequire(import.meta.url);
const Ajv2020 = require(path.join(project, 'node_modules/ajv/dist/2020.js')).default;
const addFormats = require(path.join(project, 'node_modules/ajv-formats')).default;
const ajvOptions = {allErrors: true, strict: false, validateFormats: true, useDefaults: false, coerceTypes: false, removeAdditional: false};
const ajv = new Ajv2020(ajvOptions); addFormats(ajv);
const clone = x => structuredClone(x);
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
const same = (a,b) => equal(canonical(a), canonical(b));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const escapePointer = s => String(s).replaceAll('~', '~0').replaceAll('/', '~1');
function differences(a,b,p='') {
  if (same(a,b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k => differences(a[k], b[k], `${p}/${escapePointer(k)}`));
  }
  return [{pointer:p || '/', canonical:a === undefined ? {absent:true} : a, project:b === undefined ? {absent:true} : b}];
}
const checks=[], diagnostics=[], sources=[], tiers={}, schemasById=new Map();
function report(name, passed, detail={}) {checks.push({name, passed:Boolean(passed), ...detail});}
function mustRead(relative) {
  const file=path.join(root,relative);
  if (!fs.existsSync(file)) {report(`file:${relative}`,false,{errors:['required file missing']});return null;}
  try {const data=read(file);sources.push({path:file,sha256:hash(file)});return data;} catch(e) {report(`file:${relative}`,false,{errors:[e.message]});return null;}
}
const kinds=['task','record','layout','delivery','submission'];
for (const [tier,folder] of [['current','contracts'],['1.1.0','contracts/legacy/1.1.0'],['1.0.0','contracts/legacy/1.0.0']]) {
  tiers[tier]={};
  for (const kind of kinds) {const s=mustRead(`${folder}/${kind}.schema.json`);if(s) tiers[tier][kind]=s;}
}
const snapshotSchema=mustRead('contracts/session.snapshot.schema.json');
if(snapshotSchema) tiers.current['session-snapshot']=snapshotSchema;
for (const [tier,schemas] of Object.entries(tiers)) for (const [kind,s] of Object.entries(schemas)) {
  const prior=schemasById.get(s.$id);
  if(prior) report(`schemaId-content-consistency:${tier}:${kind}`,same(prior,s),{schemaId:s.$id});
  else schemasById.set(s.$id,s);
}
for (const [id,s] of schemasById) {try {ajv.addSchema(s,id);} catch(e){report(`addSchema:${id}`,false,{errors:[e.message]});}}
for (const [tier,schemas] of Object.entries(tiers)) for (const [kind,s] of Object.entries(schemas)) {
  try {ajv.getSchema(s.$id);report(`compile:${tier}:${kind}`,true,{schemaId:s.$id});}
  catch(e){report(`compile:${tier}:${kind}`,false,{errors:[e.message]});}
}
// Strict lint is an additional diagnostic; it is not JSON Schema validity.
for (const [id,s] of schemasById) {
  const strictAjv=new Ajv2020({...ajvOptions,strict:true});addFormats(strictAjv);
  try {for(const [refId,ref] of schemasById) strictAjv.addSchema(ref,refId);strictAjv.getSchema(id);diagnostics.push({name:'strict-lint',schemaId:id,passed:true});}
  catch(e){diagnostics.push({name:'strict-lint',schemaId:id,passed:false,error:e.message});}
}
function schemaErrors(kind,data,tier='current') {
  const s=tiers[tier]?.[kind];if(!s) return [{message:`missing schema ${tier}/${kind}`}];
  try {const validate=ajv.getSchema(s.$id);return validate(data) ? [] : clone(validate.errors || []);}
  catch(e){return [{message:e.message}];}
}
function validate(name,kind,data,want=true,tier='current') {
  const errors=schemaErrors(kind,data,tier);report(name,(errors.length===0)===want,{expected:want?'accept':'reject',tier,schemaId:tiers[tier]?.[kind]?.$id,errors});return errors;
}
const vocab=mustRead('contracts/task-vocabulary.v1.2.0.json');
const oldVocab=mustRead('contracts/legacy/1.1.0/task-vocabulary.v1.1.0.json');
function semantics(kind,data,v=vocab,current=true) {
  const out=[];if(!data||!v)return ['missing semantic input or vocabulary'];
  if(kind==='task') {
    const steps=data.steps || [], ids=steps.map(s=>s.stepId),known=new Set(ids),graph=Object.fromEntries(steps.map(s=>[s.stepId,s.prerequisites||[]]));
    if(ids.length!==known.size)out.push('duplicateStepId');
    for(const st of steps) {
      const d=v.completionConditions?.[st.completionCondition];
      if(!d || !d.stepIds?.includes(st.stepId))out.push('stepCompletionBinding');
      if(st.prerequisites?.some(id=>!known.has(id)))out.push('unknownPrerequisite');
      if(!(st.onBlockedFeedbackKey in (data.feedback || {})))out.push('unknownFeedback');
      if(st.requiredSafetyConditions?.some(id=>!(id in (v.safetyConditions || {}))))out.push('unknownSafetyCondition');
    }
    const visiting=new Set(),done=new Set();
    function cyclic(k){if(visiting.has(k))return true;if(done.has(k)||!graph[k])return false;visiting.add(k);if(graph[k].some(cyclic))return true;visiting.delete(k);done.add(k);return false;}
    if(ids.some(cyclic))out.push('cyclicPrerequisites');
    if(data.feedbackPolicy?.answerFeedbackKeys?.some(k=>!(k in data.feedback)))out.push('unknownAnswerFeedback');
    const responses=data.requiredResponseItems||[],responseIds=responses.map(i=>i.itemId);
    if(responseIds.length!==new Set(responseIds).size)out.push('duplicateResponseId');
    const calculationItems=new Set(Object.values(v.calculationRules||{}).flatMap(r=>r.appliesToItems||[]));
    for(const item of responses) {
      const grade=v.gradingRules?.[item.gradingRuleId],precision=v.precisionPolicies?.[item.precisionPolicyRef];
      if(grade&&!grade.allowedKinds?.includes(item.kind))out.push('gradingKindMismatch');
      if(precision&&!precision.allowedKinds?.includes(item.kind))out.push('precisionKindMismatch');
      if(item.gradingRuleId==='decimalExact'&&item.answerTolerance!==null)out.push('exactToleranceNotNull');
      if(item.gradingRuleId==='vehicleVerdictMatch'&&['unit','answerTolerance','precisionPolicyRef'].some(k=>item[k]!==null))out.push('judgmentAuxiliaryFields');
      if(item.kind==='calculation'&&!calculationItems.has(item.itemId))out.push('unknownCalculationBinding');
      if(item.gradingRuleId!==null&&data.taskId===v.taskBindings?.taskId) {
        const b=v.taskBindings.requiredResponseItems?.[item.itemId];
        if(!b||['gradingRuleId','precisionPolicyRef'].some(k=>item[k]!==b[k]))out.push('responseBindingMismatch');
      }
      if(item.precisionPolicyRef==='truncate1'&&(!same(data.ruleset?.decisionPrecision,{mode:'rounded',digits:1,rounding:'truncate'})||data.ruleset?.judgmentValueSource!=='written'))out.push('truncatePolicyMismatch');
    }
    if(current&&known.has('tire')&&known.has('equip')) {
      for(const id of ['tire','equip']) {const st=steps.find(s=>s.stepId===id);if(!st.requiredSafetyConditions?.includes('s-engine')||st.onBlockedFeedbackKey!=='blocked_safety_engine')out.push(`engineBinding:${id}`);}
      if(!data.feedback?.blocked_safety_engine)out.push('missingEngineFeedback');
      if(ids.length!==12)out.push('canonicalStepCountMustBe12');
    }
  }
  if(kind==='layout') {
    const openings=data.openings||[],ids=openings.map(x=>x.openingId);
    if(ids.length!==new Set(ids).size)out.push('duplicateOpeningId');
    if(openings.some(x=>same(x.start,x.end)&&Object.values(x.start||{}).every(v=>v!==null)))out.push('zeroLengthOpening');
  }
  if(kind==='record') {
    const allowed=new Set(['motorOff','liftUp','exitVehicle']);
    const events=data.stepEvents||[],eventIds=events.map(e=>e.eventId),sequences=events.map(e=>e.sequence);
    if(eventIds.length!==new Set(eventIds).size)out.push('duplicateEventId');
    if(sequences.length!==new Set(sequences).size)out.push('duplicateEventSequence');
    const sub=events.filter(e=>e.type==='stepCompleted'&&e.stepId?.startsWith('off:'));
    for(const event of events)if(event.stepId?.startsWith('off:')&&!allowed.has(event.stepId.slice(4)))out.push('unknownOffSubAction');
    const actions=sub.map(e=>e.stepId.slice(4));
    if(actions.length!==new Set(actions).size)out.push('duplicateOffSubAction');
    const ordering=['motorOff','liftUp','exitVehicle'];
    if(actions.some((action,i)=>ordering.indexOf(action)!==i))out.push('offSubActionOrder');
    const parents=events.filter(e=>e.type==='stepCompleted'&&e.stepId==='off');
    if(parents.length>1)out.push('duplicateOffParent');
    if(sub.length&&parents.length){const exitIndex=events.findIndex(e=>e.type==='stepCompleted'&&e.stepId==='off:exitVehicle'),parentIndex=events.indexOf(parents[0]);if(exitIndex<0||parentIndex!==exitIndex+1)out.push('offParentMustFollowExitVehicle');}
  }
  return [...new Set(out)];
}
function semantic(name,kind,data,want=true,v=vocab,current=true) {const errors=semantics(kind,data,v,current);report(name,(errors.length===0)===want,{expected:want?'accept':'reject',errors});}
const mapping = file => file.startsWith('session.') ? 'session-snapshot' : kinds.find(k=>file.startsWith(`${k}.`));
function walk(dir) {return fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(ent=>ent.isDirectory()?walk(path.join(dir,ent.name)):[path.join(dir,ent.name)]):[];}
for(const file of walk(path.join(root,'examples')).filter(f=>f.endsWith('.json'))) {
  const rel=path.relative(path.join(root,'examples'),file),kind=mapping(path.basename(file));if(!kind)continue;
  const old=rel.match(/^legacy[/\\]([^/\\]+)[/\\]/),tier=old?old[1]:'current',data=read(file);
  sources.push({path:file,sha256:hash(file)});validate(`example:${rel}`,kind,data,true,tier);
  if(['task','layout','record'].includes(kind))semantic(`example-semantics:${rel}`,kind,data,true,old?oldVocab:vocab,!old);
}
const cases=[];const projectComparisons=[];
const teacher=read(path.join(root,'../collaboration/teacher-check-0A.json'));
for(const level of [1,2]) {
  const relative=`docs/task.braking-force.case-lv${level}.json`,doc=mustRead(relative),pfile=path.join(project,`src/data/tasks/task.braking-force.case-lv${level}.json`);
  report(`project-source-present-lv${level}`,fs.existsSync(pfile));
  if(!doc||!fs.existsSync(pfile))continue;
  const source=read(pfile);sources.push({path:pfile,sha256:hash(pfile),readOnly:true});cases.push(doc);
  validate(`formal-task-lv${level}`,'task',doc);semantic(`formal-task-semantics-lv${level}`,'task',doc);
  report(`formal-task-metadata-lv${level}`,doc.schemaVersion==='1.2.0'&&doc.vocabularyVersion==='1.2.0'&&doc.taskDefinitionVersion===`1.2.0-review-case-${level}-2026-10-26`);
  report(`formal-task-approval-preserved-lv${level}`,doc.approvalStatus==='pending');
  report(`teacher-review-reference-lv${level}`,doc.teacherReviewReference===source.teacherReviewReference&&doc.teacherReviewReference.includes('teacher-check-0A.json')&&doc.teacherReviewReference.includes('teacher-check-0E.json'));
  report(`approved-10-feedback-equality-lv${level}`,Object.keys(doc.feedback).length===10&&same(doc.feedback,source.feedback),{differences:differences(doc.feedback,source.feedback,'/feedback')});
  report(`feedback-policy-equality-lv${level}`,same(doc.feedbackPolicy,source.feedbackPolicy)&&doc.feedbackPolicy.status==='approved'&&doc.feedbackPolicy.version==='1.1.0-design-approved-2026-10-26');
  const expectedMeasurement=teacher.cases[`lv${level}`].draft;
  report(`0A-measurement-preservation-lv${level}`,Object.entries(expectedMeasurement).every(([k,v])=>same(doc.measurement[k],v))&&doc.measurement.inputsIntegerOnly===teacher.precision.inputsIntegerOnly);
  report(`0A-rules-preservation-lv${level}`,['deviationMaxPercent','sumMinRearPercent','sumMinFrontPercent'].every(k=>doc.ruleset[k]===teacher.ruleset[k].value)&&same(doc.ruleset.decisionPrecision,{mode:'rounded',digits:1,rounding:'truncate'})&&doc.ruleset.judgmentValueSource===teacher.precision.compareWith&&doc.ruleset.approvedAt===null&&doc.ruleset.approvedOn===teacher.checkedAt);
  report(`0A-12-steps-preservation-lv${level}`,same(doc.steps.map(s=>s.stepId),teacher.steps.map(s=>s.stepId))&&doc.steps.length===12);
  validate(`project-task-lv${level}-current1.2`,'task',source);
  semantic(`project-task-semantics-lv${level}-current1.2`,'task',source);
  const diff=differences(doc,source);projectComparisons.push({level,canonical:path.join(root,relative),project:pfile,differences:diff,expected:'exact current 1.2.0 JSON equality'});
  report(`project-task-exact-equality-lv${level}`,diff.length===0,{differences:diff});
  const m=doc.measurement,dev=Math.floor(Math.abs(m.left-m.right)*1000/m.axleWeight)/10,sum=Math.floor((m.left+m.right)*1000/m.axleWeight)/10;
  report(`independent-case-arithmetic-lv${level}`,dev===(level===1?6.6:10)&&sum===73.3&&(dev<=doc.ruleset.deviationMaxPercent&&sum>=doc.ruleset.sumMinRearPercent)===(level===1),{deviation:dev,sum,vehicleVerdict:level===1?'pass':'fail'});
}
for(const file of walk(path.join(root,'docs')).filter(f=>/layout.*\.json$/.test(path.basename(f)))){const data=read(file);if(data.schemaVersion){const tier=data.schemaVersion==='1.0.0'?'1.0.0':'current',rel=path.relative(root,file);validate(`docs-layout:${rel}`,'layout',data,true,tier);semantic(`docs-layout-semantics:${rel}`,'layout',data,true,tier==='current'?vocab:oldVocab,tier==='current');}}
const index=mustRead('contracts/schema-index.json');
if(index) {
  report('catalog-version',index.catalogVersion==='1.2.0');
  for(const kind of kinds)report(`catalog-current:${kind}`,index.current?.[kind]?.schemaId===tiers.current[kind]?.$id);
  report('catalog-session-snapshot',Object.values(index.current||{}).some(v=>v.schemaId==='urn:chassis-3d-lab:session-snapshot:1.0.0'&&v.path==='session.snapshot.schema.json'));
}
report('current-task-contract-version',tiers.current.task?.$id==='urn:chassis-3d-lab:task:1.2.0'&&tiers.current.task?.properties.schemaVersion.const==='1.2.0'&&tiers.current.task?.properties.vocabularyVersion.const==='1.2.0');
for(const kind of ['record','layout','submission','delivery'])report(`unchanged-contract:${kind}`,same(tiers.current[kind],tiers['1.1.0'][kind]));
report('current-vocabulary-version',vocab?.vocabularyVersion==='1.2.0');
if(vocab) {
  report('vocabulary-engine-feedback-key',Boolean(vocab.feedbackKeys?.blocked_safety_engine));
  report('vocabulary-off-subactions',same(Object.keys(vocab.offSubActions||{}).sort(),['exitVehicle','liftUp','motorOff']));
  const serialized=JSON.stringify(vocab.stepEventSemantics||{});
  report('vocabulary-off-event-identifiers',['off:motorOff','off:liftUp','off:exitVehicle'].every(id=>serialized.includes(id)));
  report('vocabulary-off-registered-event-ids',same(vocab.stepEventSemantics?.registeredSubActionStepIds,['off:motorOff','off:liftUp','off:exitVehicle']));
  report('vocabulary-off-action-order',same(vocab.stepEventSemantics?.subActionOrder,['motorOff','liftUp','exitVehicle']));
  report('vocabulary-off-subaction-event-bindings',['motorOff','liftUp','exitVehicle'].every(id=>vocab.offSubActions?.[id]?.parentStepId==='off'&&vocab.offSubActions?.[id]?.eventStepId===`off:${id}`));
  report('vocabulary-motorOff-not-blocked-by-exit-or-lift',same(vocab.offSubActions?.motorOff?.requiredSafetyConditions,['s-ppe']));
  report('vocabulary-liftUp-safety-bindings',['s-ppe','s-exit','s-lift'].every(id=>vocab.offSubActions?.liftUp?.requiredSafetyConditions?.includes(id)));
  const eventExamples=vocab.stepEventSemantics?.examples||[];
  report('vocabulary-event-examples-parent-and-subactions',['off:motorOff','off:liftUp','off:exitVehicle','off'].every(stepId=>eventExamples.some(event=>event.type==='stepCompleted'&&event.stepId===stepId)));
  report('vocabulary-schema-enum-consistency',same(Object.keys(vocab.completionConditions).sort(),[...tiers.current.task.properties.steps.items.properties.completionCondition.enum].sort())&&same(Object.keys(vocab.safetyConditions).sort(),[...tiers.current.task.properties.steps.items.properties.requiredSafetyConditions.items.enum].sort()));
}
function mutateTask(name,modify,mode='schema'){if(!cases[0])return;const data=clone(cases[0]);modify(data);mode==='semantic'?semantic(name,'task',data,false):validate(name,'task',data,false);}
mutateTask('reject-task-schema-version-mismatch',d=>d.schemaVersion='1.1.0');
mutateTask('reject-task-vocabulary-version-mismatch',d=>d.vocabularyVersion='1.1.0');
mutateTask('reject-task-unregistered-condition',d=>d.steps[0].completionCondition='eval(userText)');
mutateTask('reject-task-unregistered-safety-enum',d=>d.steps[1].requiredSafetyConditions=['s-unregistered']);
mutateTask('reject-task-invalid-unit',d=>d.measurement.unit='kgf-auto');
mutateTask('reject-task-missing-required-response-items',d=>delete d.requiredResponseItems);
mutateTask('reject-task-fractional-integer-input',d=>d.measurement.left=2.5);
mutateTask('reject-task-negative-measurement',d=>d.measurement.left=-1);
mutateTask('reject-task-zero-axle-weight',d=>d.measurement.axleWeight=0);
mutateTask('reject-task-unregistered-grading',d=>d.requiredResponseItems[0].gradingRuleId='runExpression');
mutateTask('reject-task-unregistered-precision',d=>d.requiredResponseItems[0].precisionPolicyRef='roundWhatever');
for(const [name,fn] of [
  ['unknown-prerequisite',d=>d.steps[1].prerequisites=['no-such-step']],
  ['cyclic-prerequisites',d=>d.steps[0].prerequisites=[d.steps.at(-1).stepId]],
  ['duplicate-step-id',d=>d.steps[1].stepId=d.steps[0].stepId],
  ['unknown-feedback-target',d=>d.steps[0].onBlockedFeedbackKey='not-defined'],
  ['unknown-answer-feedback',d=>d.feedbackPolicy.answerFeedbackKeys=['not-defined']],
  ['completion-condition-binding',d=>d.steps[0].completionCondition='vehicleExited'],
  ['duplicate-response-id',d=>d.requiredResponseItems[1].itemId=d.requiredResponseItems[0].itemId],
  ['unknown-calculation-binding',d=>d.requiredResponseItems[3].itemId='unknownFormula'],
  ['grading-kind-mismatch',d=>d.requiredResponseItems[0].gradingRuleId='vehicleVerdictMatch'],
  ['exact-tolerance',d=>d.requiredResponseItems[0].answerTolerance=10],
  ['truncate-written-policy',d=>d.ruleset.judgmentValueSource='raw'],
  ['engine-binding-tire',d=>d.steps.find(s=>s.stepId==='tire').requiredSafetyConditions=['s-ppe']],
  ['engine-feedback-equip',d=>d.steps.find(s=>s.stepId==='equip').onBlockedFeedbackKey='blocked_order'],
  ['12-step-aggregate-preserved',d=>d.steps.push({...clone(d.steps[10]),stepId:'off:motorOff'})],
])mutateTask(`semantic-reject-${name}`,fn,'semantic');
if(cases[0]) {const changed=clone(cases[0]);changed.feedback.blocked_safety_engine.what='synthetic changed text';report('detect-approved-feedback-text-drift',!same(changed.feedback,cases[0].feedback));}
const record=mustRead('examples/record.demo-aborted.json');
if(record) {
  for(const key of ['vehicleEntryDirection','sessionConfiguration']){const d=clone(record);d[key]=key==='sessionConfiguration'?{vehicleEntryDirection:'north'}:'north';validate(`reject-extra-record-${key}`,'record',d,false);}
  const offRecord=clone(record);offRecord.stepEvents=[{eventId:'00000000-0000-4000-8000-000000000011',sequence:1,elapsedMs:0,type:'stepCompleted',stepId:'off:motorOff'}];
  validate('off-event-known-id-structure','record',offRecord);semantic('off-event-known-id-semantics','record',offRecord);
  const long=clone(offRecord);long.stepEvents[0].stepId='off:'+ 'x'.repeat(61);validate('reject-off-event-id-over64','record',long,false);
  const boundary=clone(offRecord);boundary.stepEvents[0].stepId='off:'+ 'x'.repeat(60);validate('off-event-id64-structure-accept','record',boundary);
  const unknown=clone(offRecord);unknown.stepEvents[0].stepId='off:teleport';validate('unknown-off-event-is-schema-valid-string','record',unknown);semantic('reject-unknown-off-action-semantically','record',unknown,false);
  if(cases[0]) {
    const fixture=clone(record),ids=cases[0].steps.map(s=>s.stepId).flatMap(id=>id==='off'?['off:motorOff','off:liftUp','off:exitVehicle','off']:[id]);
    fixture.stepEvents=ids.map((stepId,i)=>({eventId:`00000000-0000-4000-8000-${String(i+100).padStart(12,'0')}`,sequence:i+1,elapsedMs:i*10,type:'stepCompleted',stepId}));
    validate('off-subactions-synthetic-record','record',fixture);semantic('off-subactions-synthetic-record-semantics','record',fixture);
    const topSteps=new Set(cases[0].steps.map(s=>s.stepId)),completed=fixture.stepEvents.filter(e=>e.type==='stepCompleted').map(e=>e.stepId), aggregate=new Set(completed.filter(id=>topSteps.has(id)));
    report('off-subactions-15-events-12-aggregate',completed.length===15&&aggregate.size===12&&['off:motorOff','off:liftUp','off:exitVehicle'].every(id=>completed.includes(id)),{completedEvents:completed.length,aggregateSteps:aggregate.size});
    report('off-subactions-synthetic-pending',fixture.completionStatus==='aborted'&&fixture.runPurpose==='demo'&&fixture.researchEligible===false&&Object.values(fixture.configurationApproval).every(v=>v===false));
    const noParent=clone(fixture);noParent.stepEvents=noParent.stepEvents.filter(e=>e.stepId!=='off');semantic('off-subactions-without-parent-is-partial-transcript','record',noParent);report('off-subactions-do-not-infer-parent-completion',new Set(noParent.stepEvents.filter(e=>topSteps.has(e.stepId)).map(e=>e.stepId)).size===11);
    const legacyParent=clone(fixture);legacyParent.stepEvents=legacyParent.stepEvents.filter(e=>!e.stepId.startsWith('off:'));semantic('legacy-off-parent-only-remains-valid','record',legacyParent);report('legacy-parent-does-not-infer-subactions',legacyParent.stepEvents.filter(e=>e.stepId.startsWith('off:')).length===0);
    const duplicate=clone(fixture);duplicate.stepEvents.push({...clone(fixture.stepEvents.find(e=>e.stepId==='off:motorOff')),eventId:'00000000-0000-4000-8000-000000009999',sequence:99});semantic('reject-duplicate-off-subaction','record',duplicate,false);
    const duplicateEvent=clone(fixture);duplicateEvent.stepEvents[1].eventId=duplicateEvent.stepEvents[0].eventId;semantic('reject-duplicate-event-id','record',duplicateEvent,false);
    const duplicateSequence=clone(fixture);duplicateSequence.stepEvents[1].sequence=duplicateSequence.stepEvents[0].sequence;semantic('reject-duplicate-event-sequence','record',duplicateSequence,false);
    const reversed=clone(fixture);const motor=reversed.stepEvents.findIndex(e=>e.stepId==='off:motorOff'),lift=reversed.stepEvents.findIndex(e=>e.stepId==='off:liftUp');[reversed.stepEvents[motor].stepId,reversed.stepEvents[lift].stepId]=[reversed.stepEvents[lift].stepId,reversed.stepEvents[motor].stepId];semantic('reject-off-action-order','record',reversed,false);
    const earlyParent=clone(fixture);const parent=earlyParent.stepEvents.findIndex(e=>e.stepId==='off'),exit=earlyParent.stepEvents.findIndex(e=>e.stepId==='off:exitVehicle');[earlyParent.stepEvents[parent].stepId,earlyParent.stepEvents[exit].stepId]=[earlyParent.stepEvents[exit].stepId,earlyParent.stepEvents[parent].stepId];semantic('reject-parent-before-exitVehicle','record',earlyParent,false);
  }
}
const snapshot=mustRead('examples/session.demo-snapshot.json');
if(snapshot) {
  validate('session-snapshot-example','session-snapshot',snapshot);
  for(const direction of ['north','south',null]){const d=clone(snapshot);d.sessionConfiguration.vehicleEntryDirection=direction;validate(`session-direction-${direction}`,'session-snapshot',d);}
  for(const [name,fn] of [['invalid-direction',d=>d.sessionConfiguration.vehicleEntryDirection='east'],['missing-direction',d=>delete d.sessionConfiguration.vehicleEntryDirection],['missing-session-config',d=>delete d.sessionConfiguration],['extra-session-config-field',d=>d.sessionConfiguration.extra=true],['extra-root-field',d=>d.extra=true],['bad-snapshot-version',d=>d.schemaVersion='1.2.0']]) {const d=clone(snapshot);fn(d);validate(`reject-session-${name}`,'session-snapshot',d,false);}
  const before=clone(snapshot);delete before.sessionConfiguration.vehicleEntryDirection;const original=clone(before);schemaErrors('session-snapshot',before);report('schema-default-does-not-mutate-data',same(before,original)&&!('vehicleEntryDirection' in before.sessionConfiguration));
  if(cases[0])report('snapshot-formal-task-version-alignment',snapshot.versions.taskDefinitionVersion===cases[0].taskDefinitionVersion&&snapshot.versions.feedbackPolicyVersion===cases[0].feedbackPolicy.version&&snapshot.versions.sessionConfigVersion==='1.2.0-design-2026-10-26'&&snapshot.versions.layoutVersion==='partial-survey-2026-10-26');
  if(cases[1]){const second=clone(snapshot);second.versions.taskDefinitionVersion=cases[1].taskDefinitionVersion;validate('session-case2-version-fixture','session-snapshot',second);report('session-case2-independent-copy',snapshot.versions.taskDefinitionVersion!==second.versions.taskDefinitionVersion&&same(snapshot.sessionConfiguration,second.sessionConfiguration));}
  if(record){report('snapshot-new-identity-preserves-existing-record',snapshot.sessionSnapshotId!==record.sessionSnapshotId&&record.sessionSnapshotId==='00000000-0000-4000-8000-000000000004');report('snapshot-existing-record-shared-session-context', ['sessionCode','classConditionCode','taskId','difficultyMode','usagePhase','runPurpose','displayMode'].every(k=>same(snapshot[k],record[k])));report('snapshot-approval-bounded-to-ruleset',same(snapshot.configurationApproval,{taskApproved:false,rulesetApproved:true,layoutConfirmed:false,researchUseApproved:false}));}
  if(record){const syntheticRecord=clone(record);for(const key of ['sessionSnapshotId','sessionCode','classConditionCode','taskId','difficultyMode','usagePhase','runPurpose','displayMode','configurationApproval','versions'])syntheticRecord[key]=clone(snapshot[key]);validate('synthetic-record-with-snapshot-context','record',syntheticRecord);report('snapshot-synthetic-record-binding',syntheticRecord.sessionSnapshotId===snapshot.sessionSnapshotId&&same(syntheticRecord.versions,snapshot.versions));}
}

for (const level of [1,2]) {
  const data=mustRead(`docs/legacy/1.1.0/task.braking-force.case-lv${level}.json`);
  if(data){validate(`archived-formal-task-lv${level}`,'task',data,true,'1.1.0');semantic(`archived-formal-task-semantics-lv${level}`,'task',data,true,oldVocab,false);}
}
// Snapshot references are registry lookups, never inferred from the current UI choice.
function sessionBindingErrors(record,snapshots) {
  const snap=snapshots.find(s=>s.sessionSnapshotId===record.sessionSnapshotId);
  if(!snap)return ['unknownSnapshotId'];
  return ['sessionCode','classConditionCode','taskId','difficultyMode','usagePhase','runPurpose','displayMode','configurationApproval','versions'].filter(k=>!same(record[k],snap[k])).map(k=>`snapshotMismatch:${k}`);
}
if(snapshot&&record){
  const linked=clone(record);for(const key of ['sessionSnapshotId','sessionCode','classConditionCode','taskId','difficultyMode','usagePhase','runPurpose','displayMode','configurationApproval','versions'])linked[key]=clone(snapshot[key]);
  report('session-reference-registry-accepts-matching-record',sessionBindingErrors(linked,[snapshot]).length===0);
  const unknown=clone(linked);unknown.sessionSnapshotId=record.sessionSnapshotId;report('session-reference-rejects-unknown-id',sessionBindingErrors(unknown,[snapshot]).includes('unknownSnapshotId'));
  for(const [name,fn,expected] of [
    ['versions',r=>r.versions.feedbackPolicyVersion='synthetic-changed-version','versions'],
    ['approval',r=>r.configurationApproval.taskApproved=true,'configurationApproval'],
    ['mode',r=>r.difficultyMode='unguided','difficultyMode'],
    ['session',r=>r.sessionCode='OTHER-DEMO','sessionCode'],
    ['condition',r=>r.classConditionCode='OTHER','classConditionCode']
  ]){const mutated=clone(linked);fn(mutated);report(`session-reference-rejects-${name}-mismatch`,sessionBindingErrors(mutated,[snapshot]).includes(`snapshotMismatch:${expected}`));}
}

// Read generated artifacts only. The generator is hashed, never imported or executed.
function projectInput(relative, json=true) {
  const file=path.join(project,relative);
  try {
    const source=fs.readFileSync(file,'utf8');
    sources.push({path:file,sha256:hash(file),readOnly:true});
    return json?JSON.parse(source):source;
  } catch(e) {report(`project-file:${relative}`,false,{errors:[e.message]});return null;}
}
function contentSnapshotId(snapshot) {
  const {sessionSnapshotId,...body}=snapshot;
  const digest=crypto.createHash('sha256').update(JSON.stringify(canonical(body)),'utf8').digest('hex');
  return `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
}
const snapshotCombination=s=>JSON.stringify([s?.versions?.taskDefinitionVersion,s?.difficultyMode,s?.usagePhase,s?.sessionConfiguration?.vehicleEntryDirection]);
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const offStepIds=['off:motorOff','off:liftUp','off:exitVehicle'];
const boundedApproval={taskApproved:false,rulesetApproved:true,layoutConfirmed:false,researchUseApproved:false};
const demoPattern='^D-[0-9]{2}$',fixtureId='00000000-0000-4000-8000-000000000004';
const appInput=projectInput('src/data/session/demo-snapshots.json');
const ledgerInput=projectInput('src/data/session/snapshot-ledger.json');
const serverSource=projectInput('server/apps-script/DemoSnapshots.gs',false);
const generatorSource=projectInput('scripts/build-demo-snapshots.mjs',false);
const submissionFixture=projectInput('docs/design/examples/submission.demo-request.json');
const formalSubmissionFixture=mustRead('examples/submission.demo-request.json');
report('project-submission-fixture-exact-equality',Boolean(submissionFixture)&&same(submissionFixture,formalSubmissionFixture));
const appSnapshots=Array.isArray(appInput)?appInput:[], ledgerEntries=Array.isArray(ledgerInput?.entries)?ledgerInput.entries:[];
report('app-snapshot-list-is-array',Array.isArray(appInput));
report('ledger-entries-is-array',Array.isArray(ledgerInput?.entries));
report('ledger-rule-version',ledgerInput?.ruleVersion==='1');
report('generator-rule-version-source',typeof generatorSource==='string'&&/export\s+const\s+SNAPSHOT_RULE_VERSION\s*=\s*['"]1['"]/.test(generatorSource));
let serverRegistry={};
if(serverSource!==null) {
  try {
    // Accept the generated JSON object declaration, not arbitrary Apps Script.
    // Parse data directly: evaluating a JSON object as a JavaScript literal can
    // consume an own "__proto__" key and hide an additional-property violation.
    const declaration=serverSource.replace(/^\s*\/\/[^\n]*(?:\n|$)/gm,'').trim().match(/^var\s+ALLOWED_SNAPSHOTS\s*=\s*(\{[\s\S]*\})\s*;\s*$/);
    if(!declaration)throw new Error('expected only var ALLOWED_SNAPSHOTS = <JSON object>;');
    serverRegistry=JSON.parse(declaration[1]);
    report('server-declaration-only',true,{parsedWith:'JSON.parse; own keys preserved',functionCallsExecuted:false});
  } catch(e) {report('server-declaration-only',false,{errors:[e.message],functionCallsExecuted:false});}
}
const expectedByCombination=new Map();
for(const task of cases)for(const difficultyMode of ['guided','unguided'])for(const usagePhase of ['preview','review','other'])for(const vehicleEntryDirection of [null,'north','south']) {
  const body={schemaVersion:'1.0.0',sessionCode:'DEMO-ONLY',classConditionCode:'DEMO',taskId:task.taskId,runPurpose:'demo',displayMode:'threeD',difficultyMode,usagePhase,configurationApproval:boundedApproval,versions:{taskDefinitionVersion:task.taskDefinitionVersion,rulesetVersion:task.ruleset.rulesetVersion,measurementSetVersion:task.measurement.measurementSetVersion,layoutVersion:'dev-provisional-2026-10-26',judgeEngineVersion:'0.1.0',sessionConfigVersion:'1.2.0-design-2026-10-26',researchProtocolVersion:'unapproved',feedbackPolicyVersion:task.feedbackPolicy.version},sessionConfiguration:{vehicleEntryDirection}};
  const expected={...body,sessionSnapshotId:contentSnapshotId(body)};
  expectedByCombination.set(snapshotCombination(expected),expected);
}
const appIds=appSnapshots.map(s=>s?.sessionSnapshotId), ledgerIds=ledgerEntries.map(e=>e?.snapshot?.sessionSnapshotId),serverIds=Object.keys(serverRegistry);
report('app-snapshot-count-36',appSnapshots.length===36,{actual:appSnapshots.length,expected:36});
report('app-snapshot-unique-ids',new Set(appIds).size===appIds.length);
report('app-snapshot-full-combinations',expectedByCombination.size===36&&same([...new Set(appSnapshots.map(snapshotCombination))].sort(),[...expectedByCombination.keys()].sort()));
for(const [i,s]of appSnapshots.entries()) {
  validate(`app-snapshot-schema:${i+1}`,'session-snapshot',s);
  report(`app-content-derived-id:${i+1}`,Boolean(s)&&s.sessionSnapshotId===contentSnapshotId(s));
  report(`app-current-body:${i+1}`,same(s,expectedByCombination.get(snapshotCombination(s))));
}
report('ledger-unique-ids',new Set(ledgerIds).size===ledgerIds.length);
report('ledger-reserved-fixture-id-excluded',!ledgerIds.includes(fixtureId));
const activeEntries=ledgerEntries.filter(e=>e?.status==='active'),retiredEntries=ledgerEntries.filter(e=>e?.status==='retired');
const byId=list=>Object.fromEntries(list.map(s=>[s?.sessionSnapshotId,s]));
report('ledger-active-equals-app',same(byId(activeEntries.map(e=>e.snapshot)),byId(appSnapshots))&&activeEntries.length===appSnapshots.length);
report('ledger-retired-excluded-from-app',retiredEntries.every(e=>!appIds.includes(e.snapshot?.sessionSnapshotId)));
for(const [i,entry]of ledgerEntries.entries()) {
  const s=entry?.snapshot,id=s?.sessionSnapshotId;
  validate(`ledger-snapshot-schema:${i+1}`,'session-snapshot',s);
  report(`ledger-content-derived-id:${i+1}`,Boolean(s)&&id===contentSnapshotId(s));
  report(`ledger-entry-shape:${i+1}`,Boolean(entry)&&same(Object.keys(entry).sort(),['snapshot','allowedStepIds','status','firstGeneratedOn','retiredOn'].sort()));
  report(`ledger-entry-status:${i+1}`,['active','retired'].includes(entry?.status));
  report(`ledger-entry-dates:${i+1}`,validDate(entry?.firstGeneratedOn)&&(entry?.status==='active'?entry.retiredOn===null:entry?.status==='retired'&&validDate(entry.retiredOn)&&entry.retiredOn>=entry.firstGeneratedOn));
  const scope=entry?.allowedStepIds;
  report(`ledger-recorded-step-scope:${i+1}`,Array.isArray(scope)&&scope.length>0&&scope.every(k=>typeof k==='string'&&k.length>0&&k.length<=64)&&new Set(scope).size===scope.length);
  if(entry?.status==='active') {
    const task=cases.find(t=>t.taskDefinitionVersion===s?.versions?.taskDefinitionVersion);
    const expectedScope=task?[...task.steps.map(st=>st.stepId),...offStepIds]:null;
    report(`ledger-active-step-scope:${i+1}`,Boolean(task)&&task.steps.length===12&&same(scope,expectedScope));
  }
  const serverEntry=serverRegistry[id];
  report(`server-ledger-body:${i+1}`,same(s,serverEntry?.snapshot));
  // Retired entries retain their recorded historical scope; never recompute it from current tasks.
  report(`server-ledger-policy:${i+1}`,Boolean(serverEntry)&&serverEntry.status===entry?.status&&serverEntry.anonymousCodePattern===demoPattern&&same(serverEntry.allowedStepIds,scope));
}
const expectedServerIds=[...ledgerIds,fixtureId];
report('server-registry-complete',same(serverIds.sort(),expectedServerIds.sort()),{actual:serverIds.length,expected:ledgerEntries.length+1});
for(const [id,entry]of Object.entries(serverRegistry)) {
  validate(`server-snapshot-schema:${id}`,'session-snapshot',entry?.snapshot);
  report(`server-key-matches-snapshot-id:${id}`,entry?.snapshot?.sessionSnapshotId===id);
  report(`server-entry-shape:${id}`,Boolean(entry)&&same(Object.keys(entry).sort(),['snapshot','status','anonymousCodePattern','allowedStepIds'].sort()));
}
const fixturePayload=submissionFixture?.payload,fixtureEntry=serverRegistry[fixtureId];
const fixtureContextKeys=['sessionSnapshotId','sessionCode','classConditionCode','taskId','difficultyMode','usagePhase','runPurpose','displayMode','configurationApproval','versions'];
report('server-fixture-id',fixturePayload?.sessionSnapshotId===fixtureId);
const expectedFixture=fixturePayload?{schemaVersion:'1.0.0',...Object.fromEntries(fixtureContextKeys.map(k=>[k,fixturePayload[k]])),sessionConfiguration:{vehicleEntryDirection:null}}:null;
report('server-fixture-body',Boolean(expectedFixture)&&same(fixtureEntry?.snapshot,expectedFixture));
report('server-fixture-policy',fixtureEntry?.status==='active'&&fixtureEntry?.anonymousCodePattern==='^D-00$'&&fixtureEntry?.allowedStepIds===null);
const snapshotSummary={ruleVersion:ledgerInput?.ruleVersion??null,appSnapshots:appSnapshots.length,appUniqueIds:new Set(appIds).size,expectedCombinations:expectedByCombination.size,actualCombinations:new Set(appSnapshots.map(snapshotCombination)).size,ledgerEntries:ledgerEntries.length,activeEntries:activeEntries.length,retiredEntries:retiredEntries.length,serverEntries:serverIds.length,fixtureEntries:fixtureEntry?1:0,generatedCodePattern:demoPattern,fixtureCodePattern:'^D-00$',generatorExecuted:false,serverFunctionsExecuted:false,retiredScopePolicy:'preserve recorded historical scope; server equality required'};

const result={checkedAt:new Date().toISOString(),root,project,applicationExecuted:false,projectModified:false,dependenciesUsed:['node:fs','node:path','node:crypto','node:module',path.join(project,'node_modules/ajv/dist/2020.js'),path.join(project,'node_modules/ajv-formats')],validatorOptions:ajvOptions,checks,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,strictLint:{classification:'additional lint diagnostic; not counted as JSON Schema validity failures',passed:diagnostics.filter(d=>d.passed).length,failed:diagnostics.filter(d=>!d.passed).length,diagnostics},projectComparisons,snapshotSummary,sources};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output,passed:result.passed,failed:result.failed,strictLintPassed:result.strictLint.passed,strictLintFailed:result.strictLint.failed,applicationExecuted:false,projectModified:false}));
for(const c of checks.filter(c=>!c.passed))console.log('FAIL',c.name,JSON.stringify(c.errors||c.differences||{}));
for(const comparison of projectComparisons)console.log(`PROJECT_DIFF_LV${comparison.level}`,JSON.stringify(comparison.differences));
process.exitCode=result.failed?1:0;
