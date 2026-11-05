# Work orders portability example

A separate React/Vite work desk proves Proofline adaptation. Dispatchers complete requests within their organization; observers have read access and no completion authority. Organizations north and south own different requests. The UI authenticates through a cookie-session API adapter, uses `/desk/requests` and `/desk/completed`, and has no CRM imports or product fixtures.

The test-only entrypoint checks its launcher capability. Each browser test owns fresh runtime state and contexts; workers serve separate stateless test artifacts on allocated loopback ports. Production imports only the application and production transport. Providers and database durability are outside this example.

Run `pnpm proofline:validate-portability` from the Proofline checkout. It copies this target plus unchanged core into an OS temporary repository, reuses installed dependencies offline, and retains results under `artifacts/portability`. Chromium on the actual local runtime is the compatibility claim; other browsers, platforms and dependency versions are untested.
