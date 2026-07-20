import { generateId, generateRoomCode } from "@arcade/util";
import type { Participant, Room, RoomCode, RoomView } from "@arcade/core";

function toView(room: Room): RoomView {
  const participants: Record<string, Participant> = {};
  for (const [id, participant] of Object.entries(room.participants)) {
    participants[id] = { ...participant };
  }
  return {
    code: room.code,
    participants,
    createdAt: room.createdAt,
  };
}

export class RoomStore {
  private rooms = new Map<RoomCode, Room>();

  create(hostName: string): { view: RoomView; host: Participant } {
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();

    const host: Participant = {
      id: generateId("p"),
      name: hostName,
      role: "host",
      connected: true,
    };
    const room: Room = {
      code,
      participants: { [host.id]: host },
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    return { view: toView(room), host };
  }

  join(
    code: RoomCode,
    name: string,
    asHost: boolean,
  ): { view: RoomView; participant: Participant } | null {
    const room = this.rooms.get(code);
    if (!room) return null;

    const participant: Participant = {
      id: generateId("p"),
      name,
      role: asHost ? "host" : "player",
      connected: true,
    };
    room.participants[participant.id] = participant;
    return { view: toView(room), participant };
  }

  get(code: RoomCode): RoomView | null {
    const room = this.rooms.get(code);
    return room ? toView(room) : null;
  }

  setConnected(code: RoomCode, id: string, connected: boolean): RoomView | null {
    const room = this.rooms.get(code);
    const participant = room?.participants[id];
    if (!room || !participant) return null;
    participant.connected = connected;
    return toView(room);
  }

  remove(code: RoomCode, id: string): RoomView | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    delete room.participants[id];
    return toView(room);
  }
}
