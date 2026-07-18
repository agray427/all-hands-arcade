import { describe, expect, it } from "vitest";
import { RoomStore } from "../src/rooms.js";

describe("RoomStore", () => {
  it("create makes a room with a connected host", () => {
    const store = new RoomStore();
    const { view, host } = store.create("Ada");

    expect(view.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    expect(host.name).toBe("Ada");
    expect(host.role).toBe("host");
    expect(host.connected).toBe(true);
    expect(view.participants[host.id]).toEqual(host);
    expect(Object.keys(view.participants)).toHaveLength(1);
  });

  it("join adds a player to an existing room", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    const result = store.join(view.code, "Grace", false);

    expect(result).not.toBeNull();
    expect(result!.participant.role).toBe("player");
    expect(result!.participant.connected).toBe(true);
    expect(Object.keys(result!.view.participants)).toHaveLength(2);
  });

  it("join with asHost grants the host role", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    const result = store.join(view.code, "Grace", true);
    expect(result!.participant.role).toBe("host");
  });

  it("join returns null for an unknown room", () => {
    const store = new RoomStore();
    expect(store.join("ZZZZ", "Grace", false)).toBeNull();
  });

  it("get returns a view or null", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    expect(store.get(view.code)?.code).toBe(view.code);
    expect(store.get("ZZZZ")).toBeNull();
  });

  it("setConnected flips the participant flag", () => {
    const store = new RoomStore();
    const { view, host } = store.create("Ada");

    const updated = store.setConnected(view.code, host.id, false);
    expect(updated!.participants[host.id]!.connected).toBe(false);

    const restored = store.setConnected(view.code, host.id, true);
    expect(restored!.participants[host.id]!.connected).toBe(true);
  });

  it("setConnected returns null for unknown room or participant", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    expect(store.setConnected("ZZZZ", "p_x", false)).toBeNull();
    expect(store.setConnected(view.code, "p_x", false)).toBeNull();
  });

  it("remove drops the participant from the room", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    const { participant } = store.join(view.code, "Grace", false)!;

    const updated = store.remove(view.code, participant.id);
    expect(updated!.participants[participant.id]).toBeUndefined();
    expect(Object.keys(updated!.participants)).toHaveLength(1);
  });

  it("remove returns null for an unknown room", () => {
    const store = new RoomStore();
    expect(store.remove("ZZZZ", "p_x")).toBeNull();
  });

  it("issues a distinct resume token to every participant", () => {
    const store = new RoomStore();
    const { view, resumeToken } = store.create("Ada");
    const joined = store.join(view.code, "Grace", false)!;

    expect(resumeToken).toMatch(/^t_/);
    expect(joined.resumeToken).toMatch(/^t_/);
    expect(joined.resumeToken).not.toBe(resumeToken);
  });

  it("never exposes resume tokens in room views", () => {
    const store = new RoomStore();
    const { view, host } = store.create("Ada");
    expect(JSON.stringify(store.get(view.code))).not.toContain("t_");
    expect(JSON.stringify(view.participants[host.id])).not.toContain("t_");
  });

  it("rejoin with a valid token reclaims the identity and reconnects it", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    const { participant, resumeToken } = store.join(view.code, "Grace", false)!;
    store.setConnected(view.code, participant.id, false);

    const result = store.rejoin(view.code, participant.id, resumeToken);
    expect(result).not.toBeNull();
    expect(result!.participant.id).toBe(participant.id);
    expect(result!.participant.name).toBe("Grace");
    expect(result!.participant.connected).toBe(true);
    expect(result!.view.participants[participant.id]!.connected).toBe(true);
    expect(Object.keys(result!.view.participants)).toHaveLength(2);
  });

  it("rejoin rejects a wrong token, unknown participant, or unknown room", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    const { participant, resumeToken } = store.join(view.code, "Grace", false)!;

    expect(store.rejoin(view.code, participant.id, "t_forged")).toBeNull();
    expect(store.rejoin(view.code, "p_ghost", resumeToken)).toBeNull();
    expect(store.rejoin("ZZZZ", participant.id, resumeToken)).toBeNull();
  });

  it("rejoin rejects a token after the participant left", () => {
    const store = new RoomStore();
    const { view } = store.create("Ada");
    const { participant, resumeToken } = store.join(view.code, "Grace", false)!;
    store.remove(view.code, participant.id);
    expect(store.rejoin(view.code, participant.id, resumeToken)).toBeNull();
  });

  it("issues a host key on create, keeps it out of views, and clears it with the room", () => {
    const store = new RoomStore();
    const { view, hostKey } = store.create("Ada");
    expect(hostKey).toMatch(/^h_/);
    expect(store.hostKey(view.code)).toBe(hostKey);
    expect(JSON.stringify(store.get(view.code))).not.toContain(hostKey);
    store.removeRoom(view.code);
    expect(store.hostKey(view.code)).toBeNull();
  });

  it("removeRoom deletes the room and invalidates its tokens", () => {
    const store = new RoomStore();
    const { view, host, resumeToken } = store.create("Ada");
    store.removeRoom(view.code);
    expect(store.get(view.code)).toBeNull();
    expect(store.rejoin(view.code, host.id, resumeToken)).toBeNull();
  });

  it("views are snapshots, not live references", () => {
    const store = new RoomStore();
    const { view, host } = store.create("Ada");
    store.setConnected(view.code, host.id, false);
    expect(view.participants[host.id]!.connected).toBe(true);
  });
});
