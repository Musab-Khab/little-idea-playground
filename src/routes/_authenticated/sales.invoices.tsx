import {createFileRoute} from '@tanstack/react-router';
import {ModulePage} from '@/components/modules/ModulePage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/sales/invoices')({head:()=>moduleHead('Invoices'),component:()=> <ModulePage path="/sales/invoices"/>});
