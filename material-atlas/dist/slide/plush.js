import * as T from 'three';

// A periodic height tile for individual tufts. Read it in rest space so the
// nap follows the skinned surface through every animation.
function makeNap() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4b4b4b';
  ctx.fillRect(0, 0, 256, 256);
  let seed = 5681;
  function random() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 8300; i++) {
    const x = random()*256, y = random()*256;
    const length = 3 + random()*10;
    const drift = length*(.36*Math.sin(y*Math.PI/32) + random()-.5);
    const value = Math.floor(45 + random()*208);
    ctx.strokeStyle = 'rgb('+[value,value,value].join(',')+')';
    ctx.lineWidth = .65 + random()*1.1;
    for (const ox of (x<12 ? [0,256] : x>244 ? [0,-256] : [0])) {
      for (const oy of (y>242 ? [0,-256] : [0])) {
        ctx.beginPath();
        ctx.moveTo(x+ox,y+oy);
        ctx.quadraticCurveTo(x+ox+drift*.2,y+oy+length*.65,x+ox+drift,y+oy+length);
        ctx.stroke();
      }
    }
  }
  const tex = new T.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export function dressPlush(bear) {
  const nap = makeNap();
  const meshes = [];
  bear.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
  for (const mesh of meshes) {
    const source = mesh.material;
    const base = new T.MeshPhysicalMaterial({
      map:source.map, metalness:0, roughness:.92, sheen:1,
      sheenColor:0xf2c59a, sheenRoughness:.83, specularIntensity:.48
    });
    function configure(material, shell) {
      material.customProgramCacheKey = () => 'teddy-nap-'+shell;
      material.onBeforeCompile = shader => {
        shader.uniforms.napTile = {value:nap};
        const vary = 'varying vec3 vRest; varying vec3 vRestNormal;';
        shader.vertexShader = vary+'\n'+shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          vRest=position; vRestNormal=normal;
          transformed += normal * ${shell.toFixed(4)};
        `);
        shader.fragmentShader = 'uniform sampler2D napTile; '+vary+'\n'+shader.fragmentShader
          .replace('#include <map_fragment>', `
            #include <map_fragment>
            // Button-eye centers measured on the neutral mesh. Use pigment too
            // so the surrounding brow and muzzle keep their fabric response.
            vec3 e=(vec3(abs(vRest.x),vRest.yz)-vec3(.068,.822,.172))/vec3(.023,.021,.026);
            float eye=(1.-smoothstep(.78,1.1,length(e)))*(1.-smoothstep(.10,.19,diffuseColor.r));
            vec3 c=diffuseColor.rgb;
            float warm=smoothstep(.013,.062,c.r-c.b);
            float kneePatch=smoothstep(1.95,2.9,c.r/max(.012,c.g))*(1.-smoothstep(.29,.42,vRest.y));
            float nose=(1.-smoothstep(.78,1.1,length((vRest-vec3(0.,.783,.243))/vec3(.048,.029,.024))));
            float fur=warm*(1.-max(max(eye,nose),kneePatch));
            vec3 axis=pow(abs(normalize(vRestNormal)),vec3(4.));
            axis/=max(dot(axis,vec3(1.)),.001);
            vec3 p=vRest*4.3;
            float fibers=dot(axis,vec3(texture2D(napTile,p.zy).r,texture2D(napTile,p.xz).r,texture2D(napTile,p.xy).r));
            float tuft=texture2D(napTile,p.xy*.36+vRest.z*.5).r;
            ${shell ? 'if (fur<.54 || fibers+.15*tuft<.66) discard;' : ''}
            diffuseColor.rgb*=mix(1.,.66+.63*fibers+.14*tuft,fur);
          `)
          .replace('#include <roughnessmap_fragment>', `
            #include <roughnessmap_fragment>
            roughnessFactor=mix(roughnessFactor,.12,eye);
          `)
          .replace('#include <normal_fragment_maps>', `
            #include <normal_fragment_maps>
            vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
            vec3 rx=cross(dy,normal),ry=cross(normal,dx);
            float det=dot(dx,rx);
            float height=(fibers+.4*tuft)*fur*.003;
            normal=normalize(normal-sign(det)*(rx*dFdx(height)+ry*dFdy(height))/max(abs(det),1.e-8));
          `)
          .replace('#include <lights_physical_fragment>', `
            #include <lights_physical_fragment>
            material.sheenColor*=fur;
            material.specularColor=mix(material.specularColor,vec3(.085),eye);
          `);
      };
    }
    configure(base,0);
    mesh.material = base;
    // One sparse, short outer layer breaks the smooth silhouette. It shares
    // the original vertices, joint weights and skeleton with the base mesh.
    const pile = mesh.clone(false);
    pile.name = 'Short pile';
    pile.material = base.clone();
    configure(pile.material,.0055);
    pile.castShadow = false;
    mesh.parent.add(pile);
  }
  return () => nap.dispose();
}
