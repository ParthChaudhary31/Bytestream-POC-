import { useEffect, useState } from 'react';
import { SettlementData } from '../store/slices/walletSlice';
import { Button } from './ui/button';
import { Check, Loader2, ExternalLink, Minimize2 } from 'lucide-react';

interface SettlementStatusProps {
  settlementData: SettlementData;
  onMinimize: () => void;
  onComplete: () => void;
  onUpdateStatus: (status: SettlementData['status']) => void;
}

export function SettlementStatus({ settlementData, onMinimize, onComplete, onUpdateStatus }: SettlementStatusProps) {
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    // Simulate status progression
    const progressStatuses: SettlementData['status'][] = ['frozen', 'signing', 'broadcasting', 'mempool', 'confirmed'];
    let currentIndex = progressStatuses.indexOf(settlementData.status);

    const timer = setInterval(() => {
      currentIndex++;
      if (currentIndex < progressStatuses.length) {
        onUpdateStatus(progressStatuses[currentIndex]);
      } else {
        clearInterval(timer);
        setTimeout(() => {
          onComplete();
        }, 1000);
      }
    }, 2000);

    return () => clearInterval(timer);
  }, []);

  const steps = [
    {
      id: 'frozen',
      label: 'Request Sent',
      description: '',
    },
    {
      id: 'signing',
      label: 'Shard Frozen',
      description: 'No new payments allowed.',
    },
    {
      id: 'broadcasting',
      label: 'Hub Signing',
      description: 'Aggregating signatures...',
    },
    {
      id: 'mempool',
      label: 'Broadcasting',
      description: 'Hub broadcasting via Anchor Output...',
    },
    {
      id: 'confirmed',
      label: 'Confirmed',
      description: 'Settlement complete!',
    },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === settlementData.status);

  if (minimized) {
    return (
      <div className="fixed top-20 right-8 bg-[#F59E0B]/90 border-2 border-[#F59E0B] px-6 py-4 z-50 backdrop-blur">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-white">Settlement in Progress...</span>
          <Button
            onClick={() => setMinimized(false)}
            variant="ghost"
            className="text-white hover:text-white hover:bg-white/10 h-8 px-2"
          >
            Expand
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8">
      <div className="bg-[#1A1A1A] border-2 border-[#F59E0B] max-w-2xl w-full">
        {/* Header */}
        <div className="border-b border-[#F59E0B] p-6 flex items-center justify-between">
          <h2 className="text-[#F59E0B]">Settlement Status</h2>
          <Button
            onClick={() => setMinimized(true)}
            variant="ghost"
            className="text-[#F59E0B] hover:text-white hover:bg-[#F59E0B]/10"
          >
            <Minimize2 className="h-5 w-5" />
          </Button>
        </div>

        {/* Status Tracker */}
        <div className="p-8">
          <div className="space-y-6">
            {steps.map((step, index) => {
              const isComplete = index < currentStepIndex;
              const isCurrent = index === currentStepIndex;
              const isPending = index > currentStepIndex;

              return (
                <div key={step.id} className="flex gap-4">
                  {/* Indicator */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                        isComplete
                          ? 'bg-[#10B981] border-[#10B981]'
                          : isCurrent
                          ? 'bg-[#F59E0B] border-[#F59E0B] animate-pulse'
                          : 'bg-transparent border-[#2C2C2C]'
                      }`}
                    >
                      {isComplete ? (
                        <Check className="h-5 w-5 text-white" />
                      ) : isCurrent ? (
                        <Loader2 className="h-5 w-5 text-white animate-spin" />
                      ) : (
                        <span className="text-[#888]">{index + 1}</span>
                      )}
                    </div>
                    {index < steps.length - 1 && (
                      <div
                        className={`w-0.5 h-12 mt-2 ${
                          isComplete ? 'bg-[#10B981]' : 'bg-[#2C2C2C]'
                        }`}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-6">
                    <h3
                      className={`mb-1 ${
                        isComplete ? 'text-[#10B981]' : isCurrent ? 'text-white' : 'text-[#888]'
                      }`}
                    >
                      {step.label}
                    </h3>
                    {step.description && (
                      <p className="text-[#888] text-sm">{step.description}</p>
                    )}
                    {step.id === 'mempool' && isCurrent && (
                      <a
                        href={`https://mempool.space/tx/${settlementData.txid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-[#FF9F1C] hover:text-[#FF9F1C]/80 mt-2"
                      >
                        <span>View TX: {settlementData.txid.slice(0, 8)}...{settlementData.txid.slice(-8)}</span>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Info */}
          <div className="mt-8 bg-[#0A0A0A] border border-[#2C2C2C] p-6 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#888]">Destination:</span>
              <span className="font-mono text-white">{settlementData.destination.slice(0, 16)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">Amount:</span>
              <span className="font-mono text-white">{settlementData.amount.toLocaleString()} sats</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">Fee:</span>
              <span className="font-mono text-white">{settlementData.fee.toLocaleString()} sats</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#888]">Priority:</span>
              <span className="text-white capitalize">{settlementData.priority}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
