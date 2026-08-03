import { PresenceService } from './presence.service';

describe('PresenceService', () => {
  let presence: PresenceService;

  beforeEach(() => {
    presence = new PresenceService();
  });

  it('treats an unknown user as offline', () => {
    expect(presence.isOnline('nobody')).toBe(false);
  });

  it('marks a user online once a socket connects', () => {
    presence.connect('u1');
    expect(presence.isOnline('u1')).toBe(true);
  });

  it('keeps the user online while any socket remains', () => {
    // Es lo que justifica contar en vez de guardar un booleano: con dos
    // pantallas abiertas, cerrar una no puede dejarlo "offline" y disparar push
    // de mensajes que está viendo llegar.
    presence.connect('u1');
    presence.connect('u1');

    presence.disconnect('u1');
    expect(presence.isOnline('u1')).toBe(true);

    presence.disconnect('u1');
    expect(presence.isOnline('u1')).toBe(false);
  });

  it('ignores a disconnect for a user that never connected', () => {
    expect(() => presence.disconnect('ghost')).not.toThrow();
    expect(presence.isOnline('ghost')).toBe(false);
  });

  it('does not go negative when disconnect is called twice', () => {
    presence.connect('u1');
    presence.disconnect('u1');
    presence.disconnect('u1');

    presence.connect('u1');
    expect(presence.isOnline('u1')).toBe(true);
    presence.disconnect('u1');
    expect(presence.isOnline('u1')).toBe(false);
  });

  it('tracks users independently', () => {
    presence.connect('u1');
    expect(presence.isOnline('u2')).toBe(false);
  });
});
