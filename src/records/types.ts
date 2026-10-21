// 저장·전송 상태 — docs/design/contracts/delivery.schema.json 과 대응. 연구 payload와 분리한다.
export type LocalSaveStatus = 'unpersisted' | 'saved' | 'failed'
export type UploadStatus = 'pending' | 'uploading' | 'confirmationPending' | 'acknowledged' | 'rejected' | 'conflict'

export interface DeliveryEnvelope {
  recordId: string
  localSaveStatus: LocalSaveStatus
  uploadStatus: UploadStatus
  uploadedAt: string | null
  receiptId: string | null
  payloadHash: string | null
  uploadAttemptCount: number
  lastErrorCode: string | null
  nextRetryAt: string | null
}
