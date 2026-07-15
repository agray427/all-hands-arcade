import {
  generateId,
  generateRoomCode,
  type Participant,
  type Room,
  type RoomCode,
  type RoomView,
} from "@arcade/core";

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
  private tokens = new Map<RoomCode, Map<string, string>>();

  create(hostName: string): { view: RoomView; host: Participant; resumeToken: string } {
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
    const resumeToken = this.issueToken(code, host.id);
    return { view: toView(room), host, resumeToken };
  }

  join(
    code: RoomCode,
    name: string,
    asHost: boolean,
  ): { view: RoomView; participant: Participant; resumeToken: string } | null {
    const room = this.rooms.get(code);
    if (!room) return null;

    const participant: Participant = {
      id: generateId("p"),
      name,
      role: asHost ? "host" : "player",
      connected: true,
    };
    room.participants[participant.id] = participant;
    const resumeToken = this.issueToken(code, participant.id);
    return { view: toView(room), participant, resumeToken };
  }

  rejoin(
    code: RoomCode,
    participantId: string,
    resumeToken: string,
  ): { view: RoomView; participant: Participant; resumeToken: string } | null {
    const room = this.rooms.get(code);
    const participant = room?.participants[participantId];
    const expected = this.tokens.get(code)?.get(participantId);
    if (!room || !participant || !expected || expected !== resumeToken) return null;
    participant.connected = true;
    return { view: toView(room), participant: { ...participant }, resumeToken };
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
    const roomTokens = this.tokens.get(code);
    if (roomTokens) {
      roomTokens.delete(id);
      if (roomTokens.size === 0) this.tokens.delete(code);
    }
    return toView(room);
  }

  private issueToken(code: RoomCode, participantId: string): string {
    let roomTokens = this.tokens.get(code);
    if (!roomTokens) {
      roomTokens = new Map();
      this.tokens.set(code, roomTokens);
    }
    const token = generateId("t");
    roomTokens.set(participantId, token);
    return token;
  }
}
