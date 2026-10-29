import { useApi } from "./api";
import { getLookups } from "@/server/functions/masters";

export type Lookups = Awaited<ReturnType<typeof getLookups>>;

/** Shared dropdown data (customers, books, accounts…) cached for a minute. */
export function useLookups() {
  return useApi(["lookups"], () => getLookups(), { staleTime: 60_000 });
}

export function nameOf<T extends { id: string; name: string }>(list: T[] | undefined, id: unknown) {
  return list?.find((x) => x.id === id)?.name ?? "";
}
