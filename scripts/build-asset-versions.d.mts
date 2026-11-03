/** public/assets/{models,hdri} 파일별 내용 해시 앞 10자('models/k3.glb' → 'ab12…') */
export function computeAssetVersions(): Record<string, string>
