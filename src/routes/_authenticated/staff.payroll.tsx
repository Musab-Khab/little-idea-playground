import {createFileRoute} from '@tanstack/react-router';
import {SpecialPage} from '@/components/modules/SpecialPage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/staff/payroll')({head:()=>moduleHead('Payroll'),component:()=> <SpecialPage path="/staff/payroll"/>});
