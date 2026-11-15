import {createFileRoute,redirect} from '@tanstack/react-router';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/transactions/bank-accounts')({head:()=>moduleHead('Cash Book'),beforeLoad:()=>{throw redirect({to:'/transactions/cash-book',replace:true});}});
