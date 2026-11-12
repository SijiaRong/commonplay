/*
Copyright (c) 2023, Qualcomm Innovation Center, Inc. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.

SPDX-License-Identifier: BSD-3-Clause
*/

// WebGL 2 port of Qualcomm's SGSR 1 spatial upscaler (RGBA mode).
// Upstream: https://github.com/SnapdragonGameStudios/snapdragon-gsr
// Source: sgsr/v1/include/glsl/sgsr1_shader_mobile.frag
// Source Git blob: 7074999ee7cba4989fb807b805c104620166e991
// Changes: Three.js shader IO, ES 3.00 constructors, explicit gather emulation,
// optional bilinear fallback. Three.js supplies highp default float precision.
// This is spatial reconstruction, with no temporal history or generated frames.
import * as THREE from 'three';

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FRAG = /* glsl */ `
//============================================================================================================
//
//
//                  Copyright (c) 2025, Qualcomm Innovation Center, Inc. All rights reserved.
//                              SPDX-License-Identifier: BSD-3-Clause
//
//============================================================================================================


////////////////////////
// USER CONFIGURATION //
////////////////////////

/*
* Operation modes:
* RGBA -> 1
* RGBY -> 3
* LERP -> 4
*/
#define OperationMode 1

#define EdgeThreshold 8.0/255.0

#define EdgeSharpness 2.0

// #define UseUniformBlock

////////////////////////
////////////////////////
////////////////////////

#if defined(UseUniformBlock)
layout (set=0, binding = 0) uniform UniformBlock
{
	highp vec4 ViewportInfo[1];
};
layout(set = 0, binding = 1) uniform mediump sampler2D ps0;
#else
uniform highp vec4 ViewportInfo[1];
uniform mediump sampler2D ps0;
#endif

varying vec2 vUv;
uniform bool uEnhance;



// WebGL 2 / GLSL ES 3.00 has no textureGather. Reproduce its component-1
// ordering with four clamped texelFetch calls, including the border behavior.
vec4 gatherGreen(sampler2D source, highp vec2 uv, int component) {
  ivec2 hi = textureSize(source, 0) - 1;
  ivec2 p = ivec2(floor(uv * ViewportInfo[0].zw - 0.5));
  return vec4(
    texelFetch(source, clamp(p + ivec2(0, 1), ivec2(0), hi), 0).g,
    texelFetch(source, clamp(p + ivec2(1, 1), ivec2(0), hi), 0).g,
    texelFetch(source, clamp(p + ivec2(1, 0), ivec2(0), hi), 0).g,
    texelFetch(source, clamp(p, ivec2(0), hi), 0).g
  );
}

float fastLanczos2(float x)
{
	float wA = x-4.0;
	float wB = x*wA-wA;
	wA *= wA;
	return wB*wA;
}
vec2 weightY(float dx, float dy,float c, float std)
{
	float x = ((dx*dx)+(dy* dy))* 0.55 + clamp(abs(c)*std, 0.0, 1.0);
	float w = fastLanczos2(x);
	return vec2(w, w * c);
}

void main()
{
  if (!uEnhance) { gl_FragColor = vec4(texture2D(ps0, vUv).rgb, 1.0); return; }
	int mode = OperationMode;
	float edgeThreshold = EdgeThreshold;
	float edgeSharpness = EdgeSharpness;

	vec4 color;
	if(mode == 1)
		color.xyz = textureLod(ps0,vUv,0.0).xyz;
	else
		color.xyzw = textureLod(ps0,vUv,0.0).xyzw;

	highp float xCenter;
	xCenter = abs(vUv.x+-0.5);
	highp float yCenter;
	yCenter = abs(vUv.y+-0.5);

	//todo: config the SR region based on needs
	//if ( mode!=4 && xCenter*xCenter+yCenter*yCenter<=0.4 * 0.4)
	if ( mode!=4)
	{
		highp vec2 imgCoord = ((vUv*ViewportInfo[0].zw)+vec2(-0.5,0.5));
		highp vec2 imgCoordPixel = floor(imgCoord);
		highp vec2 coord = (imgCoordPixel*ViewportInfo[0].xy);
		vec2 pl = (imgCoord+(-imgCoordPixel));
		vec4  left = gatherGreen(ps0,coord, mode);

		float edgeVote = abs(left.z - left.y) + abs(color[mode] - left.y)  + abs(color[mode] - left.z) ;
		if(edgeVote > edgeThreshold)
		{
			coord.x += ViewportInfo[0].x;

			vec4 right = gatherGreen(ps0,coord + vec2(ViewportInfo[0].x, 0.0), mode);
			vec4 upDown;
			upDown.xy = gatherGreen(ps0,coord + vec2(0.0, -ViewportInfo[0].y),mode).wz;
			upDown.zw  = gatherGreen(ps0,coord+ vec2(0.0, ViewportInfo[0].y), mode).yx;

			float mean = (left.y+left.z+right.x+right.w)*0.25;
			left = left - vec4(mean);
			right = right - vec4(mean);
			upDown = upDown - vec4(mean);
			color.w =color[mode] - mean;

			float sum = (((((abs(left.x)+abs(left.y))+abs(left.z))+abs(left.w))+(((abs(right.x)+abs(right.y))+abs(right.z))+abs(right.w)))+(((abs(upDown.x)+abs(upDown.y))+abs(upDown.z))+abs(upDown.w)));
			float std = 2.181818/sum;

			vec2 aWY = weightY(pl.x, pl.y+1.0, upDown.x,std);
			aWY += weightY(pl.x-1.0, pl.y+1.0, upDown.y,std);
			aWY += weightY(pl.x-1.0, pl.y-2.0, upDown.z,std);
			aWY += weightY(pl.x, pl.y-2.0, upDown.w,std);
			aWY += weightY(pl.x+1.0, pl.y-1.0, left.x,std);
			aWY += weightY(pl.x, pl.y-1.0, left.y,std);
			aWY += weightY(pl.x, pl.y, left.z,std);
			aWY += weightY(pl.x+1.0, pl.y, left.w,std);
			aWY += weightY(pl.x-1.0, pl.y-1.0, right.x,std);
			aWY += weightY(pl.x-2.0, pl.y-1.0, right.y,std);
			aWY += weightY(pl.x-2.0, pl.y, right.z,std);
			aWY += weightY(pl.x-1.0, pl.y, right.w,std);

			float finalY = aWY.y/aWY.x;

			float maxY = max(max(left.y,left.z),max(right.x,right.w));
			float minY = min(min(left.y,left.z),min(right.x,right.w));
			finalY = clamp(edgeSharpness*finalY, minY, maxY);

			float deltaY = finalY -color.w;

			//smooth high contrast input
			deltaY = clamp(deltaY, -23.0 / 255.0, 23.0 / 255.0);

			color.x = clamp((color.x+deltaY),0.0,1.0);
			color.y = clamp((color.y+deltaY),0.0,1.0);
			color.z = clamp((color.z+deltaY),0.0,1.0);
		}
	}

	color.w = 1.0;  //assume alpha channel is not used
	gl_FragColor = color;
}`;

export class SpatialUpscaler {
  constructor() {
    this.target = null;
    this.enhanced = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ps0: {value: null},
        ViewportInfo: {value: [new THREE.Vector4()]},
        uEnhance: {value: true}
      },
      vertexShader: VERT, fragmentShader: FRAG,
      depthTest: false, depthWrite: false
    });
  }

  resize(width, height, needed) {
    if (!needed) {
      this.target?.dispose();
      this.target = null;
      return;
    }
    // Grading has already encoded sRGB. Keep those values unchanged in an
    // untagged RGBA8 texture so upscaling cannot apply a second color conversion.
    this.target ??= new THREE.WebGLRenderTarget(width, height, {depthBuffer: false});
    if (this.target.width !== width || this.target.height !== height) this.target.setSize(width, height);
    this.material.uniforms.ViewportInfo.value[0].set(1 / width, 1 / height, width, height);
    this.material.uniforms.ps0.value = this.target.texture;
  }

  render(renderer, quad) {
    this.material.uniforms.uEnhance.value = this.enhanced;
    quad.material = this.material;
    renderer.setRenderTarget(null);
    quad.render(renderer);
  }
}
