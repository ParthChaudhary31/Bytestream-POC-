import { Screen } from '../App';
import { WalletState } from '../store/slices/walletSlice';
import { Button } from './ui/button';
import { Download, Send, Zap, Link2 } from 'lucide-react';

interface DashboardProps {
  walletState: WalletState;
  onNavigate: (screen: Screen) => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

export function Dashboard({ walletState, onNavigate, showToast }: DashboardProps) {
  const formatSats = (sats: number) => {
    return sats.toLocaleString();
  };

  const formatTime = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diff = Math.floor((now.getTime() - dateObj.getTime()) / 1000);
    
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'intent':
        return '⚡';
      case 'settlement':
        return '🔗';
      case 'deposit':
        return '📥';
      default:
        return '•';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-[#10B981]';
      case 'confirming':
        return 'text-[#F59E0B]';
      case 'pending':
        return 'text-[#888]';
      default:
        return 'text-white';
    }
  };

  const availablePercent = (walletState.availableL2 / walletState.totalBalance) * 100;
  const frozenPercent = (walletState.frozen / walletState.totalBalance) * 100;
  const onChainPercent = (walletState.onChain / walletState.totalBalance) * 100;

  return (
    <div className="space-y-8">
      {/* Frozen Banner */}
      {walletState.settlementInProgress && (
        <div className="bg-[#F59E0B]/10 border-2 border-[#F59E0B] p-4">
          <p className="text-[#F59E0B] text-center">
            ⚠ Shard Frozen - Settlement in Progress. No new payments allowed.
          </p>
        </div>
      )}

      {/* Hero Section - Balance Card */}
      <div className="bg-[#1A1A1A] border-2 border-[#2C2C2C] p-12">
        <h2 className="text-[#888] mb-4 text-center">Total Balance</h2>
        <div className="text-center mb-8">
          <span className="font-mono text-white">{formatSats(walletState.totalBalance)}</span>
          <span className="text-[#888] ml-2">sats</span>
        </div>

        {/* Visual Breakdown */}
        <div className="mb-6">
          <div className="h-8 flex overflow-hidden border border-[#2C2C2C]">
            <div
              className="bg-[#10B981] transition-all duration-500"
              style={{ width: `${availablePercent}%` }}
            />
            <div
              className="bg-[#F59E0B] transition-all duration-500"
              style={{ width: `${frozenPercent}%` }}
            />
            <div
              className="bg-[#4C4C4C] transition-all duration-500"
              style={{ width: `${onChainPercent}%` }}
            />
          </div>
          
          <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 bg-[#10B981]" />
                <span className="text-[#888]">Available (L2)</span>
              </div>
              <p className="font-mono text-white">{formatSats(walletState.availableL2)} sats</p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 bg-[#F59E0B]" />
                <span className="text-[#888]">Frozen (Settling)</span>
              </div>
              <p className="font-mono text-white">{formatSats(walletState.frozen)} sats</p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 bg-[#4C4C4C]" />
                <span className="text-[#888]">On-Chain (Confirmed)</span>
              </div>
              <p className="font-mono text-white">{formatSats(walletState.onChain)} sats</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-4">
          <Button
            onClick={() => onNavigate('deposit')}
            className="h-16 bg-[#2C2C2C] hover:bg-[#3C3C3C] text-white border-2 border-[#2C2C2C] hover:border-[#10B981] transition-all"
            disabled={walletState.settlementInProgress}
          >
            <Download className="mr-2 h-5 w-5" />
            Deposit (L1 → L2)
          </Button>
          
          <Button
            onClick={() => onNavigate('send')}
            className="h-16 bg-[#FF9F1C] hover:bg-[#FF9F1C]/90 text-black transition-all"
            disabled={walletState.settlementInProgress || walletState.availableL2 === 0}
          >
            <Zap className="mr-2 h-5 w-5" />
            Send (Instant L2)
          </Button>
          
          <Button
            onClick={() => onNavigate('settle')}
            className="h-16 bg-[#2C2C2C] hover:bg-[#3C3C3C] text-white border-2 border-[#2C2C2C] hover:border-[#FF9F1C] transition-all"
            disabled={walletState.settlementInProgress || walletState.availableL2 === 0}
          >
            <Link2 className="mr-2 h-5 w-5" />
            Settle (L2 → L1)
          </Button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-[#1A1A1A] border-2 border-[#2C2C2C]">
        <div className="border-b border-[#2C2C2C] px-8 py-4">
          <h3 className="text-white">Recent Activity</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2C2C2C] text-left text-[#888] text-sm">
                <th className="px-8 py-4">Type</th>
                <th className="px-4 py-4">Counterparty</th>
                <th className="px-4 py-4 text-right">Amount</th>
                <th className="px-4 py-4 text-right">Fee</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-8 py-4 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {walletState.transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-[#2C2C2C] hover:bg-[#2C2C2C]/30 transition-colors">
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-2">
                      <span>{getTypeIcon(tx.type)}</span>
                      <span className="capitalize">{tx.type}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 font-mono text-sm">{tx.counterparty}</td>
                  <td className="px-4 py-4 text-right font-mono">
                    <span className={tx.amount < 0 ? 'text-[#EF4444]' : 'text-[#10B981]'}>
                      {tx.amount < 0 ? '' : '+'}{formatSats(tx.amount)} sats
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-mono text-[#888]">
                    {tx.fee > 0 ? `${formatSats(tx.fee)} sats` : '-'}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`capitalize ${getStatusColor(tx.status)}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-8 py-4 text-right text-[#888]">
                    {formatTime(tx.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
