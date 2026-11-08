# Long-lived browser driver. POST JSON {"js":..., "shot":path, "wait":sec, "goto":url, "key":..}
import asyncio, json, sys
from playwright.async_api import async_playwright
W,H=int(sys.argv[1]) if len(sys.argv)>1 else 1280, int(sys.argv[2]) if len(sys.argv)>2 else 720
PORT=int(sys.argv[3]) if len(sys.argv)>3 else 9300
state={}
async def handle(reader, writer):
    data=b''
    hdr=await reader.readuntil(b'\r\n\r\n')
    n=0
    for line in hdr.decode().split('\r\n'):
        if line.lower().startswith('content-length:'): n=int(line.split(':')[1])
    body=await reader.readexactly(n) if n else b'{}'
    cmd=json.loads(body); pg=state['pg']; out={}
    try:
        if cmd.get('goto'): await pg.goto(cmd['goto']); 
        if cmd.get('wait'): await pg.wait_for_timeout(cmd['wait']*1000)
        if cmd.get('js'): out['r']=await pg.evaluate(cmd['js'])
        if cmd.get('click'): await pg.click(cmd['click'], timeout=60000)
        if cmd.get('fill'): await pg.fill(cmd['fill'][0], cmd['fill'][1])
        if cmd.get('keydown'): await pg.keyboard.down(cmd['keydown'])
        if cmd.get('keyup'): await pg.keyboard.up(cmd['keyup'])
        if cmd.get('wait2'): await pg.wait_for_timeout(cmd['wait2']*1000)
        if cmd.get('shot'): await pg.screenshot(path=cmd['shot'], timeout=300000)
    except Exception as e: out['err']=str(e)[:800]
    out['log']=state['log'][-15:]; state['log'].clear()
    b=json.dumps(out,ensure_ascii=False).encode()
    writer.write(b'HTTP/1.0 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\n\r\n'%len(b)+b); await writer.drain(); writer.close()
async def main():
    async with async_playwright() as p:
        import os
        b=await p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None,args=['--ignore-gpu-blocklist']+(['--use-angle=swiftshader','--enable-unsafe-swiftshader'] if os.environ.get('SOFTWARE_GL') else []))
        pg=await b.new_page(viewport={'width':W,'height':H},is_mobile=W<600,has_touch=W<600,device_scale_factor=2 if W<600 else 1)
        state['pg']=pg; state['log']=[]
        pg.on('console', lambda m: None if 'GL Driver' in m.text else state['log'].append(m.text[:300]))
        pg.on('pageerror', lambda e: state['log'].append('ERR '+str(e)[:300]))
        srv=await asyncio.start_server(handle,'127.0.0.1',PORT)
        print('ready',flush=True)
        async with srv: await srv.serve_forever()
asyncio.run(main())
