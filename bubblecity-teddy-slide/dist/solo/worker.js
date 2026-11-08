import {createAuthority} from './authority.js';
const simulation=createAuthority(message=>postMessage(message));
onmessage=event=>simulation.receive(event.data);
