import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Copy, CheckCircle2, Zap, ArrowRight, Clock, XCircle, Loader2 } from 'lucide-react';
import { apiService } from '../services/api';
import { useAppSelector } from '../store/hooks';

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

export function LightningChannel() {
  const networkState = useAppSelector((state) => state.network);
  const { user1Keys, hubKeys } = networkState;

  const [channels, setChannels] = useState<ChannelState[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  
  // Channel opening form
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [channelCapacity, setChannelCapacity] = useState('');
  const [openingChannel, setOpeningChannel] = useState(false);

  // Channel update form
  const [selectedChannel, setSelectedChannel] = useState<ChannelState | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [updatingChannel, setUpdatingChannel] = useState(false);

  // Channel closing
  const [closingChannelId, setClosingChannelId] = useState<string | null>(null);

  useEffect(() => {
    if (user1Keys?.address) {
      loadChannels();
    }
  }, [user1Keys?.address]);

  const loadChannels = async () => {
    if (!user1Keys?.address) return;
    
    setLoading(true);
    try {
      const response = await apiService.getUserChannels(user1Keys.address);
      setChannels(response.channels);
    } catch (error) {
      console.error('Failed to load channels:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (value: string, type: string) => {
    navigator.clipboard.writeText(value);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleOpenChannel = async () => {
    if (!user1Keys?.address || !hubKeys?.address) {
      alert('Please generate User 1 and Hub keys first');
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
      if (user1Keys.publicKey) {
        try {
          await apiService.registerPublicKey(user1Keys.address, user1Keys.publicKey);
        } catch (err) {
          console.warn('Failed to register public key:', err);
        }
      }

      // Get hub public key if available
      const hubPublicKey = hubKeys?.publicKey;

      const channel = await apiService.openChannel(
        user1Keys.address,
        capacity,
        user1Keys.publicKey,
        hubPublicKey
      );
      
      alert(`Channel opened! Channel ID: ${channel.channelId}\nTaproot Address: ${channel.taprootAddress}\n\nNow fund this address on L1 to activate the channel.`);
      setShowOpenForm(false);
      setChannelCapacity('');
      await loadChannels();
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
      } catch (error: any) {
        alert(`Failed to confirm funding: ${error.message || 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleUpdateChannel = async () => {
    if (!selectedChannel) return;

    const amount = parseInt(paymentAmount);
    if (!amount || amount <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }

    if (amount > selectedChannel.userBalance) {
      alert('Insufficient balance in channel');
      return;
    }

    setUpdatingChannel(true);
    try {
      const newUserBalance = selectedChannel.userBalance - amount;
      const newHubBalance = selectedChannel.hubBalance + amount;

      const commitment = await apiService.updateChannel(
        selectedChannel.channelId,
        newUserBalance,
        newHubBalance
      );

      alert(`Payment successful! New commitment #${commitment.commitmentNumber}\nYour balance: ${newUserBalance} sats\nHub balance: ${newHubBalance} sats`);
      
      setSelectedChannel(null);
      setPaymentAmount('');
      await loadChannels();
    } catch (error: any) {
      alert(`Failed to update channel: ${error.message || 'Unknown error'}`);
    } finally {
      setUpdatingChannel(false);
    }
  };

  const handleCloseChannel = async (channel: ChannelState) => {
    if (!user1Keys?.privateKey || !hubKeys?.privateKey) {
      alert('Private keys are required to close channel');
      return;
    }

    if (!window.confirm(`Are you sure you want to close channel ${channel.channelId}? This will broadcast the latest commitment to L1.`)) {
      return;
    }

    setClosingChannelId(channel.channelId);
    try {
      const result = await apiService.closeChannel(
        channel.channelId,
        user1Keys.privateKey,
        hubKeys.privateKey
      );

      alert(`Channel closed! Closing TXID: ${result.closingTxid}\nFunds will be settled on L1.`);
      await loadChannels();
    } catch (error: any) {
      alert(`Failed to close channel: ${error.message || 'Unknown error'}`);
    } finally {
      setClosingChannelId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'text-[#10B981]';
      case 'opening':
        return 'text-[#F59E0B]';
      case 'closing':
        return 'text-[#EF4444]';
      case 'closed':
        return 'text-[#888]';
      default:
        return 'text-[#888]';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <CheckCircle2 className="h-4 w-4 text-[#10B981]" />;
      case 'opening':
        return <Clock className="h-4 w-4 text-[#F59E0B]" />;
      case 'closing':
        return <Loader2 className="h-4 w-4 text-[#EF4444] animate-spin" />;
      case 'closed':
        return <XCircle className="h-4 w-4 text-[#888]" />;
      default:
        return null;
    }
  };

  const formatSats = (sats: number) => {
    return sats.toLocaleString();
  };

  return (
    <div className="min-h-screen w-full flex flex-col px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Lightning Network Style Channels</h1>
        <p className="text-[#888]">
          Open payment channels, make off-chain payments, and settle on L1
        </p>
      </div>

      {/* Open Channel Button */}
      <div className="mb-6">
        <Button
          onClick={() => setShowOpenForm(!showOpenForm)}
          className="bg-[#10B981] hover:bg-[#10B981]/90 text-white"
        >
          <Zap className="h-4 w-4 mr-2" />
          {showOpenForm ? 'Cancel' : 'Open New Channel'}
        </Button>
      </div>

      {/* Open Channel Form */}
      {showOpenForm && (
        <Card className="mb-6 p-6 bg-[#1A1A1A] border-2 border-[#2C2C2C]">
          <h3 className="text-white mb-4">Open Payment Channel</h3>
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
            <div className="bg-[#0A0A0A] border border-[#2C2C2C] p-4 rounded">
              <p className="text-[#888] text-sm mb-2">How it works:</p>
              <ol className="text-[#888] text-sm space-y-1 list-decimal list-inside">
                <li>Channel will create a taproot address for funding</li>
                <li>Send Bitcoin to the taproot address (L1 transaction)</li>
                <li>Confirm funding with transaction ID</li>
                <li>Channel becomes OPEN for off-chain payments</li>
              </ol>
            </div>
            <Button
              onClick={handleOpenChannel}
              disabled={openingChannel || !channelCapacity}
              className="w-full bg-[#10B981] hover:bg-[#10B981]/90 text-white"
            >
              {openingChannel ? 'Opening...' : 'Open Channel'}
            </Button>
          </div>
        </Card>
      )}

      {/* Channels List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[#888]" />
        </div>
      ) : channels.length === 0 ? (
        <Card className="p-12 bg-[#1A1A1A] border-2 border-[#2C2C2C] text-center">
          <p className="text-[#888]">No channels found. Open a new channel to get started.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {channels.map((channel) => (
            <Card key={channel.channelId} className="p-6 bg-[#1A1A1A] border-2 border-[#2C2C2C]">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusIcon(channel.status)}
                    <span className={`font-semibold ${getStatusColor(channel.status)}`}>
                      {channel.status.toUpperCase()}
                    </span>
                    <span className="text-[#888] text-sm font-mono">
                      {channel.channelId.slice(0, 8)}...
                    </span>
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

              {/* Taproot Address */}
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

              {/* Actions based on status */}
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
                    <Button
                      onClick={() => setSelectedChannel(channel)}
                      className="bg-[#3B82F6] hover:bg-[#3B82F6]/90 text-white"
                      size="sm"
                    >
                      Make Payment
                    </Button>
                    <Button
                      onClick={() => handleCloseChannel(channel)}
                      disabled={closingChannelId === channel.channelId}
                      className="bg-[#EF4444] hover:bg-[#EF4444]/90 text-white"
                      size="sm"
                    >
                      {closingChannelId === channel.channelId ? 'Closing...' : 'Close Channel'}
                    </Button>
                  </>
                )}

                {channel.fundingTxid && (
                  <div className="text-xs text-[#888] mt-2">
                    Funding TX: <span className="font-mono">{channel.fundingTxid.slice(0, 16)}...</span>
                  </div>
                )}

                {channel.closingTxid && (
                  <div className="text-xs text-[#888] mt-2">
                    Closing TX: <span className="font-mono">{channel.closingTxid.slice(0, 16)}...</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Payment Modal */}
      {selectedChannel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md p-6 bg-[#1A1A1A] border-2 border-[#2C2C2C]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white">Make Off-Chain Payment</h3>
              <Button
                onClick={() => {
                  setSelectedChannel(null);
                  setPaymentAmount('');
                }}
                variant="ghost"
                size="sm"
                className="text-[#888] hover:text-white"
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <div className="bg-[#0A0A0A] border border-[#2C2C2C] p-4 rounded">
                <p className="text-[#888] text-sm mb-2">Channel Balance</p>
                <p className="text-white font-mono">{formatSats(selectedChannel.userBalance)} sats</p>
              </div>

              <div>
                <label className="block text-[#888] mb-2">Payment Amount (sats)</label>
                <Input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="10000"
                  className="bg-[#0A0A0A] border-[#2C2C2C] text-white"
                />
              </div>

              <div className="bg-[#F59E0B]/10 border border-[#F59E0B] p-4 rounded">
                <p className="text-[#F59E0B] text-sm">
                  ⚡ This is an OFF-CHAIN payment. No L1 transaction will be broadcast.
                  A new commitment will be created and signed.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setSelectedChannel(null);
                    setPaymentAmount('');
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateChannel}
                  disabled={updatingChannel || !paymentAmount}
                  className="flex-1 bg-[#10B981] hover:bg-[#10B981]/90 text-white"
                >
                  {updatingChannel ? 'Processing...' : 'Send Payment'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

