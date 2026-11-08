const {items,modelFiles,samples}=window.materialInventory;
const byHash=new Map(items.filter(r=>r.kind==='textures').map(r=>[r.sha256,r]));
const $=id=>document.getElementById(id);
const kinds={sample:'三维标本',textures:'贴图',recipes:'程序材质与预设','model-materials':'模型材质组'};
const channelNames={baseColorTexture:'底色',metallicRoughnessTexture:'粗糙度 G / 金属度 B',emissiveTexture:'自发光',normalTexture:'法线',occlusionTexture:'环境遮蔽'};
const gallery=samples.map(s=>({kind:'sample',group:s.project==='Lost Marbles'?'lost-marbles':'commonplay',title:s.name,id:s.id,channels:[s.group],sources:[s.project],notes:[s.description]}));
const channels=r=>r.channels.map(c=>channelNames[c]||c);
const offline=location.protocol==='file:'||location.pathname.includes('/assets/material-library/');
if(offline)$('atlas').href='https://commonplay-surface-atlas.rongsijia.chatgpt.site/';
let group='lost-marbles',limit=48;
const node=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e};
function openRecord(r){
 const box=$('info');box.replaceChildren(node('h2',r.title));
 if(r.thumb){const img=new Image();img.src=r.thumb;img.alt=r.title;box.append(img)}
 for(const t of [kinds[r.kind],channels(r).join(' · '),r.size?.join(' × '),...r.notes].filter(Boolean))box.append(node('p',t));
 if(r.kind==='sample'){const a=node('a','在 Three.js 中查看');const url=new URL($('atlas').href);url.searchParams.set('sample',r.id);a.href=url;box.append(a)}
 else box.append(node('h3','合集位置'),node('code',r.file));
 if(offline&&r.file){const a=node('a','打开原文件');a.href=r.file;a.target='_blank';box.append(node('p',''),a)}
 if(r.parameters?.length){const details=node('details','');details.append(node('summary','查看 '+r.slots+' 个材质槽的原始参数'),node('pre',JSON.stringify(r.parameters,null,2)));box.append(details)}
 if(r.images?.length){box.append(node('h3','材质图集'));for(const hash of new Set(r.images)){const entry=byHash.get(hash);const b=node('button',channels(entry).join(' / ')||entry.title);b.onclick=()=>openRecord(entry);box.append(b)}}
 box.append(node('h3','仓库来源'));const ul=node('ul','');for(const path of r.sources){const li=node('li','');li.append(node('code',path));ul.append(li)}box.append(ul);
 if(!$('detail').open)$('detail').showModal();$('detail').scrollTop=0;
}
function render(){
 for(const b of $('groups').children)b.setAttribute('aria-pressed',b.value===group);
 const q=$('q').value.trim().toLowerCase();const matches=[...items,...gallery].filter(r=>r.group===group&&(!$('type').value||r.kind===$('type').value)&&(!q||[r.title,...channels(r),...r.channels,...r.sources].join(' ').toLowerCase().includes(q)));
 $('count').textContent=matches.length?'共 '+matches.length+' 项，已显示 '+Math.min(limit,matches.length)+' 项':'没有匹配项';$('cards').replaceChildren();
 for(const r of matches.slice(0,limit)){const b=node('button','');if(r.thumb){const img=new Image();img.loading='lazy';img.alt='';img.src=r.thumb;b.append(img)}else{const s=node('span',r.kind==='sample'?'3D':r.kind==='recipes'?'ƒ':r.kind==='textures'?'HDR':'PBR');s.className='symbol';b.append(s)}
 b.append(node('strong',r.title),node('small',[kinds[r.kind],r.size?.join(' × '),channels(r).join(' / ')].filter(Boolean).join(' · ')));b.onclick=()=>openRecord(r);$('cards').append(b)}
 $('more').hidden=limit>=matches.length;
}
$('summary').textContent=byHash.size+' 张去重贴图 · '+items.filter(r=>r.kind==='model-materials').length+' 组模型材质 · '+items.filter(r=>r.kind==='recipes').length+' 份程序源码与预设。覆盖 '+modelFiles+' 个 GLB / glTF 文件路径。';
$('groups').onclick=e=>{if(e.target.tagName==='BUTTON'){group=e.target.value;limit=48;render()}};
$('q').oninput=$('type').onchange=()=>{limit=48;render()};$('more').onclick=()=>{limit+=48;render()};$('close').onclick=()=>$('detail').close();render();
