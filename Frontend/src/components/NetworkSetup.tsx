import React, { useState } from 'react';
import { NodeInitialization } from './NodeInitialization';
import { Button } from './ui/button';
import { Copy, CheckCircle2 } from 'lucide-react';
import { apiService } from '../services/api';

interface UserKeys {
  address: string;
  privateKey: string;
  publicKey: string;
}

interface TaprootMultisig {
  address: string;
  scriptHex: string;
}

export function NetworkSetup() {
  const [user1Keys, setUser1Keys] = useState<UserKeys | null>(null);
  const [hubKeys, setHubKeys] = useState<UserKeys | null>(null);
  const [user2Keys, setUser2Keys] = useState<UserKeys | null>(null);
  const [user1HubTaproot, setUser1HubTaproot] = useState<TaprootMultisig | null>(null);
  const [user2HubTaproot, setUser2HubTaproot] = useState<TaprootMultisig | null>(null);
  const [loadingUser1Hub, setLoadingUser1Hub] = useState(false);
  const [loadingUser2Hub, setLoadingUser2Hub] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const allKeysGenerated = user1Keys && hubKeys && user2Keys;
  console.log('allKeysGenerated', allKeysGenerated)

  const handleUser1KeysGenerated = (keys: UserKeys) => {
    setUser1Keys(keys);
  };

  const handleHubKeysGenerated = (keys: UserKeys) => {
    setHubKeys(keys);
  };

  const handleUser2KeysGenerated = (keys: UserKeys) => {
    setUser2Keys(keys);
  };

  const handleCreateUser1HubTaproot = async () => {
    if (!user1Keys || !hubKeys) return;
    setLoadingUser1Hub(true);
    try {
      const result = await apiService.createTaprootMultisig(user1Keys.address, hubKeys.address);
      setUser1HubTaproot(result);
    } catch (error) {
      console.error('Failed to create taproot multisig:', error);
      alert('Failed to create taproot multisig. Please try again.');
    } finally {
      setLoadingUser1Hub(false);
    }
  };

  const handleCreateUser2HubTaproot = async () => {
    if (!user2Keys || !hubKeys) return;
    setLoadingUser2Hub(true);
    try {
      const result = await apiService.createTaprootMultisig(user2Keys.address, hubKeys.address);
      setUser2HubTaproot(result);
    } catch (error) {
      console.error('Failed to create taproot multisig:', error);
      alert('Failed to create taproot multisig. Please try again.');
    } finally {
      setLoadingUser2Hub(false);
    }
  };

  const handleCopy = (value: string, type: string) => {
    navigator.clipboard.writeText(value);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen w-full flex flex-col px-6 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-white mb-2">ByteStream Network Setup</h1>
        <p className="text-[#888]">Initialize User 1, Hub, and User 2 nodes</p>
      </div>

      <div className="grid grid-cols-3 gap-6 flex-1 w-full">
          {/* User 1 */}
          <div className="flex flex-col justify-center">
            <NodeInitialization
              userLabel="User 1"
              onKeysGenerated={handleUser1KeysGenerated}
            />
            
            {/* Taproot Button for User 1 + Hub */}
            {allKeysGenerated && (
              <div className="mt-6 bg-[#1A1A1A] border-2 border-[#2C2C2C] rounded-lg p-6">
                <div className="mb-4">
                  <p className="text-[#888] text-xs mb-2">User 1 Address</p>
                  <div className="bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs break-all text-white">
                    {user1Keys?.address}
                  </div>
                </div>
                <div className="mb-4">
                  <p className="text-[#888] text-xs mb-2">Hub Address</p>
                  <div className="bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs break-all text-white">
                    {hubKeys?.address}
                  </div>
                </div>
                <Button
                  onClick={handleCreateUser1HubTaproot}
                  disabled={loadingUser1Hub || !!user1HubTaproot}
                  className="w-full bg-[#FF9F1C] hover:bg-[#FF9F1C]/90 text-black h-10 disabled:opacity-50"
                >
                  {loadingUser1Hub ? 'Creating...' : user1HubTaproot ? 'Taproot Created' : 'Create Taproot'}
                </Button>
                {user1HubTaproot && (
                  <div className="mt-4">
                    <p className="text-[#888] text-xs mb-2">Taproot Address</p>
                    <div className="flex gap-2">
                      <div className="flex-1 bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs break-all text-white">
                        {user1HubTaproot.address}
                      </div>
                      <Button
                        onClick={() => handleCopy(user1HubTaproot.address, 'user1hub-address')}
                        size="sm"
                        className="bg-[#2C2C2C] hover:bg-[#3C3C3C] text-white px-3"
                      >
                        {copied === 'user1hub-address' ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Hub */}
          <div>
            <NodeInitialization
              userLabel="Hub"
              onKeysGenerated={handleHubKeysGenerated}
            />
          </div>

          {/* User 2 */}
          <div className="flex flex-col justify-center">
            <NodeInitialization
              userLabel="User 2"
              onKeysGenerated={handleUser2KeysGenerated}
            />
            
            {/* Taproot Button for User 2 + Hub */}
            {allKeysGenerated && (
              <div className="mt-6 bg-[#1A1A1A] border-2 border-[#2C2C2C] rounded-lg p-6">
                <div className="mb-4">
                  <p className="text-[#888] text-xs mb-2">User 2 Address</p>
                  <div className="bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs break-all text-white">
                    {user2Keys?.address}
                  </div>
                </div>
                <div className="mb-4">
                  <p className="text-[#888] text-xs mb-2">Hub Address</p>
                  <div className="bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs break-all text-white">
                    {hubKeys?.address}
                  </div>
                </div>
                <Button
                  onClick={handleCreateUser2HubTaproot}
                  disabled={loadingUser2Hub || !!user2HubTaproot}
                  className="w-full bg-[#FF9F1C] hover:bg-[#FF9F1C]/90 text-black h-10 disabled:opacity-50"
                >
                  {loadingUser2Hub ? 'Creating...' : user2HubTaproot ? 'Taproot Created' : 'Create Taproot'}
                </Button>
                {user2HubTaproot && (
                  <div className="mt-4">
                    <p className="text-[#888] text-xs mb-2">Taproot Address</p>
                    <div className="flex gap-2">
                      <div className="flex-1 bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs break-all text-white">
                        {user2HubTaproot.address}
                      </div>
                      <Button
                        onClick={() => handleCopy(user2HubTaproot.address, 'user2hub-address')}
                        size="sm"
                        className="bg-[#2C2C2C] hover:bg-[#3C3C3C] text-white px-3"
                      >
                        {copied === 'user2hub-address' ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
    </div>
  );
}

