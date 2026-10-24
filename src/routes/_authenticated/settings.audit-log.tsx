import {createFileRoute} from '@tanstack/react-router';
import {SpecialPage} from '@/components/modules/SpecialPage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/settings/audit-log')({head:()=>moduleHead('Audit Log'),component:()=> <SpecialPage path="/settings/audit-log"/>});
