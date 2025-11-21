import { useState } from 'react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Download, Key, Shield } from 'lucide-react';

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<'initial' | 'keys' | 'loading'>('initial');
  const [hasBackedUp, setHasBackedUp] = useState(false);
  const [privateKey] = useState('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

  const handleGenerateKeys = () => {
    setStep('keys');
  };

  const handleDownloadBackup = () => {
    const backup = {
      version: 'ByteStream V2',
      privateKey,
      timestamp: new Date().toISOString(),
      warning: 'NEVER share this file. Loss = permanent loss of funds.',
    };
    
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bytestream-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConnect = () => {
    setStep('loading');
    
    // Simulate handshake process
    setTimeout(() => {
      onComplete();
    }, 3000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Initial State */}
        {step === 'initial' && (
          <div className="bg-[#1A1A1A] border-2 border-[#2C2C2C] p-12 text-center">
            <div className="mb-8 flex justify-center">
              <div className="w-20 h-20 bg-[#FF9F1C]/10 border-2 border-[#FF9F1C] flex items-center justify-center">
                <Shield className="w-10 h-10 text-[#FF9F1C]" />
              </div>
            </div>
            
            <h1 className="mb-4 text-[#FF9F1C]">Initialize ByteStream Node</h1>
            <p className="text-[#888] mb-12">
              Client-side Key Generation. Non-Custodial.
            </p>

            <Button
              onClick={handleGenerateKeys}
              className="w-full bg-[#FF9F1C] hover:bg-[#FF9F1C]/90 text-black h-14"
            >
              <Key className="mr-2 h-5 w-5" />
              Generate Keys
            </Button>
          </div>
        )}

        {/* Keys Generated State */}
        {step === 'keys' && (
          <div className="bg-[#1A1A1A] border-2 border-[#2C2C2C] p-12">
            <div className="mb-8 flex justify-center">
              <div className="w-20 h-20 bg-[#10B981]/10 border-2 border-[#10B981] flex items-center justify-center">
                <Key className="w-10 h-10 text-[#10B981]" />
              </div>
            </div>
            
            <h1 className="mb-4 text-[#10B981] text-center">Keys Generated</h1>
            
            <div className="mb-8">
              <label className="block text-[#888] mb-2">Secret Key</label>
              <div className="bg-[#0A0A0A] border border-[#2C2C2C] p-4 font-mono text-sm break-all">
                {'*'.repeat(64)}
              </div>
              <p className="text-[#EF4444] text-sm mt-2">
                ⚠ This key is stored in your browser. You must back it up.
              </p>
            </div>

            <Button
              onClick={handleDownloadBackup}
              className="w-full bg-[#2C2C2C] hover:bg-[#3C3C3C] text-white h-12 mb-6"
            >
              <Download className="mr-2 h-5 w-5" />
              Download Backup .json
            </Button>

            <div className="border-t border-[#2C2C2C] pt-6 mb-6">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="backup-confirm"
                  checked={hasBackedUp}
                  onCheckedChange={(checked) => setHasBackedUp(checked === true)}
                  className="mt-1"
                />
                <label htmlFor="backup-confirm" className="text-sm text-[#CCC] leading-tight cursor-pointer">
                  I have backed up my private key. I understand the Hub cannot recover my funds.
                </label>
              </div>
            </div>

            <Button
              onClick={handleConnect}
              disabled={!hasBackedUp}
              className="w-full bg-[#FF9F1C] hover:bg-[#FF9F1C]/90 text-black h-14 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Connect to Hub
            </Button>
          </div>
        )}

        {/* Loading State */}
        {step === 'loading' && (
          <div className="bg-[#1A1A1A] border-2 border-[#2C2C2C] p-12 text-center">
            <div className="mb-8 flex justify-center">
              <div className="w-20 h-20 bg-[#FF9F1C]/10 border-2 border-[#FF9F1C] flex items-center justify-center animate-pulse">
                <Shield className="w-10 h-10 text-[#FF9F1C]" />
              </div>
            </div>
            
            <h1 className="mb-4 text-white">Handshaking with Hub...</h1>
            <p className="text-[#888] mb-4 font-mono text-sm">
              Deriving 2-of-2 Taproot Address...
            </p>
            
            <div className="w-full bg-[#0A0A0A] border border-[#2C2C2C] h-2 overflow-hidden">
              <div className="h-full bg-[#FF9F1C] animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
