// 과제 데이터 형식 — docs/design/contracts/task.schema.json (1.2.0) 과 대응
// 주의: 과제 전체 approvalStatus는 '동작 매핑 미완료'로 pending일 수 있다. 교사 확인값은 ruleset.approvalStatus=approved로 보존된다(docs/design/docs/13).
import type { AxlePosition, DecisionPrecision } from './judge'

export type ActionType = 'confirm' | 'inspect' | 'operate' | 'read' | 'submit'
export type ResponseKind = 'measurement' | 'calculation' | 'judgment'

export interface TaskStep {
  stepId: string
  instruction: string
  equipmentId: string | null
  prerequisites: string[]
  requiredSafetyConditions: string[]
  actionType: ActionType
  completionCondition: string
  onBlockedFeedbackKey: string
  source: { document: string; printedPage: string | null; pdfPage: number | null; confirmation: 'pending' | 'approved' }
}

export interface RequiredResponseItem {
  itemId: string
  kind: ResponseKind
  unit: string | null
  gradingRuleId: string | null
  answerTolerance: number | null
  precisionPolicyRef: string | null
}

export interface FeedbackText {
  what: string
  why: string
  how: string
}

export interface ApprovedTask {
  schemaVersion: string
  taskId: string
  taskDefinitionVersion: string
  title: string
  approvalStatus: 'pending' | 'approved'
  measurement: {
    measurementSetVersion: string
    sourceType: 'teacherApprovedCase' | 'demoSynthetic'
    unit: string | null
    caseId: string | null
    left: number | null
    right: number | null
    axleWeight: number | null
    axlePosition: AxlePosition | null
    /** 판독 입력 정책(계산 답변에는 적용하지 않음) */
    inputsIntegerOnly?: boolean
  }
  ruleset: {
    rulesetVersion: string
    approvalStatus: 'pending' | 'approved'
    deviationMaxPercent: number | null
    sumMinFrontPercent: number | null
    sumMinRearPercent: number | null
    decisionPrecision: DecisionPrecision | null
    sourceDocument: string | null
    sourcePage: string | null
    approvedAt: string | null
    /** 교사 확인 날짜(시각 없음). approvedAt과 구별 */
    approvedOn?: string | null
    /** 판정 비교값 출처: written=기재값(절사값), raw=원값 */
    judgmentValueSource?: 'written' | 'raw'
  }
  requiredResponseItems: RequiredResponseItem[]
  steps: TaskStep[]
  feedback: Record<string, FeedbackText>
  vocabularyVersion?: string
  teacherReviewReference?: string
  /** 무안내 모드 정답 피드백 노출 정책(제안 상태일 수 있음) */
  feedbackPolicy?: {
    version: string
    status: 'proposed' | 'approved'
    unguidedAnswerFeedback: 'afterAllFirstResponses'
    answerFeedbackKeys: string[]
    safetyFeedback: 'immediate'
  }
}
