// src/frontend/src/lib/votingInterfaceSingleton.js
import { ICRC149VotingInterface } from './icrc149-voting-interface.js';

// Create a single global instance
export const votingInterface = new ICRC149VotingInterface();
