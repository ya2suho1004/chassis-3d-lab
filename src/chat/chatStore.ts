// 대화 사본을 이 기기에 남긴다(설계 07 §4-2). 수행 기록 저장소(chassis-3d-lab DB)와 섞지 않으려고 별도 IndexedDB를 쓴다.
// 저장 실패는 대화를 막지 않는다(사본일 뿐, 정본은 서버 chat_logs).
export interface StoredChatTurn {
  id: string; createdAt: string; sessionCode: string; anonymousStudentCode: string; recordId: string | null; stepId: string | null
  difficultyMode: string; turnIndex: number; question: string; answer: string | null; serverLogged: boolean; chatId: string | null; errorCode: string | null
}
export const CHAT_DB_NAME = 'chassis-3d-lab-chat'
const STORE = 'turns'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(CHAT_DB_NAME, 1)
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }) }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export async function saveChatTurn(t: StoredChatTurn): Promise<boolean> {
  try {
    const db = await open()
    await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(t); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
    db.close()
    return true
  } catch { return false }
}

export async function listChatTurns(): Promise<StoredChatTurn[]> {
  const db = await open()
  const all = await new Promise<StoredChatTurn[]>((resolve, reject) => { const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll(); r.onsuccess = () => resolve(r.result as StoredChatTurn[]); r.onerror = () => reject(r.error) })
  db.close()
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
