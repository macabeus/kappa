import * as vscode from 'vscode';
import { objdiff } from '../objdiff/objdiff';
import { checkFileExists, resolveAbsolutePath } from '../utils/vscode-utils';

type CommandParams = {
  functionName: string;
  currentObjectFilePath: string;
  targetObjectFilePath: string;
};

export class GetDiffBetweenObjectFiles implements vscode.LanguageModelTool<CommandParams> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<CommandParams>,
    _token: vscode.CancellationToken,
  ) {
    const { functionName } = options.input;
    return {
      invocationMessage: new vscode.MarkdownString(`Getting Objects Diff for function: \`${functionName}\``),
    };
  }

  async invoke(options: vscode.LanguageModelToolInvocationOptions<CommandParams>, _token: vscode.CancellationToken) {
    const { functionName, currentObjectFilePath, targetObjectFilePath } = options.input;

    const absoluteCurrentObjectFilePath = resolveAbsolutePath(currentObjectFilePath);
    const absoluteTargetObjectFilePath = resolveAbsolutePath(targetObjectFilePath);

    // TODO: If it failed to find the object file, we search in the workspace for all objects files
    // and suggest the one that matches the function name.
    if ((await checkFileExists(absoluteCurrentObjectFilePath)) === false) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Current object file does not exist: ${absoluteCurrentObjectFilePath}`),
      ]);
    }

    if ((await checkFileExists(absoluteTargetObjectFilePath)) === false) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`Target object file does not exist: ${absoluteTargetObjectFilePath}`),
      ]);
    }

    const [currentParsedObject, targetParsedObject] = await Promise.all([
      objdiff.parseObjectFile(absoluteCurrentObjectFilePath),
      objdiff.parseObjectFile(absoluteTargetObjectFilePath),
    ]);

    const result = await objdiff.compareObjectFiles(
      absoluteCurrentObjectFilePath,
      absoluteTargetObjectFilePath,
      currentParsedObject,
      targetParsedObject,
      functionName,
    );

    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(result)]);
  }
}
