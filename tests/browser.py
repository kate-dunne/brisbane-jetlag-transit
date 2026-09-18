import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':393,'height':851},device_scale_factor=1,is_mobile=True,has_touch=True)
    errors=[]
    page.on('pageerror',lambda e: (errors.append(str(e)),print('JS:',e,flush=True)))
    page.on('requestfailed',lambda r: print('Request failed:',r.url,r.failure,flush=True))
    page.goto(os.environ.get('TEST_URL','http://127.0.0.1:8000'),wait_until='networkidle',timeout=90000)
    print('Page loaded',flush=True)
    page.wait_for_function("map.getLayer('legal-line') && map.areTilesLoaded()",timeout=90000)
    page.screenshot(path='/tmp/brisbane-mobile.png')
    page.locator('#menuBtn').click()
    page.locator('[data-layer=intermediate]').check()
    assert page.evaluate("map.getLayoutProperty('intermediate','visibility')")=='visible'
    page.locator('[data-layer=intermediate]').uncheck()
    page.locator('[data-layer=stops]').check()
    page.locator('#menuBtn').click()
    page.evaluate("map.jumpTo({center:[153.02,-27.475],zoom:14})")
    page.wait_for_timeout(1500)
    point=page.evaluate("""()=>{const f=map.queryRenderedFeatures({layers:['stops']}).find(f=>{const p=map.project(f.geometry.coordinates);return p.x>30&&p.x<350&&p.y>110&&p.y<720});const p=map.project(f.geometry.coordinates);return [p.x,p.y]}""")
    page.touchscreen.tap(*point)
    page.wait_for_selector('.maplibregl-popup-content')
    assert page.locator('.maplibregl-popup-content').inner_text().strip()
    page.locator('.maplibregl-popup-close-button').first.click()
    fixture={'type':'Feature','properties':{'questions':[{'id':'radius','data':{'lng':153.02,'lat':-27.475,'radius':2,'unit':'kilometers','within':True}}]},'geometry':{'type':'Polygon','coordinates':[[[152.8,-27.8],[153.3,-27.8],[153.3,-27.1],[152.8,-27.1],[152.8,-27.8]]]}}
    page.locator('#fileInput').set_input_files({'name':'fixture.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()})
    page.wait_for_function('legal!==null')
    page.locator('#insideOnly').check()
    page.wait_for_timeout(1000)
    page.screenshot(path='/tmp/brisbane-import.png')
    page.evaluate("""()=>{const area=turf.bboxPolygon([152,-29,154,-26]);const r=parseTaibeled({...area,questions:[{id:'thermometer',data:{lngA:153,latA:-27.5,lngB:153.1,latB:-27.5,warmer:true}}]});if(!turf.booleanPointInPolygon([153.1,-27.5],r.geom)||turf.booleanPointInPolygon([153,-27.5],r.geom))throw Error('Thermometer reversed');const cut=clipTransit(turf.featureCollection([turf.lineString([[0,0],[3,0]])]),turf.bboxPolygon([1,-1,2,1]));if(cut.features.length!==1||Math.abs(cut.features[0].geometry.coordinates[0][0]-1)>1e-6)throw Error('Clipping failed');try{parseTaibeled({})}catch(e){return;}throw Error('Invalid JSON accepted')}""")
    page.reload(wait_until='networkidle')
    page.wait_for_function('legal!==null')
    page.locator('#menuBtn').click()
    page.locator('#clearBtn').click()
    assert page.evaluate('legal===null')
    assert page.locator('#fitBtn').is_disabled()
    assert not errors,errors
    print('PASS: mobile render, live basemap tiles, toggles, stop tap, import, spherical warmer direction, clipping, invalid import, persistence, reset. No JS errors.')
    browser.close()
