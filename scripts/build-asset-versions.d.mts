/** public/assets 아래 폴더마다 파일별 내용 해시 앞 10자('models/k3.glb' → 'ab12…'). root: 훑을 폴더(기본 public/assets/ — 끝에 /가 붙은 URL) */
export function computeAssetVersions(root?: URL): Record<string, string>
