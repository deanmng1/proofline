import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import i18n from "@/features/i18n/i18n";
import { resetMockState } from "@/mocks/handlers";
import { server } from "@/test/server";

const storage = new Map<string, string>();

Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
  },
  writable: true,
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, "ResizeObserver", {
  value: ResizeObserverMock,
  writable: true,
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => {
  window.localStorage.clear();
  resetMockState();
  server.resetHandlers();
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

afterAll(() => server.close());
