// --- line 8 ---
let pdfViewer,cadImages,measureTool,wordViewer;

// --- line 17 ---
function zoom(factor,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2,keepCentered=false){if(mode==='word'){wordViewer.zoom(factor,keepCentered);return;}if(mode==='pdf'){if(keepCentered)pdfViewer.zoomCentered(factor);else pdfViewer.zoom(factor,cx-$('pdf').offsetLeft,cy-$('pdf').offsetTop);return;}if(mode==='cad'){if(keepCentered){const mid={x:viewport.clientWidth/2,y:viewport.clientHeight/2};cadRenderer.zoom(factor,mid);cadRenderer.centerInView();}else cadRenderer.zoom(factor,{x:cx,y:cy});return;}if(mode==='3d'){if(ifcWalk?.walking)ifcWalk.nudge(factor>1?.5:-.5);else ifcNavigation.zoom(factor);return;}const next=Math.max(.01,Math.min(100,scale*factor));x=cx-(cx-x)*next/scale;y=cy-(cy-y)*next/scale;scale=next;if(keepCentered)centerContent();else paint();}

// --- line 18 ---
function fit(){if(mode==='word'){wordViewer.fit();return;}if(mode==='empty')return;if(mode==='pdf'){pdfViewer.fit().catch(e=>notice(e.message,true));return;}if(mode==='cad'){cadRenderer.fitToView(.9);return;}if(mode==='3d'){if(!group)return;ifcWalk?.stop();ifcNavigation?.setModel(group);const box=visibleFederationBounds();if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());const radius=size.length()/2;const angle=Math.min(camera.fov*Math.PI/360,Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));const distance=radius/Math.sin(angle)*1.2;controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(1,.8,1).normalize().multiplyScalar(distance));camera.near=Math.max(distance/10000,.001);camera.far=distance*100;camera.updateProjectionMatrix();controls.update();return;}const {fitWidth,fitHeight}=contentSize();scale=Math.min((viewport.clientWidth-48)/fitWidth,(viewport.clientHeight-48)/fitHeight);scale=Math.max(.01,scale);centerContent();}

// --- line 25 ---
function placeDocTools(value){const bar=$('doc-toolbar'),tools=document.querySelector('.tools'),bottom=document.querySelector('footer.bottom');if(!bar||!tools||!bottom)return;const top=value==='pdf'||value==='word';document.body.classList.toggle('doc-toolbar-mode',top);if(top){if(tools.parentElement!==bar)bar.appendChild(tools);bar.hidden=false;}else{if(tools.parentElement===bar){const status=bottom.querySelector('.status-area');if(status)status.after(tools);else bottom.appendChild(tools);}bar.hidden=true;}}

// --- line 26 ---
function setMode(value){ifcWalk?.stop();ifcTools?.activate(value==='3d');if(value==='3d')ifcTools?.setModel(group);$('ifc-tools').hidden=value!=='3d';$('ifc-tab').hidden=value!=='3d';ifcNavigation?.armFocus(false);$('ifc-focus').setAttribute('aria-pressed','false');$('word').hidden=value!=='word';document.body.classList.toggle('word-mode',value==='word');document.body.classList.toggle('mode-3d',value==='3d');document.body.classList.toggle('mode-empty',value==='empty');for(const id of ['rotate-screen','rotate-screen-full']){const label='Girar conteÃºdo 90Â°';$(id).setAttribute('aria-label',label);$(id).title=label;}for(const id of ['plus','minus','fit','background'])$(id).disabled=false;if(mode==='pdf'&&value!=='pdf')pdfViewer?.close().catch(e=>notice(e.message,true));measureTool?.reset();$('measure').hidden=true;$('layers-open').hidden=true;const float=value==='cad';$('viewer-tab').hidden=!float;$('viewer-cad-actions').hidden=value!=='cad';if(float){$('viewer-tab').style.left='';$('viewer-tab').style.top='';$('viewer-tab').classList.remove('collapsed');}mode=value;viewport.classList.toggle('pdf-mode',value==='pdf');$('pdf').hidden=value!=='pdf';$('pdf-tools').hidden=value!=='pdf'&&value!=='word';for(const id of ['pdf-print','pdf-share','pdf-capture','pdf-actions-divider']){const el=$(id);if(el)el.hidden=value!=='pdf'&&value!=='word';}if(value!=='pdf'&&value!=='word')$('pdf-capture')?.setAttribute('aria-pressed','false');

// --- line 27 ---
 if($('pdf-print')){$('pdf-print').title=value==='word'?'Imprimir o documento':'Imprimir o PDF';$('pdf-print').setAttribute('aria-label',value==='word'?'Imprimir documento':'Imprimir PDF');}

// --- line 28 ---
 if($('pdf-share')){$('pdf-share').title=value==='word'?'Compartilhar o documento':'Compartilhar o PDF';$('pdf-share').setAttribute('aria-label',value==='word'?'Compartilhar documento':'Compartilhar PDF');}$('pdf-query').placeholder=value==='word'?'Buscar no Word':'Buscar no PDF';$('drawing').hidden=value!=='2d';$('three').hidden=value!=='3d';$('cad').hidden=value!=='cad';$('viewname').textContent=value==='pdf'?'DOCUMENTO Â· PDF':value==='3d'?'MODELO Â· VISTA 3D':'PLANTA Â· VISTA 2D';$('badge').dataset.mode=value==='pdf'?'PDF':value==='3d'?'3D':'2D';if(value==='word'){$('viewname').textContent='DOCUMENTO Â· WORD';$('badge').dataset.mode='DOC';}if(controls)controls.enabled=value==='3d';updateOriginMarker();renderIfcInfo();placeDocTools(value);}

// --- line 52 ---
function resize(){ifcNeedsRender=true;ifcTools?.draw();if(pdfViewer&&mode==='pdf'){(pdfViewer.fitted?pdfViewer.fit():pdfViewer.render()).catch(e=>notice(e.message,true));}if(wordViewer&&mode==='word'&&wordViewer.current?.fitted)wordViewer.fit();if(cadRenderer&&mode==='cad')cadRenderer.resize();if(renderer){renderer.setPixelRatio(ifcPixelRatio(false));renderer.setSize(viewport.clientWidth,viewport.clientHeight);camera.aspect=viewport.clientWidth/viewport.clientHeight;camera.updateProjectionMatrix();}}

// --- line 575 ---
async function loadFile(file,save=true){const nested=fromArchiveOpen;fromArchiveOpen=false;if(!file||busy)return;if(!nested)clearArchives();if(file.size>(/\.(ifc|skp)$/i.test(file.name)?1024:100)*1024*1024){notice(/\.(ifc|skp)$/i.test(file.name)?'O limite para IFC/SKP Ã© 1 GB.':'O limite para este formato Ã© 100 MB.',true);return;}busy=true;$('open').disabled=true;$('badge').disabled=true;await initialView;notice('Abrindo '+file.name+'â€¦');await new Promise(r=>setTimeout(r,40));let partial=false;try{const ext=file.name.split('.').pop().toLowerCase();if(IMAGE_EXT.has(ext)){await showImage(file);}else if(ARCHIVE_EXT.has(ext)){await openArchive(file);}else if(ext==='doc'||ext==='docx'||ext==='txt'){await openWord(file);}else if(ext==='pdf'){await openPDF(file);}else if(ext==='ifc'){await openIFC(file);}else if(ext==='skp'){await openSKP(file);}else if(ext==='svg'){const prepared=await prepareSVG(file);try{await showSVG(prepared);}catch(e){if(prepared.url.startsWith('blob:'))URL.revokeObjectURL(prepared.url);throw e;}}else if(ext==='dwg'){notice('Lendo DWG no dispositivoâ€¦');const {readDwg}=await import(asset('./dwg-local.js'));const result=await readDwg(file);const {CrispCadRenderer,prepareDrawing}=await import(asset('./cad-view.js'));const prepared=prepareDrawing(result.database,file.name);$('font-report').textContent='Fontes solicitadas: '+[...new Set((result.database.tables.STYLE?.entries||[]).map(s=>s.font).filter(Boolean))].join(', ')+'. Importe os arquivos TTF/OTF originais para usar a fonte exata. SHX nÃ£o suportado.';const {attachCadImages}=await import(asset('./cad-images.js'));const nextImages=await attachCadImages(result.database,prepared);cadImages?.dispose();cadImages=nextImages;updateImageReport();if(!cadRenderer){cadRenderer=new CrispCadRenderer($('cad'),{contrastMode:'preserve',background:'#172334',foreground:'#ffffff',showPageBounds:false,fitMode:'extents'});cadRenderer.onStats=stats=>updateCadReport(stats);cadRenderer.onViewChange=e=>{if(mode==='cad')$('zoom').textContent=Math.round(e.zoomPercent)+'%';measureTool?.draw();};}if(!measureTool){const {DwgMeasure}=await import(asset('./measure.js'));measureTool=new DwgMeasure(viewport,cadRenderer);}clear3d();setMode('cad');cadRenderer.resize();cadRenderer.setDocument(prepared.document);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(mode==='cad')cadRenderer.fitToView(.9);setupLayers();partial=result.unknown>0||Object.values(cadRenderer.getStats().unsupported).some(count=>count>0);cadCompatibility={unknown:result.unknown,fonts:prepared.substitutedFonts};updateCadReport(cadRenderer.getStats());const fonts=prepared.substitutedFonts;$('filemeta').title=fonts.length?'Fontes SHX substituÃ­das por Arial: '+fonts.join(', '):'';}else throw new Error('Escolha uma imagem, um compactado ZIP, RAR ou 7Z, ou um arquivo DWG, IFC, SKP, PDF, DOC, DOCX, TXT ou SVG.');applyBg('normal');$('filename').textContent=file.name;$('filemeta').textContent=(file.size/1024/1024).toFixed(2)+' MB â€¢ '+ext.toUpperCase();$('status').textContent=ext==='dwg'?(partial?'PrÃ©via parcial Â· alguns elementos nÃ£o sÃ£o suportados':'DWG local Â· cores e propriedades do desenho'):ARCHIVE_EXT.has(ext)?'Compactado Â· toque um item da lista para abrir':IMAGE_EXT.has(ext)?'Imagem aberta no dispositivo':(ext==='pdf'||ext==='doc'||ext==='docx'||ext==='txt')?'':'Arquivo aberto no dispositivo';notice('');try{if(save){const library=await import(asset('./local-library.js'));await library.saveFile(file);}}catch{notice('Arquivo aberto, mas nÃ£o foi possÃ­vel salvar na biblioteca. Verifique o espaÃ§o disponÃ­vel.',true);}return true;}catch(error){notice(error.message,true);return false;}finally{busy=false;$('open').disabled=false;$('badge').disabled=false;$('file').value='';}}

// --- line 661 ---
async function openPDF(file){if(!pdfViewer){const {PdfViewer}=await import(asset('./pdf-view.js'));pdfViewer=new PdfViewer($('pdf'),state=>{$('pdf-page').value=state.page;$('pdf-page').max=state.pages;$('pdf-total').textContent='/ '+state.pages;$('zoom').textContent=state.zoom+'%';updateSearchStatus();},error=>notice(error.message,true));}clear3d();setMode('pdf');$('pdf-results').textContent='';$('pdf-query').value='';await pdfViewer.open(file);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(mode==='pdf'&&pdfViewer?.page)await pdfViewer.fit();}

// --- line 662 ---
function goDocumentPage(value){if(mode==='word')wordViewer.go(value);else pdfViewer.go(value).catch(e=>notice(e.message,true));}

// --- line 663 ---
$('pdf-prev').onclick=()=>goDocumentPage((mode==='word'?wordViewer.current.pageNumber:pdfViewer.pageNumber)-1);$('pdf-next').onclick=()=>goDocumentPage((mode==='word'?wordViewer.current.pageNumber:pdfViewer.pageNumber)+1);$('pdf-page').onchange=e=>goDocumentPage(e.target.value);$('pdf-rotate').onclick=()=>pdfViewer.rotate().catch(e=>notice(e.message,true));

// --- line 665 ---
 const query=mode==='word'?wordViewer?.current?.searchQuery:pdfViewer?.searchQuery;

// --- line 666 ---
 const count=mode==='word'?wordViewer?.current?.matches?.length:pdfViewer?.searchMatches?.length;

// --- line 667 ---
 const index=mode==='word'?wordViewer?.current?.matchIndex:pdfViewer?.searchIndex;

// --- line 668 ---
 $('pdf-results').textContent=query?(count?`${(index??-1)+1} de ${count}`:(mode==='pdf'&&pdfViewer?.searchNoText?'PDF sem texto pesquisÃ¡vel':'NÃ£o encontrado')):'';

// --- line 669 ---
 $('pdf-match').disabled=!count;$('pdf-match-prev').disabled=!count;

// --- line 672 ---
$('pdf-search').onclick=async()=>{

// --- line 673 ---
 const query=$('pdf-query').value,request=++searchRequest,reader=mode==='word'?wordViewer:pdfViewer;

// --- line 674 ---
 $('pdf-results').textContent='Buscandoâ€¦';

// --- line 677 ---
$('pdf-query').onkeydown=e=>{if(e.key==='Enter')$('pdf-search').click();};

// --- line 678 ---
for(const [id,direction]of [['pdf-match',1],['pdf-match-prev',-1]])$(id).onclick=async()=>{try{await(mode==='word'?wordViewer:pdfViewer)?.nextMatch(direction);updateSearchStatus();}catch(e){notice(e.message,true);}};

// --- line 786 ---
 if(mode==='pdf')Object.assign(state,{page:pdfViewer.pageNumber,rotation:pdfViewer.rotation,scale:pdfViewer.scale,x:pdfViewer.x,y:pdfViewer.y,pdfWidth:$('pdf').clientWidth,pdfHeight:$('pdf').clientHeight});

// --- line 797 ---
 if(mode==='pdf'){pdfViewer.rotation=state.rotation;if(pdfViewer.pageNumber!==state.page)await pdfViewer.go(state.page);Object.assign(pdfViewer,{scale:state.scale,x:state.x+($('pdf').clientWidth-state.pdfWidth)/2,y:state.y+($('pdf').clientHeight-state.pdfHeight)/2});await pdfViewer.render();}

// --- line 858 ---
 const resource={mode,meta:$('filemeta').textContent,title:$('filemeta').title,status:$('status').textContent,view:$('viewname').textContent,badge:$('badge').dataset.mode,placeholder:$('pdf-query').placeholder};

// --- line 863 ---
 if(mode==='pdf')resource.pdf=pdfViewer.suspend();

// --- line 876 ---
 if(r.mode==='pdf'){pdfViewer.resume(r.pdf);}

// --- line 878 ---
 $('viewname').textContent=r.view;$('badge').dataset.mode=r.badge||'';$('pdf-query').placeholder=r.placeholder;

// --- line 881 ---
 $('filename').textContent=tab.file.name;$('filemeta').textContent=r.meta;$('filemeta').title=r.title;$('status').textContent=(r.mode==='pdf'||r.mode==='word')?'':r.status;$('pdf-query').value=r.mode==='word'?(r.word.searchQuery||''):r.mode==='pdf'?(r.pdf.searchQuery||''):'';updateSearchStatus();if(r.mode==='3d')publishFederation();notice('');return true;

// --- line 888 ---
 if(r.pdf?.loading&&r.pdf.loading!==pdfViewer?.loading)r.pdf.loading.destroy().catch(()=>{});

// --- line 924 ---
  if(mode==='pdf')await pdfViewer.rotate();

// --- line 943 ---
 clear3d();setMode('word');$('pdf-query').value='';$('pdf-results').textContent='';await wordViewer.open(file);

// --- line 944 ---
 if(/\.txt$/i.test(file.name)){$('viewname').textContent='TEXTO Â· TXT';$('badge').dataset.mode='TXT';$('pdf-query').placeholder='Buscar no texto';}

// --- line 997 ---
setTimeout(()=>{import(asset('./vendor/pdf/pdf.js')).then(lib=>{lib.GlobalWorkerOptions.workerSrc=asset('./vendor/pdf/pdf.worker.js');}).catch(()=>{});},500);

// --- line 1049 ---
 $('pdf-print-root')?.remove();

// --- line 1063 ---
 if(pdfPrintBusy)return;pdfPrintBusy=true;const printBtn=$('pdf-print');if(printBtn)printBtn.disabled=true;

// --- line 1085 ---
async function printPdf(){

// --- line 1092 ---
   const lib=pdfViewer?.lib||await import(asset('./vendor/pdf/pdf.js'));

// --- line 1093 ---
   lib.GlobalWorkerOptions.workerSrc=asset('./vendor/pdf/pdf.worker.js');

// --- line 1094 ---
   class BinaryDataFactory{async fetch({kind,filename}){const folder={cMapUrl:'cmaps',standardFontDataUrl:'standard_fonts',wasmUrl:'wasm'}[kind];if(!folder||filename.includes('..'))throw Error('Recurso PDF invÃ¡lido');const response=await fetch(asset('./vendor/pdf/'+folder+'/'+filename));if(!response.ok)throw Error('Recurso PDF ausente: '+filename);return new Uint8Array(await response.arrayBuffer());}}

// --- line 1096 ---
   const loading=lib.getDocument({data:bytes,useWorkerFetch:false,BinaryDataFactory,isEvalSupported:false,useSystemFonts:false,cMapPacked:true,disableRange:true,disableStream:true,disableAutoFetch:true,enableXfa:false,verbosity:0});

// --- line 1098 ---
   const root=document.createElement('div');root.id='pdf-print-root';

// --- line 1102 ---
    const rotation=pdfViewer?.rotation||0;

// --- line 1127 ---
   const root=document.createElement('div');root.id='pdf-print-root';

// --- line 1132 ---
     '#pdf-print-root .word-print-page, #pdf-print-root .word-print-page *{-webkit-print-color-adjust:exact;print-color-adjust:exact}';

// --- line 1173 ---
async function shareDocument(){

// --- line 1192 ---
$('pdf-print').onclick=()=>{(mode==='word'?printWord:printPdf)().catch(e=>notice(e.message,true));};

// --- line 1193 ---
$('pdf-share').onclick=()=>{shareDocument().catch(()=>{});};

// --- line 1201 ---
 function closeCapture(){if(field)field.hidden=true;pendingText=null;selected=-1;grab=null;if(frame)frame.hidden=true;select.hidden=true;editor.hidden=true;rect.hidden=true;strokes=[];draft=null;start=null;button?.setAttribute('aria-pressed','false');$('pdf-capture')?.setAttribute('aria-pressed','false');setCaptureChrome(false);showCaptureHint(true);}

// --- line 1360 ---
 function startCapture(){if(!select.hidden||!editor.hidden){closeCapture();return;}if(mode!=='3d'&&mode!=='pdf'&&mode!=='word'){notice('Abra um IFC, um SKP, um PDF ou um Word para capturar.',true);return;}editor.hidden=true;rect.hidden=true;showCaptureHint(true);select.hidden=false;button?.setAttribute('aria-pressed',String(mode==='3d'));$('pdf-capture')?.setAttribute('aria-pressed',String(mode==='pdf'||mode==='word'));setCaptureChrome(true);}button?.addEventListener('click',startCapture);$('pdf-capture')?.addEventListener('click',startCapture);

