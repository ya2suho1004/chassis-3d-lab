// 연구용 묶음을 ZIP 하나로 내려받고, 화면에 보여 줄 건수 문장을 돌려준다(B1)
import { buildResearchBundle, type BundleInput } from '../records/researchBundle'
import { zipStore } from '../records/zip'

export async function downloadResearchBundle(source: BundleInput['source'], scope: string, rows: BundleInput['rows']): Promise<string> {
  const now = new Date()
  const b = await buildResearchBundle({ source, scope, generatedAtIso: now.toISOString(), rows })
  const dateKst = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
  const url = URL.createObjectURL(new Blob([zipStore(b.files, now) as BlobPart], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `research-bundle-${source === 'server' ? scope : 'device'}-${dateKst}.zip`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  const { usable, problem, answerRows, eventRows } = b.counts
  return `기록 ${usable}건 · 항목 ${answerRows}행 · 사건 ${eventRows}행으로 묶었습니다.${problem ? ` 문제가 있는 ${problem}줄은 표에서 분리했습니다. problems.csv를 확인하세요.` : ''}`
}
