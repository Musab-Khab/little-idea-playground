import {createFileRoute} from '@tanstack/react-router';
import {SpecialPage} from '@/components/modules/SpecialPage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/inventory/stock')({head:()=>moduleHead('Stock'),component:()=> <SpecialPage path="/inventory/stock"/>});
