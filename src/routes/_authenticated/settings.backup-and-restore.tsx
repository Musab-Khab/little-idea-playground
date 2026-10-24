import {createFileRoute} from '@tanstack/react-router';
import {SpecialPage} from '@/components/modules/SpecialPage';
import {moduleHead} from '@/lib/moduleConfig';
export const Route=createFileRoute('/_authenticated/settings/backup-and-restore')({head:()=>moduleHead('Backup And Restore'),component:()=> <SpecialPage path="/settings/backup-and-restore"/>});
