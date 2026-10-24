import {createFileRoute} from '@tanstack/react-router';
import {ModulePage} from '@/components/modules/ModulePage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/purchases/returns')({head:()=>moduleHead('Returns'),component:()=> <ModulePage path="/purchases/returns"/>});
