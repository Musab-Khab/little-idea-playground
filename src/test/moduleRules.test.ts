import {beforeEach,describe,expect,it} from 'vitest';
import {useAppStore} from '@/store/appStore';
import {modules} from '@/lib/moduleConfig';
import {moduleService,ledgerEntries,num,canManageHR,validateRecord,partyBalance} from '@/services/moduleService';
const sales=modules['/sales/invoices'];const journal=modules['/transactions/journal'];const customers=modules['/customers'];
function config<T>(value:T|undefined):T{if(!value)throw Error('Config missing');return value;}
beforeEach(()=>{useAppStore.getState().resetDemo();useAppStore.getState().setRole('admin');useAppStore.getState().setFy('FY2025-26');});
describe('MFAHH business rules',()=>{
 it('requires Draft → Pending → Approved and reduces stock only on approval',async()=>{const c=config(sales);await moduleService.save(c,{date:'2025-09-12',dueDate:'2025-10-12',customerId:'C001',items:[{bookId:'B001',qty:2,rate:300,discountPct:0}]},'Admin');const i=useAppStore.getState().data.salesInvoices[0];if(!i)throw Error('Invoice missing');expect(i.no).toBe('INV-1027');await expect(moduleService.transition(c,i.id,'Approved','Admin')).rejects.toThrow();await moduleService.transition(c,i.id,'Pending','Admin');await moduleService.transition(c,i.id,'Approved','Admin');expect(useAppStore.getState().data.books[0]?.availableStock).toBe(1478);});
 it('blocks negative stock without the permission',async()=>{useAppStore.getState().updateData(d=>({...d,salesInvoices:d.salesInvoices.map(i=>i.id==='SI02'?{...i,docStatus:'Pending'}:i)}));useAppStore.getState().setRole('accountant');await expect(moduleService.transition(config(sales),'SI02','Approved','Accountant')).rejects.toThrow('Not enough stock');});
 it('cancel keeps record, requires reason and reverses stock',async()=>{const c=config(sales);await expect(moduleService.transition(c,'SI01','Cancelled','Admin','')).rejects.toThrow('reason');await moduleService.transition(c,'SI01','Cancelled','Admin','Wrong order');expect(useAppStore.getState().data.salesInvoices.find(i=>i.id==='SI01')?.docStatus).toBe('Cancelled');expect(useAppStore.getState().data.books[0]?.availableStock).toBe(1530);});
 it('journal must balance Dr and Cr',()=>{expect(()=>validateRecord(config(journal),{date:'2025-09-12',narration:'Transfer',lines:[{account:'1000',dr:100,cr:0},{account:'1010',dr:0,cr:90}]},useAppStore.getState().data)).toThrow('balance');});
 it('codes must be unique',()=>{expect(()=>validateRecord(config(customers),{code:'CUS-001',name:'Duplicate',category:'Other',status:'Active'},useAppStore.getState().data)).toThrow('unique');});
 it('closed financial years are read only',async()=>{useAppStore.getState().setFy('FY2024-25');await expect(moduleService.convertOrder('SO01','Admin')).rejects.toThrow('closed');});
 it('only Admin and HR can manage HR data',()=>{expect(canManageHR('admin')).toBe(true);expect(canManageHR('hr')).toBe(true);expect(canManageHR('accountant')).toBe(false);expect(canManageHR('sales')).toBe(false);});
 it('ledger entries balance per posted document',()=>{const entries=ledgerEntries(useAppStore.getState().data);const refs=new Set(entries.map(e=>e['ref']));for(const ref of refs){const rows=entries.filter(e=>e['ref']===ref);expect(rows.reduce((s,e)=>s+num(e,'dr')-num(e,'cr'),0)).toBe(0);}});
 it('receipt reduces customer balance only when approved',async()=>{const before=partyBalance(useAppStore.getState().data,'C003',true);await moduleService.transition(config(modules['/sales/receipts']),'RV05','Approved','Admin');expect(partyBalance(useAppStore.getState().data,'C003',true)).toBe(before-50000);});
});
