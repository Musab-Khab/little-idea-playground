import {createFileRoute} from '@tanstack/react-router';
import {ModulePage} from '@/components/modules/ModulePage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/transactions/journal')({head:()=>moduleHead('Journal'),component:()=> <ModulePage path="/transactions/journal"/>});
