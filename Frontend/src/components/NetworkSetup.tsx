import React, { useState } from 'react';
import { NodeInitialization } from './NodeInitialization';
import { Server, CheckCircle2, XCircle } from 'lucide-react';

interface UserKeys {
  address: string;
  privateKey: string;
  publicKey: string;
}

export function NetworkSetup() {
  const [user1Keys, setUser1Keys] = useState<UserKeys | null>(null);
  const [hubKeys, setHubKeys] = useState<UserKeys | null>(null);
  const [user2Keys, setUser2Keys] = useState<UserKeys | null>(null);
  const [hubStatus, setHubStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  const handleUser1KeysGenerated = (keys: UserKeys) => {
    setUser1Keys(keys);
    checkHubConnection();
  };

  const handleHubKeysGenerated = (keys: UserKeys) => {
    setHubKeys(keys);
    checkHubConnection();
  };

  const handleUser2KeysGenerated = (keys: UserKeys) => {
    setUser2Keys(keys);
    checkHubConnection();
  };

  const checkHubConnection = () => {
    if (user1Keys && hubKeys && user2Keys) {
      setHubStatus('connecting');
      // Simulate hub connection check
      setTimeout(() => {
        setHubStatus('connected');
      }, 1500);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col px-6 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-white mb-2">ByteStream Network Setup</h1>
        <p className="text-[#888]">Initialize User 1, Hub, and User 2 nodes</p>
      </div>

      <div className="grid grid-cols-3 gap-6 flex-1 w-full">
          {/* User 1 */}
          <div>
            <NodeInitialization
              userLabel="User 1"
              onKeysGenerated={handleUser1KeysGenerated}
            />
          </div>

          {/* Hub */}
          <div>
            <NodeInitialization
              userLabel="Hub"
              onKeysGenerated={handleHubKeysGenerated}
            />
          </div>

          {/* User 2 */}
          <div>
            <NodeInitialization
              userLabel="User 2"
              onKeysGenerated={handleUser2KeysGenerated}
            />
          </div>
        </div>
    </div>
  );
}

