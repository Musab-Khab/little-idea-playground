import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const isProd = process.env.NODE_ENV === "production";
const https = (process.env.APP_URL ?? "").startsWith("https://");

/** Security headers on every response. CSP is relaxed in dev for Vite's HMR. */
const securityHeaders = createMiddleware().server(async ({ next }) => {
  setResponseHeader("X-Content-Type-Options", "nosniff");
  setResponseHeader("X-Frame-Options", "DENY");
  setResponseHeader("Referrer-Policy", "same-origin");
  setResponseHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  setResponseHeader("Cross-Origin-Opener-Policy", "same-origin");
  if (https) setResponseHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  if (isProd) {
    setResponseHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    );
  }
  return next();
});

// Defining src/start.ts opts out of Start's default CSRF protection, so add it back explicitly:
// server functions only accept same-origin requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, securityHeaders, csrfMiddleware],
}));
