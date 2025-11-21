import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { ArrowLeft, Copy, Info } from 'lucide-react';

interface DepositProps {
  address: string;
  onBack: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
  onDeposit: (amount: number) => void;
}

export function Deposit({ address, onBack, showToast, onDeposit }: DepositProps) {
  const [scanning, setScanning] = useState(true);
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    // Simulate scanning for 3 seconds
    const timer = setTimeout(() => {
      setScanning(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    showToast('Address copied to clipboard!', 'success');
  };

  const handleSimulateDeposit = () => {
    setDetected(true);
    showToast('Incoming Deposit Detected: +50,000 sats (1 Conf required)', 'success');
    setTimeout(() => {
      onDeposit(50000);
      showToast('Deposit Confirmed! Funds added to L2 balance.', 'success');
      setTimeout(() => {
        onBack();
      }, 1500);
    }, 2000);
  };

  // Generate QR code placeholder (in a real app, use a QR library)
  const qrCodeSize = 256;

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

      <div className="grid grid-cols-2 gap-8">
        {/* Left: Instructions */}
        <div className="space-y-6">
          <div>
            <h1 className="mb-4 text-white">Fund Shard Account</h1>
            <p className="text-[#888]">
              Send Bitcoin to the address below to fund your off-chain L2 balance.
            </p>
          </div>

          {/* Address Field */}
          <div className="bg-[#1A1A1A] border-2 border-[#2C2C2C] p-6">
            <label className="block text-[#888] mb-3">2-of-2 Taproot Address</label>
            <div className="flex gap-2">
              <div className="flex-1 bg-[#0A0A0A] border border-[#2C2C2C] p-4 font-mono text-sm break-all">
                {address}
              </div>
              <Button
                onClick={handleCopy}
                className="bg-[#2C2C2C] hover:bg-[#3C3C3C] text-white px-6"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Warning Box */}
          <div className="bg-[#FF9F1C]/10 border-2 border-[#FF9F1C] p-6 flex gap-4">
            <Info className="h-6 w-6 text-[#FF9F1C] flex-shrink-0 mt-1" />
            <div>
              <p className="text-white mb-2">Important</p>
              <p className="text-sm text-[#CCC]">
                Minimum deposit: <span className="font-mono">10,000 sats</span>. 
                Amounts below this limit may not be credited to the ledger.
              </p>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-3 text-sm text-[#888]">
            <div className="flex gap-3">
              <span className="text-[#FF9F1C]">1.</span>
              <span>Copy the address above or scan the QR code</span>
            </div>
            <div className="flex gap-3">
              <span className="text-[#FF9F1C]">2.</span>
              <span>Send Bitcoin from your L1 wallet</span>
            </div>
            <div className="flex gap-3">
              <span className="text-[#FF9F1C]">3.</span>
              <span>Wait for 1 confirmation (~10 minutes)</span>
            </div>
            <div className="flex gap-3">
              <span className="text-[#FF9F1C]">4.</span>
              <span>Funds will be credited to your L2 balance</span>
            </div>
          </div>

          {/* Demo Button */}
          <Button
            onClick={handleSimulateDeposit}
            className="w-full bg-[#2C2C2C] hover:bg-[#3C3C3C] text-white h-12 border border-[#FF9F1C]"
            disabled={detected}
          >
            {detected ? 'Processing Deposit...' : 'Simulate Deposit (Demo)'}
          </Button>
        </div>

        {/* Right: QR Code */}
        <div className="flex flex-col items-center justify-start">
          <div className="bg-white p-8 border-4 border-[#2C2C2C]">
            <div
              className="bg-white"
              style={{
                width: qrCodeSize,
                height: qrCodeSize,
                backgroundImage: `
                  linear-gradient(to right, black 50%, transparent 50%),
                  linear-gradient(to right, black 50%, transparent 50%),
                  linear-gradient(to bottom, black 50%, transparent 50%),
                  linear-gradient(to bottom, black 50%, transparent 50%)
                `,
                backgroundSize: '20px 20px, 20px 20px, 20px 20px, 20px 20px',
                backgroundPosition: '0 0, 10px 10px, 0 0, 10px 10px',
              }}
            >
              <div className="w-full h-full flex items-center justify-center bg-white/50 backdrop-blur-sm">
                <span className="text-black text-xs font-mono text-center px-4 break-all">
                  {address.slice(0, 8)}...
                </span>
              </div>
            </div>
          </div>
          <p className="text-[#888] text-sm mt-6 text-center">
            Scan with your Bitcoin wallet
          </p>
        </div>
      </div>

      {/* Live Listener */}
      <div className="mt-12 bg-[#1A1A1A] border-2 border-[#2C2C2C] p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${scanning ? 'bg-[#F59E0B] animate-pulse' : detected ? 'bg-[#10B981]' : 'bg-[#888]'}`} />
            <span className="text-white">
              {scanning && 'Scanning Mempool...'}
              {!scanning && !detected && 'Waiting for deposit...'}
              {detected && 'Incoming Deposit Detected: +50,000 sats (1 Conf required)'}
            </span>
          </div>
          {detected && (
            <span className="text-[#888] text-sm font-mono">Confirmations: 0/1</span>
          )}
        </div>
      </div>
    </div>
  );
}
