import {createFileRoute} from '@tanstack/react-router';
import {ModulePage} from '@/components/modules/ModulePage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/transactions/expenses')({head:()=>moduleHead('Expenses'),component:()=> <ModulePage path="/transactions/expenses"/>});
