import { useRouteContext } from "@tanstack/react-router";
import type { Permission } from "@/shared/permissions";

export interface SessionInfo {
  id: string;
  name: string;
  email: string;
  roleId: string;
  permissions: Permission[];
}

/**
 * The signed-in user, loaded by the authenticated layout. `can()` only hides UI;
 * every action is re-checked on the server.
 */
export function useSession() {
  const { session } = useRouteContext({ from: "/_authenticated" });
  const perms = new Set(session.permissions);
  return {
    user: session,
    can: (p?: Permission) => !p || perms.has(p),
    canAny: (...ps: Permission[]) => ps.some((p) => perms.has(p)),
  };
}
