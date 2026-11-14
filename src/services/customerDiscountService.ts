export interface DiscountRule {category:string;type:'Percentage'|'Amount';value:number}
export interface CustomerDiscount {discountPct?:number;discountType?:string;discountAmount?:number;discountMode?:string;discountRules?:DiscountRule[]}
export function customerDiscount(customer:CustomerDiscount|undefined,category:string,rate:number){
 const rule=customer?.discountRules?.find(r=>r.category===category);
 const type=rule?.type??customer?.discountType??'Percentage';
 const value=rule?.value??(type==='Amount'?customer?.discountAmount??0:customer?.discountPct??0);
 return type==='Amount'?(rate>0?Math.min(100,value/rate*100):0):value;
}
export function validateDiscount(customer:CustomerDiscount){
 const rules=[{type:customer.discountType??'Percentage',value:customer.discountType==='Amount'?customer.discountAmount??0:customer.discountPct??0},...(customer.discountRules??[])];
 for(const rule of rules)if(!Number.isFinite(rule.value)||rule.value<0||(rule.type==='Percentage'&&rule.value>100))throw Error('Discount must be positive or zero; percentages cannot exceed 100.');
 const categories=(customer.discountRules??[]).map(r=>r.category);
 if(new Set(categories).size!==categories.length||categories.some(c=>!c))throw Error('Choose a different category for each discount.');
}
export function applyCustomerDiscount<T extends {bookId:string;rate:number;discountPct:number}>(lines:T[],customer:CustomerDiscount|undefined,books:{id:string;category:string}[],force=false):T[]{
 return lines.map(line=>force||customer?.discountMode==='Fixed'?{...line,discountPct:customerDiscount(customer,books.find(b=>b.id===line.bookId)?.category??'',line.rate)}:line);
}