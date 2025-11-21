import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ArrowLeft, Clock, Zap, TrendingUp } from 'lucide-react';

interface SettleProps {
  availableBalance: number;
  onBack: () => void;
  onSettle: (destination: string, priority: 'economy' | 'standard' | 'priority', fee: number) => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

type Priority = {
  id: 'economy' | 'standard' | 'priority';
  name: string;
  time: string;
  cost: number;
  icon: any;
};

export function Settle({ availableBalance, onBack, onSettle, showToast }: SettleProps) {
  const [destination, setDestination] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<'economy' | 'standard' | 'priority'>('standard');

  const priorities: Priority[] = [
    {
      id: 'economy',
      name: 'Economy',
      time: '~1 Hour',
      cost: 200,
      icon: Clock,
    },
    {
      id: 'standard',
      name: 'Standard',
      time: '~20 Minutes',
      cost: 500,
      icon: TrendingUp,
    },
    {
      id: 'priority',
      name: 'Priority',
      time: 'Next Block',
      cost: 1200,
      icon: Zap,
    },
  ];

  const selectedFee = priorities.find(p => p.id === selectedPriority)?.cost || 0;
  const netWithdrawal = availableBalance - selectedFee;

  const handleSettle = () => {
    if (!destination) {
      showToast('Please enter a withdrawal address', 'error');
      return;
    }

    if (availableBalance < selectedFee) {
      showToast('Insufficient balance for settlement fee', 'error');
      return;
    }

    onSettle(destination, selectedPriority, selectedFee);
  };

  const formatSats = (sats: number) => {
    return sats.toLocaleString();
  };

  return (
    <div className="max-w-3xl mx-auto">
      <Button
        onClick={onBack}
        variant="ghost"
        className="mb-6 text-[#888] hover:text-white"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Dashboard
      </Button>

      <div className="bg-[#1A1A1A] border-2 border-[#2C2C2C] p-12">
        <h1 className="mb-2 text-white text-center">Settlement Request</h1>
        <p className="text-[#888] mb-12 text-center">
          Move funds from L2 to L1 using Commit-and-Reveal
        </p>

        <div className="space-y-8">
          {/* Step 1: Destination */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-[#FF9F1C] flex items-center justify-center text-black">
                1
              </div>
              <h3 className="text-white">Withdrawal Address</h3>
            </div>
            <Input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Enter L1 Bitcoin address (e.g., bc1q...)"
              className="bg-[#0A0A0A] border-[#2C2C2C] text-white font-mono"
            />
          </div>

          {/* Step 2: Priority Selection */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-[#FF9F1C] flex items-center justify-center text-black">
                2
              </div>
              <div>
                <h3 className="text-white">Select Confirmation Priority</h3>
                <p className="text-[#888] text-sm">
                  Settlement fees are deducted from your off-chain balance. The Hub handles the broadcast.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {priorities.map((priority) => {
                const Icon = priority.icon;
                const isSelected = selectedPriority === priority.id;
                
                return (
                  <button
                    key={priority.id}
                    onClick={() => setSelectedPriority(priority.id)}
                    className={`p-6 border-2 transition-all text-left ${
                      isSelected
                        ? 'bg-[#FF9F1C]/10 border-[#FF9F1C]'
                        : 'bg-[#0A0A0A] border-[#2C2C2C] hover:border-[#3C3C3C]'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className={`h-5 w-5 ${isSelected ? 'text-[#FF9F1C]' : 'text-[#888]'}`} />
                      <span className="text-white">{priority.name}</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="text-[#888]">
                        Est. Time: <span className="text-white">{priority.time}</span>
                      </div>
                      <div className="text-[#888]">
                        Cost: <span className="font-mono text-white">{formatSats(priority.cost)} sats</span>
                      </div>
                    </div>
                    <div className={`mt-4 w-5 h-5 rounded-full border-2 ${
                      isSelected
                        ? 'border-[#FF9F1C] bg-[#FF9F1C]'
                        : 'border-[#2C2C2C]'
                    } flex items-center justify-center`}>
                      {isSelected && (
                        <div className="w-2 h-2 bg-black rounded-full" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 3: Review */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-[#FF9F1C] flex items-center justify-center text-black">
                3
              </div>
              <h3 className="text-white">Review & Confirm</h3>
            </div>

            <div className="bg-[#0A0A0A] border border-[#2C2C2C] p-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[#888]">Current L2 Balance:</span>
                <span className="font-mono text-white">{formatSats(availableBalance)} sats</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#888]">Settlement Fee:</span>
                <span className="font-mono text-[#EF4444]">-{formatSats(selectedFee)} sats</span>
              </div>
              <div className="border-t border-[#2C2C2C] pt-3 flex justify-between">
                <span className="text-white">Net Withdrawal Amount:</span>
                <span className="font-mono text-[#10B981]">
                  {formatSats(netWithdrawal)} sats
                </span>
              </div>
            </div>

            <div className="bg-[#F59E0B]/10 border border-[#F59E0B] p-4 mt-4">
              <p className="text-[#F59E0B] text-sm">
                ⚠ Your shard will be frozen during settlement. No new payments will be allowed until the transaction confirms on-chain.
              </p>
            </div>
          </div>

          {/* Action Button */}
          <Button
            onClick={handleSettle}
            disabled={!destination || netWithdrawal <= 0}
            className="w-full bg-[#FF9F1C] hover:bg-[#FF9F1C]/90 text-black h-14 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Freeze Shard & Request Settlement
          </Button>
        </div>
      </div>
    </div>
  );
}
