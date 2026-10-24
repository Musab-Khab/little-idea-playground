import {createFileRoute} from '@tanstack/react-router';
import {SpecialPage} from '@/components/modules/SpecialPage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/staff/attendance-and-leave')({head:()=>moduleHead('Attendance And Leave'),component:()=> <SpecialPage path="/staff/attendance-and-leave"/>});
