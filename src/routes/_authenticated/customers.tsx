import {createFileRoute} from '@tanstack/react-router';
import {ModulePage} from '@/components/modules/ModulePage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/customers')({head:()=>moduleHead('Customers'),component:()=> <ModulePage path="/customers"/>});
