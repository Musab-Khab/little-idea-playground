import {createFileRoute} from '@tanstack/react-router';
import {SpecialPage} from '@/components/modules/SpecialPage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/settings/users-and-roles')({head:()=>moduleHead('Users And Roles'),component:()=> <SpecialPage path="/settings/users-and-roles"/>});
