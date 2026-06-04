const fs=require('fs');
// --- port pure functions, ignoreWs=true ---
const IGNORE_WS=true;
function norm(line){return IGNORE_WS?line.trim():line.replace(/\s+$/,"");}
function splitLines(css){return (css||"").replace(/\r\n/g,"\n").split("\n");}
function lcsDiff(aLines,bLines){
  const a=aLines.map(norm),b=bLines.map(norm);
  const aIdx=[],bIdx=[];
  for(let i=0;i<a.length;i++){if(!(IGNORE_WS&&a[i]==="")) aIdx.push(i);}
  for(let j=0;j<b.length;j++){if(!(IGNORE_WS&&b[j]==="")) bIdx.push(j);}
  const A=aIdx.map(i=>a[i]),B=bIdx.map(j=>b[j]);
  const n=A.length,m=B.length;
  const dp=Array.from({length:n+1},()=>new Int32Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)
    dp[i][j]=(A[i]===B[j])?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const ops=[];let i=0,j=0;
  while(i<n&&j<m){
    if(A[i]===B[j]){ops.push({t:"eq",ai:aIdx[i],bi:bIdx[j]});i++;j++;}
    else if(dp[i+1][j]>=dp[i][j+1]){ops.push({t:"del",ai:aIdx[i]});i++;}
    else{ops.push({t:"ins",bi:bIdx[j]});j++;}
  }
  while(i<n){ops.push({t:"del",ai:aIdx[i]});i++;}
  while(j<m){ops.push({t:"ins",bi:bIdx[j]});j++;}
  return ops;
}
function buildRows(aLines,bLines,ops){
  const rows=[];let k=0;
  while(k<ops.length){
    const op=ops[k];
    if(op.t==="eq"){rows.push({kind:"eq",l:aLines[op.ai],r:bLines[op.bi]});k++;}
    else{
      const dels=[],ins=[];
      while(k<ops.length&&ops[k].t!=="eq"){if(ops[k].t==="del")dels.push(ops[k].ai);else ins.push(ops[k].bi);k++;}
      const max=Math.max(dels.length,ins.length);
      for(let x=0;x<max;x++){
        const d=x<dels.length?dels[x]:null,ip=x<ins.length?ins[x]:null;
        if(d!=null&&ip!=null)rows.push({kind:"chg",l:aLines[d],r:bLines[ip]});
        else if(d!=null)rows.push({kind:"del",l:aLines[d],r:null});
        else rows.push({kind:"add",l:null,r:bLines[ip]});
      }
    }
  }
  return rows;
}
function parseStyles(json){
  const data=JSON.parse(json);const styles=data.styles;const map=new Map();
  for(const k of Object.keys(styles)){const s=styles[k];if(!s||!s.selector)continue;
    if(map.has(s.selector))map.get(s.selector).css+="\n"+(s.css||"");
    else map.set(s.selector,{selector:s.selector,type:s.type||"",css:s.css||""});}
  return{version:String(data.version),map};
}

const raw=fs.readFileSync('../uploads/Etch Mega Menu Pro + Header Builder v1.0.8.json','utf8');
const NEW=parseStyles(raw);

// Build a "site" version: modify some values, drop one selector, add one custom
const obj=JSON.parse(raw);
let modifiedSel=null, droppedSel=null;
for(const k of Object.keys(obj.styles)){
  const s=obj.styles[k];
  if(s.selector===".dwc-header-vars"){ s.css=s.css.replace('--header-min-height: 60px;','--header-min-height: 80px;').replace('--dropdown-content-width: 1200px;','--dropdown-content-width: 1400px;'); modifiedSel=s.selector;}
}
// drop the LAST class entry to simulate "only on website missing" -> actually removed from new = present only on site? We drop from SITE so it's "only new". Instead drop one to test 'added'(only new): remove from site.
const keys=Object.keys(obj.styles);
const dropKey=keys.find(k=>obj.styles[k].selector==='.dwc-toggle-div');
droppedSel=obj.styles[dropKey].selector; delete obj.styles[dropKey];
// add a custom selector only on site
obj.styles['zzcustom']={type:'class',selector:'.my-custom-tweak',collection:'default',css:'color: red;',readonly:false};

const SITE=parseStyles(JSON.stringify(obj));

// compute compare
function norm2(css){let l=splitLines(css).map(x=>x.trim()).filter(x=>x!=='');return l.join("\n");}
const all=new Set([...NEW.map.keys(),...SITE.map.keys()]);
const c={changed:0,added:0,removed:0,same:0};const changedList=[],addedList=[],removedList=[];
for(const sel of all){const n=NEW.map.get(sel),s=SITE.map.get(sel);let st;
  if(n&&!s){st='added';addedList.push(sel);} else if(!n&&s){st='removed';removedList.push(sel);}
  else st=norm2(n.css)===norm2(s.css)?'same':'changed';
  if(st==='changed')changedList.push(sel);
  c[st]++;}
console.log('STATUS COUNTS:',c);
console.log('changed:',changedList);
console.log('added (only new):',addedList);
console.log('removed (only site):',removedList);

// diff the modified selector
const n=NEW.map.get('.dwc-header-vars'),s=SITE.map.get('.dwc-header-vars');
const rows=buildRows(splitLines(s.css),splitLines(n.css),lcsDiff(splitLines(s.css),splitLines(n.css)));
const chg=rows.filter(r=>r.kind==='chg');
console.log('\nCHANGED ROWS for .dwc-header-vars (',chg.length,'):');
chg.forEach(r=>console.log('  SITE:',r.l.trim(),'  =>  NEW:',r.r.trim()));
const adds=rows.filter(r=>r.kind==='add').length, dels=rows.filter(r=>r.kind==='del').length;
console.log('add rows:',adds,'del rows:',dels,'eq rows:',rows.filter(r=>r.kind==='eq').length);
