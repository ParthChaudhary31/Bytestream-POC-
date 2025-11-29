import { useState } from 'react';
import { Transaction } from '../store/slices/walletSlice';
import { Button } from './ui/button';
import { ArrowLeft, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

interface AuditProps {
  transactions: Transaction[];
  onBack: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

export function Audit({ transactions, onBack, showToast }: AuditProps) {
  const [expandedTxs, setExpandedTxs] = useState<Set<string>>(new Set());
  const [blocksRemaining] = useState(144);

  const toggleTx = (id: string) => {
    const newExpanded = new Set(expandedTxs);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedTxs(newExpanded);
  };

  const handleVerifyProof = (txId: string) => {
    showToast('Merkle proof verified successfully! ✓', 'success');
  };

  const handleEmergencyExit = () => {
    showToast('Cannot broadcast: Timelock not yet expired', 'error');
  };

  // Generate mock merkle data
  const getMerkleData = (txId: string) => ({
    root: `0x${Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`,
    proof: Array(5).fill(0).map((_, i) => 
      `0x${Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`
    ),
  });

  return (
    <div className="max-w-6xl mx-auto">
      <Button
        onClick={onBack}
        variant="ghost"
        className="mb-6 text-[#888] hover:text-white"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Dashboard
      </Button>

      <div className="bg-[#1A1A1A] border-2 border-[#2C2C2C]">
        <div className="border-b border-[#2C2C2C] px-8 py-6">
          <h1 className="text-white mb-2">Audit & Recovery</h1>
          <p className="text-[#888] text-sm">
            Transparency tools and emergency recovery options
          </p>
        </div>

        <Tabs defaultValue="logs" className="w-full">
          <TabsList className="w-full border-b border-[#2C2C2C] bg-transparent rounded-none p-0 h-auto">
            <TabsTrigger
              value="logs"
              className="flex-1 bg-transparent border-b-2 border-transparent data-[state=active]:border-[#FF9F1C] rounded-none py-4 text-[#888] data-[state=active]:text-white"
            >
              Ledger Logs
            </TabsTrigger>
            <TabsTrigger
              value="emergency"
              className="flex-1 bg-transparent border-b-2 border-transparent data-[state=active]:border-[#EF4444] rounded-none py-4 text-[#888] data-[state=active]:text-white"
            >
              Emergency Exit
            </TabsTrigger>
          </TabsList>

          <TabsContent value="logs" className="p-8 mt-0">
            <div className="mb-6">
              <h3 className="text-white mb-2">Intent History & Merkle Proofs</h3>
              <p className="text-[#888] text-sm">
                Every signed intent with verifiable inclusion proofs
              </p>
            </div>

            <div className="space-y-3">
              {transactions.filter(tx => tx.type === 'intent').map((tx) => {
                const isExpanded = expandedTxs.has(tx.id);
                const merkleData = getMerkleData(tx.id);

                return (
                  <div key={tx.id} className="bg-[#0A0A0A] border border-[#2C2C2C]">
                    <button
                      onClick={() => toggleTx(tx.id)}
                      className="w-full p-4 flex items-center justify-between hover:bg-[#2C2C2C]/30 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 text-[#888]" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-[#888]" />
                        )}
                        <div className="text-left">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="text-white">Intent #{tx.id}</span>
                            <span className="font-mono text-[#888] text-sm">{tx.counterparty}</span>
                          </div>
                          <div className="text-[#888] text-sm">
                            {typeof tx.timestamp === 'string' 
                              ? new Date(tx.timestamp).toLocaleString() 
                              : tx.timestamp.toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-[#EF4444]">
                          {tx.amount.toLocaleString()} sats
                        </span>
                        <span className={`text-sm capitalize ${
                          tx.status === 'success' ? 'text-[#10B981]' : 'text-[#F59E0B]'
                        }`}>
                          {tx.status}
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-[#2C2C2C] p-6 space-y-4">
                        <div>
                          <label className="text-[#888] text-sm mb-2 block">Merkle Root</label>
                          <div className="bg-[#121212] border border-[#2C2C2C] p-3 font-mono text-xs text-[#10B981] break-all">
                            {merkleData.root}
                          </div>
                        </div>

                        <div>
                          <label className="text-[#888] text-sm mb-2 block">Inclusion Proof</label>
                          <div className="bg-[#121212] border border-[#2C2C2C] p-3 space-y-2">
                            {merkleData.proof.map((hash, i) => (
                              <div key={i} className="font-mono text-xs text-[#888] break-all">
                                [{i}] {hash}
                              </div>
                            ))}
                          </div>
                        </div>

                        <Button
                          onClick={() => handleVerifyProof(tx.id)}
                          className="w-full bg-[#10B981] hover:bg-[#10B981]/90 text-white"
                        >
                          Verify Proof (Client-side)
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}

              {transactions.filter(tx => tx.type === 'intent').length === 0 && (
                <div className="text-center py-12 text-[#888]">
                  No intent history yet
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="emergency" className="p-8 mt-0">
            <div className="max-w-2xl mx-auto">
              <div className="bg-[#EF4444]/10 border-2 border-[#EF4444] p-8 mb-8">
                <div className="flex gap-4 mb-4">
                  <AlertTriangle className="h-6 w-6 text-[#EF4444] flex-shrink-0" />
                  <div>
                    <h3 className="text-[#EF4444] mb-2">Emergency Exit - Use Only If Necessary</h3>
                    <p className="text-[#CCC] text-sm">
                      Only use this if the Hub is offline or censoring you. This will trigger a CSV (CheckSequenceVerify) spend path.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-[#0A0A0A] border border-[#2C2C2C] p-8 space-y-6">
                <div>
                  <h4 className="text-white mb-4">Timelock Status</h4>
                  <div className="bg-[#121212] border border-[#2C2C2C] p-6 text-center">
                    <p className="text-[#888] mb-2">Timelock expires in:</p>
                    <p className="font-mono text-[#F59E0B] mb-4">
                      {blocksRemaining} Blocks
                    </p>
                    <p className="text-[#888] text-sm">
                      (~{Math.floor(blocksRemaining * 10 / 60)} hours remaining)
                    </p>
                  </div>
                </div>

                <div className="space-y-3 text-sm text-[#888]">
                  <div className="flex gap-3">
                    <span className="text-[#EF4444]">1.</span>
                    <span>Broadcasting will create an unilateral exit transaction</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-[#EF4444]">2.</span>
                    <span>You must wait 5 minutes after broadcasting to claim funds</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-[#EF4444]">3.</span>
                    <span>This action is irreversible and will close your shard</span>
                  </div>
                </div>

                <Button
                  onClick={handleEmergencyExit}
                  disabled={blocksRemaining > 0}
                  className="w-full bg-[#EF4444] hover:bg-[#EF4444]/90 text-white h-14 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {blocksRemaining > 0 ? (
                    `Broadcast Unilateral Exit (Disabled - ${blocksRemaining} blocks remaining)`
                  ) : (
                    'Broadcast Unilateral Exit'
                  )}
                </Button>

                {blocksRemaining > 0 && (
                  <p className="text-[#888] text-sm text-center">
                    This button will be enabled when the timelock expires
                  </p>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
