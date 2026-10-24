import {createFileRoute} from '@tanstack/react-router';
import {ModulePage} from '@/components/modules/ModulePage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/inventory/samples')({head:()=>moduleHead('Samples'),component:()=> <ModulePage path="/inventory/samples"/>});
