"""Local contract checks only; no application, network, or student data execution."""
import copy,json,sys,hashlib
from pathlib import Path
B=Path(__file__).resolve().parents[1]
workspace=B.parents[2]
sys.path.insert(0,str(workspace/'work/validation-deps'))
from jsonschema import Draft202012Validator,FormatChecker
from referencing import Registry,Resource
NAMES=['task','record','layout','delivery','submission']
def read(p):return json.loads(p.read_text())
VOC=read(B/'contracts/task-vocabulary.v1.1.0.json')
current={n:read(B/'contracts'/f'{n}.schema.json') for n in NAMES}
legacy={n:read(B/'contracts/legacy/1.0.0'/f'{n}.schema.json') for n in NAMES}
resources={s['$id']:Resource.from_contents(s) for s in [*legacy.values(),*current.values()]}
reg=Registry().with_resources(resources.items())
def validator(n,old=False):return Draft202012Validator((legacy if old else current)[n],registry=reg,format_checker=FormatChecker())
checks=[]
def check(name,n,data,want=True,old=False):
 errors=list(validator(n,old).iter_errors(data));good=not errors
 checks.append({'name':name,'passed':good==want,'expected':'accept' if want else 'reject','errors':[e.message[:180] for e in errors[:2]]})
for n,s in resources.items():Draft202012Validator.check_schema(s.contents)
M={'task.unapproved':'task','layout.unapproved':'layout','record.demo-aborted':'record','delivery.pending':'delivery','submission.demo-request':'submission'}
oldex={f:read(B/'examples/legacy/1.0.0'/f'{f}.json') for f in M}
for f,n in M.items():check('legacy_'+f,n,oldex[f],old=True)
r=copy.deepcopy(oldex['record.demo-aborted']);r['schemaVersion']='1.1.0';r['usagePhase']='preview'
check('record_preview_valid','record',r)
x=copy.deepcopy(r);x['usagePhase']='review';check('record_review_valid','record',x)
x=copy.deepcopy(r);del x['usagePhase'];check('record_missing_phase','record',x,False)
x=copy.deepcopy(r);x['usagePhase']='guided';check('record_phase_not_difficulty','record',x,False)
for name,change in [('demo_research_true',{'researchEligible':True}),('unapproved_research_run',{'runPurpose':'research'}),('delivery_mixed_into_payload',{'uploadStatus':'acknowledged'})]:
 x=copy.deepcopy(r);x.update(change);check(name,'record',x,False)
x=copy.deepcopy(r);x['stepEvents'][1]['eventId']=None;check('missing_event_id','record',x,False)
for typ in ['feedbackShown','displayModeChanged']:
 x=copy.deepcopy(r);x['stepEvents'][1]={'eventId':x['stepEvents'][1]['eventId'],'sequence':2,'elapsedMs':0,'type':typ};check('missing_'+typ+'_fields','record',x,False)
x=copy.deepcopy(r);x['stepEvents']=[copy.deepcopy(r['stepEvents'][0]) for _ in range(201)];check('event_limit','record',x,False)
x=copy.deepcopy(r);x['completionStatus']='completed';check('npc_not_passed','record',x,False)
x=copy.deepcopy(oldex['delivery.pending']);x['uploadStatus']='acknowledged';check('ack_requires_receipt_hash_time','delivery',x,False)
request={'protocolVersion':'1','payload':r};check('submission_current_record','submission',request)
check('submission_legacy_record','submission',oldex['submission.demo-request'])
x=copy.deepcopy(request);x['secret']='synthetic';check('client_secret_rejected','submission',x,False)
# Synthetic approved opening fixture: these dimensions are test-only, not school measurements.
l=copy.deepcopy(oldex['layout.unapproved']);l.update(schemaVersion='1.1.0',openings=[],siteMeasurements=[])
check('layout_pending_openings_empty','layout',l)
a=copy.deepcopy(l);a.update(layoutVersion='synthetic-approval-test',layoutConfirmed=True,sourceStatus='teacherApproved')
a['coordinateSystem'].update(originDescription='synthetic test only',axesDescription='x east/y up/z south')
a['room']={'widthMeters':10,'lengthMeters':10,'heightMeters':3};a['boundary']=[{'x':0,'z':0},{'x':10,'z':0},{'x':10,'z':10},{'x':0,'z':10}]
a['equipment'][0]['position']={'x':2,'y':0,'z':2,'rotationYDegrees':0};a['equipment'][0]['size']={'widthMeters':1,'lengthMeters':1,'heightMeters':1};a['equipment'][0]['surveyReference']='synthetic test only'
a['safetyAisles']=[{'aisleId':'test','path':[{'x':0,'z':0},{'x':1,'z':0}],'widthMeters':1,'teacherConfirmed':True}]
a['equipment'][0]['accessPoints']=[{'accessPointId':'synthetic-access','position':{'x':1,'y':0,'z':2,'rotationYDegrees':0}}]
a['openings']=[{'openingId':'west-test','start':{'x':0,'z':2},'end':{'x':0,'z':4},'connectsTo':'synthetic engine zone','surveyReference':'synthetic test only'}]
check('confirmed_opening_without_fake_door','layout',a)
x=copy.deepcopy(a);x['openings']=[];check('confirmed_no_access_rejected','layout',x,False)
x=copy.deepcopy(a);x['openings'][0]['start']['x']=None;check('confirmed_unknown_opening_point','layout',x,False)
x=copy.deepcopy(a);x['room']['heightMeters']=None;check('confirmed_unmeasured_room','layout',x,False)
# New kg and written-value policy; approval data here is wholly synthetic.
t=copy.deepcopy(oldex['task.unapproved']);t['schemaVersion']='1.1.0';t['vocabularyVersion']='1.1.0';t['teacherReviewReference']=None
t['feedbackPolicy']={'version':'test-fixture','status':'proposed','unguidedAnswerFeedback':'afterAllFirstResponses','answerFeedbackKeys':[],'safetyFeedback':'immediate'}
t['measurement'].update(unit='kg',left=240,right=200,axleWeight=600,axlePosition='rear',caseId='synthetic-case',inputsIntegerOnly=True)
t['ruleset'].update(judgmentValueSource='written',approvedOn=None)
check('task_pending_kg','task',t)
x=copy.deepcopy(t);x['measurement']['left']=2.5;check('integer_input_case_rejects_fraction','task',x,False)
x=copy.deepcopy(t);x['measurement']['unit']='kgf-auto';check('unknown_unit','task',x,False)
x=copy.deepcopy(t);x['steps'][0]['completionCondition']='eval(userText)';check('unregistered_condition','task',x,False)
x=copy.deepcopy(t);del x['requiredResponseItems'];check('missing_required_responses','task',x,False)
x=copy.deepcopy(t);x['approvalStatus']='approved';check('pending_rules_cannot_approve','task',x,False)
# Cross-field contracts JSON Schema cannot express by itself.
def semantic_errors(kind,data):
 out=[]
 if kind=='task':
  steps=data['steps'];ids=[v['stepId'] for v in steps];known=set(ids)
  if len(ids)!=len(known):out.append('duplicateStepId')
  graph={v['stepId']:v['prerequisites'] for v in steps}
  for st in steps:
   definition=VOC['completionConditions'].get(st['completionCondition'])
   if definition is None or st['stepId'] not in definition.get('stepIds',[]):out.append('stepCompletionBinding')
   if any(p not in known for p in st['prerequisites']):out.append('unknownPrerequisite')
   if st['onBlockedFeedbackKey'] not in data['feedback']:out.append('unknownFeedback')
  visiting=set();done=set()
  def walk(k):
   if k in visiting:return True
   if k in done or k not in graph:return False
   visiting.add(k)
   if any(walk(n) for n in graph[k]):return True
   visiting.remove(k);done.add(k);return False
  if any(walk(k) for k in graph):out.append('cyclicPrerequisites')
  if any(k not in data['feedback'] for k in data['feedbackPolicy']['answerFeedbackKeys']):out.append('unknownAnswerFeedback')
  response_ids=[i['itemId'] for i in data['requiredResponseItems']]
  if len(response_ids)!=len(set(response_ids)):out.append('duplicateResponseId')
  calculation_items={i for v in VOC['calculationRules'].values() for i in v['appliesToItems']}
  bindings=VOC['taskBindings']['requiredResponseItems']
  for item in data['requiredResponseItems']:
   grade=VOC['gradingRules'].get(item['gradingRuleId'])
   policy=VOC['precisionPolicies'].get(item['precisionPolicyRef'])
   if grade is not None and item['kind'] not in grade['allowedKinds']:out.append('gradingKindMismatch')
   if policy is not None and item['kind'] not in policy['allowedKinds']:out.append('precisionKindMismatch')
   if item['gradingRuleId']=='decimalExact' and item['answerTolerance'] is not None:out.append('exactToleranceNotNull')
   if item['gradingRuleId']=='vehicleVerdictMatch' and any(item[k] is not None for k in ['unit','answerTolerance','precisionPolicyRef']):out.append('judgmentAuxiliaryFields')
   if item['kind']=='calculation' and item['itemId'] not in calculation_items:out.append('unknownCalculationBinding')
   if item['gradingRuleId'] is not None and data['taskId']==VOC['taskBindings']['taskId']:
    binding=bindings.get(item['itemId'])
    if binding is None or any(item[k]!=binding[k] for k in ['gradingRuleId','precisionPolicyRef']):out.append('responseBindingMismatch')
   if item['precisionPolicyRef']=='truncate1' and (data['ruleset']['decisionPrecision']!={'mode':'rounded','digits':1,'rounding':'truncate'} or data['ruleset']['judgmentValueSource']!='written'):out.append('truncatePolicyMismatch')
 if kind=='layout':
  ids=[i['openingId'] for i in data['openings']]
  if len(ids)!=len(set(ids)):out.append('duplicateOpeningId')
  for op in data['openings']:
   if op['start']==op['end'] and all(v is not None for v in op['start'].values()):out.append('zeroLengthOpening')
 return out
def semantic_check(name,kind,data,want=True):
 errs=semantic_errors(kind,data);checks.append({'name':name,'passed':(not errs)==want,'errors':errs})
semantic_check('valid_opening_semantics','layout',a)
x=copy.deepcopy(a);x['openings'][0]['end']=copy.deepcopy(x['openings'][0]['start']);semantic_check('zero_length_opening_rejected','layout',x,False)
x=copy.deepcopy(a);x['openings']*=2;semantic_check('duplicate_opening_id_rejected','layout',x,False)
fixture=read(B/'docs/task.braking-force.case-lv1.json')
semantic_check('task_references_valid','task',fixture)
x=copy.deepcopy(fixture);x['steps'][1]['prerequisites']=['does-not-exist'];semantic_check('unknown_step_ref_rejected','task',x,False)
x=copy.deepcopy(fixture);x['steps'][0]['prerequisites']=[x['steps'][-1]['stepId']];semantic_check('cyclic_steps_rejected','task',x,False)
x=copy.deepcopy(fixture);x['steps'][1]['stepId']=x['steps'][0]['stepId'];semantic_check('duplicate_step_id_rejected','task',x,False)
x=copy.deepcopy(fixture);x['steps'][0]['onBlockedFeedbackKey']='not-defined';semantic_check('missing_feedback_target_rejected','task',x,False)
x=copy.deepcopy(fixture);x['feedbackPolicy']['answerFeedbackKeys']=['not-defined'];semantic_check('missing_answer_feedback_rejected','task',x,False)
x=copy.deepcopy(fixture);x['requiredResponseItems'][-1]['gradingRuleId']='decimalExact';semantic_check('judgment_grading_type_rejected','task',x,False)
x=copy.deepcopy(fixture);x['requiredResponseItems'][0]['gradingRuleId']='runExpression';check('unregistered_grading_rejected','task',x,False)
x=copy.deepcopy(fixture);x['requiredResponseItems'][0]['precisionPolicyRef']='roundWhatever';check('unregistered_precision_rejected','task',x,False)
x=copy.deepcopy(fixture);x['measurement']['left']=-1;check('negative_measurement_rejected','task',x,False)
x=copy.deepcopy(fixture);x['measurement']['axleWeight']=0;check('zero_axle_weight_rejected','task',x,False)
for field in ['dates','decisionPrecision','deviationMaxPercent']:
 x=copy.deepcopy(fixture)
 if field=='dates':x['ruleset'].update(approvedAt=None,approvedOn=None)
 else:x['ruleset'][field]=None
 check('approved_ruleset_requires_'+field,'task',x,False)
x=copy.deepcopy(fixture);x['requiredResponseItems'][0]['gradingRuleId']='vehicleVerdictMatch';semantic_check('measurement_grading_kind_rejected','task',x,False)
x=copy.deepcopy(fixture);x['requiredResponseItems'][3]['precisionPolicyRef']='integer';semantic_check('calculation_precision_kind_rejected','task',x,False)
x=copy.deepcopy(fixture);x['requiredResponseItems'][0]['answerTolerance']=10;semantic_check('exact_grading_no_tolerance','task',x,False)
x=copy.deepcopy(fixture);x['steps'][0]['completionCondition']='vehicleExited';semantic_check('step_completion_binding_rejected','task',x,False)
x=copy.deepcopy(fixture);x['requiredResponseItems'][3]['itemId']='unknownFormula';semantic_check('unknown_calculation_binding_rejected','task',x,False)

x=copy.deepcopy(fixture);x['ruleset'].update(decisionPrecision={'mode':'unrounded','digits':1,'rounding':'truncate'},judgmentValueSource='raw');semantic_check('truncate_policy_requires_written_comparison','task',x,False)
x=copy.deepcopy(fixture);x['requiredResponseItems'][1]['itemId']=x['requiredResponseItems'][0]['itemId'];semantic_check('duplicate_response_ids_rejected','task',x,False)

# Independent exact rational arithmetic; no application judge is implemented here.
from fractions import Fraction
def written(numerator,denominator):return Fraction((Fraction(numerator*100,denominator)*10).__floor__(),10)
for filename,expected in [('task.braking-force.case-lv1.json',(Fraction(66,10),Fraction(733,10),'pass')),('task.braking-force.case-lv2.json',(Fraction(100,10),Fraction(733,10),'fail'))]:
 data=read(B/'docs'/filename);m=data['measurement'];rs=data['ruleset']
 dev=written(abs(m['left']-m['right']),m['axleWeight']);total=written(m['left']+m['right'],m['axleWeight'])
 got=(dev,total,'pass' if dev<=rs['deviationMaxPercent'] and total>=rs['sumMinRearPercent'] else 'fail')
 checks.append({'name':'independent_case_arithmetic_'+filename,'passed':got==expected})
checks.append({'name':'boundary_comparison_uses_written_not_raw','passed':written(49,608)==8 and Fraction(4900,608)>8})
checks.append({'name':'inclusive_sum_boundary','passed':written(120,600)==20 and written(119,600)<20})

# All examples must load against their explicit current version; archived examples above remain untouched.
for f,n in M.items():check('current_example_'+f,n,read(B/'examples'/f'{f}.json'))
for filename in ['task.braking-force.case-lv1.json','task.braking-force.case-lv2.json']:
 check(filename,'task',read(B/'docs'/filename))
for filename in ['layout.partial-survey.v1.1.json']:
 p=B/'examples'/filename
 if p.exists():check(filename,'layout',read(p))
# Precision must still reject incomplete rounded policies.
p=current['task']['properties']['ruleset']['properties']['decisionPrecision']['anyOf'][0]
checks.append({'name':'rounded_policy_requires_digits_and_method','passed':not Draft202012Validator(p).is_valid({'mode':'rounded','digits':None,'rounding':None})})
result={'checkedAt':'2026-10-21','checks':checks,'passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks),'applicationExecuted':False}
report=B/'validation/results.json';report.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='checks'},ensure_ascii=False))
for c in checks:
 if not c['passed']:print('FAIL',c['name'],c.get('errors',[]))
sys.exit(1 if result['failed'] else 0)
