import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { ArrowLeft, AlertCircle } from 'lucide-react';

interface SendProps {
  availableBalance: number;
  onBack: () => void;
  onSend: (recipient: string, amount: number, fee: number, memo?: string) => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

export function Send({ availableBalance, onBack, onSend, showToast }: SendProps) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [showMemo, setShowMemo] = useState(false);
  const [memo, setMemo] = useState('');
  
  const [fees, setFees] = useState({
    base: 20,
    gas: 20,
    proportional: 0,
    total: 0,
  });

  const [error, setError] = useState('');

  useEffect(() => {
    const amountNum = parseInt(amount) || 0;
    
    if (amountNum > 0) {
      const proportional = Math.ceil(amountNum * 0.0001); // 0.01%
      const total = fees.base + fees.gas + proportional;
      
      setFees({
        ...fees,
        proportional,
        total,
      });

      // Validation
      if (amountNum < 1000) {
        setError('Minimum payment is 1,000 sats');
      } else if (total > amountNum) {
        setError('Fees exceed payment amount');
      } else if (amountNum + total > availableBalance) {
        setError('Insufficient L2 Balance');
      } else {
        setError('');
      }
    } else {
      setFees({
        ...fees,
        proportional: 0,
        total: 0,
      });
      setError('');
    }
  }, [amount]);

  const handleSend = () => {
    if (!recipient) {
      showToast('Please enter a recipient address', 'error');
      return;
    }
    
    if (error) {
      showToast(error, 'error');
      return;
    }

    const amountNum = parseInt(amount);
    if (amountNum > 0 && !error) {
      onSend(recipient, amountNum, fees.total, memo || undefined);
    }
  };

  const formatSats = (sats: number) => {
    return sats.toLocaleString();
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Button
        onClick={onBack}
        variant="ghost"
        className="mb-6 text-[#888] hover:text-white"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Dashboard
      </Button>

      <div className="bg-[#1A1A1A] border-2 border-[#2C2C2C] p-12">
        <h1 className="mb-2 text-white text-center">Send Payment</h1>
        <p className="text-[#888] mb-12 text-center">Create an off-chain payment intent</p>

        <div className="space-y-6">
          {/* Available Balance */}
          <div className="bg-[#0A0A0A] border border-[#2C2C2C] p-4 text-center">
            <span className="text-[#888] text-sm">Available Balance: </span>
            <span className="font-mono text-[#10B981]">{formatSats(availableBalance)} sats</span>
          </div>

          {/* Recipient */}
          <div>
            <label className="block text-[#888] mb-2">Recipient</label>
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="ByteStream ID or Bitcoin Address"
              className="bg-[#0A0A0A] border-[#2C2C2C] text-white font-mono"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-[#888] mb-2">Amount (sats)</label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className={`bg-[#0A0A0A] text-white font-mono ${
                error && parseInt(amount) < 1000 ? 'border-[#EF4444]' : 'border-[#2C2C2C]'
              }`}
            />
            {error && (
              <div className="flex items-center gap-2 mt-2 text-[#EF4444] text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>Error: {error}</span>
              </div>
            )}
          </div>

          {/* Fee Calculator */}
          {parseInt(amount) > 0 && (
            <div className="bg-[#0A0A0A] border-2 border-dashed border-[#2C2C2C] p-6">
              <h3 className="text-white mb-4 text-sm">Fee Breakdown</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#888]">Base Fee:</span>
                  <span className="font-mono text-white">{fees.base} sats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#888]">Gas Fee:</span>
                  <span className="font-mono text-white">{fees.gas} sats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#888]">Proportional (0.01%):</span>
                  <span className="font-mono text-white">{fees.proportional} sats</span>
                </div>
                <div className="border-t border-[#2C2C2C] pt-2 mt-2 flex justify-between">
                  <span className="text-white">Total Fee:</span>
                  <span className={`font-mono ${error && fees.total > parseInt(amount) ? 'text-[#F59E0B]' : 'text-[#FF9F1C]'}`}>
                    {fees.total} sats
                  </span>
                </div>
              </div>
              {error && fees.total > parseInt(amount) && (
                <p className="text-[#F59E0B] text-sm mt-3">
                  ⚠ Warning: Fees exceed payment amount
                </p>
              )}
            </div>
          )}

          {/* Memo Toggle */}
          {!showMemo ? (
            <Button
              onClick={() => setShowMemo(true)}
              variant="ghost"
              className="text-[#888] hover:text-white w-full"
            >
              + Add Memo (Optional)
            </Button>
          ) : (
            <div>
              <label className="block text-[#888] mb-2">Memo</label>
              <Textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Payment description..."
                className="bg-[#0A0A0A] border-[#2C2C2C] text-white resize-none"
                rows={3}
              />
            </div>
          )}

          {/* Total */}
          {parseInt(amount) > 0 && (
            <div className="bg-[#FF9F1C]/10 border border-[#FF9F1C] p-4">
              <div className="flex justify-between items-center">
                <span className="text-white">Total (Amount + Fees):</span>
                <span className="font-mono text-[#FF9F1C]">
                  {formatSats(parseInt(amount) + fees.total)} sats
                </span>
              </div>
            </div>
          )}

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={!recipient || !amount || !!error || parseInt(amount) === 0}
            className="w-full bg-[#FF9F1C] hover:bg-[#FF9F1C]/90 text-black h-14 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Sign & Send Intent
          </Button>
        </div>
      </div>
    </div>
  );
}
