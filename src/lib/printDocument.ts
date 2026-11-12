import {company} from '@/data/mockData';
import {amountInWords} from '@/lib/amountInWords';
import {formatDate,formatPKR} from '@/lib/format';

export interface PrintLine {description:string;code?:string;qty?:number;rate?:number;discountPct?:number;amount:number}
export interface PrintDoc {
 title:string; number:string; date:string; partyLabel:string; partyName:string; partyLines:string[];
 info:[string,string][]; lines:PrintLine[]; showQty:boolean;
 totals:[string,number][]; grandTotal:number; remarks?:string; status?:string; signatures:string[];
}
const esc=(s:unknown)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] as string));
const css=`@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Montserrat,Arial,sans-serif;color:#0B2A5C;margin:0;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.head{display:flex;justify-content:space-between;align-items:flex-end;background:linear-gradient(90deg,#0B2A5C,#1D5FD1);color:#fff;padding:18px 22px;border-radius:8px}
.head h1{margin:0;font-size:22px;letter-spacing:.5px}.head p{margin:2px 0;font-size:11px;opacity:.9}.doc{text-align:right}.doc h2{margin:0;font-size:18px;text-transform:uppercase;letter-spacing:2px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}.box{border:1px solid #c9d8f2;border-radius:8px;padding:10px 12px}.box h3{margin:0 0 6px;font-size:10px;text-transform:uppercase;color:#1D5FD1;letter-spacing:1px}.box p{margin:2px 0}
.kv{display:flex;justify-content:space-between;padding:2px 0}.kv b{color:#0B2A5C}
table{width:100%;border-collapse:collapse}th{background:#1D5FD1;color:#fff;font-size:11px;text-align:left;padding:7px 8px}td{padding:7px 8px;border-bottom:1px solid #e3ebf8}tr:nth-child(even) td{background:#f4f8fe}.r{text-align:right}
.tot{margin-left:auto;width:300px;margin-top:10px}.tot .kv{padding:4px 8px}.grand{background:#0B2A5C;color:#fff;border-radius:6px;font-size:14px;font-weight:700}
.words{margin-top:12px;border-left:4px solid #1D5FD1;background:#eef4fd;padding:8px 12px;font-weight:600}
.remarks{margin-top:10px}.sig{display:flex;justify-content:space-between;gap:24px;margin-top:60px}.sig div{flex:1;border-top:1px solid #0B2A5C;text-align:center;padding-top:6px;font-size:11px}
.foot{margin-top:24px;text-align:center;font-size:10px;color:#5a6f94}.stamp{display:inline-block;border:2px solid #1D5FD1;color:#1D5FD1;padding:2px 10px;border-radius:4px;font-weight:700;margin-top:6px}`;
function headerHtml(title:string,extra:string){return `<div class="head"><div><h1>${esc(company.name)}</h1><p>${esc(company.address)}</p><p>Phone ${esc(company.phone)} · ${esc(company.email)} · NTN ${esc(company.ntn)}</p></div><div class="doc"><h2>${esc(title)}</h2>${extra}</div></div>`;}
export function documentHtml(d:PrintDoc){
 const rows=d.lines.map((l,i)=>`<tr><td>${i+1}</td><td>${esc(l.description)}${l.code?`<br><small>${esc(l.code)}</small>`:''}</td>${d.showQty?`<td class="r">${l.qty??''}</td><td class="r">${formatPKR(l.rate??0)}</td><td class="r">${l.discountPct??0}%</td>`:''}<td class="r">${formatPKR(l.amount)}</td></tr>`).join('');
 return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.title)} ${esc(d.number)}</title><style>${css}</style></head><body>
${headerHtml(d.title,`<p># ${esc(d.number)}</p><p>${esc(formatDate(d.date))}</p>${d.status?`<span class="stamp" style="color:#fff;border-color:#fff">${esc(d.status)}</span>`:''}`)}
<div class="grid"><div class="box"><h3>${esc(d.partyLabel)}</h3><p><b>${esc(d.partyName)}</b></p>${d.partyLines.filter(Boolean).map(x=>`<p>${esc(x)}</p>`).join('')}</div>
<div class="box"><h3>Document details</h3>${d.info.map(([k,v])=>`<div class="kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div></div>
<table><thead><tr><th>#</th><th>Description</th>${d.showQty?'<th class="r">Qty</th><th class="r">Rate</th><th class="r">Disc.</th>':''}<th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot">${d.totals.map(([k,v])=>`<div class="kv"><span>${esc(k)}</span><b>${formatPKR(v)}</b></div>`).join('')}<div class="kv grand"><span>Total</span><span>${formatPKR(d.grandTotal)}</span></div></div>
<div class="words">Amount in words: ${esc(amountInWords(d.grandTotal))}</div>
${d.remarks?`<div class="remarks box"><h3>Remarks</h3><p>${esc(d.remarks)}</p></div>`:''}
<div class="sig">${d.signatures.map(s=>`<div>${esc(s)}</div>`).join('')}</div>
<div class="foot">${esc(company.tagline)} · This is a computer-generated document.</div></body></html>`;
}
export function reportHtml(title:string,period:string,headers:string[],rows:string[][],numeric:boolean[]){
 return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${headerHtml(title,`<p>${esc(period)}</p>`)}<br><table><thead><tr>${headers.map((h,i)=>`<th class="${numeric[i]?'r':''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td class="${numeric[i]?'r':''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table><div class="foot">Generated ${esc(new Date().toLocaleString())} · ${esc(company.name)}</div></body></html>`;
}
/** Opens a print-ready window. Call directly from a click handler (popup blockers). */
export function openPrint(html:string){
 const w=window.open('','_blank');if(!w)return false;
 w.document.open();w.document.write(html);w.document.close();
 let done=false;const go=()=>{if(done)return;done=true;try{w.focus();w.print();}catch{/* window closed */}};w.onload=go;setTimeout(go,600);
 return true;
}
