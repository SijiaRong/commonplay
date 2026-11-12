// Run against a local or deployed bubblecity server. Checks pixel output, shader compilation,
// adaptive recovery and native 4K sizing; it is not a physical-display FPS benchmark.
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.DEMO_URL || 'http://127.0.0.1:8894/';
const asset = path => new URL(path, base).href;

(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const errors = [];
  const fixture = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}canvas{display:block;width:100vw;height:100vh}</style>
    <script type="importmap">${JSON.stringify({imports:{three:asset('slide/film/three.module.js'),'three/addons/':asset('slide/film/addons/')}})}</script>
    <canvas></canvas><script type="module">
      import * as THREE from 'three';
      import {createSlideFilm} from ${JSON.stringify(asset('slide/film/scene.js'))};
      const {film}=createSlideFilm(document.querySelector('canvas'));
      Object.assign(film,{adaptive:false,frozen:true,lens:{enabled:false}});
      film.camera.position.set(0,0,4);film.camera.lookAt(0,0,0);
      film.scene.background=new THREE.Color(.2,.3,.4);
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(1.4,1.4,1.4),new THREE.MeshBasicMaterial({color:0x20ff20}));
      mesh.rotation.set(.3,.5,.1);film.scene.add(mesh);
      film.render(0);window.film=film;window.THREE=THREE;
    </script>`;
  async function open(context) {
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {if(message.type()==='error')errors.push(message.text());});
    await page.route('**/__render-fixture', route => route.fulfill({contentType:'text/html',body:fixture}));
    await page.goto(new URL('__render-fixture', base).href);
    await page.waitForFunction(() => window.film);
    return page;
  }
  try {
    const desktop = await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:2});
    const page = await open(desktop);
    const sizes = await page.evaluate(() => {
      const f=window.film, gl=f.renderer.getContext();
      function snapshot(){
        f.render(0);
        const pixel=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
        return {output:[f.canvas.width,f.canvas.height],scene:[f.sceneRT.width,f.sceneRT.height],
          upscale:!!f.upscaler.target,pixel:[...pixel]};
      }
      const native=snapshot();
      f.setResScale(.65);const scaled=snapshot();
      f.setQuality('low');const low=snapshot();
      f.setQuality('high');f.setResScale(1);const recovered=snapshot();
      return {native,scaled,low,recovered};
    });
    assert.deepEqual(sizes.native.output,[3840,2160]);
    assert.deepEqual(sizes.native.scene,[3840,2160]);
    assert.equal(sizes.native.upscale,false);
    assert.deepEqual(sizes.scaled.output,[3840,2160]);
    assert.deepEqual(sizes.scaled.scene,[2496,1404]);
    assert.equal(sizes.scaled.upscale,true);
    assert.deepEqual(sizes.low.output,[3840,2160]);
    assert.deepEqual(sizes.recovered,sizes.native);
    for(let c=0;c<4;c++)assert(Math.abs(sizes.native.pixel[c]-sizes.scaled.pixel[c])<=2,
      'upscaling must preserve the graded color: '+JSON.stringify({sizes,errors}));

    await page.setViewportSize({width:320,height:180});
    const shader = await page.evaluate(() => {
      const f=window.film, gl=f.renderer.getContext();f.setResScale(.65);
      function read(enhanced){
        f.upscaler.enhanced=enhanced;f.render(0);
        const out=new Uint8Array(f.canvas.width*f.canvas.height*4);
        gl.readPixels(0,0,f.canvas.width,f.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,out);return out;
      }
      const bilinear=read(false), sg=read(true);
      let changed=0,opaque=0;
      for(let i=0;i<sg.length;i+=4){
        if(Math.abs(sg[i]-bilinear[i])+Math.abs(sg[i+1]-bilinear[i+1])+Math.abs(sg[i+2]-bilinear[i+2])>3)changed++;
        if(sg[i+3]===255)opaque++;
      }
      // A synthetic high-contrast border catches gather order, edge clamping,
      // color conversion, and invalid/black reconstruction results.
      const data=new Uint8Array(4*4*4);
      for(let y=0;y<4;y++)for(let x=0;x<4;x++){
        const i=(y*4+x)*4;data[i]=x<2?255:0;data[i+1]=y<2?255:0;data[i+2]=64;data[i+3]=255;
      }
      const texture=new THREE.DataTexture(data,4,4);texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
      f.upscaler.material.uniforms.ps0.value=texture;
      f.upscaler.material.uniforms.ViewportInfo.value[0].set(.25,.25,4,4);
      f.upscaler.render(f.renderer,f.fsq);
      const corners=[];
      for(const [x,y] of [[0,0],[f.canvas.width-1,0],[0,f.canvas.height-1],[f.canvas.width-1,f.canvas.height-1]]){
        const p=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);corners.push([...p]);
      }
      texture.dispose();
      return {changed,opaque,total:sg.length/4,corners,
        runnable:f.renderer.info.programs.every(p=>p.diagnostics?.runnable!==false)};
    });
    assert(shader.changed>20,'SGSR must reconstruct edges differently from bilinear: '+JSON.stringify({shader,errors}));
    assert.equal(shader.opaque,shader.total);
    assert.equal(shader.runnable,true);
    assert.deepEqual(shader.corners,[[255,255,64,255],[0,255,64,255],[255,0,64,255],[0,0,64,255]]);

    const adaptation = await page.evaluate(() => {
      const f=window.film;f.adaptive=true;
      function sample(dt,wait=31000){
        f.frameTimes.length=0;f.lastResChange=performance.now()-wait;
        for(let i=0;i<30;i++)f.trackPerf(dt);
      }
      f.setQuality('high');f.setResScale(1);sample(1/55);const slow=f.resScale;
      for(let i=0;i<10&&f.resScale<1;i++)sample(1/60);
      const restored=f.resScale;
      f.setQuality('medium');f.setResScale(1);f.lastDowngrade=performance.now()-31000;sample(1/60);
      const quality=f.quality;
      f.setQuality('low');f.setResScale(.65);f.upscaler.enhanced=true;sample(1/30);
      const fallback=!f.upscaler.enhanced;
      const before=f.frameTimes.length;f.trackPerf(0);const ignoredPause=f.frameTimes.length===before;
      f.adaptive=false;
      Object.defineProperty(window,'devicePixelRatio',{value:1,configurable:true});f.resize();
      const moved=[f.canvas.width,f.canvas.height];
      return {slow,restored,quality,fallback,ignoredPause,moved};
    });
    assert(adaptation.slow<1,'sustained 55 fps must lower scene resolution');
    assert.equal(adaptation.restored,1,'stable 60 fps must recover native resolution');
    assert.equal(adaptation.quality,'high','lighter scenes must recover the desktop preset');
    assert.equal(adaptation.fallback,true);
    assert.equal(adaptation.ignoredPause,true);
    assert.deepEqual(adaptation.moved,[320,180]);
    await desktop.close();

    const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
    const phone=await open(mobile);
    const touch=await phone.evaluate(()=>{
      const f=window.film;f.adaptive=true;f.lastDowngrade=f.lastResChange=performance.now()-31000;
      for(let i=0;i<60;i++)f.trackPerf(1/60);
      return {quality:f.quality,output:[f.canvas.width,f.canvas.height],scene:[f.sceneRT.width,f.sceneRT.height]};
    });
    assert.equal(touch.quality,'low');
    assert.deepEqual(touch.output,touch.scene);
    assert.deepEqual(touch.output,[390,844]);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'PASS',sizes,shader,adaptation,touch},null,2));
    await mobile.close();
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
