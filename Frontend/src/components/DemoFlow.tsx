import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, CheckCircle2, ArrowRight, Copy, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function DemoFlow() {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // State for identities
    const [hub, setHub] = useState<any>(null);
    const [sender, setSender] = useState<any>(null);
    const [receiver, setReceiver] = useState<any>(null);

    // State for Multisig
    const [multisig, setMultisig] = useState<any>(null);
    const [utxos, setUtxos] = useState<any[]>([]);
    const [isPolling, setIsPolling] = useState(false);

    // State for Transaction
    const [amount, setAmount] = useState(1000);
    const [commitment, setCommitment] = useState<string | null>(null);
    const [storedId, setStoredId] = useState<number | null>(null);
    const [transactionType, setTransactionType] = useState<'off-chain' | 'on-chain'>('off-chain');
    const [broadcastTxId, setBroadcastTxId] = useState<string | null>(null);

    // State for Settlement
    const [settlementResult, setSettlementResult] = useState<any>(null);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    // Step 1: Generate Identities
    const generateIdentities = async () => {
        setLoading(true);
        setError(null);
        try {
            const [h, s, r] = await Promise.all([
                api.generateWallet(),
                api.generateWallet(),
                api.generateWallet(),
            ]);
            setHub(h);
            setSender(s);
            setReceiver(r);
            setStep(2);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Step 2: Create Multisig
    const createMultisig = async () => {
        setLoading(true);
        setError(null);
        try {
            const ms = await api.createTaprootMultisig(sender.publicKey, hub.publicKey);
            setMultisig(ms);
            setStep(3);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Step 3: Poll for Funding
    const checkFunding = async () => {
        setLoading(true);
        try {
            const data = await api.getUtxos(multisig.address);
            if (data.length > 0) {
                setUtxos(data);
                setIsPolling(false);
                setStep(4);
            } else {
                setError('No funds found yet. Please fund the address and try again.');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Step 4: Create & Store Commitment OR Broadcast On-Chain
    const handleTransaction = async () => {
        setLoading(true);
        setError(null);
        try {
            if (utxos.length === 0) throw new Error('No UTXOs available');

            if (transactionType === 'on-chain') {
                // Direct On-Chain Broadcast
                const res = await api.broadcastTransaction({
                    userAddress: sender.address,
                    hubAddress: hub.address,
                    userPrivateKey: sender.privateKey,
                    hubPrivateKey: hub.privateKey,
                    amount: Number(amount),
                    recipientAddress: receiver.address,
                    multisigAddress: multisig.address
                });
                setBroadcastTxId(res.txid);
                // We don't move to step 5 (Settlement) because it's already settled on L1
            } else {
                // Off-Chain Commitment
                // 1. Create Commitment (PSBT)
                const commitRes = await api.createCommitment({
                    senderPrivateKey: sender.privateKey,
                    utxos: utxos, // Pass all UTXOs
                    scriptHex: multisig.scriptHex,
                    receiverAddress: receiver.address,
                    amount: Number(amount),
                    multisigAddress: multisig.address,
                });

                setCommitment(commitRes.commitment);

                // 2. Store Off-chain
                const storeRes = await api.addTransaction({
                    sender: sender.address,
                    receiver: receiver.address,
                    amount: Number(amount),
                    commitment_number: 1, // Simplified for demo
                    commitment: commitRes.commitment,
                });

                setStoredId(storeRes.id);
                setStep(5);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Step 5: Settle
    const settle = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.settleCommitments(receiver.address, hub.privateKey);
            setSettlementResult(res.results);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">
                    ByteStream Layer 2 Demo
                </h1>
                <p className="text-gray-400">End-to-End Flow Visualization</p>
            </div>

            {/* Progress Steps */}
            <div className="flex justify-between items-center px-10">
                {[1, 2, 3, 4, 5].map((s) => (
                    <div key={s} className="flex flex-col items-center space-y-2">
                        <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${step >= s
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/50'
                                : 'bg-gray-800 text-gray-500'
                                }`}
                        >
                            {step > s ? <CheckCircle2 className="w-6 h-6" /> : s}
                        </div>
                        <span className={`text-xs ${step >= s ? 'text-blue-400' : 'text-gray-600'}`}>
                            {['Setup', 'Channel', 'Fund', 'Transact', 'Settle'][s - 1]}
                        </span>
                    </div>
                ))}
            </div>

            {/* Main Content Area */}
            <Card className="bg-[#1E1E1E] border-gray-800 shadow-2xl">
                <CardHeader>
                    <CardTitle>
                        {step === 1 && 'Step 1: Identity Setup'}
                        {step === 2 && 'Step 2: Create Payment Channel'}
                        {step === 3 && 'Step 3: Fund Channel'}
                        {step === 4 && 'Step 4: L2 Transaction'}
                        {step === 5 && 'Step 5: Settlement'}
                    </CardTitle>
                    <CardDescription>
                        {step === 1 && 'Generate wallets for the Hub, Sender, and Receiver.'}
                        {step === 2 && 'Establish a Taproot Multisig channel between Sender and Hub.'}
                        {step === 3 && 'Fund the multisig address with Testnet BTC.'}
                        {step === 4 && 'Sender creates a commitment to pay Receiver off-chain.'}
                        {step === 5 && 'Receiver triggers settlement to finalize on-chain.'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* Step 1: Identities */}
                    {step === 1 && (
                        <div className="space-y-4">
                            <p className="text-gray-400">
                                Click below to generate fresh Testnet wallets for all participants.
                            </p>
                            <Button onClick={generateIdentities} disabled={loading} className="w-full h-12 text-lg">
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Generate Identities'}
                            </Button>
                        </div>
                    )}

                    {/* Step 2: Channel */}
                    {step === 2 && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {[
                                    { label: 'Hub', data: hub },
                                    { label: 'Sender', data: sender },
                                    { label: 'Receiver', data: receiver },
                                ].map((role) => (
                                    <div key={role.label} className="p-4 bg-black/20 rounded-lg border border-gray-800">
                                        <h3 className="font-semibold text-blue-400 mb-2">{role.label}</h3>
                                        <p className="text-xs text-gray-500 break-all">{role.data.address}</p>
                                    </div>
                                ))}
                            </div>
                            <Button onClick={createMultisig} disabled={loading} className="w-full h-12">
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Create Multisig Channel'}
                            </Button>
                        </div>
                    )}

                    {/* Step 3: Fund */}
                    {step === 3 && (
                        <div className="space-y-6 text-center">
                            <div className="p-6 bg-black/40 rounded-xl border border-gray-700 inline-block">
                                <p className="text-sm text-gray-400 mb-2">Multisig Address (Taproot)</p>
                                <div className="flex items-center justify-center gap-2">
                                    <code className="text-xl font-mono text-yellow-400">{multisig.address}</code>
                                    <Button variant="ghost" size="icon" onClick={() => copyToClipboard(multisig.address)}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <p className="text-gray-300">
                                    Please fund this address using a Testnet Faucet:
                                </p>
                                <div className="flex justify-center gap-4 text-sm">
                                    <a href="https://coinfaucet.eu/en/btc-testnet/" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">CoinFaucet.eu</a>
                                    <span className="text-gray-600">|</span>
                                    <a href="https://bitcoinfaucet.uo1.net/" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">UO1.net</a>
                                </div>
                            </div>

                            <Button onClick={checkFunding} disabled={loading} className="w-full h-12">
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'I have sent funds, Check Status'}
                            </Button>
                        </div>
                    )}

                    {/* Step 4: Transact */}
                    {step === 4 && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between p-4 bg-green-900/20 border border-green-900 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="text-green-500" />
                                    <span className="text-green-400">Channel Funded</span>
                                </div>
                                <span className="text-sm text-gray-400">
                                    {utxos.length} UTXO(s) found
                                </span>
                            </div>

                            {/* Transaction Type Toggle */}
                            <div className="flex justify-center">
                                <Tabs value={transactionType} onValueChange={(v: any) => setTransactionType(v)} className="w-full">
                                    <TabsList className="grid w-full grid-cols-2 bg-black/40">
                                        <TabsTrigger value="off-chain">Off-Chain (L2)</TabsTrigger>
                                        <TabsTrigger value="on-chain">On-Chain (L1)</TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Amount to Send (sats)</Label>
                                    <Input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(Number(e.target.value))}
                                        className="bg-black/20 border-gray-700"
                                    />
                                </div>

                                <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
                                    <span>Sender ({sender.address.slice(0, 6)}...)</span>
                                    <ArrowRight className="w-4 h-4" />
                                    <span>Receiver ({receiver.address.slice(0, 6)}...)</span>
                                </div>

                                <Button onClick={handleTransaction} disabled={loading} className="w-full h-12">
                                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> :
                                        transactionType === 'on-chain' ? 'Broadcast Transaction' : 'Sign & Store Commitment'
                                    }
                                </Button>

                                {broadcastTxId && (
                                    <div className="p-4 bg-green-900/20 border border-green-900 rounded-lg space-y-2">
                                        <h3 className="font-semibold text-green-400">Transaction Broadcasted!</h3>
                                        <div className="space-y-1">
                                            <p className="text-xs text-gray-400">TXID:</p>
                                            <code className="text-xs bg-black/40 p-2 rounded block break-all">{broadcastTxId}</code>
                                        </div>
                                        <a
                                            href={`https://mempool.space/testnet/tx/${broadcastTxId}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-blue-400 hover:underline text-sm inline-block"
                                        >
                                            View on Explorer
                                        </a>
                                        <Button
                                            variant="outline"
                                            onClick={() => window.location.reload()}
                                            className="w-full mt-4"
                                        >
                                            <RefreshCw className="mr-2 h-4 w-4" /> Start New Demo
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 5: Settle */}
                    {step === 5 && (
                        <div className="space-y-6">
                            <div className="p-4 bg-blue-900/20 border border-blue-900 rounded-lg space-y-2">
                                <h3 className="font-semibold text-blue-400">Commitment Stored Off-Chain</h3>
                                <p className="text-xs text-gray-400 break-all font-mono">{commitment?.slice(0, 60)}...</p>
                                <p className="text-xs text-gray-500">DB ID: {storedId}</p>
                            </div>

                            {!settlementResult ? (
                                <div className="space-y-4">
                                    <p className="text-gray-300">
                                        The receiver can now request settlement. The Hub will aggregate all pending commitments and broadcast the latest one.
                                    </p>
                                    <Button onClick={settle} disabled={loading} className="w-full h-12 bg-purple-600 hover:bg-purple-700">
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Settle All Commitments'}
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-6 bg-green-900/20 border border-green-900 rounded-xl text-center space-y-4">
                                        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
                                        <h3 className="text-xl font-bold text-green-400">Settlement Complete!</h3>

                                        {settlementResult.successful.map((txid: string) => (
                                            <div key={txid} className="space-y-2">
                                                <p className="text-sm text-gray-400">Transaction ID:</p>
                                                <code className="text-xs bg-black/40 p-2 rounded block break-all">{txid}</code>
                                                <a
                                                    href={`https://mempool.space/testnet/tx/${txid}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-blue-400 hover:underline text-sm inline-block mt-2"
                                                >
                                                    View on Explorer
                                                </a>
                                            </div>
                                        ))}

                                        {settlementResult.failed.length > 0 && (
                                            <div className="mt-4 p-4 bg-red-900/20 rounded text-left">
                                                <p className="text-red-400 font-bold">Failures:</p>
                                                {settlementResult.failed.map((f: string, i: number) => (
                                                    <p key={i} className="text-xs text-red-300">{f}</p>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <Button
                                        variant="outline"
                                        onClick={() => window.location.reload()}
                                        className="w-full"
                                    >
                                        <RefreshCw className="mr-2 h-4 w-4" /> Start New Demo
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}

                </CardContent>
            </Card>
        </div>
    );
}
