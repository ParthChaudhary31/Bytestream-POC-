import React, { useState } from 'react';
import { NodeInitialization } from './NodeInitialization';
import { Button } from './ui/button';
import { Copy, CheckCircle2 } from 'lucide-react';
import { apiService } from '../services/api';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  setUser1Keys,
  setHubKeys,
  setUser2Keys,
  setUser1HubTaproot,
  setUser2HubTaproot,
  setUser1TransactionTxid,
  setUser2TransactionTxid,
  type UserKeys,
  type TaprootMultisig,
} from '../store/slices/networkSlice';

export function NetworkSetup() {
  const dispatch = useAppDispatch();
  const networkState = useAppSelector((state) => state.network);
  const { user1Keys, hubKeys, user2Keys, user1HubTaproot, user2HubTaproot, user1TransactionTxid, user2TransactionTxid } = networkState;
  
  const [loadingUser1Hub, setLoadingUser1Hub] = useState(false);
  const [loadingUser2Hub, setLoadingUser2Hub] = useState(false);
  const [loadingUser1Transaction, setLoadingUser1Transaction] = useState(false);
  const [loadingUser2Transaction, setLoadingUser2Transaction] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const allKeysGenerated = user1Keys && hubKeys && user2Keys;
  console.log('allKeysGenerated', allKeysGenerated)

  const handleUser1KeysGenerated = (keys: UserKeys) => {
    dispatch(setUser1Keys(keys));
  };

  const handleHubKeysGenerated = (keys: UserKeys) => {
    dispatch(setHubKeys(keys));
  };

  const handleUser2KeysGenerated = (keys: UserKeys) => {
    dispatch(setUser2Keys(keys));
  };

  const handleCreateUser1HubTaproot = async () => {
    if (!user1Keys || !hubKeys) return;
    setLoadingUser1Hub(true);
    try {
      const result = await apiService.createTaprootMultisig(user1Keys.address, hubKeys.address);
      dispatch(setUser1HubTaproot(result));
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
      dispatch(setUser2HubTaproot(result));
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

  const handleCreateUser1Transaction = async () => {
    if (!user1Keys || !hubKeys) return;
    setLoadingUser1Transaction(true);
    try {
      const result = await apiService.createTransaction(
        user1Keys.address,
        hubKeys.address,
        user1Keys.privateKey,
        hubKeys.privateKey
      );
      dispatch(setUser1TransactionTxid(result.txid));
      alert(`Transaction created and broadcasted successfully! TXID: ${result.txid}`);
    } catch (error) {
      console.error('Failed to create transaction:', error);
      alert(`Failed to create transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingUser1Transaction(false);
    }
  };

  const handleCreateUser2Transaction = async () => {
    if (!user2Keys || !hubKeys) return;
    setLoadingUser2Transaction(true);
    try {
      const result = await apiService.createTransaction(
        user2Keys.address,
        hubKeys.address,
        user2Keys.privateKey,
        hubKeys.privateKey
      );
      dispatch(setUser2TransactionTxid(result.txid));
      alert(`Transaction created and broadcasted successfully! TXID: ${result.txid}`);
    } catch (error) {
      console.error('Failed to create transaction:', error);
      alert(`Failed to create transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingUser2Transaction(false);
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
          <div className="flex flex-col justify-center">
            <NodeInitialization
              userLabel="User 1"
              existingKeys={user1Keys}
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
                {/* Create Transaction Button for User 1 + Hub */}
                {user1Keys && hubKeys && (
                  <div className="mt-4">
                    <Button
                      onClick={handleCreateUser1Transaction}
                      disabled={loadingUser1Transaction}
                      className="w-full bg-[#10B981] hover:bg-[#10B981]/90 text-white h-10 disabled:opacity-50"
                    >
                      {loadingUser1Transaction ? 'Creating Transaction...' : 'Create & Broadcast Transaction'}
                    </Button>
                    {user1TransactionTxid && (
                      <div className="mt-2">
                        <p className="text-[#888] text-xs mb-1">Transaction ID</p>
                        <div className="flex gap-2">
                          <div className="flex-1 bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs break-all text-white">
                            {user1TransactionTxid}
                          </div>
                          <Button
                            onClick={() => handleCopy(user1TransactionTxid, 'user1-txid')}
                            size="sm"
                            className="bg-[#2C2C2C] hover:bg-[#3C3C3C] text-white px-3"
                          >
                            {copied === 'user1-txid' ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Hub */}
          <div>
            <NodeInitialization
              userLabel="Hub"
              existingKeys={hubKeys}
              onKeysGenerated={handleHubKeysGenerated}
            />
          </div>

          {/* User 2 */}
          <div className="flex flex-col justify-center">
            <NodeInitialization
              userLabel="User 2"
              existingKeys={user2Keys}
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
                {/* Create Transaction Button for User 2 + Hub */}
                {user2Keys && hubKeys && (
                  <div className="mt-4">
                    <Button
                      onClick={handleCreateUser2Transaction}
                      disabled={loadingUser2Transaction}
                      className="w-full bg-[#10B981] hover:bg-[#10B981]/90 text-white h-10 disabled:opacity-50"
                    >
                      {loadingUser2Transaction ? 'Creating Transaction...' : 'Create & Broadcast Transaction'}
                    </Button>
                    {user2TransactionTxid && (
                      <div className="mt-2">
                        <p className="text-[#888] text-xs mb-1">Transaction ID</p>
                        <div className="flex gap-2">
                          <div className="flex-1 bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs break-all text-white">
                            {user2TransactionTxid}
                          </div>
                          <Button
                            onClick={() => handleCopy(user2TransactionTxid, 'user2-txid')}
                            size="sm"
                            className="bg-[#2C2C2C] hover:bg-[#3C3C3C] text-white px-3"
                          >
                            {copied === 'user2-txid' ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
    </div>
  );
}

