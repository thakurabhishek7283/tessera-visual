import type { UserInfo } from '@tessera-kit/core';

/** Demo identities. `?user=bob` signs a tab in as Bob, so two tabs are two different people. */
export const USERS: Record<string, UserInfo> = {
  alice: { id: 'alice', name: 'Alice Archer', color: 'hsl(210 62% 36%)' },
  bob: { id: 'bob', name: 'Bob Baker', color: 'hsl(24 70% 36%)' },
  carol: { id: 'carol', name: 'Carol Chen', color: 'hsl(150 55% 28%)' },
  dave: { id: 'dave', name: 'Dave Diaz', color: 'hsl(280 45% 40%)' },
};

/** The next demo user after `id`, for the "open another tab" button. */
export function anotherUser(id: string): string {
  const ids = Object.keys(USERS);
  return ids[(ids.indexOf(id) + 1) % ids.length] ?? 'bob';
}
