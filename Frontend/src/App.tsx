import { useState } from 'react';
import { DemoFlow } from './components/DemoFlow';
import { MultiUtxoDemo } from './components/MultiUtxoDemo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function App() {
  const [activeTab, setActiveTab] = useState('standard');

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-blue-500/30">
      {/* Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-900/20 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 container mx-auto py-10">
        <Tabs defaultValue="standard" className="w-full" onValueChange={setActiveTab}>
          <div className="flex justify-center mb-8">
            <TabsList className="bg-black/40 border border-gray-800">
              <TabsTrigger value="standard" className="data-[state=active]:bg-blue-600">
                Standard Settlement
              </TabsTrigger>
              <TabsTrigger value="multi-utxo" className="data-[state=active]:bg-green-600">
                Multi-UTXO Feature
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="standard">
            <DemoFlow />
          </TabsContent>

          <TabsContent value="multi-utxo">
            <MultiUtxoDemo />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default App;
