const ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function below1000(n:number):string{const h=Math.floor(n/100),r=n%100;const rest=r<20?ones[r]:`${tens[Math.floor(r/10)]}${r%10?' '+ones[r%10]:''}`;return [h?`${ones[h]} Hundred`:'',rest].filter(Boolean).join(' ');}
/** Pakistani numbering (Crore / Lakh / Thousand), e.g. 150500 → "One Lakh Fifty Thousand Five Hundred Rupees Only". */
export function amountInWords(amount:number){
 let n=Math.round(Math.abs(amount));if(n===0)return 'Zero Rupees Only';
 const parts:string[]=[];
 for(const [size,name] of [[10_000_000,'Crore'],[100_000,'Lakh'],[1000,'Thousand']] as const){const q=Math.floor(n/size);if(q){parts.push(`${q>=1000?amountInWords(q).replace(' Rupees Only',''):below1000(q)} ${name}`);n%=size;}}
 if(n)parts.push(below1000(n));
 return `${parts.join(' ')} Rupees Only`;
}
