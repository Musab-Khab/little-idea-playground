import {createFileRoute} from '@tanstack/react-router';
import {SpecialPage} from '@/components/modules/SpecialPage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/transactions/cash-book')({head:()=>moduleHead('Cash Book'),component:()=> <SpecialPage path="/transactions/cash-book"/>});
