import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { getAuthState } from "@/server/functions/auth";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const state = await getAuthState();
    if (state.stage === "signedIn") throw redirect({ to: "/" });
    return { authState: state };
  },
  head: () => ({ meta: [{ title: "Sign in – MFAHH" }, { name: "robots", content: "noindex" }] }),
  component: AuthScreen,
});
