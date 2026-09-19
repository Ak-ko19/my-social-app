import { createContext } from 'react';

// { socket: Socket|null, connectionState: 'connecting' | 'connected' | 'disconnected' }
// `socket` is null whenever there's no authenticated user -- consumers should
// treat a null socket the same as 'disconnected'.
const SocketContext = createContext(null);

export default SocketContext;
