// 공간 채우기 여러 파일이 함께 쓰는 작은 도구(컴포넌트 아님).

/** 결정적 의사 난수(매번 같은 배치·무늬) */
export function rng(seed: number): () => number {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

/** 광선 검사에서 빠지게 하는 빈 함수: 꾸밈 메시의 raycast로 넣어 시선 판정·누르기에 잡히지 않게 한다 */
export const noRaycast = (): void => {}
