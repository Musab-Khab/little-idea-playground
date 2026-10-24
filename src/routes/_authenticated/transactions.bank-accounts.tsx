import {createFileRoute} from '@tanstack/react-router';
import {ModulePage} from '@/components/modules/ModulePage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/transactions/bank-accounts')({head:()=>moduleHead('Bank Accounts'),component:()=> <ModulePage path="/transactions/bank-accounts"/>});
