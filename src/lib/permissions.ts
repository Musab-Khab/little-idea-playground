import { useAppStore } from "@/store/appStore";
import { users } from "@/data/mockData";

export function usePermissions() {
  const roleId = useAppStore((s) => s.roleId);
  const roles = useAppStore((s) => s.data.roles);
  const role = roles.find((r) => r.id === roleId) ?? roles[0] ?? { id: "none", name: "No role", permissions: [] };
  const perms = new Set<string>(role.permissions);
  const user = users.find((u) => u.roleId === role.id) ?? users[0] ?? { id: "none", name: "Account", email: "", roleId: "none", status: "Inactive" };
  return {
    role,
    user,
    can: (p?: string) => !p || perms.has(p),
  };
}
