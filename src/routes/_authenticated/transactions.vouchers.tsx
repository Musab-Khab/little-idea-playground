import {createFileRoute} from '@tanstack/react-router';
import {SpecialPage} from '@/components/modules/SpecialPage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/transactions/vouchers')({head:()=>moduleHead('Vouchers'),component:()=> <SpecialPage path="/transactions/vouchers"/>});
