function asset(path){return globalThis.PrumoAssets?.[path]||new URL(path,document.baseURI).href;}
export class PdfViewer {
  constructor(container,onChange,onError){
    this.container=container;this.onChange=onChange;this.onError=onError;this.canvas=container.querySelector('canvas');this.pointers=new Map();this.rotation=0;this.scale=1;this.x=0;this.y=0;
    container.addEventListener('wheel',e=>{e.preventDefault();const dy=e.deltaMode===1?e.deltaY*16:e.deltaMode===2?e.deltaY*this.container.clientHeight:e.deltaY;const r=container.getBoundingClientRect();this.zoom(Math.exp(-dy*.0022),e.clientX-r.left,e.clientY-r.top);},{passive:false});
    container.addEventListener('pointerdown',e=>{this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});this.cancelRender();try{container.setPointerCapture(e.pointerId);}catch{}});
    container.addEventListener('pointermove',e=>{if(!this.pointers.has(e.pointerId))return;const before=[...this.pointers.values()],old=this.pointers.get(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const after=[...this.pointers.values()];if(before.length===1){this.fitted=false;this.x+=e.clientX-old.x;this.y+=e.clientY-old.y;}else if(before.length===2){const dist=p=>Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),r=container.getBoundingClientRect();this.zoom(dist(after)/Math.max(1,dist(before)),(before[0].x+before[1].x)/2-r.left,(before[0].y+before[1].y)/2-r.top);this.x+=(after[0].x+after[1].x-before[0].x-before[1].x)/2;this.y+=(after[0].y+after[1].y-before[0].y-before[1].y)/2;}this.preview();});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])container.addEventListener(event,e=>{if(this.pointers.delete(e.pointerId)&&!this.pointers.size)this.scheduleRefinement();});
  }
  async open(file){
    await this.close();
    const [lib,bytes]=await Promise.all([this.lib?Promise.resolve(this.lib):import(asset('./vendor/pdf/pdf.js')),file.arrayBuffer()]);this.lib=lib;lib.GlobalWorkerOptions.workerSrc=asset('./vendor/pdf/pdf.worker.js');
    class BinaryDataFactory {async fetch({kind,filename}){const folder={cMapUrl:'cmaps',standardFontDataUrl:'standard_fonts',wasmUrl:'wasm'}[kind];if(!folder||filename.includes('..'))throw Error('Recurso PDF inválido');const response=await fetch(asset('./vendor/pdf/'+folder+'/'+filename));if(!response.ok)throw Error('Recurso PDF ausente: '+filename);return new Uint8Array(await response.arrayBuffer());}}
    this.loading=lib.getDocument({data:bytes,useWorkerFetch:false,BinaryDataFactory,isEvalSupported:false,useSystemFonts:false,cMapPacked:true,disableRange:true,disableStream:true,disableAutoFetch:true,enableXfa:false,verbosity:0});
    this.loading.onPassword=(update,reason)=>{const password=window.prompt(reason===2?'Senha incorreta. Digite novamente:':'Senha deste PDF:');if(password===null)this.loading.destroy();else update(password);};
    this.doc=await this.loading.promise;this.pageNumber=1;this.rotation=0;this.searchPages=[];this.searchMatches=[];this.searchIndex=-1;this.searchQuery='';await this.go(1);
  }
  suspend(){
    this.stopPreview();clearTimeout(this.timer);this.timer=0;this.generation=(this.generation||0)+1;this.pageRequest=(this.pageRequest||0)+1;this.searchToken=(this.searchToken||0)+1;this.task?.cancel();this.task=null;
    const state={};for(const key of ['loading','doc','page','pageNumber','rotation','scale','x','y','fitted','searchPages','searchIndex','searchMatches','searchQuery','searchNoText','rendered'])state[key]=this[key];
    try{
      if(this.rendered&&this.canvas.width>1){
        const snap=document.createElement('canvas');snap.width=this.canvas.width;snap.height=this.canvas.height;
        snap.getContext('2d',{alpha:false}).drawImage(this.canvas,0,0);
        state.snapshot=snap;state.snapshotCssW=this.canvas.style.width;state.snapshotCssH=this.canvas.style.height;
      }
    }catch{}
    this.loading=null;this.doc=null;this.page=null;this.rendered=null;this.pointers.clear();return state;
  }
  resume(state){
    const snapshot=state.snapshot,cssW=state.snapshotCssW,cssH=state.snapshotCssH;
    delete state.snapshot;delete state.snapshotCssW;delete state.snapshotCssH;
    Object.assign(this,state);
    if(snapshot&&this.rendered){
      const view=this.canvas;
      if(view.width!==snapshot.width||view.height!==snapshot.height){view.width=snapshot.width;view.height=snapshot.height;}
      view.getContext('2d',{alpha:false}).drawImage(snapshot,0,0);
      view.style.width=cssW;view.style.height=cssH;
      this.applyPreview();
    }else this.canvas.style.transform='';
    this.changed();
  }
  async close(){this.stopPreview();this.pointers.clear();clearTimeout(this.timer);this.timer=0;this.generation=(this.generation||0)+1;this.task?.cancel();this.rendered=null;this.changeKey='';this.canvas.style.transform='';if(this.buffer){this.buffer.width=1;this.buffer.height=1;}const loading=this.loading;this.loading=null;this.doc=null;this.page=null;if(loading)await loading.destroy();}
  async go(n){if(!this.doc)return;const doc=this.doc;const number=Math.max(1,Math.min(doc.numPages,Math.floor(Number(n)||1)));const request=this.pageRequest=(this.pageRequest||0)+1;this.pageNumber=number;const page=await doc.getPage(number);if(doc!==this.doc||request!==this.pageRequest)return;this.page=page;await this.fit();}
  pageSize(){if(!this.page)return null;return this.page.getViewport({scale:1,rotation:(this.page.rotate+this.rotation)%360});}
  center(){const v=this.pageSize(),w=this.container.clientWidth,h=this.container.clientHeight;if(!v||w<2||h<2)return false;this.x=(w-v.width*this.scale)/2;this.y=(h-v.height*this.scale)/2;return true;}
  async fit(){
    if(!this.page)return;
    const w=this.container.clientWidth,h=this.container.clientHeight;
    if(w<2||h<2){this.fitPending=true;requestAnimationFrame(()=>{this.fitPending=false;this.fit().catch(()=>{});});return;}
    const v=this.pageSize();if(!v)return;
    this.scale=Math.max(.05,Math.min((w-24)/v.width,(h-24)/v.height));
    this.center();this.fitted=true;await this.render();
  }
  zoom(factor,cx=this.container.clientWidth/2,cy=this.container.clientHeight/2,keepCentered=false){
    if(!this.page||!Number.isFinite(factor))return;
    const next=Math.max(.05,Math.min(30,this.scale*factor));
    this.x=cx-(cx-this.x)*next/this.scale;this.y=cy-(cy-this.y)*next/this.scale;this.scale=next;
    if(keepCentered)this.center();
    this.fitted=false;this.preview();
  }
  zoomCentered(factor){this.zoom(factor,this.container.clientWidth/2,this.container.clientHeight/2,true);}
  stopPreview(){if(this.previewFrame)cancelAnimationFrame(this.previewFrame);this.previewFrame=0;}
  applyPreview(){
    if(!this.rendered)return;
    const base=this.rendered,ratio=this.scale/base.scale;
    this.canvas.style.transformOrigin='0 0';
    this.canvas.style.transform=`translate3d(${this.x-base.x*ratio}px,${this.y-base.y*ratio}px,0) scale(${ratio})`;
  }
  viewCovered(){
    const base=this.rendered;if(!base||base.page!==this.page)return false;
    if(Math.abs(base.scale-this.scale)>1e-9)return false;
    if(base.full)return true;
    const width=this.container.clientWidth,height=this.container.clientHeight;
    const left=base.x-this.x,top=base.y-this.y;
    return left>=0&&top>=0&&left+width<=base.bw&&top+height<=base.bh;
  }
  scheduleRefinement(){
    clearTimeout(this.timer);this.timer=0;
    if(this.pointers.size)return;
    if(this.viewCovered()&&!(this.searchMatches||[]).some(m=>m.page===this.pageNumber)){this.applyPreview();this.changed();return;}
    this.timer=setTimeout(()=>{this.timer=0;this.render().catch(this.onError);},36);
  }
  cancelRender(){clearTimeout(this.timer);this.timer=0;if(this.task){this.generation=(this.generation||0)+1;this.task.cancel();this.task=null;}}
  preview(){
    // Gesture only moves the bitmap already on the GPU. PDF operators stay idle until the finger stops.
    this.cancelRender();
    if(!this.previewFrame)this.previewFrame=requestAnimationFrame(()=>{this.previewFrame=0;this.applyPreview();this.changed();});
    this.scheduleRefinement();
  }
  changed(){
    const zoom=Math.round(this.scale*100),key=this.pageNumber+'|'+zoom+'|'+(this.searchIndex??-1)+'|'+(this.searchMatches?.length||0)+'|'+(this.searchQuery||'');
    if(key===this.changeKey)return;this.changeKey=key;
    this.onChange({page:this.pageNumber,pages:this.doc?.numPages||0,zoom,matches:this.searchMatches?.length||0,match:(this.searchIndex??-1)+1,query:this.searchQuery||''});
  }
  async render(){
    if(!this.page)return;if(this.pointers.size&&this.rendered){this.scheduleRefinement();return;}
    if(this.viewCovered()&&!(this.searchMatches||[]).some(m=>m.page===this.pageNumber)){this.applyPreview();this.changed();return;}
    clearTimeout(this.timer);this.timer=0;const gen=this.generation=(this.generation||0)+1;this.task?.cancel();
    const first=!this.rendered||this.rendered.page!==this.page;
    if(first){
      await this.paint(gen,false);
      if(gen===this.generation&&this.page)await this.paint(gen,true);
    }else await this.paint(gen,true);
  }
  paintBudget(sharp){
    const coarse=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>1;
    return sharp?(coarse?3600000:5600000):(coarse?1100000:1800000);
  }
  async paint(gen,sharp){
    const width=this.container.clientWidth,height=this.container.clientHeight;if(!width||!height||!this.page)return;
    const rotation=(this.page.rotate+this.rotation)%360;
    const unit=this.page.getViewport({scale:1,rotation});
    const pageW=unit.width*this.scale,pageH=unit.height*this.scale;
    const budget=this.paintBudget(sharp);
    let dpr=Math.min(devicePixelRatio||1,sharp?2.5:1.25);
    let full=pageW*pageH*(dpr*dpr)<=budget;
    if(full&&pageW*pageH*(dpr*dpr)>budget)dpr=Math.sqrt(budget/Math.max(1,pageW*pageH));
    let bufferWidth,bufferHeight,ox,oy;
    if(full){
      bufferWidth=Math.max(1,pageW);bufferHeight=Math.max(1,pageH);ox=0;oy=0;
    }else{
      // Large overscan so pan rarely hits empty edges before refinement.
      let pad=sharp?1.15:0.55;
      for(let i=0;i<6;i++){
        const padX=Math.ceil(width*pad),padY=Math.ceil(height*pad);
        bufferWidth=width+2*padX;bufferHeight=height+2*padY;
        if(bufferWidth*bufferHeight*(dpr*dpr)<=budget)break;
        if(dpr>1.1){dpr=Math.max(1,Math.sqrt(budget/(bufferWidth*bufferHeight)));break;}
        pad*=0.72;
      }
      const padX=Math.ceil((bufferWidth-width)/2),padY=Math.ceil((bufferHeight-height)/2);
      ox=this.x+padX;oy=this.y+padY;
      // Prefer covering the whole page when it is only a little larger than the tile.
      if(pageW<=bufferWidth*1.05&&pageH<=bufferHeight*1.05&&pageW*pageH*(dpr*dpr)<=budget){
        full=true;bufferWidth=Math.max(1,pageW);bufferHeight=Math.max(1,pageH);ox=0;oy=0;
      }
    }
    if(bufferWidth*bufferHeight*(dpr*dpr)>budget)dpr=Math.sqrt(budget/Math.max(1,bufferWidth*bufferHeight));
    const bw=Math.max(1,Math.ceil(bufferWidth*dpr)),bh=Math.max(1,Math.ceil(bufferHeight*dpr));
    if(!this.buffer)this.buffer=document.createElement('canvas');
    const buffer=this.buffer;if(buffer.width!==bw||buffer.height!==bh){buffer.width=bw;buffer.height=bh;}
    const ctx=buffer.getContext('2d',{alpha:false});ctx.setTransform(1,0,0,1,0,0);
    const state={x:ox,y:oy,scale:this.scale,page:this.page,full,bw:bufferWidth,bh:bufferHeight};
    const vp=this.page.getViewport({scale:state.scale,rotation});
    ctx.fillStyle='#e9eef5';ctx.fillRect(0,0,bw,bh);ctx.fillStyle='white';ctx.fillRect(ox*dpr,oy*dpr,vp.width*dpr,vp.height*dpr);
    const task=this.task=this.page.render({canvas:buffer,canvasContext:ctx,viewport:vp,transform:[dpr,0,0,dpr,ox*dpr,oy*dpr],background:'rgba(0,0,0,0)'});
    try{
      await task.promise;if(gen!==this.generation)return;
      this.drawSearchHighlights(ctx,vp,state,dpr);
      const view=this.canvas;if(view.width!==bw||view.height!==bh){view.width=bw;view.height=bh;}
      view.getContext('2d',{alpha:false}).drawImage(buffer,0,0);
      view.style.width=bufferWidth+'px';view.style.height=bufferHeight+'px';
      this.rendered=state;this.applyPreview();this.changed();
    }catch(e){if(e.name!=='RenderingCancelledException')throw e;}
    finally{if(this.task===task)this.task=null;}
  }
  async rotate(){this.rotation=(this.rotation+90)%360;await this.fit();}
  drawSearchHighlights(ctx,vp,state,dpr){
    for(const [index,match] of (this.searchMatches||[]).entries()){
      if(match.page!==this.pageNumber)continue;
      ctx.save();ctx.fillStyle=index===this.searchIndex?'rgba(255,153,0,.45)':'rgba(255,224,0,.3)';ctx.strokeStyle='#b65300';ctx.lineWidth=1.5*dpr;
      for(const quad of match.quads){ctx.beginPath();quad.forEach((p,i)=>{const [x,y]=vp.convertToViewportPoint(...p);if(i)ctx.lineTo((state.x+x)*dpr,(state.y+y)*dpr);else ctx.moveTo((state.x+x)*dpr,(state.y+y)*dpr);});ctx.closePath();ctx.fill();if(index===this.searchIndex)ctx.stroke();}ctx.restore();
    }
  }
  async search(query){
    if(!this.doc)return[];const doc=this.doc,token=this.searchToken=(this.searchToken||0)+1,q=query.trim().toLocaleLowerCase();
    this.searchQuery=query.trim();this.searchMatches=[];this.searchIndex=-1;
    if(!q){await this.render();return[];}
    const matches=[];let hasText=false;
    for(let n=1;n<=doc.numPages;n++){
      const page=await doc.getPage(n),text=await page.getTextContent();
      if(token!==this.searchToken||doc!==this.doc)return[];
      let all='';const spans=[];
      for(const item of text.items){if(!item.str)continue;spans.push({start:all.length,end:all.length+item.str.length,item});all+=item.str+(item.hasEOL?'\n':'');}
      hasText ||= !!all.trim();const lower=all.toLocaleLowerCase();let at=0;
      while((at=lower.indexOf(q,at))>=0){
        const end=at+q.length,quads=[];
        for(const s of spans){if(s.end<=at||s.start>=end)continue;const t=s.item.transform,[a,b,c,d,e,f]=t,len=s.item.str.length,unit=Math.hypot(a,b)||1;
          const lo=Math.max(0,at-s.start)/len,hi=Math.min(len,end-s.start)/len,w=s.item.width;
          const point=(fraction,h)=>[e+a/unit*w*fraction+c*h,f+b/unit*w*fraction+d*h];
          const ascent=text.styles[s.item.fontName]?.ascent??.8;
          quads.push([point(lo,ascent-1),point(hi,ascent-1),point(hi,ascent),point(lo,ascent)]);
        }
        if(quads.length)matches.push({page:n,quads});at=end;
      }
      if(n%4===0)await new Promise(requestAnimationFrame);
    }
    if(token!==this.searchToken||doc!==this.doc)return[];
    this.searchNoText=!hasText;this.searchMatches=matches;this.searchPages=[...new Set(matches.map(m=>m.page))];
    if(matches.length)await this.focusMatch(0);else await this.render();return matches;
  }
  async focusMatch(index){
    const match=this.searchMatches?.[index];if(!match||!this.doc)return;this.searchIndex=index;
    const doc=this.doc,page=await doc.getPage(match.page);if(doc!==this.doc)return;this.page=page;this.pageNumber=match.page;
    const vp=page.getViewport({scale:1,rotation:(page.rotate+this.rotation)%360}),points=match.quads.flat().map(p=>vp.convertToViewportPoint(...p));
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2;
    const h=Math.max(1,Math.max(...ys)-Math.min(...ys));this.scale=Math.max(this.scale,Math.min(3,24/h));
    this.x=this.container.clientWidth/2-x*this.scale;this.y=this.container.clientHeight/2-y*this.scale;await this.render();
  }
  async nextMatch(direction=1){if(this.searchMatches?.length)await this.focusMatch((this.searchIndex+direction+this.searchMatches.length)%this.searchMatches.length);}
}
