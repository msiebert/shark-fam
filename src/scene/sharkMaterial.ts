import * as THREE from "three";

/**
 * Swimming is done in the vertex shader, so a shark costs nothing on the CPU per frame and the GLBs need no skeleton.
 * The model is one unit long with its nose at +x and sideways along z. A wave travels from nose to tail and grows toward
 * the tail: `amp` is the sideways swing at the tail, as a fraction of body length.
 */
export interface SwimUniforms {
  uAmp: { value: number };
  uPhase: { value: number };
}

export const makeSwimUniforms = (amp: number): SwimUniforms => ({ uAmp: { value: amp }, uPhase: { value: 0 } });

const HEAD = /* glsl */ `
uniform float uAmp;
uniform float uPhase;
float swimEnv(float u) { return uAmp * (0.015 + 0.985 * pow(u, 2.4)); }
float swimOffset(float u) { return swimEnv(u) * sin(5.34 * u - uPhase); }
float swimSlope(float u) {
  float de = uAmp * 0.985 * 2.4 * pow(u, 1.4);
  return -(de * sin(5.34 * u - uPhase) + swimEnv(u) * 5.34 * cos(5.34 * u - uPhase));
}
`;

export function addSwim(material: THREE.Material, uniforms: SwimUniforms): void {
  material.customProgramCacheKey = () => "swim-v1";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAmp = uniforms.uAmp;
    shader.uniforms.uPhase = uniforms.uPhase;
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", HEAD + "\nvoid main() {")
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
         { float su = clamp(0.5 - position.x, 0.0, 1.3);
           objectNormal.x -= swimSlope(su) * objectNormal.z;
           objectNormal = normalize(objectNormal); }`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         transformed.z += swimOffset(clamp(0.5 - position.x, 0.0, 1.3));`,
      );
  };
}
