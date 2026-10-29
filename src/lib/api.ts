import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

const AUTH_CODES = [
  "UNAUTHENTICATED",
  "MFA_REQUIRED",
  "MFA_SETUP_REQUIRED",
  "PASSWORD_CHANGE_REQUIRED",
];

/** Turns a server-function error into a user-facing sentence. Auth problems send the user to sign-in. */
export function errorText(e: unknown): string {
  let msg = e instanceof Error ? e.message : String(e ?? "Something went wrong.");
  // Input validation errors arrive as a JSON list of issues.
  if (msg.startsWith("[")) {
    try {
      const issues = JSON.parse(msg) as { message?: string; path?: (string | number)[] }[];
      const first = issues[0];
      if (first?.message)
        msg = first.path?.length ? `${first.path.join(".")}: ${first.message}` : first.message;
    } catch {
      /* keep the raw message */
    }
  }
  const code = msg.split(":")[0] ?? "";
  if (AUTH_CODES.includes(code)) {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth"))
      window.location.assign("/auth");
    return msg.slice(code.length + 1).trim();
  }
  if (code === "FORBIDDEN") return msg.slice(code.length + 1).trim();
  return msg;
}

export function notifyError(e: unknown) {
  toast.error(errorText(e));
}

/** useQuery with consistent error handling. */
export function useApi<T>(
  key: QueryKey,
  fn: () => Promise<T>,
  opts: { enabled?: boolean; staleTime?: number; refetchInterval?: number } = {},
) {
  return useQuery({
    queryKey: key,
    queryFn: fn,
    staleTime: opts.staleTime ?? 15_000,
    refetchInterval: opts.refetchInterval ?? false,
    enabled: opts.enabled ?? true,
    retry: (count, err) =>
      count < 1 &&
      !/UNAUTHENTICATED|FORBIDDEN|MFA_|PASSWORD_CHANGE/.test(String((err as Error)?.message)),
  });
}

/** Mutation that toasts on success/failure and refreshes all queries (figures flow everywhere). */
export function useAction<TVars, TRes>(
  fn: (vars: TVars) => Promise<TRes>,
  success?: string | ((res: TRes) => string | null),
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (res) => {
      const msg = typeof success === "function" ? success(res) : success;
      if (msg) toast.success(msg);
      await qc.invalidateQueries();
    },
    onError: notifyError,
  });
}
