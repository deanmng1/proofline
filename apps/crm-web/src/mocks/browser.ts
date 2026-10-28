import { createMswHandlers, createTestApi } from "@testbed/api-contracts";
import { setupWorker } from "msw/browser";
import { handlers } from "@/mocks/handlers";

/** A browser session gets its own CRM Test API; template handlers still own non-CRM routes. */
export const worker = setupWorker(...handlers, ...createMswHandlers(createTestApi()));
