// Shared rooms are an explicit opt-in for the old LAN prototype.
if(['race','lan-practice'].includes(process.env.GAME_MODE))await import('./lan-server.js');
else await import('./solo-server.js');
