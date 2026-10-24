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
- Navigation is defined once in `src/lib/nav.ts`; unbuilt sections render through the splat route `src/routes/_authenticated/$.tsx` until they get their own route file.
- Role permissions come from `roles` in the store; use `usePermissions().can()` / `canAny()` to hide or disable UI.

- Cloud Auth owns real sign-in; all ERP screens live under the client-only authenticated layout so signed-out users cannot open them.
- Sample business records and role switching remain browser-local demo data, separate from Cloud Auth; never treat demo roles as production authorization.
- Repeated record screens use moduleConfig, ModulePage and moduleService; specialized reports/settings views use SpecialPage so transactions share validation and posting rules.
- Financial-year, HR and configuration seeds hydrate into the same store with additive merge so existing demo edits survive schema additions.
- Export helpers dynamically load Excel/PDF libraries from click handlers to keep browser-only work outside SSR.
