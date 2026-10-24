import { createFileRoute, redirect } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { AuthScreen } from '@/components/auth/AuthScreen';
export const Route=createFileRoute('/auth')({ssr:false,beforeLoad:async()=>{const {data}=await supabase.auth.getUser();if(data.user)throw redirect({to:'/'});},head:()=>({meta:[{title:'Sign in – MFAHH'},{name:'description',content:'Sign in to MFAHH for Turnkey Publishers.'},{property:'og:title',content:'Sign in – MFAHH'},{property:'og:description',content:'Sign in to MFAHH for Turnkey Publishers.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:AuthScreen});
