import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Copy, CheckCircle2, Zap, ArrowRight, Clock, XCircle, Loader2, Users, Shield, AlertTriangle, Plus, Trash2, RefreshCw } from 'lucide-react';
import { apiService } from '../services/api';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { addUserWallet, removeUserWallet, type UserWallet, type UserKeys } from '../store/slices/networkSlice';

interface ChannelState {
  channelId: string;
  taprootAddress: string;
  userAddress: string;
  hubAddress: string;
  userBalance: number; // Committed balance (what user will get on exit)
  hubBalance: number; // Committed hub balance (positive = user owes hub, negative = hub owes user)
  l1Balance?: number; // Actual L1 balance in taproot address (on-chain)
  capacity: number;
  status: 'opening' | 'open' | 'closing' | 'closed';
  commitmentNumber: number;
  fundingTxid?: string;
  closingTxid?: string;
}

interface HubLedgerEntry {
  userAddress: string;
  balance: number;
  channelId: string;
  lastUpdated: Date;
}

interface RoutingRecipient {
  userAddress: string;
  amount: number;
}

export function ByteStream() {
  const dispatch = useAppDispatch();
  const networkState = useAppSelector((state) => state.network);
  const { user2Keys, hubKeys, userWallets = [] } = networkState;

  // Combine legacy users and new wallet list
  interface UserOption {
    id: string;
    name: string;
    keys: UserKeys;
    isLegacy?: boolean;
  }

  // Ensure userWallets is always an array
  const safeUserWallets = Array.isArray(userWallets) ? userWallets : [];

  const allUsers: UserOption[] = [
    // User 1 removed - only showing User 2 and wallet list
    ...(user2Keys ? [{ id: 'user2', name: 'User 2', keys: user2Keys, isLegacy: true }] : []),
    ...safeUserWallets.map(w => ({ 
      id: w.id, 
      name: w.name, 
      keys: {
        address: w.address,
        privateKey: w.privateKey,
        publicKey: w.publicKey,
        mnemonic: w.mnemonic,
        derivationPath: w.derivationPath,
        network: w.network,
      },
      isLegacy: false 
    })),
  ];

  // Get all available users (with keys)
  const availableUsers = allUsers.filter(u => u.keys !== null);

  const [selectedUserId, setSelectedUserId] = useState<string>(availableUsers[0]?.id || 'user2');
  const selectedUser = availableUsers.find(u => u.id === selectedUserId);

  const [channels, setChannels] = useState<ChannelState[]>([]);
  const [allChannels, setAllChannels] = useState<ChannelState[]>([]);
  const [hubLedger, setHubLedger] = useState<HubLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [activePhase, setActivePhase] = useState<'setup' | 'offchain' | 'exit' | null>(null);
  const [showAllChannels, setShowAllChannels] = useState(false);
  
  // Channel opening form
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [channelCapacity, setChannelCapacity] = useState('');
  const [openingChannel, setOpeningChannel] = useState(false);

  // 1-to-Many routing form
  const [showRoutingForm, setShowRoutingForm] = useState(false);
  const [routingRecipients, setRoutingRecipients] = useState<RoutingRecipient[]>([
    { userAddress: '', amount: 0 }
  ]);
  const [routingChannel, setRoutingChannel] = useState<ChannelState | null>(null);
  const [routingPayment, setRoutingPayment] = useState(false);
  const [lastRoutingResult, setLastRoutingResult] = useState<any>(null);

  // Unilateral exit
  const [exitingChannelId, setExitingChannelId] = useState<string | null>(null);

  // Wallet generation
  const [showWalletGenerator, setShowWalletGenerator] = useState(false);
  const [generatingWallet, setGeneratingWallet] = useState(false);
  const [newWalletName, setNewWalletName] = useState('');

  // Update selected user when available users change
  useEffect(() => {
    if (availableUsers.length > 0) {
      const currentUserExists = availableUsers.some(u => u.id === selectedUserId);
      if (!currentUserExists) {
        setSelectedUserId(availableUsers[0].id);
      }
    }
  }, [availableUsers.length, safeUserWallets.length]);

  useEffect(() => {
    if (selectedUser?.keys?.address) {
      loadChannels();
      loadAllChannels();
      loadHubLedger();
    }
  }, [selectedUser?.keys?.address, selectedUserId]);

  const loadChannels = async () => {
    if (!selectedUser?.keys?.address) return;
    
    setLoading(true);
    try {
      const response = await apiService.getUserChannels(selectedUser.keys.address);
      setChannels(response.channels);
    } catch (error) {
      console.error('Failed to load channels:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllChannels = async () => {
    try {
      const response = await apiService.getOpenChannels();
      setAllChannels(response.channels);
    } catch (error) {
      console.error('Failed to load all channels:', error);
    }
  };

  const loadHubLedger = async (sync: boolean = true) => {
    try {
      // Always sync on load to get fresh data
      const response = await apiService.getHubLedger(sync);
      setHubLedger(response.ledger || []);
      if (sync) {
        console.log('Hub ledger synced with current channel states');
      }
    } catch (error) {
      console.error('Failed to load hub ledger:', error);
      // Don't show alert on initial load, only on manual sync
      if (sync) {
        alert('Failed to sync hub ledger');
      }
    }
  };

  const handleSyncHubLedger = async () => {
    try {
      const response = await apiService.syncHubLedger();
      setHubLedger(response.ledger || []);
      alert('Hub ledger synced successfully!');
    } catch (error: any) {
      console.error('Failed to sync hub ledger:', error);
      alert(`Failed to sync hub ledger: ${error.message || 'Unknown error'}`);
    }
  };

  const handleCopy = (value: string, type: string) => {
    navigator.clipboard.writeText(value);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleOpenChannel = async () => {
    if (!selectedUser?.keys?.address) {
      alert(`Please generate ${selectedUser?.name || 'User'} keys first`);
      return;
    }

    const capacity = parseInt(channelCapacity);
    if (!capacity || capacity <= 0) {
      alert('Please enter a valid capacity');
      return;
    }

    setOpeningChannel(true);
    try {
      // Register public key if available
      if (selectedUser.keys.publicKey) {
        try {
          await apiService.registerPublicKey(selectedUser.keys.address, selectedUser.keys.publicKey);
        } catch (err) {
          console.warn('Failed to register public key:', err);
        }
      }

      // Get hub public key if available
      const hubPublicKey = hubKeys?.publicKey;

      const channel = await apiService.openChannel(
        selectedUser.keys.address,
        capacity,
        selectedUser.keys.publicKey,
        hubPublicKey
      );
      
      alert(`Channel opened for ${selectedUser.name}!\nChannel ID: ${channel.channelId}\nTaproot Address: ${channel.taprootAddress}\n\nNow fund this address on L1 to activate the channel.`);
      setShowOpenForm(false);
      setChannelCapacity('');
      await loadChannels();
      await loadAllChannels();
    } catch (error: any) {
      alert(`Failed to open channel: ${error.message || 'Unknown error'}`);
    } finally {
      setOpeningChannel(false);
    }
  };

  const handleConfirmFunding = async (channel: ChannelState) => {
    if (!channel.fundingTxid) {
      const txid = prompt('Enter the funding transaction ID (TXID) from L1:');
      if (!txid) return;

      const userBalance = prompt(`Enter your balance in channel (sats):`);
      const hubBalance = prompt(`Enter hub balance in channel (sats):`);
      
      if (!userBalance || !hubBalance) return;

      setLoading(true);
      try {
        await apiService.confirmFunding(
          channel.channelId,
          txid,
          parseInt(userBalance),
          parseInt(hubBalance)
        );
        alert('Channel funding confirmed! Channel is now OPEN.');
        await loadChannels();
        await loadAllChannels();
        await loadHubLedger();
      } catch (error: any) {
        alert(`Failed to confirm funding: ${error.message || 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleAddRecipient = () => {
    setRoutingRecipients([...routingRecipients, { userAddress: '', amount: 0 }]);
  };

  const handleRemoveRecipient = (index: number) => {
    setRoutingRecipients(routingRecipients.filter((_, i) => i !== index));
  };

  const handleRecipientChange = (index: number, field: 'userAddress' | 'amount', value: string) => {
    const updated = [...routingRecipients];
    if (field === 'userAddress') {
      updated[index].userAddress = value;
    } else {
      updated[index].amount = parseInt(value) || 0;
    }
    setRoutingRecipients(updated);
  };

  const handleRoutingPayment = async () => {
    if (!routingChannel || !selectedUser?.keys?.address) return;

    // Validate recipients
    const validRecipients = routingRecipients.filter(r => r.userAddress && r.amount > 0);
    if (validRecipients.length === 0) {
      alert('Please add at least one valid recipient');
      return;
    }

    setRoutingPayment(true);
    try {
      const result = await apiService.routingPayment(selectedUser.keys.address, validRecipients);
      setLastRoutingResult(result);
      alert(`Payment routed successfully!\nTotal: ${result.totalAmount} sats\nRecipients: ${result.recipientChannels.length}\n\nCheck the flow visualization below!`);
      setShowRoutingForm(false);
      setRoutingRecipients([{ userAddress: '', amount: 0 }]);
      setRoutingChannel(null);
      await loadChannels();
      await loadAllChannels();
      await loadHubLedger();
    } catch (error: any) {
      alert(`Failed to route payment: ${error.message || 'Unknown error'}`);
      setLastRoutingResult(null);
    } finally {
      setRoutingPayment(false);
    }
  };

  const handleUnilateralExit = async (channel: ChannelState) => {
    if (!selectedUser?.keys?.privateKey) {
      alert('Private key is required for unilateral exit');
      return;
    }

    if (!window.confirm(`Initiate unilateral exit for channel ${channel.channelId}? Funds will be locked for 5 minutes (CSV lock).`)) {
      return;
    }

    setExitingChannelId(channel.channelId);
    try {
      const result = await apiService.unilateralExit(channel.channelId, selectedUser.keys.privateKey);
      alert(`Unilateral exit initiated!\nExit TXID: ${result.exitTxid}\nUnlock Time: ${new Date(result.unlockTime).toLocaleString()}\n\n${result.message}`);
      await loadChannels();
      await loadAllChannels();
    } catch (error: any) {
      alert(`Failed to initiate unilateral exit: ${error.message || 'Unknown error'}`);
    } finally {
      setExitingChannelId(null);
    }
  };

  const formatSats = (sats: number) => {
    return sats.toLocaleString();
  };

  const handleGenerateWallet = async () => {
    if (!newWalletName.trim()) {
      alert('Please enter a wallet name');
      return;
    }

    setGeneratingWallet(true);
    try {
      const walletData = await apiService.generateWallet();
      
      // Register public key
      if (walletData.publicKey) {
        try {
          await apiService.registerPublicKey(walletData.address, walletData.publicKey);
        } catch (err) {
          console.warn('Failed to register public key:', err);
        }
      }

      // Create wallet object
      const newWallet: UserWallet = {
        id: `wallet-${Date.now()}`,
        name: newWalletName.trim(),
        address: walletData.address,
        privateKey: walletData.privateKey,
        publicKey: walletData.publicKey,
        mnemonic: walletData.mnemonic,
        derivationPath: walletData.derivationPath,
        network: walletData.network,
        createdAt: new Date().toISOString(),
      };

      // Add to Redux store
      dispatch(addUserWallet(newWallet));

      // Select the newly created wallet
      setSelectedUserId(newWallet.id);
      setNewWalletName('');
      setShowWalletGenerator(false);

      alert(`Wallet "${newWallet.name}" generated successfully!`);
    } catch (error: any) {
      alert(`Failed to generate wallet: ${error.message || 'Unknown error'}`);
    } finally {
      setGeneratingWallet(false);
    }
  };

  const handleDeleteWallet = (walletId: string) => {
    if (window.confirm('Are you sure you want to delete this wallet?')) {
      dispatch(removeUserWallet(walletId));
      // If deleted wallet was selected, select first available
      if (selectedUserId === walletId && availableUsers.length > 0) {
        setSelectedUserId(availableUsers[0].id);
      }
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">ByteStream Layer 2 Scaling Solution</h1>
        <p className="text-[#888]">
          Instant, zero-cost transactions on Bitcoin L2 with Taproot channels
        </p>
      </div>

      {/* Narrative Presentation */}
      <Card className="mb-6 p-6 bg-[#1A1A1A] border-2 border-[#2C2C2C]">
        <h2 className="text-xl font-bold text-white mb-4">System Overview</h2>
        <div className="space-y-4 text-[#CCC]">
          <div>
            <h3 className="text-lg font-semibold text-[#FF9F1C] mb-2">Phase 1: Setup & Security Layer</h3>
            <p className="text-sm mb-2">Users create 2-of-2 Multisig Taproot channels with Hub. Each channel acts as a digital locker secured on Bitcoin L1.</p>
            <ul className="text-sm list-disc list-inside space-y-1 ml-4">
              <li>Taproot Channel Creation (2-of-2 Lockers)</li>
              <li>Funding on L1 (one-time fee)</li>
              <li>Hub tracks initial ledger balances</li>
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#10B981] mb-2">Phase 2: Off-Chain Transactions</h3>
            <p className="text-sm mb-2">Zero-cost payments through Hub's internal ledger. No L1 transactions needed.</p>
            <ul className="text-sm list-disc list-inside space-y-1 ml-4">
              <li>1-to-Many payment routing</li>
              <li>Instant balance updates</li>
              <li>Commitment transactions (signed but not broadcast)</li>
            </ul>
            <div className="mt-3 p-3 bg-[#0A0A0A] border border-[#10B981] rounded text-xs">
              <p className="text-[#10B981] font-semibold mb-1">💡 How Commitments Work:</p>
              <p className="text-[#CCC] mb-2">
                When a user pays another user through Hub:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-[#CCC] ml-2">
                <li>Sender's channel (taproot address) gets a new commitment - balance shifts from sender to Hub</li>
                <li>Recipient's channel (taproot address) gets a new commitment - balance shifts from Hub to recipient</li>
                <li>Both commitments are <strong>off-chain</strong> (not broadcast to L1)</li>
                <li>When channels close, latest commitments are broadcast to L1 via their respective taproot addresses</li>
              </ol>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[#3B82F6] mb-2">Phase 3: Exiting Safely</h3>
            <p className="text-sm mb-2">Two exit mechanisms for security:</p>
            <ul className="text-sm list-disc list-inside space-y-1 ml-4">
              <li><strong>Cooperative Exit:</strong> Both parties agree, instant settlement</li>
              <li><strong>Unilateral Exit:</strong> CSV lock (5-minute delay) for security</li>
              <li><strong>Watchtower:</strong> Monitors L1 for fraud attempts</li>
              <li><strong>Competing Remedy:</strong> Prevents stale transaction fraud</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Wallet Generator & User Selector */}
      <Card className="mb-6 p-4 bg-[#1A1A1A] border-2 border-[#2C2C2C]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">User Wallets</h3>
          <Button
            onClick={() => setShowWalletGenerator(!showWalletGenerator)}
            className="bg-[#10B981] hover:bg-[#10B981]/90 text-white"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            {showWalletGenerator ? 'Cancel' : 'Generate New Wallet'}
          </Button>
        </div>

        {/* Wallet Generator Form */}
        {showWalletGenerator && (
          <div className="mb-4 p-4 bg-[#0A0A0A] border border-[#2C2C2C] rounded">
            <div className="flex gap-2">
              <Input
                type="text"
                value={newWalletName}
                onChange={(e) => setNewWalletName(e.target.value)}
                placeholder="Enter wallet name (e.g., User 3, User 4)"
                className="flex-1 bg-[#1A1A1A] border-[#2C2C2C] text-white"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !generatingWallet) {
                    handleGenerateWallet();
                  }
                }}
              />
              <Button
                onClick={handleGenerateWallet}
                disabled={generatingWallet || !newWalletName.trim()}
                className="bg-[#10B981] hover:bg-[#10B981]/90 text-white"
              >
                {generatingWallet ? 'Generating...' : 'Generate'}
              </Button>
            </div>
          </div>
        )}

        {/* Wallets List */}
        {safeUserWallets.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-[#888] mb-2">Generated Wallets:</h4>
            <div className="space-y-2">
              {safeUserWallets.map((wallet) => (
                <div
                  key={wallet.id}
                  className="flex items-center justify-between p-2 bg-[#0A0A0A] border border-[#2C2C2C] rounded"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${selectedUserId === wallet.id ? 'bg-[#10B981]' : 'bg-[#888]'}`} />
                    <span className="text-white text-sm">{wallet.name}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[#888] text-xs font-mono">{wallet.address.slice(0, 12)}...</span>
                      <Button
                        onClick={() => handleCopy(wallet.address, `wallet-${wallet.id}`)}
                        size="sm"
                        variant="ghost"
                        className="h-4 w-4 p-0 hover:bg-[#2C2C2C]"
                      >
                        {copied === `wallet-${wallet.id}` ? (
                          <CheckCircle2 className="h-3 w-3 text-[#10B981]" />
                        ) : (
                          <Copy className="h-3 w-3 text-[#888] hover:text-white" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleDeleteWallet(wallet.id)}
                    variant="ghost"
                    size="sm"
                    className="text-[#EF4444] hover:text-[#EF4444]/80"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User Selector */}
        {availableUsers.length > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="text-white font-semibold">Select User:</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="bg-[#0A0A0A] border border-[#2C2C2C] text-white px-4 py-2 rounded"
              >
                {availableUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.keys?.address?.slice(0, 12)}...)
                  </option>
                ))}
              </select>
              {selectedUser && (
                <div className="text-[#888] text-sm">
                  Current: {selectedUser.name}
                </div>
              )}
            </div>
            <Button
              onClick={() => setShowAllChannels(!showAllChannels)}
              variant="outline"
              size="sm"
            >
              {showAllChannels ? 'Show My Channels' : 'Show All Channels'}
            </Button>
          </div>
        )}

        {availableUsers.length === 0 && (
          <div className="text-center py-4">
            <p className="text-[#888] text-sm">No wallets available. Generate a new wallet to get started.</p>
          </div>
        )}
      </Card>

      {/* Phase Navigation */}
      <div className="flex gap-2 mb-6">
        <Button
          onClick={() => setActivePhase(activePhase === 'setup' ? null : 'setup')}
          className={activePhase === 'setup' ? 'bg-[#FF9F1C]' : 'bg-[#2C2C2C]'}
        >
          Phase 1: Setup
        </Button>
        <Button
          onClick={() => setActivePhase(activePhase === 'offchain' ? null : 'offchain')}
          className={activePhase === 'offchain' ? 'bg-[#10B981]' : 'bg-[#2C2C2C]'}
        >
          Phase 2: Off-Chain
        </Button>
        <Button
          onClick={() => setActivePhase(activePhase === 'exit' ? null : 'exit')}
          className={activePhase === 'exit' ? 'bg-[#3B82F6]' : 'bg-[#2C2C2C]'}
        >
          Phase 3: Exit
        </Button>
      </div>

      {/* Phase 1: Setup */}
      {activePhase === 'setup' && (
        <Card className="mb-6 p-6 bg-[#1A1A1A] border-2 border-[#FF9F1C]">
          <h3 className="text-xl font-bold text-white mb-4">
            Phase 1: Channel Setup {selectedUser && `- ${selectedUser.name}`}
          </h3>
          {!selectedUser?.keys ? (
            <div className="bg-[#EF4444]/10 border border-[#EF4444] p-4 rounded">
              <p className="text-[#EF4444]">
                Please generate {selectedUser?.name || 'user'} keys first in Network Setup
              </p>
            </div>
          ) : (
            <>
              <Button
                onClick={() => setShowOpenForm(!showOpenForm)}
                className="mb-4 bg-[#FF9F1C] hover:bg-[#FF9F1C]/90 text-white"
              >
                <Zap className="h-4 w-4 mr-2" />
                {showOpenForm ? 'Cancel' : `Open New Channel with Hub (${selectedUser.name})`}
              </Button>

          {showOpenForm && (
            <div className="space-y-4">
              <div>
                <label className="block text-[#888] mb-2">Channel Capacity (sats)</label>
                <Input
                  type="number"
                  value={channelCapacity}
                  onChange={(e) => setChannelCapacity(e.target.value)}
                  placeholder="1000000"
                  className="bg-[#0A0A0A] border-[#2C2C2C] text-white"
                />
              </div>
              <Button
                onClick={handleOpenChannel}
                disabled={openingChannel || !channelCapacity}
                className="w-full bg-[#FF9F1C] hover:bg-[#FF9F1C]/90 text-white"
              >
                {openingChannel ? 'Opening...' : 'Open Channel'}
              </Button>
            </div>
          )}
            </>
          )}
        </Card>
      )}

      {/* Phase 2: Off-Chain Routing */}
      {activePhase === 'offchain' && (
        <Card className="mb-6 p-6 bg-[#1A1A1A] border-2 border-[#10B981]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white">Phase 2: 1-to-Many Payment Routing</h3>
            <Button
              onClick={async () => {
                await loadChannels();
                await loadAllChannels();
                alert('Channels refreshed!');
              }}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              🔄 Refresh Channels
            </Button>
          </div>
          
          {/* Debug Info */}
          {selectedUser && (
            <div className="mb-4 p-2 bg-[#0A0A0A] border border-[#2C2C2C] rounded text-xs">
              <p className="text-[#888] flex items-center gap-2">
                Selected: <span className="text-white">{selectedUser.name}</span>
                {selectedUser.keys?.address && (
                  <>
                    <span className="text-white font-mono">({selectedUser.keys.address.slice(0, 16)}...)</span>
                    <Button
                      onClick={() => handleCopy(selectedUser.keys.address, `user-${selectedUser.id}`)}
                      size="sm"
                      variant="ghost"
                      className="h-4 w-4 p-0 hover:bg-[#2C2C2C]"
                    >
                      {copied === `user-${selectedUser.id}` ? (
                        <CheckCircle2 className="h-3 w-3 text-[#10B981]" />
                      ) : (
                        <Copy className="h-3 w-3 text-[#888] hover:text-white" />
                      )}
                    </Button>
                  </>
                )}
              </p>
              <p className="text-[#888]">
                Your Channels: {channels.filter(c => c.userAddress === selectedUser.keys?.address).length} | 
                Open Channels: {channels.filter(c => c.status === 'open' && c.userAddress === selectedUser.keys?.address).length} | 
                All Open: {allChannels.filter(c => c.status === 'open').length}
              </p>
            </div>
          )}
          <Button
            onClick={() => {
              if (!selectedUser?.keys?.address) {
                alert('Please select a user first');
                return;
              }
              
              // Find open channel for the selected user (check both channels and allChannels)
              const openChannel = channels.find(c => 
                c.status === 'open' && c.userAddress === selectedUser.keys.address
              ) || allChannels.find(c => 
                c.status === 'open' && c.userAddress === selectedUser.keys.address
              );
              
              if (!openChannel) {
                // Debug info
                const userChannels = channels.filter(c => c.userAddress === selectedUser.keys.address);
                const allUserChannels = allChannels.filter(c => c.userAddress === selectedUser.keys.address);
                const totalChannels = userChannels.length + allUserChannels.length;
                
                let message = `User ${selectedUser.name} does not have an open channel.\n\n`;
                message += `Found ${totalChannels} channel(s) for this user:\n`;
                
                [...userChannels, ...allUserChannels].forEach((ch, idx) => {
                  message += `${idx + 1}. Channel ${ch.channelId.slice(0, 8)}... - Status: ${ch.status}\n`;
                });
                
                message += `\nPlease open a channel first in Phase 1, or confirm funding if channel is in 'opening' status.`;
                alert(message);
                return;
              }
              
              setRoutingChannel(openChannel);
              setShowRoutingForm(true);
            }}
            className="mb-4 bg-[#10B981] hover:bg-[#10B981]/90 text-white"
          >
            <Users className="h-4 w-4 mr-2" />
            Route Payment to Multiple Users ({selectedUser?.name || 'Select User'})
          </Button>

          {showRoutingForm && routingChannel && (
            <div className="space-y-4">
              <div className="bg-[#0A0A0A] border border-[#2C2C2C] p-4 rounded">
                <p className="text-[#888] text-sm mb-2">Your Channel Balance</p>
                <p className="text-white font-mono">{formatSats(routingChannel.userBalance)} sats</p>
              </div>
              {routingRecipients.map((recipient, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    type="text"
                    value={recipient.userAddress}
                    onChange={(e) => handleRecipientChange(index, 'userAddress', e.target.value)}
                    placeholder="Recipient address"
                    className="flex-1 bg-[#0A0A0A] border-[#2C2C2C] text-white"
                  />
                  <Input
                    type="number"
                    value={recipient.amount || ''}
                    onChange={(e) => handleRecipientChange(index, 'amount', e.target.value)}
                    placeholder="Amount (sats)"
                    className="w-32 bg-[#0A0A0A] border-[#2C2C2C] text-white"
                  />
                  <Button
                    onClick={() => handleRemoveRecipient(index)}
                    variant="outline"
                    size="sm"
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                onClick={handleAddRecipient}
                variant="outline"
                className="w-full"
              >
                Add Recipient
              </Button>
              <Button
                onClick={handleRoutingPayment}
                disabled={routingPayment}
                className="w-full bg-[#10B981] hover:bg-[#10B981]/90 text-white"
              >
                {routingPayment ? 'Routing...' : 'Route Payment'}
              </Button>
            </div>
          )}

          {/* Commitment Flow Visualization */}
          {lastRoutingResult && (
            <div className="mt-6 p-4 bg-[#0A0A0A] border-2 border-[#10B981] rounded-lg">
              <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <ArrowRight className="h-5 w-5 text-[#10B981]" />
                Commitment Flow: Sender → Hub → Recipient
              </h4>
              
              {/* Flow Diagram */}
              <div className="space-y-4 mb-4">
                {/* Step 1: Sender Channel Update */}
                <div className="bg-[#1A1A1A] border border-[#2C2C2C] p-4 rounded">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-[#3B82F6] flex items-center justify-center text-white font-bold">1</div>
                    <h5 className="text-white font-semibold flex items-center gap-2">
                      Sender Channel Commitment (Taproot: {lastRoutingResult.senderChannel.taprootAddress.slice(0, 16)}...)
                      <Button
                        onClick={() => handleCopy(lastRoutingResult.senderChannel.taprootAddress, 'sender-taproot')}
                        size="sm"
                        variant="ghost"
                        className="h-4 w-4 p-0 hover:bg-[#2C2C2C]"
                      >
                        {copied === 'sender-taproot' ? (
                          <CheckCircle2 className="h-3 w-3 text-[#10B981]" />
                        ) : (
                          <Copy className="h-3 w-3 text-[#888] hover:text-white" />
                        )}
                      </Button>
                    </h5>
                  </div>
                  <div className="ml-11 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-[#888]">User Balance: </span>
                      <span className="text-white font-mono">{formatSats(lastRoutingResult.senderChannel.userBalance)} sats</span>
                    </div>
                    <div>
                      <span className="text-[#888]">Hub Balance: </span>
                      <span className="text-white font-mono">{formatSats(lastRoutingResult.senderChannel.hubBalance)} sats</span>
                    </div>
                    <div>
                      <span className="text-[#888]">Commitment #: </span>
                      <span className="text-[#10B981] font-mono">#{lastRoutingResult.senderChannel.commitmentNumber}</span>
                    </div>
                    <div>
                      <span className="text-[#888]">Status: </span>
                      <span className="text-[#10B981]">{lastRoutingResult.senderChannel.status.toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="ml-11 mt-2 text-xs text-[#888]">
                    💡 Off-chain commitment (not broadcast to L1). Will be settled when channel closes via taproot address.
                  </div>
                </div>

                {/* Hub Processing */}
                <div className="flex items-center justify-center my-2">
                  <div className="flex items-center gap-2 bg-[#FF9F1C]/20 border border-[#FF9F1C] px-4 py-2 rounded">
                    <Shield className="h-5 w-5 text-[#FF9F1C]" />
                    <span className="text-[#FF9F1C] font-semibold">Hub Routes Payment</span>
                  </div>
                </div>

                {/* Step 2: Recipient Channels */}
                {lastRoutingResult.recipientChannels.map((recipient: any, idx: number) => (
                  <div key={idx} className="bg-[#1A1A1A] border border-[#2C2C2C] p-4 rounded">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-[#10B981] flex items-center justify-center text-white font-bold">{idx + 2}</div>
                      <h5 className="text-white font-semibold flex items-center gap-2">
                        User 2 Channel Commitment (Taproot: {recipient.channel.taprootAddress.slice(0, 16)}...)
                        <Button
                          onClick={() => handleCopy(recipient.channel.taprootAddress, `recipient-taproot-${idx}`)}
                          size="sm"
                          variant="ghost"
                          className="h-4 w-4 p-0 hover:bg-[#2C2C2C]"
                        >
                          {copied === `recipient-taproot-${idx}` ? (
                            <CheckCircle2 className="h-3 w-3 text-[#10B981]" />
                          ) : (
                            <Copy className="h-3 w-3 text-[#888] hover:text-white" />
                          )}
                        </Button>
                      </h5>
                    </div>
                    <div className="ml-11 grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-[#888]">User Address: </span>
                        <span className="text-white font-mono text-xs">{recipient.userAddress.slice(0, 20)}...</span>
                        <Button
                          onClick={() => handleCopy(recipient.userAddress, `recipient-${idx}`)}
                          size="sm"
                          variant="ghost"
                          className="h-4 w-4 p-0 hover:bg-[#2C2C2C]"
                        >
                          {copied === `recipient-${idx}` ? (
                            <CheckCircle2 className="h-3 w-3 text-[#10B981]" />
                          ) : (
                            <Copy className="h-3 w-3 text-[#888] hover:text-white" />
                          )}
                        </Button>
                      </div>
                      <div>
                        <span className="text-[#888]">Final User Balance: </span>
                        <span className="text-[#10B981] font-mono">{formatSats(recipient.channel.userBalance)} sats</span>
                      </div>
                      <div>
                        <span className="text-[#888]">User Balance: </span>
                        <span className="text-white font-mono">{formatSats(recipient.channel.userBalance)} sats</span>
                      </div>
                      <div>
                        <span className="text-[#888]">Hub Balance: </span>
                        <span className="text-white font-mono">{formatSats(recipient.channel.hubBalance)} sats</span>
                      </div>
                      <div>
                        <span className="text-[#888]">Commitment #: </span>
                        <span className="text-[#10B981] font-mono">#{recipient.channel.commitmentNumber}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[#888]">Commitment Hash: </span>
                        <span className="text-white font-mono text-xs">{recipient.commitment.commitmentHash.slice(0, 16)}...</span>
                        <Button
                          onClick={() => handleCopy(recipient.commitment.commitmentHash, `commitment-hash-${idx}`)}
                          size="sm"
                          variant="ghost"
                          className="h-4 w-4 p-0 hover:bg-[#2C2C2C]"
                        >
                          {copied === `commitment-hash-${idx}` ? (
                            <CheckCircle2 className="h-3 w-3 text-[#10B981]" />
                          ) : (
                            <Copy className="h-3 w-3 text-[#888] hover:text-white" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="ml-11 mt-2 text-xs text-[#888]">
                      💡 Off-chain commitment (not broadcast to L1). Will be settled when channel closes via taproot address.
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="bg-[#1A1A1A] border border-[#3B82F6] p-3 rounded">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-[#3B82F6]" />
                  <span className="text-white font-semibold">Payment Summary</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-[#888]">Total Amount: </span>
                    <span className="text-white font-mono">{formatSats(lastRoutingResult.totalAmount)} sats</span>
                  </div>
                  <div>
                    <span className="text-[#888]">Recipients: </span>
                    <span className="text-white">{lastRoutingResult.recipientChannels.length}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[#888]">Timestamp: </span>
                    <span className="text-white">{new Date(lastRoutingResult.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => setLastRoutingResult(null)}
                variant="outline"
                size="sm"
                className="mt-4"
              >
                Clear Visualization
              </Button>
            </div>
          )}

          {/* Hub Ledger */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-semibold text-white">Hub Internal Ledger</h4>
              <Button
                onClick={handleSyncHubLedger}
                size="sm"
                className="bg-[#10B981] hover:bg-[#10B981]/90 text-white"
                title="Sync ledger with current channel states"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Ledger
              </Button>
            </div>
            {hubLedger.length === 0 ? (
              <p className="text-[#888] text-sm">No ledger entries yet. Click "Sync Ledger" to sync with current channel states.</p>
            ) : (
              <div className="space-y-2">
                {hubLedger.map((entry, index) => (
                  <div key={index} className="bg-[#0A0A0A] border border-[#2C2C2C] p-3 rounded">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-[#888] text-sm font-mono">{entry.userAddress.slice(0, 16)}...</span>
                        <Button
                          onClick={() => handleCopy(entry.userAddress, `ledger-${index}`)}
                          size="sm"
                          variant="ghost"
                          className="h-4 w-4 p-0 hover:bg-[#2C2C2C]"
                        >
                          {copied === `ledger-${index}` ? (
                            <CheckCircle2 className="h-3 w-3 text-[#10B981]" />
                          ) : (
                            <Copy className="h-3 w-3 text-[#888] hover:text-white" />
                          )}
                        </Button>
                      </div>
                      <span className="text-white font-mono">{formatSats(entry.balance)} sats</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Phase 3: Exit */}
      {activePhase === 'exit' && (
        <Card className="mb-6 p-6 bg-[#1A1A1A] border-2 border-[#3B82F6]">
          <h3 className="text-xl font-bold text-white mb-4">Phase 3: Channel Exit</h3>
          <div className="space-y-4">
            <div className="bg-[#0A0A0A] border border-[#2C2C2C] p-4 rounded">
              <h4 className="text-white font-semibold mb-2">Exit Options</h4>
              <ul className="text-[#888] text-sm space-y-1 list-disc list-inside">
                <li><strong>Cooperative Exit:</strong> Both parties sign, instant settlement</li>
                <li><strong>Unilateral Exit:</strong> CSV lock (5 minutes), secure but delayed</li>
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* Channels List */}
      <div className="mt-6">
        <h3 className="text-xl font-bold text-white mb-4">
          {showAllChannels ? 'All Open Channels (Hub)' : `${selectedUser?.name || 'Your'} Channels`}
        </h3>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#888]" />
          </div>
        ) : (showAllChannels ? allChannels : channels).length === 0 ? (
          <Card className="p-12 bg-[#1A1A1A] border-2 border-[#2C2C2C] text-center">
            <p className="text-[#888]">
              {showAllChannels 
                ? 'No open channels found across all users.' 
                : `No channels found for ${selectedUser?.name || 'user'}. Open a new channel to get started.`}
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {(showAllChannels ? allChannels : channels).map((channel) => (
              <Card key={channel.channelId} className="p-6 bg-[#1A1A1A] border-2 border-[#2C2C2C]">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {channel.status === 'open' ? (
                        <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
                      ) : channel.status === 'opening' ? (
                        <Clock className="h-4 w-4 text-[#F59E0B]" />
                      ) : (
                        <XCircle className="h-4 w-4 text-[#888]" />
                      )}
                      <span className={`font-semibold ${
                        channel.status === 'open' ? 'text-[#10B981]' :
                        channel.status === 'opening' ? 'text-[#F59E0B]' :
                        'text-[#888]'
                      }`}>
                        {channel.status.toUpperCase()}
                      </span>
                      <span className="text-[#888] text-sm font-mono">
                        {channel.channelId.slice(0, 8)}...
                      </span>
                      {showAllChannels && (
                        <div className="flex items-center gap-2 ml-2">
                          <span className="text-[#888] text-xs">
                            User: {channel.userAddress.slice(0, 12)}...
                          </span>
                          <Button
                            onClick={() => handleCopy(channel.userAddress, `channel-user-${channel.channelId}`)}
                            size="sm"
                            variant="ghost"
                            className="h-3 w-3 p-0 hover:bg-[#2C2C2C]"
                          >
                            {copied === `channel-user-${channel.channelId}` ? (
                              <CheckCircle2 className="h-3 w-3 text-[#10B981]" />
                            ) : (
                              <Copy className="h-3 w-3 text-[#888] hover:text-white" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <p className="text-[#888] text-xs mb-1">Your Balance (L1)</p>
                        <p className="text-white font-mono">
                          {channel.l1Balance !== undefined 
                            ? `${formatSats(channel.l1Balance)} sats`
                            : 'Loading...'}
                        </p>
                      {channel.l1Balance !== undefined && (
                        <p className="text-[#888] text-xs mt-1">
                          Withdrawable: ~{formatSats(Math.max(0, channel.l1Balance - channel.hubBalance - 200))} sats
                          <span className="text-[#888] text-xs ml-1">(approx, fee deducted)</span>
                        </p>
                      )}
                      </div>
                      <div>
                        <p className="text-[#888] text-xs mb-1">
                          Hub Balance 
                          {channel.hubBalance > 0 && <span className="text-[#F59E0B] ml-1">(You owe Hub)</span>}
                          {channel.hubBalance < 0 && <span className="text-[#10B981] ml-1">(Hub owes you)</span>}
                        </p>
                        <p className="text-white font-mono">{formatSats(channel.hubBalance)} sats</p>
                        <p className="text-[#888] text-xs mt-1">Committed Balance: {formatSats(channel.userBalance)} sats</p>
                      </div>
                      <div>
                        <p className="text-[#888] text-xs mb-1">Capacity</p>
                        <p className="text-white font-mono">{formatSats(channel.capacity)} sats</p>
                      </div>
                      <div>
                        <p className="text-[#888] text-xs mb-1">Commitments</p>
                        <p className="text-white font-mono">#{channel.commitmentNumber}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-[#888] text-xs mb-2">Taproot Address (L1 Funding)</p>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-[#0A0A0A] border border-[#2C2C2C] p-2 font-mono text-xs break-all text-white">
                      {channel.taprootAddress}
                    </div>
                    <Button
                      onClick={() => handleCopy(channel.taprootAddress, `taproot-${channel.channelId}`)}
                      size="sm"
                      className="bg-[#2C2C2C] hover:bg-[#3C3C3C] text-white"
                    >
                      {copied === `taproot-${channel.channelId}` ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {channel.status === 'opening' && (
                    <Button
                      onClick={() => handleConfirmFunding(channel)}
                      className="bg-[#10B981] hover:bg-[#10B981]/90 text-white"
                      size="sm"
                    >
                      Confirm Funding
                    </Button>
                  )}
                  
                  {channel.status === 'open' && (
                    <>
                      {(!showAllChannels || channel.userAddress === selectedUser?.keys?.address) && (
                        <>
                          <Button
                            onClick={() => {
                              setRoutingChannel(channel);
                              setShowRoutingForm(true);
                              setActivePhase('offchain');
                            }}
                            className="bg-[#3B82F6] hover:bg-[#3B82F6]/90 text-white"
                            size="sm"
                            disabled={showAllChannels && channel.userAddress !== selectedUser?.keys?.address}
                          >
                            Route Payment
                          </Button>
                          <Button
                            onClick={() => handleUnilateralExit(channel)}
                            disabled={exitingChannelId === channel.channelId || (showAllChannels && channel.userAddress !== selectedUser?.keys?.address)}
                            className="bg-[#EF4444] hover:bg-[#EF4444]/90 text-white"
                            size="sm"
                          >
                            {exitingChannelId === channel.channelId ? 'Exiting...' : 'Unilateral Exit'}
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

