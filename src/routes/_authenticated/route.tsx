import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthState } from "@/server/functions/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const state = await getAuthState();
    if (state.stage !== "signedIn") throw redirect({ to: "/auth" });
    return {
      session: {
        id: state.id,
        name: state.name,
        email: state.email,
        roleId: state.roleId,
        permissions: state.permissions,
      },
    };
  },
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
});
