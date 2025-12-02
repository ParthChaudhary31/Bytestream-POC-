import React, { useState } from 'react';
import { NodeInitialization } from './NodeInitialization';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Copy, CheckCircle2, Trash2, ArrowRight, ArrowDown } from 'lucide-react';
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
  resetNetwork,
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
  const [manualTaprootUser1, setManualTaprootUser1] = useState('');
  const [manualTaprootUser2, setManualTaprootUser2] = useState('');
  const [broadcastPayloadUser1, setBroadcastPayloadUser1] = useState('');
  const [broadcastPayloadUser2, setBroadcastPayloadUser2] = useState('');
  const [editableUser1Address, setEditableUser1Address] = useState('');
  const [editableHubAddressUser1, setEditableHubAddressUser1] = useState('');
  const [editableUser2Address, setEditableUser2Address] = useState('');
  const [editableHubAddressUser2, setEditableHubAddressUser2] = useState('');
  
  // Manual transaction parameters for User 1
  const [manualUser1Address, setManualUser1Address] = useState('');
  const [manualHubAddressUser1, setManualHubAddressUser1] = useState('');
  const [manualUser1PrivateKey, setManualUser1PrivateKey] = useState('');
  const [manualHubPrivateKeyUser1, setManualHubPrivateKeyUser1] = useState('');
  const [manualNonceUser1, setManualNonceUser1] = useState('');
  const [manualMultisigAddressUser1, setManualMultisigAddressUser1] = useState('');
  
  // Manual transaction parameters for User 2
  const [manualUser2Address, setManualUser2Address] = useState('');
  const [manualHubAddressUser2, setManualHubAddressUser2] = useState('');
  const [manualUser2PrivateKey, setManualUser2PrivateKey] = useState('');
  const [manualHubPrivateKeyUser2, setManualHubPrivateKeyUser2] = useState('');
  const [manualNonceUser2, setManualNonceUser2] = useState('');
  const [manualMultisigAddressUser2, setManualMultisigAddressUser2] = useState('');

  // Initialize editable addresses when keys are available
  React.useEffect(() => {
    if (user1Keys?.address) {
      setEditableUser1Address(user1Keys.address);
      setManualUser1Address(user1Keys.address);
      setManualUser1PrivateKey(user1Keys.privateKey);
    }
    if (hubKeys?.address) {
      setEditableHubAddressUser1(hubKeys.address);
      setEditableHubAddressUser2(hubKeys.address);
      setManualHubAddressUser1(hubKeys.address);
      setManualHubAddressUser2(hubKeys.address);
      setManualHubPrivateKeyUser1(hubKeys.privateKey);
      setManualHubPrivateKeyUser2(hubKeys.privateKey);
    }
    if (user2Keys?.address) {
      setEditableUser2Address(user2Keys.address);
      setManualUser2Address(user2Keys.address);
      setManualUser2PrivateKey(user2Keys.privateKey);
    }
  }, [user1Keys?.address, hubKeys?.address, user2Keys?.address]);

  // Auto-fill broadcast fields when taproot is created
  React.useEffect(() => {
    if (user1HubTaproot) {
      // Auto-fill taproot address if manual field is empty
      if (!manualTaprootUser1) {
        setManualTaprootUser1(user1HubTaproot.address);
      }
      // Auto-fill multisig address
      if (!manualMultisigAddressUser1) {
        setManualMultisigAddressUser1(user1HubTaproot.address);
      }
      // Auto-fill addresses and keys if they're empty
      if (!manualUser1Address && user1Keys?.address) {
        setManualUser1Address(user1Keys.address);
      }
      if (!manualHubAddressUser1 && hubKeys?.address) {
        setManualHubAddressUser1(hubKeys.address);
      }
      if (!manualUser1PrivateKey && user1Keys?.privateKey) {
        setManualUser1PrivateKey(user1Keys.privateKey);
      }
      if (!manualHubPrivateKeyUser1 && hubKeys?.privateKey) {
        setManualHubPrivateKeyUser1(hubKeys.privateKey);
      }
    }
  }, [user1HubTaproot, user1Keys, hubKeys]);

  React.useEffect(() => {
    if (user2HubTaproot) {
      // Auto-fill taproot address if manual field is empty
      if (!manualTaprootUser2) {
        setManualTaprootUser2(user2HubTaproot.address);
      }
      // Auto-fill multisig address
      if (!manualMultisigAddressUser2) {
        setManualMultisigAddressUser2(user2HubTaproot.address);
      }
      // Auto-fill addresses and keys if they're empty
      if (!manualUser2Address && user2Keys?.address) {
        setManualUser2Address(user2Keys.address);
      }
      if (!manualHubAddressUser2 && hubKeys?.address) {
        setManualHubAddressUser2(hubKeys.address);
      }
      if (!manualUser2PrivateKey && user2Keys?.privateKey) {
        setManualUser2PrivateKey(user2Keys.privateKey);
      }
      if (!manualHubPrivateKeyUser2 && hubKeys?.privateKey) {
        setManualHubPrivateKeyUser2(hubKeys.privateKey);
      }
    }
  }, [user2HubTaproot, user2Keys, hubKeys]);

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
    const user1Addr = editableUser1Address || user1Keys?.address;
    const hubAddr = editableHubAddressUser1 || hubKeys?.address;
    if (!user1Addr || !hubAddr) {
      alert('Please enter User 1 Address and Hub Address');
      return;
    }
    setLoadingUser1Hub(true);
    try {
      const result = await apiService.createTaprootMultisig(user1Addr, hubAddr);
      dispatch(setUser1HubTaproot(result));
    } catch (error) {
      alert('Failed to create taproot multisig. Please try again.');
    } finally {
      setLoadingUser1Hub(false);
    }
  };

  const handleCreateUser2HubTaproot = async () => {
    const user2Addr = editableUser2Address || user2Keys?.address;
    const hubAddr = editableHubAddressUser2 || hubKeys?.address;
    if (!user2Addr || !hubAddr) {
      alert('Please enter User 2 Address and Hub Address');
      return;
    }
    setLoadingUser2Hub(true);
    try {
      const result = await apiService.createTaprootMultisig(user2Addr, hubAddr);
      dispatch(setUser2HubTaproot(result));
    } catch (error) {
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

  const handleClearRedux = () => {
    if (window.confirm('Are you sure you want to clear all network data? This will reset all keys, taproots, and transactions.')) {
      dispatch(resetNetwork());
      // Clear all local state
      setManualTaprootUser1('');
      setManualTaprootUser2('');
      setBroadcastPayloadUser1('');
      setBroadcastPayloadUser2('');
      setEditableUser1Address('');
      setEditableHubAddressUser1('');
      setEditableUser2Address('');
      setEditableHubAddressUser2('');
      setManualUser1Address('');
      setManualHubAddressUser1('');
      setManualUser1PrivateKey('');
      setManualHubPrivateKeyUser1('');
      setManualNonceUser1('');
      setManualMultisigAddressUser1('');
      setManualUser2Address('');
      setManualHubAddressUser2('');
      setManualUser2PrivateKey('');
      setManualHubPrivateKeyUser2('');
      setManualNonceUser2('');
      setManualMultisigAddressUser2('');
    }
  };

  const handleCreateUser1Transaction = async () => {
    setLoadingUser1Transaction(true);
    try {
      const userAddr = manualUser1Address || user1Keys?.address || '';
      const hubAddr = manualHubAddressUser1 || hubKeys?.address || '';
      const userPrivKey = manualUser1PrivateKey || user1Keys?.privateKey || '';
      const hubPrivKey = manualHubPrivateKeyUser1 || hubKeys?.privateKey || '';
      const nonce = manualNonceUser1 ? parseInt(manualNonceUser1) : undefined;
      const taprootAddress = manualTaprootUser1 || user1HubTaproot?.address;
      const multisigAddr = manualMultisigAddressUser1 || user1HubTaproot?.address || taprootAddress;
      
      if (!userAddr || !hubAddr || !userPrivKey || !hubPrivKey) {
        alert('Please fill in all required fields: User Address, Hub Address, User Private Key, and Hub Private Key');
        setLoadingUser1Transaction(false);
        return;
      }
      
      const result = await apiService.createTransaction(
        userAddr,
        hubAddr,
        userPrivKey,
        hubPrivKey,
        nonce,
        taprootAddress,
        broadcastPayloadUser1 || undefined,
        multisigAddr
      );
      dispatch(setUser1TransactionTxid(result.txid));
      alert(`Transaction created and broadcasted successfully! TXID: ${result.txid}`);
    } catch (error) {
      alert(`Failed to create transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingUser1Transaction(false);
    }
  };

  const handleCreateUser2Transaction = async () => {
    setLoadingUser2Transaction(true);
    try {
      const userAddr = manualUser2Address || user2Keys?.address || '';
      const hubAddr = manualHubAddressUser2 || hubKeys?.address || '';
      const userPrivKey = manualUser2PrivateKey || user2Keys?.privateKey || '';
      const hubPrivKey = manualHubPrivateKeyUser2 || hubKeys?.privateKey || '';
      const nonce = manualNonceUser2 ? parseInt(manualNonceUser2) : undefined;
      const taprootAddress = manualTaprootUser2 || user2HubTaproot?.address;
      const multisigAddr = manualMultisigAddressUser2 || user2HubTaproot?.address || taprootAddress;
      
      if (!userAddr || !hubAddr || !userPrivKey || !hubPrivKey) {
        alert('Please fill in all required fields: User Address, Hub Address, User Private Key, and Hub Private Key');
        setLoadingUser2Transaction(false);
        return;
      }
      
      const result = await apiService.createTransaction(
        userAddr,
        hubAddr,
        userPrivKey,
        hubPrivKey,
        nonce,
        taprootAddress,
        broadcastPayloadUser2 || undefined,
        multisigAddr
      );
      dispatch(setUser2TransactionTxid(result.txid));
      alert(`Transaction created and broadcasted successfully! TXID: ${result.txid}`);
    } catch (error) {
      alert(`Failed to create transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoadingUser2Transaction(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col px-6 py-8 relative">
      {/* Clear Redux Button - Top Right */}
      <div className="absolute top-6 right-6">
        <Button
          onClick={handleClearRedux}
          variant="destructive"
          className="bg-[#EF4444] hover:bg-[#EF4444]/90 text-white"
          size="sm"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Clear All Data
        </Button>
      </div>
      
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
            
            {/* Visual Connection Arrow from User 1 to Taproot */}
            <div className="mt-4 flex items-center justify-center">
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 mb-2">
                  <div className="bg-[#FF9F1C]/20 border border-[#FF9F1C] rounded px-3 py-1">
                    <span className="text-[#FF9F1C] text-xs font-semibold">User 1</span>
                  </div>
                  <span className="text-[#888] text-sm">+</span>
                  <div className="bg-[#FF9F1C]/20 border border-[#FF9F1C] rounded px-3 py-1">
                    <span className="text-[#FF9F1C] text-xs font-semibold">Hub</span>
                  </div>
                </div>
                <ArrowDown className="h-6 w-6 text-[#FF9F1C] mb-2" />
                <div className="bg-[#10B981]/20 border border-[#10B981] rounded px-3 py-1">
                  <span className="text-[#10B981] text-xs font-semibold">Taproot</span>
                </div>
              </div>
            </div>

            {/* Taproot Button for User 1 + Hub */}
            <div className="mt-6 bg-[#1A1A1A] border-2 border-[#2C2C2C] rounded-lg p-6">
                <div className="mb-4">
                  <p className="text-[#888] text-xs mb-2">User 1 Address</p>
                  <Input
                    type="text"
                    value={editableUser1Address}
                    onChange={(e) => setEditableUser1Address(e.target.value)}
                    className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                    placeholder="Enter User 1 address"
                  />
                </div>
                <div className="mb-4">
                  <p className="text-[#888] text-xs mb-2">Hub Address</p>
                  <Input
                    type="text"
                    value={editableHubAddressUser1}
                    onChange={(e) => setEditableHubAddressUser1(e.target.value)}
                    className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                    placeholder="Enter Hub address"
                  />
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
                    <p className="text-[#888] text-xs mb-2">Taproot Address (Auto-generated)</p>
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
                {/* Manual Taproot Input */}
                <div className="mt-4">
                  <p className="text-[#888] text-xs mb-2">Manual Taproot Address (Optional)</p>
                  <Input
                    type="text"
                    value={manualTaprootUser1}
                    onChange={(e) => setManualTaprootUser1(e.target.value)}
                    className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                    placeholder="Enter taproot address manually"
                  />
                  <p className="text-[#888] text-xs mt-1">If provided, this will be used instead of auto-generated taproot</p>
                </div>
              </div>

            {/* Broadcast Transaction Section for User 1 - Separate Box */}
            <div className="mt-6 bg-[#1A1A1A] border-2 border-[#10B981] rounded-lg p-6">
              <p className="text-[#10B981] text-sm font-semibold mb-4">Broadcast Transaction</p>
              
              {/* Transaction Parameters for User 1 */}
              <div className="space-y-3">
                  <p className="text-[#888] text-xs font-semibold mb-2">Transaction Parameters</p>
                  
                  <div>
                    <p className="text-[#888] text-xs mb-2">User Address</p>
                    <Input
                      type="text"
                      value={manualUser1Address}
                      onChange={(e) => setManualUser1Address(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                      placeholder="Enter User 1 address for transaction"
                    />
                  </div>
                  
                  <div>
                    <p className="text-[#888] text-xs mb-2">Hub Address</p>
                    <Input
                      type="text"
                      value={manualHubAddressUser1}
                      onChange={(e) => setManualHubAddressUser1(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                      placeholder="Enter Hub address for transaction"
                    />
                  </div>
                  
                  <div>
                    <p className="text-[#888] text-xs mb-2">User Private Key</p>
                    <Input
                      type="text"
                      value={manualUser1PrivateKey}
                      onChange={(e) => setManualUser1PrivateKey(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#EF4444] p-2 font-mono text-xs text-white"
                      placeholder="Enter User 1 private key"
                    />
                  </div>
                  
                  <div>
                    <p className="text-[#888] text-xs mb-2">Hub Private Key</p>
                    <Input
                      type="text"
                      value={manualHubPrivateKeyUser1}
                      onChange={(e) => setManualHubPrivateKeyUser1(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#EF4444] p-2 font-mono text-xs text-white"
                      placeholder="Enter Hub private key"
                    />
                  </div>
                  
                  <div>
                    <p className="text-[#888] text-xs mb-2">Nonce (Optional)</p>
                    <Input
                      type="number"
                      value={manualNonceUser1}
                      onChange={(e) => setManualNonceUser1(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                      placeholder="Enter nonce (optional)"
                    />
                  </div>
                  
                  <div>
                    <p className="text-[#888] text-xs mb-2">Taproot Address (Optional)</p>
                    <Input
                      type="text"
                      value={manualTaprootUser1}
                      onChange={(e) => setManualTaprootUser1(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                      placeholder="Enter taproot address (optional)"
                    />
                  </div>
                  
                  <div>
                    <p className="text-[#888] text-xs mb-2">Multisig Address</p>
                    <Input
                      type="text"
                      value={manualMultisigAddressUser1}
                      onChange={(e) => setManualMultisigAddressUser1(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                      placeholder="Enter multisig address"
                    />
                    <p className="text-[#888] text-xs mt-1">Required for transaction creation</p>
                  </div>
                  
                  <div>
                    <p className="text-[#888] text-xs mb-2">Broadcast Payload (Transaction Hex) (Optional)</p>
                    <Input
                      type="text"
                      value={broadcastPayloadUser1}
                      onChange={(e) => setBroadcastPayloadUser1(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                      placeholder="Enter transaction hex payload manually (optional)"
                    />
                    <p className="text-[#888] text-xs mt-1">If provided, this payload will be used for broadcast instead of creating a new transaction</p>
                  </div>
                </div>
                
                {/* Create Transaction Button for User 1 + Hub */}
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
              </div>
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
            
            {/* Visual Connection Arrow from User 2 to Taproot */}
            <div className="mt-4 flex items-center justify-center">
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 mb-2">
                  <div className="bg-[#FF9F1C]/20 border border-[#FF9F1C] rounded px-3 py-1">
                    <span className="text-[#FF9F1C] text-xs font-semibold">User 2</span>
                  </div>
                  <span className="text-[#888] text-sm">+</span>
                  <div className="bg-[#FF9F1C]/20 border border-[#FF9F1C] rounded px-3 py-1">
                    <span className="text-[#FF9F1C] text-xs font-semibold">Hub</span>
                  </div>
                </div>
                <ArrowDown className="h-6 w-6 text-[#FF9F1C] mb-2" />
                <div className="bg-[#10B981]/20 border border-[#10B981] rounded px-3 py-1">
                  <span className="text-[#10B981] text-xs font-semibold">Taproot</span>
                </div>
              </div>
            </div>

            {/* Taproot Button for User 2 + Hub */}
            <div className="mt-6 bg-[#1A1A1A] border-2 border-[#2C2C2C] rounded-lg p-6">
                <div className="mb-4">
                  <p className="text-[#888] text-xs mb-2">User 2 Address</p>
                  <Input
                    type="text"
                    value={editableUser2Address}
                    onChange={(e) => setEditableUser2Address(e.target.value)}
                    className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                    placeholder="Enter User 2 address"
                  />
                </div>
                <div className="mb-4">
                  <p className="text-[#888] text-xs mb-2">Hub Address</p>
                  <Input
                    type="text"
                    value={editableHubAddressUser2}
                    onChange={(e) => setEditableHubAddressUser2(e.target.value)}
                    className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                    placeholder="Enter Hub address"
                  />
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
                    <p className="text-[#888] text-xs mb-2">Taproot Address (Auto-generated)</p>
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
                {/* Manual Taproot Input */}
                <div className="mt-4">
                  <p className="text-[#888] text-xs mb-2">Manual Taproot Address (Optional)</p>
                  <Input
                    type="text"
                    value={manualTaprootUser2}
                    onChange={(e) => setManualTaprootUser2(e.target.value)}
                    className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                    placeholder="Enter taproot address manually"
                  />
                  <p className="text-[#888] text-xs mt-1">If provided, this will be used instead of auto-generated taproot</p>
                </div>
              </div>

            {/* Broadcast Transaction Section for User 2 - Separate Box */}
            <div className="mt-6 bg-[#1A1A1A] border-2 border-[#10B981] rounded-lg p-6">
              <p className="text-[#10B981] text-sm font-semibold mb-4">Broadcast Transaction</p>
              
              {/* Transaction Parameters for User 2 */}
              <div className="space-y-3">
                  <p className="text-[#888] text-xs font-semibold mb-2">Transaction Parameters</p>
                  
                  <div>
                    <p className="text-[#888] text-xs mb-2">User Address</p>
                    <Input
                      type="text"
                      value={manualUser2Address}
                      onChange={(e) => setManualUser2Address(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                      placeholder="Enter User 2 address for transaction"
                    />
                  </div>
                  
                  <div>
                    <p className="text-[#888] text-xs mb-2">Hub Address</p>
                    <Input
                      type="text"
                      value={manualHubAddressUser2}
                      onChange={(e) => setManualHubAddressUser2(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                      placeholder="Enter Hub address for transaction"
                    />
                  </div>
                  
                  <div>
                    <p className="text-[#888] text-xs mb-2">User Private Key</p>
                    <Input
                      type="text"
                      value={manualUser2PrivateKey}
                      onChange={(e) => setManualUser2PrivateKey(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#EF4444] p-2 font-mono text-xs text-white"
                      placeholder="Enter User 2 private key"
                    />
                  </div>
                  
                  <div>
                    <p className="text-[#888] text-xs mb-2">Hub Private Key</p>
                    <Input
                      type="text"
                      value={manualHubPrivateKeyUser2}
                      onChange={(e) => setManualHubPrivateKeyUser2(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#EF4444] p-2 font-mono text-xs text-white"
                      placeholder="Enter Hub private key"
                    />
                  </div>
                  
                  <div>
                    <p className="text-[#888] text-xs mb-2">Nonce (Optional)</p>
                    <Input
                      type="number"
                      value={manualNonceUser2}
                      onChange={(e) => setManualNonceUser2(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                      placeholder="Enter nonce (optional)"
                    />
                  </div>
                  
                  <div>
                    <p className="text-[#888] text-xs mb-2">Taproot Address (Optional)</p>
                    <Input
                      type="text"
                      value={manualTaprootUser2}
                      onChange={(e) => setManualTaprootUser2(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                      placeholder="Enter taproot address (optional)"
                    />
                  </div>
                  
                  <div>
                    <p className="text-[#888] text-xs mb-2">Multisig Address</p>
                    <Input
                      type="text"
                      value={manualMultisigAddressUser2}
                      onChange={(e) => setManualMultisigAddressUser2(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                      placeholder="Enter multisig address"
                    />
                    <p className="text-[#888] text-xs mt-1">Required for transaction creation</p>
                  </div>
                  
                  <div>
                    <p className="text-[#888] text-xs mb-2">Broadcast Payload (Transaction Hex) (Optional)</p>
                    <Input
                      type="text"
                      value={broadcastPayloadUser2}
                      onChange={(e) => setBroadcastPayloadUser2(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs text-white"
                      placeholder="Enter transaction hex payload manually (optional)"
                    />
                    <p className="text-[#888] text-xs mt-1">If provided, this payload will be used for broadcast instead of creating a new transaction</p>
                  </div>
                </div>
                
                {/* Create Transaction Button for User 2 + Hub */}
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
              </div>
          </div>
        </div>
    </div>
  );
}

