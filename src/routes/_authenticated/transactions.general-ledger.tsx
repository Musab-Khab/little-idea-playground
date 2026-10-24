import {createFileRoute} from '@tanstack/react-router';
import {SpecialPage} from '@/components/modules/SpecialPage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/transactions/general-ledger')({head:()=>moduleHead('General Ledger'),component:()=> <SpecialPage path="/transactions/general-ledger"/>});
