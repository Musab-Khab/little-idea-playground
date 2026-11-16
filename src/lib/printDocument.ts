import {company} from '@/data/mockData';
import {amountInWords} from '@/lib/amountInWords';
import {formatDate,formatPKR} from '@/lib/format';
import mfahhLogo from '@/assets/mfahh-logo.png.asset.json';
import turnkeyLogo from '@/assets/turnkey-logo.png.asset.json';

export interface PrintLine {description:string;code?:string;qty?:number;rate?:number;discountPct?:number;amount:number}
export interface PrintDoc {
 title:string; number:string; date:string; partyLabel:string; partyName:string; partyLines:string[];
 info:[string,string][]; lines:PrintLine[]; showQty:boolean;
 totals:[string,number][]; grandTotal:number; remarks?:string; status?:string; signatures:string[]; voucher?:boolean;
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
 if(d.voucher)return voucherHtml(d);
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
 if(title==='Receipts Report')return receivingReportHtml(period,headers,rows,numeric);
 return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${headerHtml(title,`<p>${esc(period)}</p>`)}<br><table><thead><tr>${headers.map((h,i)=>`<th class="${numeric[i]?'r':''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td class="${numeric[i]?'r':''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table><div class="foot">Generated ${esc(new Date().toLocaleString())} · ${esc(company.name)}</div></body></html>`;
}
/** Opens a print-ready window. Call directly from a click handler (popup blockers). */
export function openPrint(html:string){
 const w=window.open('','_blank');if(!w)return false;
  w.document.open();w.document.write(html);w.document.close();
  let done=false;const go=async()=>{if(done)return;done=true;await Promise.all(Array.from(w.document.images).map(img=>img.decode().catch(()=>{})));await w.document.fonts.ready;try{w.focus();w.print();}catch{/* window closed */}};w.onload=()=>void go();setTimeout(()=>void go(),600);
 return true;
}

const voucherCss=`@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{--ink:#073a70;--blue:#1684d3;--pale:#e7f2ff;--paper:#fff;font-family:Arial,sans-serif;color:var(--ink);margin:0;background:var(--paper);-webkit-print-color-adjust:exact;print-color-adjust:exact}.voucher{position:relative;min-height:178mm;padding:7mm 4mm 5mm;border-bottom:3px solid var(--blue);overflow:hidden}.brands{display:flex;justify-content:space-between;align-items:center;height:22mm;margin-bottom:5mm}.brands img:first-child{width:73mm;height:auto}.brands img:last-child{width:63mm;height:auto}.title{display:flex;align-items:center;gap:4mm;margin-bottom:2mm}.title:before,.title:after{content:'';height:1px;flex:1;background:var(--blue)}h1{font-size:25px;margin:0;padding:2mm 25mm;border:1px solid var(--blue);border-radius:30px;background:var(--pale);text-align:center}.details{display:grid;grid-template-columns:1fr 1fr;gap:2mm 12mm;border:1px solid var(--blue);border-radius:6px;padding:2mm 4mm}.field{display:grid;grid-template-columns:35mm 1fr;align-items:center;gap:2mm;font-size:12px}.field span{padding:1.5mm 2mm;border:1px solid var(--blue);border-radius:3px;min-height:7mm;background:var(--pale);color:var(--ink);overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:5mm;font-size:12px}th{background:var(--ink);color:var(--paper);height:9mm}td{border:1px solid var(--blue);height:8mm;padding:1.5mm 3mm;color:var(--ink);overflow-wrap:anywhere}th:first-child{width:7%}th:last-child{width:22%}.number{text-align:center}.amount{text-align:right}.summary{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-top:4mm;font-size:12px}.remarks{border:1px solid var(--blue);border-radius:5px;background:var(--pale);padding:2mm 4mm;min-height:19mm}.remarks p{margin:2mm 0;overflow-wrap:anywhere}.totals{border:1px solid var(--blue);border-radius:5px;overflow:hidden}.total-row{display:grid;grid-template-columns:47% 53%;min-height:9mm}.total-row+.total-row{border-top:1px solid var(--blue)}.total-row b{background:var(--ink);color:var(--paper);padding:2mm 3mm}.total-row span{padding:2mm 3mm;background:var(--pale);overflow-wrap:anywhere}.total-row:first-child span{font-weight:bold;text-align:right;font-size:15px}.signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm;margin-top:5mm}.signature{border:1px solid var(--blue);border-radius:5px;height:20mm;padding:2mm 4mm;text-align:center;font-size:12px;font-weight:bold;display:flex;flex-direction:column;justify-content:space-between}.signature span{border-bottom:1px solid var(--ink);min-height:6mm;font-size:10px;font-weight:normal}.status{font-size:10px;text-align:right;margin-top:2mm}.voucher:before,.voucher:after{content:'';position:absolute;width:55mm;height:12mm;border-top:5mm solid var(--blue);border-radius:50%;pointer-events:none}.voucher:before{top:-5mm;left:-22mm;transform:rotate(-35deg)}.voucher:after{bottom:-8mm;right:-25mm;transform:rotate(-25deg)}tr,.summary,.signatures,.details{break-inside:avoid}`;

export function voucherHtml(d:PrintDoc){
 const info=(key:string)=>d.info.find(([k])=>k===key)?.[1]??'';
 const receipt=d.title==='Receipt Voucher';
 const fields=[['Voucher No:',d.number],[receipt?'Received From:':'Paid To:',d.partyName],['Date:',formatDate(d.date)],['Department:',info('Department')||'—'],[receipt?'Reference:':'Expense Head:',info(receipt?'Reference':'Expense head')||info('Reference')||'—'],['Payment Method:',info('Paid via')||'Cash']];
 const lines=[...d.lines];while(lines.length<5)lines.push({description:'',amount:0});
 const amount=(v:number)=>v.toLocaleString('en-PK',{minimumFractionDigits:2,maximumFractionDigits:2});
 return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.title)} ${esc(d.number)}</title><style>${voucherCss}</style></head><body><main class="voucher"><div class="brands"><img src="${esc(mfahhLogo.url)}" alt="MFAHH"><img src="${esc(turnkeyLogo.url)}" alt="Turnkey Publishers"></div><div class="title"><h1>${esc(d.title.toUpperCase())}</h1></div><div class="details">${fields.map(([k,v])=>`<div class="field"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div><table><thead><tr><th>#</th><th>Description</th><th>Amount (PKR)</th></tr></thead><tbody>${lines.map((l,i)=>`<tr><td class="number">${i+1}</td><td>${esc(l.description)}</td><td class="amount">${i<d.lines.length?esc(amount(l.amount)):''}</td></tr>`).join('')}</tbody></table><div class="summary"><div class="remarks"><b>Remarks:</b><p>${esc(d.remarks||'—')}</p></div><div class="totals"><div class="total-row"><b>Total Amount:</b><span>${esc(amount(d.grandTotal))}</span></div><div class="total-row"><b>Amount in Words:</b><span>${esc(amountInWords(d.grandTotal))}</span></div></div></div><div class="signatures">${['Prepared By','Checked By','Approved By','Received By'].map((s,i)=>`<div class="signature">${s}<span>${esc(i===0?info('Prepared by'):i===2?info('Approved by'):'')}</span></div>`).join('')}</div>${d.status?`<div class="status">${esc(d.status)}${info('Reference')?' · Reference: '+esc(info('Reference')):''}</div>`:''}</main></body></html>`;
}

function receivingReportHtml(period:string,headers:string[],rows:string[][],numeric:boolean[]){
 const names=headers.map(h=>h==='Number'?'Received No':h);
 return `<!doctype html><html><head><meta charset="utf-8"><title>Receiving – ${esc(company.name)}</title><style>@page{size:A4 portrait;margin:12mm}body{font-family:"Times New Roman",serif;font-size:10px;color:#111;margin:0}header{text-align:center;margin-bottom:8px}header h1{font-size:14px;margin:0}header p{margin:3px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #555;padding:4px 5px;text-align:left;vertical-align:top}th{font-weight:bold;background:#fff}.r{text-align:right;white-space:nowrap}thead{display:table-header-group}tr{break-inside:avoid}th:nth-child(1){width:11%}th:nth-child(2){width:14%}th:nth-child(3){width:34%}footer{text-align:right;margin-top:8px;font-size:9px}</style></head><body><header><h1>Receiving</h1><p>${esc(company.name)}</p><p>${esc(period)}</p></header><table><thead><tr>${names.map((h,i)=>`<th class="${numeric[i]?'r':''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((v,i)=>`<td class="${numeric[i]?'r':''}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table><footer>Generated on ${esc(new Date().toLocaleString('en-GB'))}</footer></body></html>`;
}
