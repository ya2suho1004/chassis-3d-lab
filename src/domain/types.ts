// 승인 과제 데이터 형식 (docs/design/contracts/task.schema.v1.1.0-proposal.json 과 대응)
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
  }
  requiredResponseItems: RequiredResponseItem[]
  steps: TaskStep[]
  feedback: Record<string, FeedbackText>
}
