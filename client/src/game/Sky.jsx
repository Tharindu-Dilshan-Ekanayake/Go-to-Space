import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BackSide, ShaderMaterial } from 'three'

import { useQuality } from '../store/quality'
import { skyUniforms } from './skyState'

/** Unit dome, scaled to just inside the camera's far plane for the current preset. */
const SKY_RADIUS = 1

const skyVertexShader = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * Game-day sky, all in one shader: the zenith-to-horizon gradient, a big soft glow round
 * the low sun (and a bright core in its middle), a scatter of thin streaky high clouds lit
 * warm on the sun's side, and - for the night stages - stars. No textures, no geometry
 * beyond the dome, nothing done per frame on the CPU.
 */
const skyFragmentShader = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform float exponent;
  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  uniform float glow;
  uniform float clouds;
  uniform float stars;
  uniform float nebula;
  uniform float cumulus;
  /** 1 = every layer of noise; 0 (LOW) = skip the finest ones. */
  uniform float detail;

  varying vec3 vDirection;

  float skyHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float skyNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), u.x), mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec3 dir = normalize(vDirection);
    float h = dir.y;
    // Below the horizon stays horizon-coloured, matching the fog on distant ground.
    vec3 color = mix(horizonColor, topColor, pow(max(h, 0.0), exponent));

    // The low sun: a wide warm haze, a tighter glow and a bright core.
    float s = max(dot(dir, normalize(sunDirection)), 0.0);
    color += sunColor * glow * (0.35 * pow(s, 6.0) + 0.45 * pow(s, 40.0) + 1.2 * pow(s, 900.0));

    // Thin high clouds: long streaks across the sky, thinning towards the zenith and
    // gone below the horizon, lit warm towards the sun.
    if (clouds > 0.0 && h > 0.0) {
      vec2 p = dir.xz / (h + 0.18);
      float n = skyNoise(p * vec2(0.9, 5.0) + vec2(3.1, 7.7)) * 0.65 + skyNoise(p * vec2(2.3, 11.0)) * 0.35;
      float streak = smoothstep(0.62 - 0.22 * clouds, 0.9, n) * smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.55, 0.95, h));
      vec3 lit = mix(vec3(1.0, 0.96, 0.92), sunColor, 0.35 + 0.65 * pow(s, 3.0));
      color = mix(color, lit, streak * 0.7 * clouds);
    }

    // Fair-weather cumulus: puffy clouds low over the horizon, sunlit white on top and a
    // soft grey in their thick middles, thinning out overhead.
    if (cumulus > 0.0 && h > -0.02) {
      vec2 cp = dir.xz / (h + 0.12) * 0.55;
      float cn = skyNoise(cp + vec2(5.2, 1.3)) * 0.5 + skyNoise(cp * 2.1 + 7.0) * 0.3 + (detail > 0.5 ? skyNoise(cp * 4.3 + 2.0) * 0.2 : 0.1);
      float cband = smoothstep(0.0, 0.06, h) * (1.0 - smoothstep(0.3, 0.55, h));
      float cloud = smoothstep(0.5, 0.66, cn) * cband;
      float dense = smoothstep(0.62, 0.85, cn);
      vec3 sunlit = mix(vec3(1.0), sunColor, 0.2) * (0.92 + 0.12 * pow(s, 2.0));
      vec3 cc = mix(sunlit, vec3(0.76, 0.8, 0.87), dense * 0.6);
      color = mix(color, cc, cloud * cumulus * 0.95);
    }

    // Stars: a fixed scatter. Under an atmosphere they fade out towards the horizon; in
    // space (nebula > 0) they fill the whole sky.
    if (stars > 0.0 && (h > 0.0 || nebula > 0.0)) {
      vec3 cell = floor(dir * 260.0);
      float star = step(0.9965, skyHash(cell.xz + cell.y * 17.0));
      float twinkle = 0.6 + 0.4 * skyHash(cell.zy + 3.0);
      color += vec3(star * stars * twinkle * mix(smoothstep(0.05, 0.4, h), 1.0, nebula));
    }

    // The Milky Way: a soft band of coloured cloud and dense faint stars across the sky.
    if (nebula > 0.0) {
      vec3 axis = normalize(vec3(0.35, 0.55, -0.76));
      float across = dot(dir, axis);
      float band = exp(-pow(across / 0.24, 2.0));
      vec2 q = vec2(atan(dir.z, dir.x) * 2.6, across * 7.0);
      float cloud = skyNoise(q * 2.2) * 0.6 + (detail > 0.5 ? skyNoise(q * 5.7 + 3.0) * 0.4 : 0.2);
      vec3 tint = mix(vec3(0.32, 0.26, 0.72), vec3(0.95, 0.55, 0.78), skyNoise(q * 1.1 + 9.0));
      color += tint * band * cloud * cloud * 0.55 * nebula;
      color += vec3(1.0, 0.95, 0.85) * exp(-pow(across / 0.07, 2.0)) * cloud * 0.12 * nebula;
      vec3 cell2 = floor(dir * 560.0);
      float dust = step(0.982, skyHash(cell2.xz + cell2.y * 31.0));
      color += vec3(dust * band * 0.55 * nebula);
    }

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

/**
 * The sky dome. Follows the camera so the horizon always sits at eye level and the dome
 * can never be walked out of. Its look is skyUniforms (skyState.showSky sets each
 * place's; the flight scene animates it).
 *
 * The material is built here rather than declared in JSX so its `uniforms` is exactly
 * the shared skyUniforms object: declared as a prop, the number uniforms (clouds, stars)
 * ended up as copies the game's writes never reached.
 */
export function Sky() {
  const ref = useRef(null)
  const camera = useThree((s) => s.camera)
  const radius = useQuality((s) => s.settings.viewDistance) * 0.9
  const material = useMemo(
    () => new ShaderMaterial({ side: BackSide, depthWrite: false, uniforms: skyUniforms, vertexShader: skyVertexShader, fragmentShader: skyFragmentShader }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  // LOW skips the sky's finest noise layers: it's drawn over every pixel of the screen.
  const low = useQuality((s) => s.level === 'LOW')
  useEffect(() => {
    skyUniforms.detail.value = low ? 0 : 1
  }, [low])

  useFrame(() => {
    ref.current?.position.copy(camera.position)
  })

  return (
    <mesh ref={ref} renderOrder={-1} frustumCulled={false} scale={radius} material={material}>
      <sphereGeometry args={[SKY_RADIUS, 32, 16]} />
    </mesh>
  )
}

export default Sky
