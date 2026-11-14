import {describe,it,expect,beforeEach} from 'vitest';
import {customerDiscount,applyCustomerDiscount,validateDiscount} from '@/services/customerDiscountService';
import {reportPeriod,reportBalance,filterReportRows} from '@/services/reportFilterService';
import {useAppStore} from '@/store/appStore';
import {moduleService} from '@/services/moduleService';
import {modules} from '@/lib/moduleConfig';
beforeEach(()=>useAppStore.getState().resetDemo());
describe('customer pricing',()=>{
 it('applies a school default of 20 percent',()=>expect(customerDiscount({discountPct:20},'Textbook',300)).toBe(20));
 it('applies a 50 percent practical journal override',()=>expect(customerDiscount({discountPct:20,discountRules:[{category:'Practical Journal',type:'Percentage',value:50}]},'Practical Journal',300)).toBe(50));
 it('converts rupee amount to a per-item discount',()=>expect(customerDiscount({discountType:'Amount',discountAmount:50},'Copy / Notebook',200)).toBe(25));
 it('fixed discounts cannot be bypassed on invoice save',async()=>{const c=modules['/sales/invoices'];if(!c)throw Error('Missing config');useAppStore.getState().updateData(d=>({...d,customers:d.customers.map(c=>c.id==='C001'?{...c,discountMode:'Fixed',discountPct:20}:c)}));await moduleService.save(c,{customerId:'C001',date:'2025-09-12',dueDate:'2025-10-12',items:[{bookId:'B001',qty:2,rate:300,discountPct:0}]},'Admin');expect(useAppStore.getState().data.salesInvoices[0]?.items[0]?.discountPct).toBe(20);});
 it('editable discounts preserve an override',()=>expect(applyCustomerDiscount([{bookId:'B001',rate:300,discountPct:15}],{discountMode:'Editable',discountPct:20},[{id:'B001',category:'Textbook'}])[0]?.discountPct).toBe(15));
 it('rejects percentage over 100',()=>expect(()=>validateDiscount({discountPct:101})).toThrow());
 it('changing customer pricing leaves past invoices untouched',()=>{const before=useAppStore.getState().data.salesInvoices[0]?.items[0]?.discountPct;useAppStore.getState().updateData(d=>({...d,customers:d.customers.map(c=>({...c,discountPct:50}))}));expect(useAppStore.getState().data.salesInvoices[0]?.items[0]?.discountPct).toBe(before);});
});
describe('report and admin rules',()=>{
 it('last month selects the full previous calendar month',()=>expect(reportPeriod('Last month',undefined)).toEqual({from:'2025-08-01',to:'2025-08-31'}));
 it('report head excludes unrelated rows',()=>expect(filterReportRows([{head:'Rent',amount:100},{head:'Printing',amount:200}],'Rent',['head'])).toEqual([{head:'Rent',amount:100}]));
 it('receivables exclude transactions after the selected end date',()=>expect(reportBalance(useAppStore.getState().data,'C001',true,'2025-07-01')).toBe(120000));
 it('only Admin is available and switching cannot select accountant',()=>{useAppStore.getState().setRole('accountant');expect(useAppStore.getState().roleId).toBe('admin');expect(useAppStore.getState().data.roles.map(r=>r.id)).toEqual(['admin']);});
});