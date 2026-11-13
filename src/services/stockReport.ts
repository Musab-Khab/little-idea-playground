import type {AppData} from '@/store/appStore';
export interface MoveRow {date:string;type:string;ref:string;qtyIn:number;qtyOut:number;balance:number}
/** Product-wise movement built from approved documents, so every figure traces to a reference. */
export function productMovement(data:AppData,bookId:string,from:string,to:string){
 const book=data.books.find(b=>b.id===bookId);const ev:Omit<MoveRow,'balance'>[]=[];
 const add=(date:string,type:string,ref:string,qty:number)=>{if(qty)ev.push({date,type,ref,qtyIn:Math.max(0,qty),qtyOut:Math.max(0,-qty)});};
 const sum=(items:{bookId:string;qty:number}[])=>items.filter(l=>l.bookId===bookId).reduce((s,l)=>s+l.qty,0);
 for(const d of data.purchaseInvoices)if(d.docStatus==='Approved'&&d.kind==='Books')add(d.date,'Purchase',d.no,sum(d.items));
 for(const d of data.salesInvoices)if(d.docStatus==='Approved')add(d.date,'Sale',d.no,-sum(d.items));
 for(const d of data.salesReturns)if(d.docStatus==='Approved'){const dmg=String((d as {condition?:string}).condition??'').startsWith('Damaged');add(d.date,dmg?'Sales return (damaged)':'Sales return',d.no,dmg?0:sum(d.items));}
 for(const d of data.purchaseReturns)if(d.docStatus==='Approved')add(d.date,'Supplier return',d.no,-sum(d.items));
 for(const s of data.samples){const q=s.items.filter(l=>l['bookId']===bookId);add(s.date,'Sample issued',s.slipNo,-q.reduce((t,l)=>t+l['qty'],0));add(s.date,'Sample returned',s.slipNo,q.reduce((t,l)=>t+(l['returned']??0),0));}
 for(const a of data.stockAdjustments)if(a.docStatus==='Approved'&&a.bookId===bookId){const dmg=(a as {stockType?:string}).stockType==='Move to damaged stock';add(a.date,dmg?'Moved to damaged':'Adjustment',a.no,dmg?-Math.abs(a.qty):a.qty);}
 ev.sort((a,b)=>a.date.localeCompare(b.date));
 const opening=(book?.openingStock??0)+ev.filter(e=>e.date<from).reduce((s,e)=>s+e.qtyIn-e.qtyOut,0);
 let bal=opening;const rows:Record<string,string|number>[]=[{date:from,type:'Opening stock',ref:'',qtyIn:0,qtyOut:0,balance:opening},...ev.filter(e=>e.date>=from&&e.date<=to).map(e=>({...e,balance:bal+=e.qtyIn-e.qtyOut}))];
 const inR=ev.filter(e=>e.date>=from&&e.date<=to);const t=(p:string)=>inR.filter(e=>e.type.startsWith(p)).reduce((s,e)=>s+e.qtyIn-e.qtyOut,0);
 return {rows,summary:{'Opening':opening,'Purchases':t('Purchase'),'Sales':-t('Sale'),'Sales returns':t('Sales return'),'Supplier returns':-t('Supplier return'),'Samples (net)':-t('Sample'),'Adjustments':t('Adjustment')+t('Moved'),'Damaged stock':book?.damagedStock??0,'Closing':bal}};
}
