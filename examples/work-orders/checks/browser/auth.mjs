const identities = Object.freeze({
  "dispatch-north": { role: "dispatcher", organization: "north" },
  "dispatch-south": { role: "dispatcher", organization: "south" },
  "observe-north": { role: "observer", organization: "north" },
});
export const authenticate = (username) => {
  if (!Object.hasOwn(identities, username)) throw new Error("Identity denied");
  return structuredClone(identities[username]);
};
