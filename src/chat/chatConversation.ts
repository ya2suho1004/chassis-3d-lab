// AI 교관 대화 저장소(E4) — 화면(게임·기본)을 바꿔 패널이 새로 만들어져도 같은 수행의 대화가 이어지게, 대화 상태를 패널 밖에 둔다.
// 메모리에만 있다(새로고침하면 처음부터). 서버 chat_logs와 기기 사본에 남기는 칸은 전과 같다.
// turnIndex: 이 대화에서 보낸 차례(실패한 질문도 번호를 쓴다, 새로고침하면 0부터). 수행 전체의 정확한 순번으로 읽지 말고 순서는 created_at으로 본다.
import { askChat, chatErrorMessage, CHAT_HISTORY_TURNS, keepQuestionAfter, serverLogNote, type ChatAsk, type ChatMode, type ChatResult, type ChatTurn } from './chatClient'
import { saveChatTurn, type StoredChatTurn } from './chatStore'

export interface ChatLine { q: string; a: string | null; error: string | null; masked: string[]; note?: string | null }
export interface ChatConversationState { lines: ChatLine[]; draft: string; busy: boolean; remaining: number | null }
export interface SendContext { endpoint: string | null; sessionCode: string; anonymousStudentCode: string; recordId: string | null; stepId: string | null; taskId: string | null; difficultyMode: ChatMode }

export interface ChatConversation {
  getState(): ChatConversationState
  subscribe(listener: () => void): () => void
  setDraft(text: string): void
  send(ctx: SendContext): Promise<void>
}

export function createChatConversation(deps: { ask?: (endpoint: string, a: ChatAsk) => Promise<ChatResult>; save?: (t: StoredChatTurn) => Promise<boolean> } = {}): ChatConversation {
  const ask = deps.ask ?? ((endpoint, a) => askChat(endpoint, a))
  const save = deps.save ?? saveChatTurn
  let state: ChatConversationState = { lines: [], draft: '', busy: false, remaining: null }
  let nextTurn = 0
  const listeners = new Set<() => void>()
  const update = (patch: Partial<ChatConversationState>) => {
    state = { ...state, ...patch }
    for (const l of listeners) l()
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setDraft: (draft) => update({ draft }),
    async send(ctx) {
      const question = state.draft.trim()
      if (!ctx.endpoint || !question || state.busy) return
      const history: ChatTurn[] = state.lines.filter((l) => l.a !== null).slice(-CHAT_HISTORY_TURNS).map((l) => ({ q: l.q, a: l.a! }))
      const turnIndex = nextTurn++
      const idx = state.lines.length
      update({ busy: true, draft: '', lines: [...state.lines, { q: question, a: null, error: null, masked: [] }] })
      const { endpoint, sessionCode, anonymousStudentCode, recordId, stepId, taskId, difficultyMode } = ctx
      const res = await ask(endpoint, { sessionCode, anonymousStudentCode, recordId, stepId, taskId, difficultyMode, question, history, turnIndex } as ChatAsk)
      const setLine = (patch: Partial<ChatLine>) => state.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l))
      if (res.ok) {
        update({ remaining: res.remaining, lines: setLine({ a: res.answer, masked: res.masked, note: serverLogNote(res) }) })
      } else {
        // 인터넷이 끊겨 실패했으면 쓴 질문을 되살려 '보내기'만 다시 누르게 한다(그 사이 새로 쓴 글이 있으면 그대로)
        update({
          remaining: res.remaining !== undefined ? res.remaining : state.remaining,
          lines: setLine({ error: chatErrorMessage(res.code) }),
          draft: keepQuestionAfter(res) && !state.draft ? question : state.draft,
        })
      }
      void save({
        id: `${Date.now()}-${turnIndex}`, createdAt: new Date().toISOString(), sessionCode, anonymousStudentCode, recordId, stepId, difficultyMode, turnIndex,
        question, answer: res.ok ? res.answer : null, serverLogged: res.ok ? res.logged : false, chatId: res.ok ? res.chatId : null, errorCode: res.ok ? null : res.code,
      })
      update({ busy: false })
    },
  }
}
