import {createFileRoute} from '@tanstack/react-router';
import {SpecialPage} from '@/components/modules/SpecialPage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/reports')({head:()=>moduleHead('Reports'),component:()=> <SpecialPage path="/reports"/>});
