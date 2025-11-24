import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Key, Copy, CheckCircle2 } from 'lucide-react';
import { apiService } from '../services/api';

interface NodeInitializationProps {
  userLabel: string;
  existingKeys?: { address: string; privateKey: string; publicKey: string } | null;
  onKeysGenerated?: (keys: { address: string; privateKey: string; publicKey: string }) => void;
}

export function NodeInitialization({ userLabel, existingKeys, onKeysGenerated }: NodeInitializationProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<'address' | 'privateKey' | 'publicKey' | null>(null);
  const [editableKeys, setEditableKeys] = useState<{ address: string; privateKey: string; publicKey: string }>({
    address: '',
    privateKey: '',
    publicKey: '',
  });

  // Restore keys from Redux on mount or when existingKeys changes
  useEffect(() => {
    if (existingKeys) {
      setEditableKeys(existingKeys);
    } else {
      setEditableKeys({ address: '', privateKey: '', publicKey: '' });
    }
  }, [existingKeys]);

  const handleKeyChange = (field: 'address' | 'privateKey' | 'publicKey', value: string) => {
    setEditableKeys(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveKeys = () => {
    if (editableKeys.address && editableKeys.privateKey && editableKeys.publicKey) {
      if (onKeysGenerated) {
        onKeysGenerated(editableKeys);
      }
    }
  };

  const handleGenerateKeys = async () => {
    setLoading(true);
    try {
      const walletData = await apiService.generateWallet();
      setEditableKeys(walletData);
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

        <div className="space-y-4">
            {/* Address */}
            <div>
              <label className="block text-[#888] text-xs mb-2">Address</label>
              <div className="flex gap-2">
            <Input
              type="text"
              value={editableKeys.address}
              onChange={(e) => handleKeyChange('address', e.target.value)}
              className="flex-1 bg-[#0A0A0A] border border-[#2C2C2C] p-3 font-mono text-xs text-white"
              placeholder="Enter address or generate keys"
            />
                <Button
              onClick={() => handleCopy('address', editableKeys.address)}
                  size="sm"
                  className="bg-[#2C2C2C] hover:bg-[#3C3C3C] text-white px-3"
              disabled={!editableKeys.address}
                >
                  {copied === 'address' ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Public Key */}
            <div>
              <label className="block text-[#888] text-xs mb-2">Public Key</label>
              <div className="flex gap-2">
            <Input
              type="text"
              value={editableKeys.publicKey}
              onChange={(e) => handleKeyChange('publicKey', e.target.value)}
              className="flex-1 bg-[#0A0A0A] border border-[#2C2C2C] p-3 font-mono text-xs text-white"
              placeholder="Enter public key or generate keys"
            />
                <Button
              onClick={() => handleCopy('publicKey', editableKeys.publicKey)}
                  size="sm"
                  className="bg-[#2C2C2C] hover:bg-[#3C3C3C] text-white px-3"
              disabled={!editableKeys.publicKey}
                >
                  {copied === 'publicKey' ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Private Key */}
            <div>
              <label className="block text-[#888] text-xs mb-2">Private Key</label>
              <div className="flex gap-2">
            <Input
              type="text"
              value={editableKeys.privateKey}
              onChange={(e) => handleKeyChange('privateKey', e.target.value)}
              className="flex-1 bg-[#0A0A0A] border border-[#EF4444] p-3 font-mono text-xs text-white"
              placeholder="Enter private key or generate keys"
            />
                <Button
              onClick={() => handleCopy('privateKey', editableKeys.privateKey)}
                  size="sm"
                  className="bg-[#2C2C2C] hover:bg-[#3C3C3C] text-white px-3"
              disabled={!editableKeys.privateKey}
                >
                  {copied === 'privateKey' ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[#EF4444] text-xs mt-1">
                ⚠ Keep this private key secure. Never share it.
              </p>
            </div>

        {/* Save Button */}
        <Button
          onClick={handleSaveKeys}
          disabled={!editableKeys.address || !editableKeys.privateKey || !editableKeys.publicKey}
          className="w-full bg-[#10B981] hover:bg-[#10B981]/90 text-white h-10 disabled:opacity-50"
        >
          Save Keys
        </Button>

        {/* Generate Keys Button */}
        <Button
          onClick={handleGenerateKeys}
          disabled={loading}
          className="w-full bg-[#FF9F1C] hover:bg-[#FF9F1C]/90 text-black h-12 disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <span className="animate-spin mr-2">⏳</span>
              Generating...
            </span>
          ) : (
            <span className="flex items-center justify-center">
              <Key className="mr-2 h-5 w-5" />
              Generate Keys
            </span>
          )}
        </Button>
        </div>
    </div>
  );
}

