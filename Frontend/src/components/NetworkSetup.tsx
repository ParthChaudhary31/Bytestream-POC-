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
  const [user2Keys, setUser2Keys] = useState<UserKeys | null>(null);
  const [hubStatus, setHubStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  const handleUser1KeysGenerated = (keys: UserKeys) => {
    setUser1Keys(keys);
    checkHubConnection();
  };

  const handleUser2KeysGenerated = (keys: UserKeys) => {
    setUser2Keys(keys);
    checkHubConnection();
  };

  const checkHubConnection = () => {
    if (user1Keys && user2Keys) {
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
            <div className="bg-[#1A1A1A] border-2 border-[#2C2C2C] rounded-lg p-8 h-full">
              <div className="mb-6">
                <h3 className="text-white text-lg font-semibold mb-2">Hub</h3>
              </div>

              <div className="text-center">
                <div className="mb-6 flex justify-center">
                  <div className={`w-16 h-16 rounded-lg flex items-center justify-center border-2 ${
                    hubStatus === 'connected'
                      ? 'bg-[#10B981]/10 border-[#10B981]'
                      : hubStatus === 'connecting'
                      ? 'bg-[#FF9F1C]/10 border-[#FF9F1C] animate-pulse'
                      : 'bg-[#2C2C2C]/10 border-[#2C2C2C]'
                  }`}>
                    {hubStatus === 'connected' ? (
                      <CheckCircle2 className="w-8 h-8 text-[#10B981]" />
                    ) : hubStatus === 'connecting' ? (
                      <Server className="w-8 h-8 text-[#FF9F1C]" />
                    ) : (
                      <XCircle className="w-8 h-8 text-[#888]" />
                    )}
                  </div>
                </div>

                <h2 className="mb-2 text-white text-xl font-semibold">Hub Status</h2>
                <p className={`text-sm mb-4 ${
                  hubStatus === 'connected'
                    ? 'text-[#10B981]'
                    : hubStatus === 'connecting'
                    ? 'text-[#FF9F1C]'
                    : 'text-[#888]'
                }`}>
                  {hubStatus === 'connected'
                    ? 'Connected'
                    : hubStatus === 'connecting'
                    ? 'Connecting...'
                    : 'Waiting for Users'}
                </p>

                {hubStatus === 'connected' && (
                  <div className="mt-4 space-y-2 text-left">
                    <div className="bg-[#0A0A0A] border border-[#2C2C2C] p-3 rounded">
                      <p className="text-xs text-[#888] mb-1">User 1</p>
                      <p className="text-xs text-white font-mono break-all">
                        {user1Keys?.address.substring(0, 20)}...
                      </p>
                    </div>
                    <div className="bg-[#0A0A0A] border border-[#2C2C2C] p-3 rounded">
                      <p className="text-xs text-[#888] mb-1">User 2</p>
                      <p className="text-xs text-white font-mono break-all">
                        {user2Keys?.address.substring(0, 20)}...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
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

