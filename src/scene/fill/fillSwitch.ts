// 공간 채우기 켜고 끄기(설계 2026-11-14 §5): 운영 묶음에서는 늘 켜져 있다.
// 개발 서버에서만 주소 인자 ?fill=0 으로 꺼서 촬영 도구로 앞뒤를 견준다. 운영 묶음에는 주소를 읽는 길이 남지 않는다(import.meta.env.DEV가 false로 바뀌어 지워진다).

/** 주소 인자에 fill=0이 있으면 끈다 */
export function fillOffBySearch(search: string): boolean {
  return new URLSearchParams(search).get('fill') === '0'
}

export const FILL_ON: boolean = import.meta.env.DEV ? !(typeof window !== 'undefined' && fillOffBySearch(window.location.search)) : true
