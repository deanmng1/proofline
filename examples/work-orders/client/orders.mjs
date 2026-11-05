export const createOrders = () => {
  const orders = [
    { id: "north-1", organization: "north", title: "Replace lobby lamp", state: "requested" },
    { id: "south-1", organization: "south", title: "Inspect loading door", state: "requested" },
  ];
  const receipts = new Map();
  const authenticated = (actor) => {
    if (!actor) throw new Error("Authentication required");
  };
  return {
    list(actor) {
      authenticated(actor);
      return structuredClone(orders.filter((order) => order.organization === actor.organization));
    },
    complete(actor, id, commandId) {
      authenticated(actor);
      if (actor.role !== "dispatcher") throw new Error("Role denied");
      const order = orders.find((candidate) => candidate.id === id);
      if (!order) throw new Error("Request missing");
      if (order.organization !== actor.organization) throw new Error("Organization denied");
      if (!commandId) throw new Error("Command identity required");
      const key = `${actor.organization}:${id}:${commandId}`;
      if (receipts.has(key)) return structuredClone(receipts.get(key));
      if (order.state !== "requested") throw new Error("Already completed");
      order.state = "completed";
      receipts.set(key, structuredClone(order));
      return structuredClone(order);
    },
    snapshot: () => structuredClone(orders),
  };
};
