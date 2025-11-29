/**
 * Test Runner: Run all Bytestream tests
 * Can be used with TestSprite or run standalone
 */

import { ChannelFlowTest } from './test-channel-flow';
import { UTXOCreationTest } from './test-utxo-creation';

class TestRunner {
  private tests: Array<{ name: string; test: () => Promise<void> }> = [];

  constructor() {
    this.tests = [
      {
        name: 'Complete Channel Flow Test',
        test: async () => {
          const test = new ChannelFlowTest();
          await test.runFullTest();
        },
      },
      {
        name: 'UTXO Creation Test',
        test: async () => {
          const test = new UTXOCreationTest();
          await test.runTest();
        },
      },
    ];
  }

  async runAll(): Promise<void> {
    console.log('\n🚀 Bytestream Test Suite');
    console.log('='.repeat(60));
    console.log(`Running ${this.tests.length} test suite(s)...\n`);

    const results: Array<{ name: string; passed: boolean; error?: string }> = [];

    for (const testSuite of this.tests) {
      try {
        console.log(`\n📋 Running: ${testSuite.name}`);
        console.log('-'.repeat(60));
        await testSuite.test();
        results.push({ name: testSuite.name, passed: true });
        console.log(`✅ ${testSuite.name} - PASSED\n`);
      } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
        results.push({ name: testSuite.name, passed: false, error: errorMsg });
        console.log(`❌ ${testSuite.name} - FAILED`);
        console.log(`   Error: ${errorMsg}\n`);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    results.forEach(result => {
      const icon = result.passed ? '✅' : '❌';
      console.log(`${icon} ${result.name}`);
      if (!result.passed && result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    console.log('\n' + '='.repeat(60));
    console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log('='.repeat(60) + '\n');

    if (failed > 0) {
      process.exit(1);
    }
  }

  async runSingle(testName: string): Promise<void> {
    const testSuite = this.tests.find(t => t.name === testName);
    if (!testSuite) {
      console.error(`Test suite "${testName}" not found`);
      console.log('Available tests:');
      this.tests.forEach(t => console.log(`  - ${t.name}`));
      process.exit(1);
    }

    await testSuite.test();
  }
}

// CLI interface
if (require.main === module) {
  const runner = new TestRunner();
  const args = process.argv.slice(2);

  if (args.length > 0) {
    // Run specific test
    runner.runSingle(args[0]).catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
  } else {
    // Run all tests
    runner.runAll().catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
  }
}

export { TestRunner };

