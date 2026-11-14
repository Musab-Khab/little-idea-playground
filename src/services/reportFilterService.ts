import {DEMO_TODAY,docTotal} from '@/data/mockData';
import type {AppData} from '@/store/appStore';
export function reportPeriod(preset:string,fy:{start:string;end:string}|undefined){
 const date=new Date(`${DEMO_TODAY}T12:00:00Z`);const iso=(d:Date)=>d.toISOString().slice(0,10);
 if(preset==='Today')return {from:DEMO_TODAY,to:DEMO_TODAY};
 if(preset==='This month')return {from:`${DEMO_TODAY.slice(0,7)}-01`,to:DEMO_TODAY};
 if(preset==='Last month'){const first=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()-1,1));const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),0));return {from:iso(first),to:iso(last)};}
 return {from:fy?.start??'2025-07-01',to:fy?.end??DEMO_TODAY};
}
export function reportBalance(data:AppData,id:string,customer:boolean,to:string){
 const approved=(r:{docStatus:string;date:string;customerId?:string;supplierId?:string})=>r.docStatus==='Approved'&&(customer?r.customerId:r.supplierId)===id&&r.date<=to;
 const docs=customer?data.salesInvoices:data.purchaseInvoices;const returns=customer?data.salesReturns:data.purchaseReturns;const payments=customer?data.customerReceipts:data.supplierPayments;
 return ((customer?data.customers:data.suppliers).find(p=>p.id===id)?.openingBalance??0)+docs.filter(r=>approved(r)).reduce((s,r)=>s+docTotal(r),0)-returns.filter(r=>approved(r)).reduce((s,r)=>s+docTotal({items:r.items.map(l=>({...l,discountPct:('discountPct' in l?Number(l.discountPct):0)}))}),0)-payments.filter(r=>approved(r)).reduce((s,r)=>s+r.amount,0);
}
export function filterReportRows<T extends Record<string,unknown>>(rows:T[],head:string,keys:string[]){return head==='All'?rows:rows.filter(r=>keys.some(k=>r[k]===head));}