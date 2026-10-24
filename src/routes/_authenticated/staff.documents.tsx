import {createFileRoute} from '@tanstack/react-router';
import {ModulePage} from '@/components/modules/ModulePage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/staff/documents')({head:()=>moduleHead('Documents'),component:()=> <ModulePage path="/staff/documents"/>});
