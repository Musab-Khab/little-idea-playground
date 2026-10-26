import { createFileRoute } from '@tanstack/react-router';

// One-click demo sign-in: performs the anonymous signup server-side so the
// browser never talks to the auth host directly (some networks block it).
export const Route = createFileRoute('/api/public/auth-anon')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const res = await fetch(`${process.env['SUPABASE_URL']}/auth/v1/signup`, {
            method: 'POST',
            headers: {
              apikey: process.env['SUPABASE_PUBLISHABLE_KEY']!,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ data: {}, gotrue_meta_security: {} }),
          });
          const data = await res.json();
          return Response.json(data, { status: res.status });
        } catch {
          return Response.json({ error: 'Sign-in service unavailable' }, { status: 502 });
        }
      },
    },
  },
});
