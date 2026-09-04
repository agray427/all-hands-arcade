/**
 * NTP-style half-RTT clock offset. Clients derive countdowns from the round's
 * `endsAt` plus this offset, so the server never has to tick every second to
 * a room of 100+ sockets.
 */
export function clockOffset(
  clientSentAt: number,
  serverNow: number,
  clientReceivedAt: number,
): number {
  const roundTrip = clientReceivedAt - clientSentAt;
  return serverNow + roundTrip / 2 - clientReceivedAt;
}
