<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Seed data lives only in `src/data/mockData.ts` (don't rename fields); it loads into the persisted Zustand store `src/store/appStore.ts` (skipHydration, rehydrated in AppLayout) so a real API can replace it later.
- Pages read figures through `src/services/*` functions; dashboard/report numbers are computed from transaction arrays, never hard-coded.
- Navigation is defined once in `src/lib/nav.ts`; unbuilt sections render through the splat route `src/routes/$.tsx` until they get their own route file.
- Role permissions come from `roles` in the store; use `usePermissions().can()` / `canAny()` to hide or disable UI.
