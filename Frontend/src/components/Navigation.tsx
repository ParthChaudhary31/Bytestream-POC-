import { Screen } from '../App';
import { WalletState } from '../store/slices/walletSlice';
import { Copy } from 'lucide-react';

interface NavigationProps {
  walletState: WalletState;
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
}

export function Navigation({ walletState, currentScreen, onNavigate }: NavigationProps) {
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    const tooltip = document.getElementById('copy-tooltip');
    if (tooltip) {
      tooltip.style.display = 'block';
      setTimeout(() => {
        tooltip.style.display = 'none';
      }, 1000);
    }
  };

  return (
    <nav className="border-b border-[#2C2C2C] bg-[#1A1A1A]/80 backdrop-blur">
      <div className="max-w-[1440px] mx-auto px-8 py-4 flex items-center justify-between">
        {/* Logo */}
        <button
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        >
          <div className="w-10 h-10 bg-[#FF9F1C] flex items-center justify-center">
            <span className="text-black font-mono">BS</span>
          </div>
          <span className="tracking-tight">ByteStream V2</span>
        </button>

        {/* Status */}
        <div className="flex items-center gap-8">
          {/* Hub Status */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${walletState.hubOnline ? 'bg-[#10B981]' : 'bg-[#EF4444]'}`} />
            <span className={`text-sm ${walletState.hubOnline ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
              Hub {walletState.hubOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          {/* Network */}
          <div className="text-sm text-[#888]">
            Bitcoin Mainnet
          </div>

          {/* Wallet ID */}
          <div className="relative">
            <button
              onClick={() => handleCopy(walletState.address)}
              className="flex items-center gap-2 text-sm font-mono text-[#CCC] hover:text-white transition-colors"
            >
              <span>{walletState.walletId}</span>
              <Copy className="w-4 h-4" />
            </button>
            <div
              id="copy-tooltip"
              className="absolute top-full mt-2 right-0 bg-[#10B981] text-white text-xs px-3 py-1 rounded hidden"
            >
              Copied!
            </div>
          </div>

          {/* Lightning Channel Link */}
          <button
            onClick={() => onNavigate('lightning')}
            className={`text-sm ${
              currentScreen === 'lightning' ? 'text-[#FF9F1C]' : 'text-[#888] hover:text-white'
            } transition-colors`}
          >
            ⚡ Lightning Channels
          </button>

          {/* Monitor Link */}
          <button
            onClick={() => onNavigate('monitor')}
            className={`text-sm ${
              currentScreen === 'monitor' ? 'text-[#FF9F1C]' : 'text-[#888] hover:text-white'
            } transition-colors`}
          >
            Taproot Monitor
          </button>

          {/* Audit Link */}
          <button
            onClick={() => onNavigate('audit')}
            className={`text-sm ${
              currentScreen === 'audit' ? 'text-[#FF9F1C]' : 'text-[#888] hover:text-white'
            } transition-colors`}
          >
            Audit & Recovery
          </button>

          {/* Quantam Wallet Link */}
          <button
            onClick={() => onNavigate('quantam')}
            className={`text-sm ${
              currentScreen === 'quantam' ? 'text-[#FF9F1C]' : 'text-[#888] hover:text-white'
            } transition-colors`}
          >
            Quantam Wallet
          </button>
        </div>
      </div>
    </nav>
  );
}
