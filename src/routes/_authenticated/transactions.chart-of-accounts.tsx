import {createFileRoute} from '@tanstack/react-router';
import {ModulePage} from '@/components/modules/ModulePage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/transactions/chart-of-accounts')({head:()=>moduleHead('Chart Of Accounts'),component:()=> <ModulePage path="/transactions/chart-of-accounts"/>});
