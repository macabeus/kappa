import { expect } from '@wdio/globals';
import { runOnVSCode } from './utils';

const exampleKappaPlugins = [
  'AddCheckOffsetMacroPlugin.js',
  'AddOffsetCommentsPlugin.js',
  'ApplyQNotationPlugin.js',
  'DoubleIntAssignmentPlugin.js',
  'DummyPlugin.js',
  'LiftVariableDeclarationsPlugin.js',
];

describe('Kappa Plugins', () => {
  exampleKappaPlugins.forEach((pluginName) => {
    it(`runs kappa plugin tests for "${pluginName}"`, async () => {
      const testsReport = await runOnVSCode(async function fn(
        { vscode, copyFile, openFile, runTestsForCurrentKappaPlugin, workspaceUri },
        pluginName,
      ) {
        const examplePluginPath = vscode.Uri.joinPath(workspaceUri, '..', 'example-kappa-plugins');
        const testPluginsFolderUri = vscode.Uri.joinPath(workspaceUri, '.kappa-plugins');

        await copyFile(
          vscode.Uri.joinPath(examplePluginPath, pluginName),
          vscode.Uri.joinPath(testPluginsFolderUri, pluginName),
        );

        const pluginFileUri = vscode.Uri.joinPath(testPluginsFolderUri, pluginName);

        await openFile(pluginFileUri);

        const testsReport = await runTestsForCurrentKappaPlugin();

        await vscode.workspace.fs.delete(vscode.Uri.joinPath(testPluginsFolderUri, pluginName));

        return testsReport;
      }, pluginName);

      const failureCount = (testsReport.match(/❌/g) ?? []).length;
      if (failureCount) {
        console.error(`Found ${failureCount} test failure(s) in the markdown report`);
      } else {
        console.log('No test failures found - all tests passed!');
      }

      expect(failureCount).toBe(0);
    });
  });
});
