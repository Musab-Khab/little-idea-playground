import {useAppStore,type AppData} from '@/store/appStore';
import {DEMO_TODAY,docTotal,type LineItem} from '@/data/mockData';
import type {ModuleConfig,Collection} from '@/lib/moduleConfig';
export type Row=Record<string,unknown>;
export const rowsOf=(data:AppData,key:Collection):Row[]=> data[key] as unknown as Row[];
export const text=(row:Row,key:string)=>String(row[key]??'');
export const num=(row:Row,key:string)=>Number(row[key]??0);
export const linesOf=(row:Row):Row[]=>Array.isArray(row['items'])?row['items'] as Row[]:[];
export const totalOf=(row:Row)=>Array.isArray(row['items'])?docTotal({items:linesOf(row).map(l=>({bookId:text(l,'bookId'),qty:num(l,'qty'),rate:num(l,'rate'),discountPct:num(l,'discountPct')})),invoiceDiscount:num(row,'invoiceDiscount'),taxPct:num(row,'taxPct')}):Array.isArray(row['lines'])?(row['lines'] as Row[]).reduce((s,l)=>s+num(l,'dr'),0):num(row,'amount');
export function partyBalance(data:AppData,id:string,customer:boolean){
 const masters=customer?data.customers:data.suppliers;const inv=customer?data.salesInvoices:data.purchaseInvoices;
 const returns=customer?data.salesReturns:data.purchaseReturns;const payments=customer?data.customerReceipts:data.supplierPayments;
 const key=customer?'customerId':'supplierId';
 return (masters.find(x=>x['id']===id)?.openingBalance??0)+ (inv as unknown as Row[]).filter(x=>text(x,key)===id&&x['docStatus']==='Approved').reduce((s,x)=>s+totalOf(x),0)-(returns as unknown as Row[]).filter(x=>text(x,key)===id&&x['docStatus']==='Approved').reduce((s,x)=>s+totalOf(x),0)-(payments as unknown as Row[]).filter(x=>text(x,key)===id&&x['docStatus']==='Approved').reduce((s,x)=>s+num(x,'amount'),0);
}
export function ledgerEntries(data:AppData){
 const entries:Row[]=[];
 const add=(r:Row,account:string,dr:number,cr:number)=>entries.push({date:r['date'],ref:r['no'],account,dr,cr});
 for(const [key,dr,cr] of [['salesInvoices','1100','4000'],['purchaseInvoices','5000','2000'],['salesReturns','4100','1100'],['purchaseReturns','2000','5000'],['customerReceipts','1000','1100'],['supplierPayments','2000','1000'],['expenses','6000','1000']] as const){
  for(const r of rowsOf(data,key).filter(r=>r['docStatus']==='Approved')) {const cash=r['method']&&r['method']!=='Cash'?'1010': '1000'; add(r,dr==='1000'?cash:dr,totalOf(r),0);add(r,cr==='1000'?cash:cr,0,totalOf(r));}
 }
 for(const j of data.journalVouchers.filter(j=>j.docStatus==='Approved'))for(const l of j.lines)entries.push({date:j.date,ref:j.no,account:l['account'].split(' ')[0],dr:l['dr'],cr:l['cr']});
 return entries.sort((a,b)=>text(a,'date').localeCompare(text(b,'date')));
}
export function canManageHR(role:string){return role==='admin'||role==='hr';}
function assertEdit(){const s=useAppStore.getState();if(s.data.financialYears.find(f=>f.id===s.fyId)?.status==='Closed')throw Error('This financial year is closed.');}
function audit(data:AppData,user:string,action:string,entity:string,ref:string,details:string){return [{id:crypto.randomUUID(),at:new Date().toISOString(),user,action,entity,ref,details},...data.auditLog];}
function stockChange(data:AppData,lines:Row[],direction:number,ref:string,date:string,allowNegative:boolean){
 const changes=new Map<string,number>();for(const l of lines)changes.set(text(l,'bookId'),(changes.get(text(l,'bookId'))??0)+num(l,'qty')*direction);
 for(const [id,qty]of changes){const book=data.books.find(b=>b.id===id);if(book&&!allowNegative&&book.availableStock+qty<0)throw Error(`Not enough stock: ${book.name}`);}
 return {...data,books:data.books.map(b=>({...b,availableStock:b.availableStock+(changes.get(b.id)??0)})),stockMovements:[...data.stockMovements,...[...changes].filter(([id])=>data.books.some(b=>b.id===id)).map(([bookId,qty])=>({id:crypto.randomUUID(),date,bookId,type:qty>0?'Received':'Issued',ref,qtyIn:Math.max(0,qty),qtyOut:Math.max(0,-qty)}))]};
}
export function validateRecord(config:ModuleConfig,row:Row,data:AppData){
 for(const f of config.fields){if(f.required&&(row[f.key]===''||row[f.key]===undefined||row[f.key]===null))throw Error(`${f.label} is required.`);if(f.type==='number'&&!Number.isFinite(Number(row[f.key]??0)))throw Error(`${f.label} must be a valid number.`);}
 for(const key of ['code','empId','accountNo'])if(row[key]&&rowsOf(data,config.collection).some(r=>r[key]===row[key]&&r['id']!==row['id']))throw Error(`${key} must be unique.`);
 if(config.lines&&config.lines!=='journal'){if(!linesOf(row).length)throw Error('Add at least one book.');for(const l of linesOf(row))if(!l['bookId']||!Number.isInteger(num(l,'qty'))||num(l,'qty')<=0||num(l,'rate')<0||num(l,'discountPct')<0||num(l,'discountPct')>100)throw Error('Enter a book, positive whole quantity and discount between 0 and 100.');if(totalOf(row)<0)throw Error('Discount cannot exceed the total.');}
 if(config.lines==='journal'){const lines=row['lines'] as Row[];const dr=lines.reduce((s,l)=>s+num(l,'dr'),0),cr=lines.reduce((s,l)=>s+num(l,'cr'),0);if(dr<=0||Math.abs(dr-cr)>0.001||lines.some(l=>!l['account']||num(l,'dr')<0||num(l,'cr')<0||(num(l,'dr')>0&&num(l,'cr')>0)))throw Error('Journal debit and credit must balance, with one side per line.');}
 if(['customerReceipts','supplierPayments','expenses'].includes(config.collection)){if(num(row,'amount')<=0)throw Error('Amount must be positive.');if(row['method']!=='Cash'&&!row['bankId'])throw Error('Choose a bank account.');}
}
export const moduleService={
 async save(config:ModuleConfig,input:Row,user:string){assertEdit();let result='';useAppStore.getState().updateData(data=>{
  const role=data.roles.find(r=>r['id']===useAppStore.getState().roleId);if(!role?.permissions.includes(config.permission))throw Error('Permission denied.');if(config.section==='Staff & HR'&&!canManageHR(role.id))throw Error('HR access is restricted.');
  const existing=rowsOf(data,config.collection).find(r=>r['id']===input['id']||(config.collection==='chartOfAccounts'&&r['code']===input['code']));
  if(existing&&!config.master)throw Error('Posted documents cannot be edited.');
  if(existing&&config.collection==='books'&&!role.permissions.includes('books.price_edit')&&(input['salePrice']!==existing['salePrice']||input['costPrice']!==existing['costPrice']))throw Error('Price changes require permission.');
  const row:Row={...input,id:existing?.['id']??crypto.randomUUID(),createdBy:existing?.['createdBy']??user,createdAt:existing?.['createdAt']??new Date().toISOString()};
  let next={...data};if(config.prefix){const no=`${config.prefix}-${data.numberSeries[config.prefix]}`;row[config.collection==='samples'?'slipNo':'no']=no;next.numberSeries={...data.numberSeries,[config.prefix]:data.numberSeries[config.prefix]+1};result=no;}
  if(!config.master&&config.collection!=='staffDocuments')row['docStatus']='Draft';
  if(config.collection==='samples'){row['status']='Issued';row['issuedBy']=user;row['items']=linesOf(row).map(l=>({...l,returned:0}));next=stockChange(next,linesOf(row),-1,text(row,'slipNo'),text(row,'date'),role.permissions.includes('stock.negative_allow'));delete row['docStatus'];}
  if(config.collection==='books'){row['availableStock']=existing?.['availableStock']??num(row,'openingStock');row['damagedStock']=existing?.['damagedStock']??0;}
  if(config.collection==='bankAccounts')row['current']=existing?.['current']??num(row,'opening');
  if(config.lines==='invoice'){row['paidAmount']=0;row['payStatus']='Unpaid';}
  validateRecord(config,row,data);
  const collection=rowsOf(next,config.collection);next={...next,[config.collection]:existing?collection.map(r=>r===existing?{...row,editedBy:user,editedAt:new Date().toISOString()}:r):[row,...collection]} as unknown as AppData;
  next.auditLog=audit(next,user,existing?'Edited':'Created',config.title,text(row,'no')||text(row,'code')||text(row,'slipNo'),existing?'Record updated':'Record created');return next;
 });return result;
 },
 async transition(config:ModuleConfig,id:string,action:'Pending'|'Approved'|'Cancelled',user:string,reason=''){
 assertEdit();useAppStore.getState().updateData(data=>{
  const role=data.roles.find(r=>r['id']===useAppStore.getState().roleId);const required=action==='Approved'?config.approve:config.permission;if(!required||!role?.permissions.includes(required))throw Error('Permission denied.');
  const row=rowsOf(data,config.collection).find(r=>r['id']===id);if(!row)throw Error('Record not found.');if(row['docStatus']==='Cancelled'||(action==='Approved'&&row['docStatus']!=='Pending')||(action==='Pending'&&row['docStatus']!=='Draft'))throw Error('This status change is not allowed.');if(action==='Cancelled'&&!reason.trim())throw Error('A cancellation reason is required.');
  let next={...data};let direction=0;if(action==='Approved'||(action==='Cancelled'&&row['docStatus']==='Approved')){const sign=action==='Approved'?1:-1;direction=({salesInvoices:-1,purchaseInvoices:row['kind']==='Books'?1:0,salesReturns:1,purchaseReturns:-1,stockAdjustments:1} as Record<string,number>)[config.collection]??0;if(direction)next=stockChange(next,config.collection==='stockAdjustments'?[{bookId:row['bookId'],qty:row['qty']}]:linesOf(row),direction*sign,text(row,'no'),text(row,'date'),role.permissions.includes('stock.negative_allow'));
   if(['customerReceipts','supplierPayments'].includes(config.collection)){const key=config.collection==='customerReceipts'?'salesInvoices':'purchaseInvoices';next={...next,[key]:next[key].map(i=>i.no===row['ref']?{...i,paidAmount:i.paidAmount+num(row,'amount')*sign,payStatus:i.paidAmount+num(row,'amount')*sign>=docTotal(i)?'Paid':'Partially Paid'}:i)} as AppData;}
   if(row['bankId']&&row['method']!=='Cash'){next.bankAccounts=next.bankAccounts.map(b=>b.id===row['bankId']?{...b,current:b.current+num(row,'amount')*sign*(config.collection==='customerReceipts'?1:-1)}:b);}
  }
  next={...next,[config.collection]:rowsOf(next,config.collection).map(r=>r['id']===id?{...r,docStatus:action,...(action==='Cancelled'?{cancelReason:reason,cancelledBy:user,cancelledAt:new Date().toISOString(),...(r['payStatus']?{payStatus:'Cancelled'}:{})}:action==='Approved'?{approvedBy:user,approvedAt:new Date().toISOString()}:{})}:r)} as unknown as AppData;
  next.auditLog=audit(next,user,action,config.title,text(row,'no'),reason||'Status updated');return next;
 });
 },
 async returnSample(id:string,quantities:number[],user:string){assertEdit();useAppStore.getState().updateData(data=>{const sample=data.samples.find(s=>s.id===id);if(!sample)throw Error('Sample not found.');const items=sample.items.map((l,i)=>{const qty=quantities[i]??l['returned'];if(!Number.isInteger(qty)||qty<l['returned']||qty>l['qty'])throw Error('Return quantity must stay between previously returned and issued.');return {...l,returned:qty};});let next=stockChange(data,items.map((l,i)=>({bookId:l['bookId'],qty:l['returned']-(sample.items[i]?.returned??0)})),1,sample.slipNo,DEMO_TODAY,false);next.samples=next.samples.map(s=>s.id===id?{...s,items,status:items.every(l=>l['returned']===l['qty'])?'Returned':'Partially Returned'}:s);next.auditLog=audit(next,user,'Returned','Sample',sample.slipNo,'Sample stock returned');return next;});},
 async convertOrder(id:string,user:string){assertEdit();let no='';useAppStore.getState().updateData(data=>{const order=data.salesOrders.find(o=>o.id===id);if(!order||order.status==='Cancelled')throw Error('Order cannot be converted.');if(data.salesInvoices.some(i=>i.remarks===`Order ${order.no}`))throw Error('This order already has an invoice.');no=`INV-${data.numberSeries.INV}`;return {...data,salesInvoices:[{id:crypto.randomUUID(),no,date:DEMO_TODAY,dueDate:'2025-10-12',customerId:order.customerId,items:order.items.map(l=>({bookId:l['bookId'],qty:l['qty'],rate:l['rate'],discountPct:l['discountPct']})),invoiceDiscount:0,taxPct:0,paidAmount:0,docStatus:'Draft',payStatus:'Unpaid',remarks:`Order ${order.no}`,createdBy:user,createdAt:new Date().toISOString()},...data.salesInvoices],numberSeries:{...data.numberSeries,INV:data.numberSeries.INV+1},auditLog:audit(data,user,'Converted','Sales Order',order.no,no)};});return no;},
};
