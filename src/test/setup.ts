import "@testing-library/jest-dom/vitest";

// Browser shims for jsdom tests; server tests run in the node environment without `window`.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", { writable: true, value: () => {} });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
