// 구운 바닥 그림자(설계 2026-11-11 §4.4): 주된 빛 그림자와 닿는 그늘을 한 번만 계산해 바닥 위 판 한 장에 깐다.
// 매 화면 비용은 섞어 그리는 판 한 장뿐이다(예전 닿는 그늘 판과 같음). 품질 낮음은 둘 다, 품질 높음은 닿는 그늘만 굽는다(sun = 0).
// 차례: ① 그림자를 드리우는 물체의 깊이를 빛 쪽에서(주된 빛) ② 바닥 아래에서 위로(닿는 그늘) ③ 바닥의 점마다 가려진 정도 계산 ④ 흐림 ⑤ 합치기
import { useFrame, useThree } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BAKE, LOOK, PALETTE, fitShadowFrustum, keyDirection, type Bounds } from './lookConfig'

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`
/** three.js 그림자와 같은 방식으로 색에 싸서 적은 깊이를 푼다(packing.glsl.js의 UnpackFactors4) */
const DEPTH = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec4 uRect;
const vec4 UNPACK = vec4( 255.0 / 256.0, 255.0 / 65536.0, 255.0 / 16777216.0, 1.0 / 16777216.0 );
float depthAt( sampler2D t, vec2 uv ) { return dot( texture2D( t, uv ), UNPACK ); }
vec3 floorPoint() { return vec3( uRect.x + vUv.x * uRect.z, 0.0, uRect.y + ( 1.0 - vUv.y ) * uRect.w ); }`
/** 주된 빛 그림자: 가리는 물체를 찾고(SEARCH_TAPS점), 물체가 멀수록 넓게 풀어(FILTER_TAPS점) 가려진 비율을 적는다. 점 수는 값 표(BAKE)에서 받는다 */
const SUN = `#define SEARCH_TAPS ${BAKE.searchTaps}\n#define FILTER_TAPS ${BAKE.filterTaps}\n` + DEPTH + /* glsl */`
uniform sampler2D tDepth; uniform mat4 uLightVP; uniform float uRange; uniform vec2 uSpan; uniform float uTan; uniform float uMinPen; uniform float uMaxPen; uniform float uBias;
float ign( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }
vec2 vogel( float i, float n, float phi ) { float r = sqrt( ( i + 0.5 ) / n ); float a = i * 2.39996323 + phi; return r * vec2( cos( a ), sin( a ) ); }
void main() {
  vec4 lp = uLightVP * vec4( floorPoint(), 1.0 );
  vec3 c = lp.xyz / lp.w * 0.5 + 0.5;
  float phi = ign( gl_FragCoord.xy ) * 6.2831853;
  vec2 searchUV = uMaxPen / uSpan;
  float sum = 0.0; float cnt = 0.0;
  for ( int i = 0; i < SEARCH_TAPS; i ++ ) {
    float dz = depthAt( tDepth, c.xy + vogel( float( i ), float( SEARCH_TAPS ), phi ) * searchUV );
    if ( dz < c.z - uBias ) { sum += dz; cnt += 1.0; }
  }
  if ( cnt < 0.5 ) { gl_FragColor = vec4( 0.0 ); return; }
  float pen = clamp( ( c.z - sum / cnt ) * uRange * uTan, uMinPen, uMaxPen );
  vec2 penUV = pen / uSpan;
  float sh = 0.0;
  for ( int i = 0; i < FILTER_TAPS; i ++ ) sh += step( depthAt( tDepth, c.xy + vogel( float( i ), float( FILTER_TAPS ), phi + 1.7 ) * penUV ), c.z - uBias );
  gl_FragColor = vec4( sh / float( FILTER_TAPS ) );
}`
/** 닿는 그늘: 바닥 바로 위에 물체가 있을수록(낮을수록) 짙게 */
const CONTACT = DEPTH + /* glsl */`
uniform sampler2D tDepth; uniform mat4 uUpVP; uniform float uNear; uniform float uRange; uniform float uBelow; uniform float uFar;
void main() {
  vec4 cp = uUpVP * vec4( floorPoint(), 1.0 );
  float d = depthAt( tDepth, cp.xy / cp.w * 0.5 + 0.5 );
  float h = uNear + d * uRange - uBelow;
  gl_FragColor = vec4( d >= 0.999 ? 0.0 : pow( clamp( 1.0 - h / uFar, 0.0, 1.0 ), 1.5 ) );
}`
const BLUR = /* glsl */`
precision highp float; uniform sampler2D tMap; uniform vec2 uStep; varying vec2 vUv;
void main() {
  float a = texture2D( tMap, vUv ).r * 0.1633;
  a += ( texture2D( tMap, vUv + uStep ).r + texture2D( tMap, vUv - uStep ).r ) * 0.1531;
  a += ( texture2D( tMap, vUv + uStep * 2.0 ).r + texture2D( tMap, vUv - uStep * 2.0 ).r ) * 0.12245;
  a += ( texture2D( tMap, vUv + uStep * 3.0 ).r + texture2D( tMap, vUv - uStep * 3.0 ).r ) * 0.0918;
  a += ( texture2D( tMap, vUv + uStep * 4.0 ).r + texture2D( tMap, vUv - uStep * 4.0 ).r ) * 0.051;
  gl_FragColor = vec4( a );
}`
const COMBINE = /* glsl */`
precision highp float; uniform sampler2D tSun; uniform sampler2D tContact; uniform float uSun; uniform float uContact; varying vec2 vUv;
void main() {
  float s = uSun > 0.0 ? texture2D( tSun, vUv ).r * uSun : 0.0;
  float k = texture2D( tContact, vUv ).r * uContact;
  gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 - ( 1.0 - s ) * ( 1.0 - k ) );
}`

function target(size: number, depth: boolean, filter: THREE.MagnificationTextureFilter) {
  return new THREE.WebGLRenderTarget(size, size, { depthBuffer: depth, minFilter: filter, magFilter: filter, generateMipmaps: false })
}

export function FloorShadowBake({ bounds, sun, contact, stateKey }: { bounds: Bounds; sun: number; contact: number; stateKey: string }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const { active } = useProgress()
  // 굽는 때: 모델을 다 불러온 뒤(불러오는 동안은 굽지 않는다), 그리고 상태(리프트·시험 차량·품질)가 바뀌고 조금 뒤
  const [loads, setLoads] = useState(0)
  useEffect(() => { if (!active) setLoads((n) => n + 1) }, [active])
  const placed = `${loads}|${stateKey}|`
  const want = `${placed}${sun}|${contact}`
  const [key, setKey] = useState('')
  useEffect(() => {
    if (active || loads === 0) return
    // 물체가 움직이는 변화(리프트·차량)는 움직임이 끝나도록 길게 기다리고, 처음과 품질만 바뀐 때(그림자 세기만 다름)는 바로 굽는다 — 품질을 바꾼 뒤 그림자가 겹치거나 비는 시간을 줄인다
    const t = setTimeout(() => setKey(want), key === '' || key.startsWith(placed) ? BAKE.firstDelayMs : BAKE.rebakeDelayMs)
    return () => clearTimeout(t)
  }, [want, active]) // eslint-disable-line react-hooks/exhaustive-deps
  const pending = useRef(false)
  useEffect(() => { if (key) pending.current = true }, [key])
  // 그래픽 장치 연결이 끊겼다 돌아오면 구워 둔 그림이 비어 있다. 다시 굽는다
  useEffect(() => {
    const el = gl.domElement, again = () => { pending.current = true }
    el.addEventListener('webglcontextrestored', again)
    return () => el.removeEventListener('webglcontextrestored', again)
  }, [gl])
  const [failed, setFailed] = useState(false)

  const out = useMemo(() => target(BAKE.size, false, THREE.LinearFilter), [])
  const quad = useMemo(() => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); mesh.frustumCulled = false
    const s = new THREE.Scene(); s.add(mesh)
    const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false })
    return {
      mesh, scene: s, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
      depthMat: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }),
      sun: pass(SUN, { uRect: { value: new THREE.Vector4() }, tDepth: { value: null }, uLightVP: { value: new THREE.Matrix4() }, uRange: { value: 1 }, uSpan: { value: new THREE.Vector2(1, 1) }, uTan: { value: 0.08 }, uMinPen: { value: BAKE.minPenumbra }, uMaxPen: { value: BAKE.maxPenumbra }, uBias: { value: 0.0005 } }),
      contact: pass(CONTACT, { uRect: { value: new THREE.Vector4() }, tDepth: { value: null }, uUpVP: { value: new THREE.Matrix4() }, uNear: { value: 0.01 }, uRange: { value: 1 }, uBelow: { value: 0.05 }, uFar: { value: BAKE.contactFar } }),
      blur: pass(BLUR, { tMap: { value: null }, uStep: { value: new THREE.Vector2() } }),
      combine: pass(COMBINE, { tSun: { value: null }, tContact: { value: null }, uSun: { value: 0 }, uContact: { value: 0 } }),
    }
  }, [])
  useEffect(() => () => { out.dispose(); quad.depthMat.dispose(); quad.sun.dispose(); quad.contact.dispose(); quad.blur.dispose(); quad.combine.dispose(); quad.mesh.geometry.dispose() }, [out, quad])

  useFrame(() => {
    if (!pending.current) return
    pending.current = false
    const t0 = performance.now()
    // 한 번 쓰고 버리는 그림들(굽기가 드물어 메모리를 쥐고 있지 않는다)
    const sunDepth = sun > 0 ? target(BAKE.depthSize, true, THREE.NearestFilter) : null
    const upDepth = target(BAKE.size, true, THREE.NearestFilter)
    const a = target(BAKE.size, false, THREE.LinearFilter), b = target(BAKE.size, false, THREE.LinearFilter)
    const ca = target(BAKE.contactSize, false, THREE.LinearFilter), cb = target(BAKE.contactSize, false, THREE.LinearFilter)
    const prev = { rt: gl.getRenderTarget(), over: scene.overrideMaterial, bg: scene.background, auto: gl.shadowMap.autoUpdate, color: gl.getClearColor(new THREE.Color()), alpha: gl.getClearAlpha() }
    const hidden: THREE.Object3D[] = []
    // 셰이더가 만들어지지 않아도 three.js는 예외를 던지지 않고 알리기만 한다. 굽는 동안에는 그 알림을 받아 두었다가 실패로 처리한다
    let broken = false
    const prevShaderError = gl.debug.onShaderError
    gl.debug.onShaderError = (glc, program) => { broken = true; console.error('[look] 바닥 그림자 굽기 셰이더를 만들지 못했습니다', glc.getProgramInfoLog(program)) }
    const draw = (mat: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget) => { quad.mesh.material = mat; gl.setRenderTarget(to); gl.clear(); gl.render(quad.scene, quad.cam) }
    const blur = (from: THREE.WebGLRenderTarget, tmp: THREE.WebGLRenderTarget, stepU: number, stepV: number) => {
      quad.blur.uniforms.tMap!.value = from.texture; quad.blur.uniforms.uStep!.value.set(stepU, 0); draw(quad.blur, tmp)
      quad.blur.uniforms.tMap!.value = tmp.texture; quad.blur.uniforms.uStep!.value.set(0, stepV); draw(quad.blur, from)
    }
    try {
      // 그림자를 드리우지 않는 메시(바닥·벽·표시)는 잠깐 숨긴다. 사람은 다른 레이어라 아래 카메라에 보이지 않는다
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.castShadow && m.visible) { m.visible = false; hidden.push(m) } })
      scene.overrideMaterial = quad.depthMat; scene.background = null; gl.shadowMap.autoUpdate = false
      gl.setClearColor(0xffffff, 1)
      const rect = new THREE.Vector4(bounds.xMin, bounds.zMin, bounds.xMax - bounds.xMin, bounds.zMax - bounds.zMin)
      const cx = (bounds.xMin + bounds.xMax) / 2, cz = (bounds.zMin + bounds.zMax) / 2

      // ① 주된 빛 쪽에서 본 깊이
      const cam = new THREE.OrthographicCamera()
      if (sunDepth) {
        const f = fitShadowFrustum(bounds, BAKE.casterHeight, keyDirection())
        cam.position.set(...f.position); cam.up.set(0, 1, 0); cam.lookAt(...f.target)
        cam.left = f.left; cam.right = f.right; cam.bottom = f.bottom; cam.top = f.top; cam.near = f.near; cam.far = f.far
        cam.updateProjectionMatrix(); cam.updateMatrixWorld(true)
        gl.setRenderTarget(sunDepth); gl.clear(); gl.render(scene, cam)
      }
      // ② 바닥 아래에서 위로 본 깊이
      const up = new THREE.OrthographicCamera(-(bounds.xMax - bounds.xMin) / 2, (bounds.xMax - bounds.xMin) / 2, (bounds.zMax - bounds.zMin) / 2, -(bounds.zMax - bounds.zMin) / 2, 0.01, 0.05 + BAKE.contactFar)
      up.position.set(cx, -0.05, cz); up.up.set(0, 0, 1); up.lookAt(cx, 1, cz); up.updateMatrixWorld(true)
      gl.setRenderTarget(upDepth); gl.clear(); gl.render(scene, up)

      scene.overrideMaterial = prev.over; scene.background = prev.bg
      for (const o of hidden) o.visible = true
      hidden.length = 0
      gl.setClearColor(0x000000, 0)

      // ③ 바닥의 점마다 계산 → ④ 흐림
      if (sunDepth) {
        const u = quad.sun.uniforms
        u.uRect!.value.copy(rect); u.tDepth!.value = sunDepth.texture
        u.uLightVP!.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
        u.uRange!.value = cam.far - cam.near; u.uSpan!.value.set(cam.right - cam.left, cam.top - cam.bottom)
        u.uTan!.value = Math.tan((LOOK.shadowSoftDeg * Math.PI) / 180); u.uBias!.value = 0.03 / (cam.far - cam.near)
        draw(quad.sun, a)
        blur(a, b, 1 / BAKE.size, 1 / BAKE.size)
      }
      const c = quad.contact.uniforms
      c.uRect!.value.copy(rect); c.tDepth!.value = upDepth.texture
      c.uUpVP!.value.multiplyMatrices(up.projectionMatrix, up.matrixWorldInverse)
      c.uNear!.value = up.near; c.uRange!.value = up.far - up.near
      draw(quad.contact, ca)
      blur(ca, cb, 2 / 256, 2 / 256)
      blur(ca, cb, 0.8 / 256, 0.8 / 256)
      // ⑤ 합쳐서 한 장으로
      const m = quad.combine.uniforms
      m.tSun!.value = a.texture; m.tContact!.value = ca.texture; m.uSun!.value = sunDepth ? sun : 0; m.uContact!.value = contact
      draw(quad.combine, out)
      if (broken || gl.getContext().isContextLost()) throw new Error('셰이더를 만들지 못했거나 그래픽 장치 연결이 끊겼습니다')
      if (failed) setFailed(false)
      if (import.meta.env.DEV) {
        // 개발 서버 전용: 화면 촬영 도구가 굽기가 됐는지 확인한다
        const px = new Uint8Array(BAKE.size * BAKE.size * 4)
        gl.readRenderTargetPixels(out, 0, 0, BAKE.size, BAKE.size, px)
        let sum = 0, max = 0
        for (let i = 3; i < px.length; i += 4) { sum += px[i]!; if (px[i]! > max) max = px[i]! }
        const w = window as unknown as { __lookdev?: { bakes: Array<{ key: string; mean: number; max: number; ms: number }> } }
        ;(w.__lookdev ??= { bakes: [] }).bakes.push({ key, mean: +(sum / (BAKE.size * BAKE.size) / 255).toFixed(4), max: +(max / 255).toFixed(3), ms: Math.round(performance.now() - t0) })
      }
    } catch (e) {
      console.warn('[look] 바닥 그림자 굽기에 실패해 그림자 판을 숨깁니다', e)
      setFailed(true)
    } finally {
      for (const o of hidden) o.visible = true
      scene.overrideMaterial = prev.over; scene.background = prev.bg; gl.shadowMap.autoUpdate = prev.auto
      gl.setClearColor(prev.color, prev.alpha); gl.setRenderTarget(prev.rt)
      gl.debug.onShaderError = prevShaderError
      sunDepth?.dispose(); upDepth.dispose(); a.dispose(); b.dispose(); ca.dispose(); cb.dispose()
    }
  })

  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: out.texture, color: PALETTE.shadow, transparent: true, depthWrite: false }), [out])
  useEffect(() => () => mat.dispose(), [mat])
  if (failed || key === '') return null
  return (
    <mesh rotation-x={-Math.PI / 2} position={[(bounds.xMin + bounds.xMax) / 2, 0.006, (bounds.zMin + bounds.zMax) / 2]} material={mat} renderOrder={1}>
      <planeGeometry args={[bounds.xMax - bounds.xMin, bounds.zMax - bounds.zMin]} />
    </mesh>
  )
}
