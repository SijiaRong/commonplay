"""Build the local review catalog from per-component settings; retain existing artwork."""
from pathlib import Path
import html
import json
import shutil
import struct
import subprocess

ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT / 'manifest.json').read_text())
catalog = []

def save_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

def extract_states(folder, motion):
    version = folder / motion.get('state_image_dir', 'states/v1')
    record = json.loads((version / 'generation.json').read_text())
    sheet = version / 'state-comparison.png'
    if not sheet.exists():
        shutil.copy2(record['source_sheet'], sheet)
    with sheet.open('rb') as stream:
        width, height = struct.unpack('>II', stream.read(24)[16:24])
    assert width % 2 == 0 and height % 2 == 0
    cw, ch, inset = width // 2, height // 2, 6
    pw, ph = cw - 2 * inset, ch - 2 * inset
    for index, state in enumerate(motion['states']):
        file = version / (state['id'] + '.png')
        if not file.exists():
            col, row = index % 2, index // 2
            subprocess.run(['sips', '-c', str(ph), str(pw), '--cropOffset', str(row * ch + inset), str(col * cw + inset), str(sheet), '--out', str(file)], check=True, capture_output=True)
            side = max(pw, ph)
            subprocess.run(['sips', '-p', str(side), str(side), '--padColor', 'FFFFFF', str(file), '--out', str(file)], check=True, capture_output=True)
        state['image'] = str(file.relative_to(folder))
    motion['comparison_layout'] = ['top_left', 'top_right', 'bottom_left', 'bottom_right']
    motion['reference_accuracy'] = 'AI概念关键帧；角度与关节约束以参数为准，不是同一3D网格的精确渲染。'
    motion['clip_preview'] = '目录页的关键帧轮播，不是骨骼动画或物理动画。'
    if folder.name in ('01-saturn-landmark', '02-ferris-wheel', '12-umbrella-table'):
        motion.setdefault('rotation_loop', {'full_turn_seconds': motion['cycle_seconds'], 'angular_velocity_deg_per_sec': 360 / motion['cycle_seconds'], 'interpolation': 'linear; wrap 360 to 0', 'note': '四张图是角度采样，不是一个完整旋转周期的四等分。'})
    if folder.name == '02-ferris-wheel':
        motion.setdefault('constraints', ['支架及底座固定', '轮体绕垂直轮盘的水平轴旋转', '吊舱独立绕轮轴方向反向补偿，保持世界朝上', '灯光相位独立于旋转相位'])
        motion.setdefault('lighting_clips', {'chase_period_seconds': 3.2, 'fade_seconds': 0.35, 'palette': ['#FFD29A', '#8EDDDC', '#FFB6A0']})
    elif folder.name == '12-umbrella-table':
        motion.setdefault('constraints', ['新增轴承式旋转伞顶', '只转伞面及伞骨；伞杆、桌面和底座固定', '不折叠、不倾斜'])
    elif folder.name == '01-saturn-landmark':
        motion.setdefault('lighting_clips', {'breath_period_seconds': 4, 'intensity_min': 0.35, 'intensity_max': 1, 'curve': 'sinusoidal', 'off_is_separate_power_state': True})
    elif folder.name in ('03-soda-cafe', '06-curved-shop'):
        motion.setdefault('lighting_clips', {'alternating_groups': ['A', 'B'], 'phase_seconds': 1.6, 'fade_seconds': 0.5, 'off_is_separate_power_state': True})
    elif folder.name == '10-lamp':
        motion.setdefault('lighting_clips', {'steady': 'selected color/intensity', 'blink_period_seconds': 2, 'duty_cycle': 0.5, 'fade_seconds': 0.4, 'color_transition_seconds': 0.8})
    elif folder.name == '14-rocket-gantry':
        motion.setdefault('event_sequence', [{'from': 'off', 'to': 'hold_red', 'on': 'power_on_event'}, {'from': 'hold_red', 'to': 'ready_amber', 'on': 'race_ready_event'}, {'from': 'ready_amber', 'to': 'go_green', 'on': 'race_start_event', 'suggested_amber_hold_seconds': 2}, {'from': '*', 'to': 'off', 'on': 'power_off_event'}])
        motion.setdefault('playback', 'event_driven; no automatic red/amber/green loop')
    elif folder.name in ('11-planter', '15-ornamental-tree'):
        motion.setdefault('wind_clip', {'period_seconds': motion['cycle_seconds'], 'base_curve': 'sin(2*pi*t/period)', 'secondary_curve': '0.2*sin(2*pi*t/(period*0.47)+phase)', 'root_weight': 0, 'tip_weight': 1, 'randomize_instance_phase': True, 'note': '花箱/花盆/根固定；主摆动与叶尖余振分层。'})
    elif folder.name == '07-terminal-station':
        motion.setdefault('door_clip', {'open_seconds': 1.2, 'hold_open_seconds': 3, 'close_seconds': 1.6, 'pivot': 'each leaf outer vertical hinge', 'max_outward_angle_deg': 65, 'trigger': 'visitor_arrival_or_finish_event'})
    elif folder.name == '08-service-robot':
        motion.setdefault('gesture_clips', {'wave_seconds': 2.4, 'wave_repetitions': 2, 'point_hold_seconds': 2, 'head_follow_delay_seconds': 0.15, 'feet_locked': True})
    save_json(folder / 'motion.json', motion)

for asset in manifest['assets']:
    folder = ROOT / asset['id']
    design = json.loads((folder / 'design.json').read_text())
    motion = json.loads((folder / 'motion.json').read_text())
    active = motion['status'] != 'static_skipped'
    if active:
        extract_states(folder, motion)
    asset.update({'name': design['name'], 'description': design['description'], 'design_file': asset['id'] + '/design.json', 'motion_file': asset['id'] + '/motion.json', 'component_readme': asset['id'] + '/README.md', 'dynamic_status': motion['status']})
    if active:
        asset['state_comparison'] = asset['id'] + '/' + motion['reference_sheet']
    lines = ['# ' + design['name'], '', '本文件夹是该组件的独立设计单元。', '', '- 修改造型、材质、描述与基础提示词：`design.json`。', '- 修改灯光、可动部件、状态参数、周期与约束：`motion.json`。', '- 基础四视图：`reference-sheet.png`；独立视图：`front.png` / `right.png` / `back.png` / `three-quarter.png`。', '- 新设计另存 `states/v2/` 等版本；保留 v1 和原始基础图。', '', '## 当前动态设计', '']
    if active:
        lines += [motion['notes'], '', '[四态对比图](' + motion['reference_sheet'] + ')' , '', '对比图顺序：左上 → 右上 → 左下 → 右下。所有状态使用同一观察方向。', '', '| 状态 | 单独参考 | 参数 |', '|---|---|---|']
        for state in motion['states']:
            params = json.dumps(state['parameters'], ensure_ascii=False)
            lines.append(f'| {state["name"]} | [图片]({state["image"]}) | `{params}` |')
        lines += ['', '## 后续3D制作', '', '- 3D生成使用基础中性造型；状态图用于确定灯区、关节、转轴和形变，不为每个状态分别生成模型。', '- 需要的部件拆分：`' + '`, `'.join(motion['parts']) + '`。', '- 参数为设计目标，状态图不是经过尺寸或角度校准的3D渲染；几何和图像有冲突时以确认后的设定为准。', '- 原图和完整生成提示词保存在 `states/v1/generation.json`。', '- 此阶段未创建GLB、骨骼、顶点动画或引擎运行代码。']
    else:
        lines += [motion['reason']]
    (folder / 'README.md').write_text('\n'.join(lines) + '\n')
    catalog.append({'id': asset['id'], 'name': design['name'], 'active': active, 'motion': motion})
    print(asset['id'], 'dynamic' if active else 'static', flush=True)

manifest['component_settings_authority'] = 'Each component design.json and motion.json; manifest is an index.'
manifest['dynamic_summary'] = {'dynamic_components': sum(a['active'] for a in catalog), 'static_components': sum(not a['active'] for a in catalog), 'states_per_dynamic_component': 4, 'generator': 'built-in image_gen', 'implementation': 'concept_keyframes_and_specifications_only'}
save_json(ROOT / 'manifest.json', manifest)

nav = ''.join(f'<a href="#{a["id"]}">{html.escape(a["name"])}</a>' for a in catalog)
cards = []
for a in catalog:
    aid, m = a['id'], a['motion']
    image = aid + '/' + (m['reference_sheet'] if a['active'] else 'reference-sheet.png')
    controls = '<button data-mode="compare">四态对比</button>'
    caption = '左上 → 右上 → 左下 → 右下：' + ' / '.join(s['name'] for s in m.get('states', []))
    if a['active']:
        controls += ''.join(f'<button data-state="{i}">{html.escape(s["name"])}</button>' for i,s in enumerate(m['states']))
        controls += '<button data-mode="play">轮播关键帧</button>'
    else:
        controls = ''
        caption = m['reason']
    info = m.get('notes', m.get('reason', ''))
    cards.append(f'<section id="{aid}" class="card"><div class="card-head"><span>{aid}</span><h2>{html.escape(a["name"])}</h2><b>{"动态 · 4 状态" if a["active"] else "静态 · 已跳过"}</b></div><img class="preview" loading="lazy" src="{image}" alt="{html.escape(a["name"])}状态参考"><div class="controls">{controls}</div><p class="caption">{html.escape(caption)}</p><p>{html.escape(info)}</p><div class="links"><a href="{aid}/README.md">组件说明</a><a href="{aid}/design.json">造型设定 JSON</a><a href="{aid}/motion.json">动态设定 JSON</a><a href="{aid}/reference-sheet.png">基础四视图</a></div></section>')
payload = json.dumps(catalog, ensure_ascii=False).replace('<', '\\u003c')
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>泡泡星港 · 组件设计目录</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f4ef;color:#263a38;font:15px/1.7 system-ui,sans-serif}header,main,nav{max-width:1320px;margin:auto;padding:24px}header{padding-bottom:6px}h1{font-size:32px;margin:8px 0}header p{max-width:900px}nav{display:flex;gap:9px;flex-wrap:wrap;padding-top:10px}a{color:#246b62}nav a{background:white;border:1px solid #d6e1db;border-radius:20px;padding:5px 13px;text-decoration:none}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.card{background:white;padding:20px;border-radius:20px;box-shadow:0 3px 20px #2540380a;scroll-margin-top:15px}.card-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.card-head span{font-size:11px;color:#778a83;width:100%}h2{font-size:23px;margin:0 0 10px}.card-head b{margin-left:auto;font-size:12px;color:#547a6a}.preview{display:block;width:100%;height:400px;object-fit:contain;background:#fff}.controls{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}button{border:1px solid #ccd9d3;background:#f5f9f7;border-radius:8px;padding:7px 10px;color:#285548;cursor:pointer}button[aria-pressed=true]{background:#cfe9df;border-color:#53846f}.caption{font-size:13px;color:#718179;min-height:45px}.links{display:flex;gap:14px;flex-wrap:wrap;font-size:13px}.notice{background:#e7eee8;padding:12px 16px;border-radius:12px}@media(max-width:800px){main{grid-template-columns:1fr}.preview{height:340px}}
</style><header><div>模型设定 · 状态比较 · v1</div><h1>泡泡星港，逐个组件调整。</h1><p>16个独立组件，13个动态组件各有四个状态；长椅、咖啡椅、广场围栏保持静态。点击状态可单独查看，轮播用于比较关键帧。</p><p class="notice">这是动态设计参考，轮播为离散图片切换，不是已经制作好的3D动画。每个组件的造型与动态设定分别保存在自己的 design.json 和 motion.json 中。修改设定后运行 build_catalog.py 可更新目录页；原始参考图不会重画。</p></header><nav>__NAV__</nav><main>__CARDS__</main><script>
const assets=__DATA__;
for(const asset of assets){if(!asset.active)continue;const card=document.getElementById(asset.id),img=card.querySelector('img'),caption=card.querySelector('.caption');let timer=null,index=0;const compareSrc=asset.id+'/'+asset.motion.reference_sheet;const reset=()=>{clearInterval(timer);timer=null;for(const b of card.querySelectorAll('button'))b.setAttribute('aria-pressed','false');};const show=i=>{index=i;const s=asset.motion.states[i];img.src=asset.id+'/'+s.image;img.alt=asset.name+' · '+s.name;caption.textContent=s.name+' · '+JSON.stringify(s.parameters);for(const b of card.querySelectorAll('[data-state]'))b.setAttribute('aria-pressed',Number(b.dataset.state)===i?'true':'false');};for(const b of card.querySelectorAll('[data-state]'))b.onclick=()=>{reset();show(Number(b.dataset.state));};card.querySelector('[data-mode=compare]').onclick=()=>{reset();img.src=compareSrc;img.alt=asset.name+'四态对比';caption.textContent='左上 → 右上 → 左下 → 右下：'+asset.motion.states.map(s=>s.name).join(' / ');};const play=card.querySelector('[data-mode=play]');play.onclick=()=>{if(timer){reset();return;}reset();show(0);play.setAttribute('aria-pressed','true');timer=setInterval(()=>show((index+1)%asset.motion.states.length),1600);};}
</script></html>'''
(ROOT / 'index.html').write_text(page.replace('__NAV__', nav).replace('__CARDS__', ''.join(cards)).replace('__DATA__', payload))

readme = (ROOT / 'README.md').read_text()
marker = '\n<!-- COMPONENT-DYNAMICS -->'
readme = readme.split(marker)[0]
readme += marker + '\n\n## 逐组件设定与动态设计\n\n[打开本地状态比较目录](index.html)。每个组件保留独立目录，造型设定在 `design.json`，动态设定在 `motion.json`，状态图在 `states/v1/`。配置更改后运行 `python3 build_catalog.py` 更新目录页；该操作保留已有图片，不会重新调用生成服务。\n\n13 个动态组件，每个 1 张对比图 + 4 张独立状态图，共新增 65 张 PNG。另有 3 个静态组件跳过。状态图采用同机位，图序为左上、右上、左下、右下。完整提示词在每个组件的 `states/v1/generation.json`。\n\n这些是关键帧设计与可修改参数，尚未实现 3D 模型拆分、绑定、物理形变或运行时动画。动态图不作为另一个模型的基础造型输入。\n\n| 组件 | 状态与说明 | 设定 |\n|---|---|---|\n'
for a in catalog:
    aid, m = a['id'], a['motion']
    desc = ' / '.join(s['name'] for s in m['states']) if a['active'] else m['reason']
    readme += f'| [{a["name"]}]({aid}/README.md) | {desc} | [造型]({aid}/design.json) · [动态]({aid}/motion.json) |\n'
(ROOT / 'README.md').write_text(readme)
print('Catalog and per-component documentation updated.', flush=True)
