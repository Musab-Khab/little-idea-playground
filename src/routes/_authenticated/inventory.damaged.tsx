import {createFileRoute} from '@tanstack/react-router';
import {SpecialPage} from '@/components/modules/SpecialPage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/inventory/damaged')({head:()=>moduleHead('Damaged'),component:()=> <SpecialPage path="/inventory/damaged"/>});
