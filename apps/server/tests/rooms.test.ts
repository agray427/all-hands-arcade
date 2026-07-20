import { describe, expect, it } from "vitest";
import { RoomStore } from "../src/rooms.js";

describe("RoomStore", () => {
  it("create makes a room with a connected host", () => {
    const store = new RoomStore();
    const { view, host } = store.create("Ada");

    expect(view.id).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    expect(host.name).toBe("Ada");
    expect(host.role).toBe("host");
    expect(host.connected).toBe(true);
    expect(view.participants[host.id]).toEqual(host);
    expect(Object.keys(view.participants)).toHaveLength(1);
  });

  it("join adds a player to an existing room", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    const result = store.join(view.id, "Grace", false);

    expect(result).not.toBeNull();
    expect(result!.participant.role).toBe("player");
    expect(result!.participant.connected).toBe(true);
    expect(Object.keys(result!.view.participants)).toHaveLength(2);
  });

  it("join with asHost grants the host role", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    const result = store.join(view.id, "Grace", true);
    expect(result!.participant.role).toBe("host");
  });

  it("join returns null for an unknown room", () => {
    const store = new RoomStore();
    expect(store.join("ZZZZ", "Grace", false)).toBeNull();
  });

  it("get returns a view or null", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    expect(store.get(view.id)?.id).toBe(view.id);
    expect(store.get("ZZZZ")).toBeNull();
  });

  it("setConnected flips the participant flag", () => {
    const store = new RoomStore();
    const { view, host } = store.create("Ada");

    const updated = store.setConnected(view.id, host.id, false);
    expect(updated!.participants[host.id]!.connected).toBe(false);

    const restored = store.setConnected(view.id, host.id, true);
    expect(restored!.participants[host.id]!.connected).toBe(true);
  });

  it("setConnected returns null for unknown room or participant", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    expect(store.setConnected("ZZZZ", "p_x", false)).toBeNull();
    expect(store.setConnected(view.id, "p_x", false)).toBeNull();
  });

  it("remove drops the participant from the room", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    const { participant } = store.join(view.id, "Grace", false)!;

    const updated = store.remove(view.id, participant.id);
    expect(updated!.participants[participant.id]).toBeUndefined();
    expect(Object.keys(updated!.participants)).toHaveLength(1);
  });

  it("remove returns null for an unknown room", () => {
    const store = new RoomStore();
    expect(store.remove("ZZZZ", "p_x")).toBeNull();
  });

  it("views are snapshots, not live references", () => {
    const store = new RoomStore();
    const { view, host } = store.create("Ada");
    store.setConnected(view.id, host.id, false);
    expect(view.participants[host.id]!.connected).toBe(true);
  });
});
