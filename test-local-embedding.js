// Simple test script for local embedding functionality
const vscode = require('vscode');

async function testLocalEmbedding() {
  try {
    console.log('Testing local embedding functionality...');

    // Test 1: Check if command is registered
    const commands = await vscode.commands.getCommands();
    const hasCommand = commands.includes('kappa.enableLocalEmbeddingModel');
    console.log('✓ Command registered:', hasCommand);

    // Test 2: Try to execute the command (this will test the full workflow)
    console.log('Attempting to execute enableLocalEmbeddingModel command...');
    await vscode.commands.executeCommand('kappa.enableLocalEmbeddingModel');
    console.log('✓ Command executed successfully');
  } catch (error) {
    console.error('✗ Test failed:', error.message);
  }
}

// Export for use in VS Code extension context
module.exports = { testLocalEmbedding };
