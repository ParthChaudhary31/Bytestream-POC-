import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { apiService } from '../services/api';
import { Monitor, Plus, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface TaprootAccount {
  address: string;
  userAddress?: string;
  hubAddress?: string;
  createdAt?: string;
  lastBalanceCheck?: string;
  lastKnownBalance?: number;
  isActive?: boolean;
}

interface TaprootMonitorProps {
  showToast: (message: string, type: 'success' | 'error') => void;
}

export function TaprootMonitor({ showToast }: TaprootMonitorProps) {
  const [taprootAddress, setTaprootAddress] = useState('');
  const [userAddress, setUserAddress] = useState('');
  const [hubAddress, setHubAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<TaprootAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const handleRegister = async () => {
    if (!taprootAddress.trim()) {
      showToast('Please enter a taproot address', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await apiService.registerMonitoring(
        taprootAddress.trim(),
        userAddress.trim() || undefined,
        hubAddress.trim() || undefined
      );

      if (response.success) {
        showToast('Taproot address registered for monitoring!', 'success');
        setTaprootAddress('');
        setUserAddress('');
        setHubAddress('');
        loadAccounts(); // Reload accounts list
      }
    } catch (error: any) {
      showToast(
        error.response?.data?.error || 'Failed to register taproot address',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const response = await apiService.getAccounts();
      setAccounts(response.accounts || []);
    } catch (error: any) {
      console.error('Failed to load accounts:', error);
      showToast('Failed to load accounts', 'error');
    } finally {
      setLoadingAccounts(false);
    }
  };

  // Load accounts on mount
  useEffect(() => {
    loadAccounts();
  }, []);

  const formatSats = (sats: number) => {
    return sats.toLocaleString();
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#1A1A1A] border-2 border-[#2C2C2C] p-6">
        <h2 className="text-white text-xl font-semibold mb-4 flex items-center gap-2">
          <Monitor className="w-5 h-5" />
          Taproot Address Monitor
        </h2>
        <p className="text-[#888] text-sm mb-6">
          Register taproot addresses to monitor balance changes. The cron job will automatically
          check balances and store events in the database.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-[#888] text-sm mb-2">
              Taproot Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={taprootAddress}
              onChange={(e) => setTaprootAddress(e.target.value)}
              placeholder="bc1p..."
              className="w-full bg-[#0A0A0A] border border-[#2C2C2C] text-white px-4 py-2 rounded focus:outline-none focus:border-[#10B981] font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-[#888] text-sm mb-2">
              User Address (Optional)
            </label>
            <input
              type="text"
              value={userAddress}
              onChange={(e) => setUserAddress(e.target.value)}
              placeholder="mzBc4XEFSdzCDcTxAgf6EZXgsZWpztRhef"
              className="w-full bg-[#0A0A0A] border border-[#2C2C2C] text-white px-4 py-2 rounded focus:outline-none focus:border-[#10B981] font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-[#888] text-sm mb-2">
              Hub Address (Optional)
            </label>
            <input
              type="text"
              value={hubAddress}
              onChange={(e) => setHubAddress(e.target.value)}
              placeholder="n3WvK6rXsmSgzv6V6dU9h5H5j5j5j5j5j5j"
              className="w-full bg-[#0A0A0A] border border-[#2C2C2C] text-white px-4 py-2 rounded focus:outline-none focus:border-[#10B981] font-mono text-sm"
            />
          </div>

          <Button
            onClick={handleRegister}
            disabled={loading || !taprootAddress.trim()}
            className="w-full bg-[#10B981] hover:bg-[#059669] text-white"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Registering...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Register for Monitoring
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Registered Accounts List */}
      <div className="bg-[#1A1A1A] border-2 border-[#2C2C2C] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white text-lg font-semibold">Registered Accounts</h3>
          <Button
            onClick={loadAccounts}
            disabled={loadingAccounts}
            variant="outline"
            className="text-sm"
          >
            {loadingAccounts ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Refresh'
            )}
          </Button>
        </div>

        {loadingAccounts ? (
          <div className="text-center py-8 text-[#888]">Loading accounts...</div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-8 text-[#888]">
            No accounts registered yet. Register a taproot address above.
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((account, index) => (
              <div
                key={account.address || index}
                className="bg-[#0A0A0A] border border-[#2C2C2C] p-4 rounded"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {account.isActive !== false ? (
                        <CheckCircle className="w-4 h-4 text-[#10B981]" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#888]" />
                      )}
                      <span className="text-white font-mono text-sm break-all">
                        {account.address}
                      </span>
                    </div>
                    {account.userAddress && (
                      <div className="text-[#888] text-xs mb-1">
                        User: <span className="font-mono">{account.userAddress}</span>
                      </div>
                    )}
                    {account.hubAddress && (
                      <div className="text-[#888] text-xs mb-1">
                        Hub: <span className="font-mono">{account.hubAddress}</span>
                      </div>
                    )}
                    {account.lastKnownBalance !== undefined && (
                      <div className="text-[#10B981] text-sm mt-2">
                        Last Balance: {formatSats(account.lastKnownBalance)} sats
                      </div>
                    )}
                    <div className="text-[#888] text-xs mt-2">
                      Registered: {formatDate(account.createdAt)}
                    </div>
                    {account.lastBalanceCheck && (
                      <div className="text-[#888] text-xs">
                        Last Check: {formatDate(account.lastBalanceCheck)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

