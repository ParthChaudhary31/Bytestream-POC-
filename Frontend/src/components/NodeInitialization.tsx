import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Shield, Key, Copy, CheckCircle2 } from 'lucide-react';
import { apiService } from '../services/api';

interface NodeInitializationProps {
  userLabel: string;
  existingKeys?: { address: string; privateKey: string; publicKey: string } | null;
  onKeysGenerated?: (keys: { address: string; privateKey: string; publicKey: string }) => void;
}

export function NodeInitialization({ userLabel, existingKeys, onKeysGenerated }: NodeInitializationProps) {
  const [step, setStep] = useState<'initial' | 'generated'>('initial');
  const [loading, setLoading] = useState(false);
  const [keys, setKeys] = useState<{ address: string; privateKey: string; publicKey: string } | null>(null);
  const [copied, setCopied] = useState<'address' | 'privateKey' | 'publicKey' | null>(null);

  // Restore keys from Redux on mount or when existingKeys changes
  useEffect(() => {
    if (existingKeys) {
      setKeys(existingKeys);
      setStep('generated');
    } else {
      setKeys(null);
      setStep('initial');
    }
  }, [existingKeys]);

  const handleGenerateKeys = async () => {
    setLoading(true);
    try {
      const walletData = await apiService.generateWallet();
      setKeys(walletData);
      setStep('generated');
      if (onKeysGenerated) {
        onKeysGenerated(walletData);
      }
    } catch (error) {
      console.error('Failed to generate wallet:', error);
      alert('Failed to generate wallet. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (type: 'address' | 'privateKey' | 'publicKey', value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="bg-[#1A1A1A] border-2 border-[#2C2C2C] rounded-lg p-8">
      <div className="mb-6">
        <h3 className="text-white text-lg font-semibold mb-2">{userLabel}</h3>
      </div>

      {step === 'initial' && (
        <div className="text-center">
          <div className="mb-6 flex justify-center">
            <div className="w-16 h-16 bg-[#FF9F1C]/10 border-2 border-[#FF9F1C] rounded-lg flex items-center justify-center">
              <Shield className="w-8 h-8 text-[#FF9F1C]" />
            </div>
          </div>
          
          <h2 className="mb-2 text-[#FF9F1C] text-xl font-semibold">Initialize ByteStream Node</h2>
          <p className="text-[#888] mb-8 text-sm">
            Client-side Key Generation. Non-Custodial.
          </p>

          <Button
            onClick={handleGenerateKeys}
            disabled={loading}
            className="w-full bg-[#FF9F1C] hover:bg-[#FF9F1C]/90 text-black h-12 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center">
                <span className="animate-spin mr-2">⏳</span>
                Generating...
              </span>
            ) : (
              <>
                <Key className="mr-2 h-5 w-5" />
                Generate Keys
              </>
            )}
          </Button>
        </div>
      )}

      {step === 'generated' && keys && (
        <div className="space-y-4">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-[#10B981]/10 border-2 border-[#10B981] rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-[#10B981]" />
            </div>
          </div>

          <div className="space-y-3">
            {/* Address */}
            <div>
              <label className="block text-[#888] text-xs mb-2">Address</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-[#0A0A0A] border border-[#2C2C2C] p-3 font-mono text-xs break-all text-white">
                  {keys.address}
                </div>
                <Button
                  onClick={() => handleCopy('address', keys.address)}
                  size="sm"
                  className="bg-[#2C2C2C] hover:bg-[#3C3C3C] text-white px-3"
                >
                  {copied === 'address' ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Public Key */}
            <div>
              <label className="block text-[#888] text-xs mb-2">Public Key</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-[#0A0A0A] border border-[#2C2C2C] p-3 font-mono text-xs break-all text-white">
                  {keys.publicKey}
                </div>
                <Button
                  onClick={() => handleCopy('publicKey', keys.publicKey)}
                  size="sm"
                  className="bg-[#2C2C2C] hover:bg-[#3C3C3C] text-white px-3"
                >
                  {copied === 'publicKey' ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Private Key */}
            <div>
              <label className="block text-[#888] text-xs mb-2">Private Key</label>
              <div className="flex gap-2">
                <div className="flex-1 bg-[#0A0A0A] border border-[#EF4444] p-3 font-mono text-xs break-all text-white">
                  {keys.privateKey}
                </div>
                <Button
                  onClick={() => handleCopy('privateKey', keys.privateKey)}
                  size="sm"
                  className="bg-[#2C2C2C] hover:bg-[#3C3C3C] text-white px-3"
                >
                  {copied === 'privateKey' ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[#EF4444] text-xs mt-1">
                ⚠ Keep this private key secure. Never share it.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

