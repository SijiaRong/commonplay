import {entries} from './catalog.js';
import {SKINS} from './lm/shared/skins.js';
const $=id=>document.getElementById(id),frame=document.querySelector('iframe');
let comparison,item,shape,skin,finish,revision=0,ready=false;
function send(){revision++;$('values').replaceChildren();$('maps').replaceChildren();const ref=item.comparisons?.find(([key])=>key===comparison);
 $('pair').hidden=!ref;if(ref)$('pair').textContent='左　'+ref[1]+'　　 /　　 右　'+item.name;
 if(ready)frame.contentWindow.postMessage({id:item.id,shape,skin,finish,comparison,revision},location.origin)}
function menu(label,options,current,change){
 const l=document.createElement('label'),s=document.createElement('select');l.append(label,s);
 for(const [value,title] of options)s.add(new Option(title,value));
 s.value=current;s.onchange=()=>change(s.value);$('controls').append(l);
}
function select(e){
 item=e;comparison=e.comparisons?.[0][0]||'';shape=e.shape;finish=0;const marble=e.id.startsWith('marble-');
 $('category').textContent=e.project+'  /  '+e.group;$('name').textContent=e.name;$('description').textContent=e.description;$('source').textContent='来源　'+e.source;
 $('controls').replaceChildren();
 if(marble){const variants=SKINS.map((s,i)=>[i,s]).filter(([,s])=>s.style===Number(e.id.slice(7))).map(([i,s])=>[i,s.name]);skin=variants[0][0];
 menu('配色',variants,skin,v=>{skin=+v;send()});menu('表面',['抛光','磨砂','珠光','闪粉','发光'].map((n,i)=>[i,n]),finish,v=>{finish=+v;send()});
 }else if(e.id!=='port-acrylic'&&!['平面','点精灵','圆环'].includes(shape))menu('几何体',['圆角块','球体','圆柱','平板'].map(n=>[n,n]),shape,v=>{shape=v;send()});
 if(e.comparisons)menu('左侧对照',[['','仅看星港样本'],...e.comparisons],comparison,v=>{comparison=v;send()});
 for(const b of $('list').querySelectorAll('button'))b.setAttribute('aria-current',b.dataset.id===e.id);
 send();
}
function list(){const all=entries.filter(e=>e.project===$('project').value);$('list').replaceChildren();
 for(const group of new Set(all.map(e=>e.group))){const h=document.createElement('h3');h.textContent=group;$('list').append(h);
 for(const e of all.filter(e=>e.group===group)){const b=document.createElement('button');b.textContent=e.name;b.dataset.id=e.id;b.onclick=()=>select(e);$('list').append(b)}}
 select(all[0]);}
window.addEventListener('message',({origin,source,data})=>{if(origin!==location.origin||source!==frame.contentWindow)return;
 if(data.ready){ready=true;send();return}if(data.revision!==revision)return;
 for(const [key,value] of Object.entries(data.values||{})){const d=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;d.append(dt,dd);$('values').append(d)}
 for(const [key,url] of data.maps||[]){const f=document.createElement('figure'),img=new Image(),cap=document.createElement('figcaption');img.src=url;img.alt=key;cap.textContent=key;f.append(img,cap);$('maps').append(f)}
});
const linked=entries.find(e=>e.id===new URLSearchParams(location.search).get('sample'));
if(linked)$('project').value=linked.project;
else if(location.hash==='#port')$('project').value='泡泡星港版小熊滑滑梯';
$('project').onchange=list;$('reset').onclick=()=>frame.contentWindow.postMessage({reset:true},location.origin);list();if(linked)select(linked);frame.contentWindow.postMessage({ping:true},location.origin);
