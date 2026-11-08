// A polished sphere, with refracted scene history and suspended layers sampled along
// its refracted chord. The sphere entry/exit and screen lookup follow Lost Marbles.
import * as T from 'three';

function tile(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  draw(canvas.getContext('2d'));
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  return texture;
}

export function makePeachAcrylic() {
  let state = 72318;
  const random = () => (state = (Math.imul(state,1664525)+1013904223)>>>0) / 4294967296;
  const polish = tile(ctx => {
    ctx.fillStyle = '#a6a6a6'; ctx.fillRect(0,0,256,256);
    for(let i=0;i<3200;i++){
      ctx.fillStyle = random()<.5?'#888':'#bbb';
      ctx.fillRect(random()*256,random()*256,1+random()*3,1);
    }
  });
  const flow = tile(ctx => {
    const data = ctx.createImageData(256,256);
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      const u=x*Math.PI/128,v=y*Math.PI/128;
      const band=.5+.5*Math.sin(v*2+.72*Math.sin(u)+.22*Math.sin(2*u+v));
      const i=4*(256*y+x);
      data.data[i]=data.data[i+1]=data.data[i+2]=Math.round(255*Math.pow(band,6));
      data.data[i+3]=255;
    }
    ctx.putImageData(data,0,0);
  });
  const bubbles = tile(ctx => {
    ctx.fillStyle='#000';ctx.fillRect(0,0,256,256);
    for(let i=0;i<52;i++){
      const x=random()*256,y=random()*256,r=1+3*random();
      for(const dx of [-256,0,256])for(const dy of [-256,0,256]){
        ctx.beginPath();ctx.arc(x+dx,y+dy,r,0,Math.PI*2);ctx.strokeStyle='#999';ctx.lineWidth=.8;ctx.stroke();
        ctx.beginPath();ctx.arc(x+dx,y+dy,r,3.5,4.8);ctx.strokeStyle='#fff';ctx.stroke();
      }
    }
  });
  const mat=new T.MeshPhysicalMaterial({
    name:'蜜桃气泡亚克力',color:0x000000,roughness:.095,roughnessMap:polish,
    ior:1.49,clearcoat:1,clearcoatRoughness:.055,envMapIntensity:1.1
  });
  const uniforms={previousScene:{value:null},useScene:{value:0},flowLayer:{value:flow},bubbleLayer:{value:bubbles}};
  mat.userData.layers={'桃色流纹':flow,'悬浮气泡':bubbles};
  mat.userData.setBackdrop=texture=>{uniforms.previousScene.value=texture;uniforms.useScene.value=texture?1:0};
  mat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec3 globePoint; varying vec3 globeCenter;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      globePoint=(modelMatrix*vec4(position,1.)).xyz; globeCenter=modelMatrix[3].xyz;`);
    shader.fragmentShader='varying vec3 globePoint; varying vec3 globeCenter; uniform mat4 projectionMatrix; uniform sampler2D previousScene,flowLayer,bubbleLayer; uniform float useScene;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',`
      vec3 radial=globePoint-globeCenter;
      float radius=max(length(radial),.001);
      vec3 n=radial/radius, incident=normalize(globePoint-cameraPosition);
      vec3 ray=refract(incident,n,1./1.49);
      float chord=max(0.,-2.*dot(n,ray));
      vec3 exitN=normalize(n+ray*chord);
      vec3 outgoing=refract(ray,-exitN,1.49);
      if(dot(outgoing,outgoing)<.01) outgoing=reflect(ray,-exitN);
      vec3 backdrop=vec3(.6,.55,.5);
      #ifdef ENVMAP_TYPE_CUBE_UV
        backdrop=textureCubeUV(envMap,envMapRotation*outgoing,.055).rgb*envMapIntensity;
      #endif
      if(useScene>.5){
        vec3 farPoint=globeCenter+radius*exitN+outgoing*(1.5+6.*radius);
        vec4 clip=projectionMatrix*viewMatrix*vec4(farPoint,1.);
        vec4 center=projectionMatrix*viewMatrix*vec4(globeCenter,1.);
        vec2 uv=.5+.5*clip.xy/max(.001,clip.w);
        vec2 mid=.5+.5*center.xy/max(.001,center.w);
        vec2 size=.5*vec2(projectionMatrix[0][0],projectionMatrix[1][1])*radius/max(.001,center.w);
        vec2 offset=(uv-mid)/size;
        if(length(offset)<1.35) uv=mid+size*1.35*(length(offset)>.001?normalize(offset):vec2(0.,-1.));
        if(clip.w>0. && all(greaterThan(uv,vec2(.001))) && all(lessThan(uv,vec2(.999))))
          backdrop=mix(backdrop,texture2D(previousScene,uv).rgb,.87);
      }
      vec3 sediment=vec3(0.); float visibility=1.;
      for(int i=0;i<6;i++){
        vec3 p=n+ray*chord*((float(i)+.5)/6.);
        vec2 sampleUV=vec2(p.x+.37*p.z,p.y-.23*p.z)*.54;
        float ribbon=texture2D(flowLayer,sampleUV).r;
        float speck=texture2D(bubbleLayer,sampleUV*1.48+float(i)*.171).r;
        float alpha=1.-exp(-chord*(.17*ribbon+.32*speck));
        sediment+=visibility*alpha*mix(vec3(1.,.48,.28),vec3(1.,.84,.67),speck);
        visibility*=1.-alpha;
      }
      vec3 body=backdrop*exp(-chord*vec3(.022,.28,.43))*visibility+sediment;
      float fresnel=.039+.961*pow(1.-clamp(dot(-incident,n),0.,1.),5.);
      outgoingLight+=body*(1.-fresnel);
      #include <opaque_fragment>`);
  };
  return mat;
}

// Use a completed post-process target from the preceding frame, never the active scene target.
export function updateAcrylicBackdrop(mat,film){
  const target=film.gtao?film.rtA:film.rtDof;
  mat.userData.setBackdrop(film.frameNo>1 && target ? target.texture : null);
}
