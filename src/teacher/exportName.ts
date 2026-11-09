// 교사 화면 내려받기 파일 이름(C2). 건수를 이름에 넣어 파일만 봐도 몇 건을 받았는지 알게 한다.
export const kstDate = (now: Date): string => new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)

export const exportFileName = (kind: string, sessionCode: string, count: number, now: Date): string =>
  `${kind}-${sessionCode}-${kstDate(now)}-${count}건.csv`
