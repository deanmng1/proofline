import { randomUUID } from "node:crypto";
import { authenticate } from "./auth.mjs";

export const installApi = async (context, runtime, metrics) => {
  let actor = null;
  let session = null;
  await context.route("**/work-api/**", async (route) => {
    const request = route.request();
    const operation = new URL(request.url()).pathname.slice("/work-api/".length);
    const authenticated =
      session &&
      (request.headers().cookie ?? "")
        .split(";")
        .map((entry) => entry.trim())
        .includes(`desk_session=${session}`)
        ? actor
        : null;
    const headers = {};
    try {
      let result;
      if (operation === "session") {
        result = authenticated;
        if (request.method() === "POST") {
          actor = authenticate(request.postDataJSON().username);
          session = randomUUID();
          headers["set-cookie"] = `desk_session=${session}; HttpOnly; SameSite=Strict; Path=/`;
          result = actor;
        }
        if (request.method() === "DELETE") {
          actor = null;
          session = null;
          result = null;
          headers["set-cookie"] = "desk_session=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/";
        }
      } else if (operation === "orders" && request.method() === "GET")
        result = runtime.list(authenticated);
      else if (/^orders\/[^/]+\/complete$/.test(operation) && request.method() === "POST") {
        metrics.mutations++;
        result = runtime.complete(
          authenticated,
          operation.split("/")[1],
          request.postDataJSON().commandId,
        );
      } else throw new Error("Unknown test API operation");
      await route.fulfill({ json: result, headers });
    } catch (error) {
      await route.fulfill({ status: 403, json: { error: error.message } });
    }
  });
};
