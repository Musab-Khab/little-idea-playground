import {createFileRoute} from '@tanstack/react-router';
import {ModulePage} from '@/components/modules/ModulePage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/purchases/payments')({head:()=>moduleHead('Payments'),component:()=> <ModulePage path="/purchases/payments"/>});
