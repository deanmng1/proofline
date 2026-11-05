import { useCallback, useEffect, useState } from "react";

const api = async (url, options) => {
  const response = await fetch(`/work-api/${url}`, {
    ...options,
    headers: { "content-type": "application/json" },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
};

export function App() {
  const [actor, setActor] = useState(undefined);
  const [route, setRoute] = useState(location.pathname);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const navigate = useCallback((url) => {
    history.pushState({}, "", url);
    setRoute(location.pathname);
  }, []);
  useEffect(() => {
    const listener = () => setRoute(location.pathname);
    addEventListener("popstate", listener);
    api("session")
      .then(setActor)
      .catch(() => setActor(null));
    return () => removeEventListener("popstate", listener);
  }, []);
  useEffect(() => {
    if (actor === null && route !== "/signin")
      navigate(`/signin?return=${encodeURIComponent(route)}`);
    if (actor)
      api("orders")
        .then(setOrders)
        .catch((failure) => setError(failure.message));
  }, [actor, route, navigate]);
  if (actor === undefined) return <p>Loading workspace</p>;
  if (!actor)
    return (
      <main>
        <h1>Work desk sign in</h1>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              const result = await api("session", {
                method: "POST",
                body: JSON.stringify({
                  username: new FormData(event.currentTarget).get("username"),
                }),
              });
              const destination =
                new URLSearchParams(location.search).get("return") || "/desk/requests";
              setActor(result);
              navigate(destination.startsWith("/desk/") ? destination : "/desk/requests");
            } catch (failure) {
              setError(failure.message);
            }
          }}
        >
          <label>
            Desk identity
            <input name="username" required />
          </label>
          <button type="submit">Sign in</button>
        </form>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  const denied = route !== "/desk/completed" && actor.role !== "dispatcher";
  return (
    <main>
      <header>
        <p>
          {actor.organization} · {actor.role}
        </p>
        <nav aria-label="Desk navigation">
          {actor.role === "dispatcher" && (
            <a
              href="/desk/requests"
              onClick={(event) => {
                event.preventDefault();
                navigate("/desk/requests");
              }}
            >
              Requests
            </a>
          )}
          <a
            href="/desk/completed"
            onClick={(event) => {
              event.preventDefault();
              navigate("/desk/completed");
            }}
          >
            Completed
          </a>
          <button
            type="button"
            onClick={async () => {
              await api("session", { method: "DELETE" });
              setActor(null);
              navigate("/signin");
            }}
          >
            Sign out
          </button>
        </nav>
      </header>
      {denied ? (
        <h1>Permission denied</h1>
      ) : (
        <>
          <h1>{route === "/desk/completed" ? "Completed work" : "Requested work"}</h1>
          <ul>
            {orders
              .filter(
                (order) =>
                  order.state === (route === "/desk/completed" ? "completed" : "requested"),
              )
              .map((order) => (
                <li key={order.id}>
                  {order.title}
                  {route !== "/desk/completed" && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await api(`orders/${order.id}/complete`, {
                            method: "POST",
                            body: JSON.stringify({ commandId: `complete-${order.id}` }),
                          });
                          setOrders(await api("orders"));
                        } catch (failure) {
                          setError(failure.message);
                        }
                      }}
                    >
                      Complete {order.title}
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
