import { generateId, generateRoomId } from "@arcade/util";
import type { Participant, Room, RoomId, RoomView } from "@arcade/core";

function toView(room: Room): RoomView {
  const participants: Record<string, Participant> = {};
  for (const [id, participant] of Object.entries(room.participants)) {
    participants[id] = { ...participant };
  }
  return {
    id: room.id,
    participants,
    createdAt: room.createdAt,
  };
}

export class RoomStore {
  private rooms = new Map<RoomId, Room>();

  create(hostName: string): { view: RoomView; host: Participant } {
    let roomId = generateRoomId();
    while (this.rooms.has(roomId)) roomId = generateRoomId();

    const host: Participant = {
      id: generateId("p"),
      name: hostName,
      role: "host",
      connected: true,
    };
    const room: Room = {
      id: roomId,
      participants: { [host.id]: host },
      createdAt: Date.now(),
    };
    this.rooms.set(roomId, room);
    return { view: toView(room), host };
  }

  join(
    roomId: RoomId,
    name: string,
    asHost: boolean,
  ): { view: RoomView; participant: Participant } | null {
    const room = this.rooms.get(roomId);
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

  get(roomId: RoomId): RoomView | null {
    const room = this.rooms.get(roomId);
    return room ? toView(room) : null;
  }

  setConnected(roomId: RoomId, id: string, connected: boolean): RoomView | null {
    const room = this.rooms.get(roomId);
    const participant = room?.participants[id];
    if (!room || !participant) return null;
    participant.connected = connected;
    return toView(room);
  }

  remove(roomId: RoomId, id: string): RoomView | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    delete room.participants[id];
    return toView(room);
  }
}
