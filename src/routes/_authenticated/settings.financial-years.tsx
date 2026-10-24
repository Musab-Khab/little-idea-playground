import {createFileRoute} from '@tanstack/react-router';
import {SpecialPage} from '@/components/modules/SpecialPage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/settings/financial-years')({head:()=>moduleHead('Financial Years'),component:()=> <SpecialPage path="/settings/financial-years"/>});
