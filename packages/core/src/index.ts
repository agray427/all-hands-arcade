export { envelope, isEnvelopeShape } from "./protocol/envelope.js";
export {
  roomCreate,
  roomJoin,
  roomLeave,
  roomWelcome,
  roomState,
  roomPlayerJoined,
  engineError,
  validateClient,
} from "./protocol/messages.js";

export type { Id as ParticipantId, Role, Participant } from "./models/participant.js";
export type { Id as RoomId, Room } from "./models/room.js";
export type { RoomView } from "./protocol/dto.js";
export type {
  TargetAudience,
  EngineErrorCode,
  EnvelopeOptions,
  BaseMessage,
  ServerBroadcastEnvelope,
} from "./protocol/envelope.js";
export type {
  RoomCreatePayload,
  RoomJoinPayload,
  RoomLeavePayload,
  RoomWelcomePayload,
  RoomStatePayload,
  RoomPlayerJoinedPayload,
  EngineErrorPayload,
  ClientMessageMap,
  ServerMessageMap,
  ClientMessage,
  ServerMessage,
} from "./protocol/messages.js";
