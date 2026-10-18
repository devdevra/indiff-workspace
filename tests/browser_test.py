"""Runtime UI checks. Requires existing Playwright/Chromium; do not install dependencies.
Run only in an executor that permits the installed browser's local sockets.
"""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('INDIFF_TEST_URL','http://127.0.0.1:4178')
OUT=Path(os.environ.get('INDIFF_QA_DIR','qa'));OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def record(s):checks.append(s)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 context=browser.new_context(viewport={'width':1440,'height':900},accept_downloads=True)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE);page.wait_for_selector('.empty-panel');assert page.locator('.empty-panel h1').inner_text()=="Open it.\nThat's enough."
 dims=page.evaluate("({sidebar:document.querySelector('.lnb').getBoundingClientRect().width,tab:document.querySelector('.pane-bar').getBoundingClientRect().height,status:document.querySelector('.app-bar').getBoundingClientRect().height,bg:getComputedStyle(document.body).backgroundColor})")
 assert dims['sidebar']==280 and dims['tab']==32 and dims['status']==26,dims
 record('dark shell, 280px tree, 32px tab strip, 26px status bar and original empty phrase');page.screenshot(path=str(OUT/'desktop-empty.png'))
 page.locator('[data-open=doc_brief]').click();assert page.locator('.pane-tab.preview').count()==1
 page.locator('[data-open=doc_shots]').click();assert page.locator('.pane-tab').count()==1
 page.locator('[data-open=doc_shots]').dblclick();page.locator('[data-open=doc_brief]').click();assert page.locator('.pane-tab').count()==2;record('preview replacement and double-click pin')
 page.locator('[data-doc-mode=edit]').click();page.locator('[data-editor=doc_brief]').fill('# UI 검증\n\n<script>window.injected=1</script>\n\n- 항목 하나')
 page.wait_for_timeout(600);page.reload();page.wait_for_selector('[data-editor=doc_brief]');assert 'UI 검증' in page.locator('[data-editor=doc_brief]').input_value();assert not page.evaluate('Boolean(window.injected)')
 page.locator('[data-doc-mode=read]').click();assert 'window.injected' in page.locator('[data-reader=doc_brief]').inner_text();assert not page.evaluate('Boolean(window.injected)');record('document editing, autosave/reload, safe preview')
 page.locator('.note-form input').fill('검증 메모');page.locator('.note-form button').click();assert '검증 메모' in page.locator('.doc-notes').inner_text();record('document notes')
 page.locator('.split-row').click();assert page.locator('.pane').count()==2;page.locator('[data-open=doc_shots]').click();assert page.locator('.pane.active [data-reader=doc_shots]').count()==1
 page.screenshot(path=str(OUT/'desktop-split.png'));record('independent documents in split panes')
 target=page.locator('.pane.active .pane-tabs');source=page.locator('.pane:not(.active) [data-tab=doc_brief]');source.drag_to(target);assert page.locator('.pane.active [data-tab=doc_brief]').count()==1;record('tab moving between panels')
 page.locator('[data-open="@board"]').click();page.wait_for_selector('.bd-card');page.locator('[data-action=fit]').click();assert page.locator('.bd-card').count()==5 and page.locator('.bd-edge').count()==5
 card=page.locator('[data-node=node_input]');box=card.bounding_box();page.mouse.move(box['x']+60,box['y']+20);page.mouse.down();page.mouse.move(box['x']+100,box['y']+50,steps=4);page.mouse.up();assert page.evaluate("JSON.parse(localStorage.getItem('indiff.original-ui.layout.v1')).positions.node_input.x") is not None;record('free-position node dragging and persisted coordinates')
 page.locator('[data-port-out=node_merge]').click();page.locator('[data-port-in=node_input]').click();assert '순환' in page.locator('#toast').inner_text();page.keyboard.press('Escape');record('cyclic connection rejected')
 page.locator('[data-port-out=node_input]').click();page.locator('[data-port-in=node_draft]').click();assert page.locator('.bd-edge').count()==6;record('port connection adds a curved DAG edge')
 page.screenshot(path=str(OUT/'desktop-board.png'))
 page.locator('[data-action=run]').click();page.wait_for_function("document.querySelector('[data-action=run]')!==null",timeout=15000);assert page.locator('.bd-card.completed').count()==5;record('local rule execution')
 page.locator('[data-open="@runs"]').click();assert 'AI 생성' in page.locator('.runs-page').inner_text();assert page.locator('.run-item').count()==1;record('terminal run ledger')
 page.locator('[data-open="@team"]').click();page.locator('.tm-compose textarea').fill('메모입니다. 실제 AI 요청이 아닙니다.');page.locator('.tm-compose button').click();assert page.locator('.tm-msg').count()==1;assert page.locator('.tm-msg .tm-text').inner_text()=='메모입니다. 실제 AI 요청이 아닙니다.';record('local chat-shaped notes with no fabricated agent response');page.screenshot(path=str(OUT/'desktop-team.png'))
 page.locator('#text-import').set_input_files({'name':'가져온노트.md','mimeType':'text/markdown','buffer':'# UTF-8 가져오기\n\n테스트'.encode()});assert '가져온노트.md' in page.locator('.pane.active .pane-tabs').inner_text();record('UTF-8 Markdown import')
 with page.expect_download() as event:page.locator('#export-backup').click()
 event.value.save_as(str(OUT/'backup.json'));backup=json.loads((OUT/'backup.json').read_text());assert backup['format']=='indiff-ui-correction';assert backup['ui']['chat'];record('full workspace + layout + chat backup')
 page.once('dialog',lambda d:d.accept());page.locator('#backup-import').set_input_files(str(OUT/'backup.json'));page.wait_for_timeout(300);record('validated full backup restore')
 mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,device_scale_factor=1)
 mp=mobile.new_page();mp.goto(BASE);mp.wait_for_selector('.empty-panel');mp.locator('#sidebar-rail').click();mp.locator('[data-open=doc_brief]').click();assert mp.locator('.lnb').bounding_box()['x']<0
 mp.locator('.split-row').click();assert mp.locator('#mobile-panes.has-splits').is_visible();assert mp.locator('.pane.active').bounding_box()['width']>=380;assert mp.evaluate('document.documentElement.scrollWidth<=innerWidth')
 mp.locator('#sidebar-rail').click();mp.locator('[data-open="@board"]').click();mp.locator('[data-action=fit]').click();mp.screenshot(path=str(OUT/'mobile-board.png'));assert mp.evaluate('document.documentElement.scrollWidth<=innerWidth')
 mp.locator('#mobile-panes button').first.click();mp.screenshot(path=str(OUT/'mobile-document.png'));assert mp.locator('[data-reader=doc_brief]').is_visible();record('390px mobile uses same document/board via pane switching without horizontal overflow')
 broken=browser.new_context();bp=broken.new_page();bp.goto(BASE);bp.evaluate("localStorage.setItem('indiff.original-ui.layout.v1','{broken')");bp.reload();bp.wait_for_selector('#recovery-bar');assert bp.evaluate("localStorage.getItem('indiff.original-ui.layout.v1')")=='{broken';bp.reload();bp.wait_for_selector('#recovery-bar');record('damaged layout storage protected across reload')
 assert not errors,errors;browser.close()
(OUT/'browser-result.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'pageErrors':errors},ensure_ascii=False,indent=2))
print(json.dumps({'passed':len(checks),'checks':checks,'pageErrors':errors},ensure_ascii=False))
