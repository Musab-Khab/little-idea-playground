import { useState, type FormEvent, type ReactNode } from "react";
import { useRouteContext, useRouter } from "@tanstack/react-router";
import { BookOpen, KeyRound, LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  beginMfaSetup,
  changePassword,
  confirmMfaSetup,
  login,
  logout,
  verifyMfa,
} from "@/server/functions/auth";
import { errorText } from "@/lib/api";

export function AuthScreen() {
  const { authState } = useRouteContext({ from: "/auth" });
  const router = useRouter();
  // Re-runs the route guard, which moves to the next stage or into the app.
  const refresh = () => router.invalidate();

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-card">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen />
          </span>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">TURNKEY PUBLISHERS</p>
            <h1 className="text-3xl font-extrabold text-navy">MFAHH</h1>
          </div>
        </div>
        {authState.stage === "signedOut" && <LoginForm onDone={refresh} />}
        {authState.stage === "mfa" && <MfaForm onDone={refresh} />}
        {authState.stage === "mfaSetup" && <MfaSetup onDone={refresh} />}
        {authState.stage === "changePassword" && <ChangePasswordForm onDone={refresh} />}
        {authState.stage !== "signedOut" && (
          <Button
            variant="link"
            size="sm"
            className="mt-4 px-0"
            onClick={async () => {
              await logout();
              await refresh();
            }}
          >
            Sign in as a different user
          </Button>
        )}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Knowledge Today, A Brighter Tomorrow
        </p>
      </div>
    </main>
  );
}

function useSubmit(action: () => Promise<unknown>, onDone: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await action();
      await onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

function Shell({
  title,
  icon,
  children,
  note,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  note?: string;
}) {
  return (
    <>
      <h2 className="mb-1 flex items-center gap-2 text-xl font-bold">
        {icon}
        {title}
      </h2>
      {note && <p className="mb-5 text-sm text-muted-foreground">{note}</p>}
      {children}
    </>
  );
}

function LoginForm({ onDone }: { onDone: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, submit } = useSubmit(() => login({ data: { email, password } }), onDone);
  return (
    <Shell title="Sign in" icon={<LockKeyhole className="size-5" />}>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button className="w-full" disabled={busy} type="submit">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Forgot your password? Ask your administrator to reset it. Accounts lock for 15 minutes
          after 5 failed attempts.
        </p>
      </form>
    </Shell>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      required
      autoFocus
      className="text-center text-2xl tracking-[0.5em]"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      aria-label="6-digit code"
    />
  );
}

function MfaForm({ onDone }: { onDone: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const { busy, error, submit } = useSubmit(() => verifyMfa({ data: { code } }), onDone);
  return (
    <Shell
      title="Two-factor authentication"
      icon={<Smartphone className="size-5" />}
      note="Enter the 6-digit code from your authenticator app."
    >
      <form onSubmit={submit} className="space-y-4">
        <CodeInput value={code} onChange={setCode} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button className="w-full" disabled={busy || code.length !== 6} type="submit">
          Verify
        </Button>
      </form>
    </Shell>
  );
}

function MfaSetup({ onDone }: { onDone: () => Promise<void> }) {
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [startError, setStartError] = useState("");
  const { busy, error, submit } = useSubmit(() => confirmMfaSetup({ data: { code } }), onDone);
  return (
    <Shell
      title="Set up two-factor authentication"
      icon={<ShieldCheck className="size-5" />}
      note="Your role handles financial data, so a second factor is required. Use Google Authenticator, Microsoft Authenticator or a similar app."
    >
      {!setup ? (
        <div className="space-y-3">
          <Button
            className="w-full"
            onClick={async () => {
              try {
                setSetup(await beginMfaSetup());
              } catch (e) {
                setStartError(errorText(e));
              }
            }}
          >
            Show QR code
          </Button>
          {startError && (
            <p role="alert" className="text-sm text-destructive">
              {startError}
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <img
            src={setup.qr}
            alt="Scan this QR code with your authenticator app"
            className="mx-auto size-48 rounded-lg border"
          />
          <p className="break-all text-center text-xs text-muted-foreground">
            Can't scan? Enter this key: <span className="font-mono">{setup.secret}</span>
          </p>
          <Label>Code shown in the app</Label>
          <CodeInput value={code} onChange={setCode} />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button className="w-full" disabled={busy || code.length !== 6} type="submit">
            Enable and continue
          </Button>
        </form>
      )}
    </Shell>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => Promise<void> }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const { busy, error, submit } = useSubmit(async () => {
    if (next !== confirm) throw new Error("The new passwords do not match.");
    await changePassword({ data: { current, next } });
  }, onDone);
  return (
    <Shell
      title="Choose a new password"
      icon={<KeyRound className="size-5" />}
      note="At least 10 characters. Avoid common words and your name."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cur">Current (temporary) password</Label>
          <Input
            id="cur"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new">New password</Label>
          <Input
            id="new"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="conf">Confirm new password</Label>
          <Input
            id="conf"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button className="w-full" disabled={busy} type="submit">
          Save password
        </Button>
      </form>
    </Shell>
  );
}
