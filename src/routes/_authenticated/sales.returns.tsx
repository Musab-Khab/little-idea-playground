import {createFileRoute} from '@tanstack/react-router';
import {ModulePage} from '@/components/modules/ModulePage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/sales/returns')({head:()=>moduleHead('Returns'),component:()=> <ModulePage path="/sales/returns"/>});
