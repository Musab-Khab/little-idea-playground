import {createFileRoute,Link} from '@tanstack/react-router';
import {findNav} from '@/lib/nav';
import {moduleHead} from '@/lib/moduleConfig';
import {PageHeader} from '@/components/shared/PageHeader';
import {Button} from '@/components/ui/button';
export const Route=createFileRoute('/_authenticated/$')({head:({params})=>moduleHead(findNav('/'+(params._splat??''))?.section.title??'Page not found'),component:Section});
function Section(){const {_splat}=Route.useParams();const nav=findNav('/'+(_splat??''));return <div><PageHeader title={nav?.section.title??'Page not found'}/><div className="flex flex-wrap gap-3">{nav?.section.children?.map(c=><Button asChild variant="outline" key={c.path}><Link to="/$" params={{_splat:c.path.slice(1)}}>{c.title}</Link></Button>)}<Button asChild><Link to="/">Dashboard</Link></Button></div></div>;}
