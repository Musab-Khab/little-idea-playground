import {createFileRoute} from '@tanstack/react-router';
import {ModulePage} from '@/components/modules/ModulePage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/sales/receipts')({head:()=>moduleHead('Receipts'),component:()=> <ModulePage path="/sales/receipts"/>});
