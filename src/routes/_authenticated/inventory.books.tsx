import {createFileRoute} from '@tanstack/react-router';
import {ModulePage} from '@/components/modules/ModulePage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/inventory/books')({head:()=>moduleHead('Books'),component:()=> <ModulePage path="/inventory/books"/>});
