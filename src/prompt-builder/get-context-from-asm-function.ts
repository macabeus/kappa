import * as vscode from 'vscode';
import * as path from 'path';
import { parse } from '@ast-grep/napi';
import { extractAssemblyFunction, extractFunctionCallsFromAssembly, extractFunctionName } from '../utils/asm-utils';
import { getFirstParentWithKind } from '../utils/ast-grep-utils';
import { getFileChangesFromCommit, getRepositoryForFile } from '../utils/git-utils';

export type AsmContext = {
  asmName: string;
  asmDeclaration?: string; // Declaration of the target assembly function
  calledFunctionsDeclarations: { [functionName: string]: string };
  sampling: SamplingCFunction[];
};

export type SamplingCFunction = {
  name: string;
  cCode: string;
  assemblyCode: string;
  callsTarget: boolean;
};

/**
 * Get context from a given assembly function
 * @param targetAssembly The target assembly code to get context
 * @returns An object containing declarations and C functions that call similar functions
 */
export async function getAsmContext(targetAssembly: string): Promise<AsmContext> {
  const context = await getCodebaseContext(targetAssembly);

  const result: AsmContext = {
    asmName: context.asmName,
    asmDeclaration: context.asmDeclaration,
    calledFunctionsDeclarations: context.calledFunctionsDeclarations,
    sampling: [],
  };

  // For each sampled C function, try to find its assembly version
  const promises = context.cFunctionsSamplings.map(async (cFunction) => {
    const assemblyForCFunction = await findOriginalAssemblyInGitHistory(cFunction);

    if (assemblyForCFunction) {
      result.sampling.push({
        name: cFunction.name,
        cCode: cFunction.content,
        assemblyCode: assemblyForCFunction,
        callsTarget: cFunction.callsTarget,
      });
    }
  });

  const results = await Promise.allSettled(promises);
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Error processing C function:', result.reason);
    }
  }

  return result;
}

/**
 * Search git history for the original assembly code of a C function
 * @returns The original assembly code or null if not found
 */
async function findOriginalAssemblyInGitHistory({
  returnType,
  name,
  location,
}: CFunctionSampling): Promise<string | null> {
  if (!vscode.workspace.workspaceFolders) {
    return null;
  }

  const repo = await getRepositoryForFile(location.uri.fsPath);
  if (!repo) {
    console.warn(`No git repository found for ${location.uri.fsPath}`);
    return null;
  }

  const relativePath = path.relative(repo.rootUri.fsPath, location.uri.fsPath);

  // TODO: This logic assumes that:
  // - The last commit from the function declaration line is the one that introduced it from the assembly code.
  // - This commit also has the assembly file changed.
  // - There is only one assembly file changed in this commit.
  const fileBlame = await repo.blame(relativePath);

  const creationCommit = fileBlame
    .split('\n')
    .find((line) => line.includes(`${returnType} ${name}`))
    ?.split(' ')[0];

  if (!creationCommit) {
    return null;
  }

  const changedFiles = await getFileChangesFromCommit(repo, creationCommit);
  const parentHash = Object.keys(changedFiles)[0]; // We assume that there is exactly a single commit parent

  const assemblyFileName = changedFiles[parentHash].find(
    (file) => file.uri.fsPath.endsWith('.s') || file.uri.fsPath.endsWith('.S') || file.uri.fsPath.endsWith('.asm'),
  )!;
  const assemblyFileContent = await repo.show(
    parentHash,
    path.relative(repo.rootUri.fsPath, assemblyFileName.uri.fsPath),
  );

  const functionCode = extractAssemblyFunction(assemblyFileContent, name);

  return functionCode;
}

type CFunctionSampling = {
  returnType: string;
  name: string;
  content: string;
  location: vscode.Location;
  callsTarget: boolean; // Indicates if this function calls the target assembly function
};

type CodebaseContext = {
  asmName: string;
  asmDeclaration?: string;
  calledFunctionsDeclarations: { [functionName: string]: string }; // Declarations of functions called from the assembly
  cFunctionsSamplings: CFunctionSampling[];
};

/**
 * Walk through the codebase to get relevant information from the given assembly function.
 */
async function getCodebaseContext(targetAssembly: string): Promise<CodebaseContext> {
  const targetAssemblyName = extractFunctionName(targetAssembly);
  const targetFunctionCalls = extractFunctionCallsFromAssembly(targetAssembly);

  const allFunctionsName = [targetAssemblyName, ...targetFunctionCalls];

  const result: CodebaseContext = {
    asmName: targetAssemblyName,
    calledFunctionsDeclarations: {},
    cFunctionsSamplings: [],
  };

  const codebaseFiles = await vscode.workspace.findFiles('**/*.{c,h}', 'tools/**');

  // Pattern for finding relevant function declarations (e.g., the target assembly function and functions called in the assembly)
  const declarationsPattern = {
    rule: {
      kind: 'identifier',
      regex: allFunctionsName.map((funcName) => `^(${funcName})$`).join('|'),
      inside: {
        kind: 'function_declarator',
      },
    },
  };

  // Pattern for finding function calls for the functions called in the assembly
  const callsPattern = {
    rule: {
      kind: 'identifier',
      regex: allFunctionsName.map((funcName) => `^(${funcName})$`).join('|'),
      inside: {
        kind: 'call_expression',
      },
    },
  };

  const promises = codebaseFiles.map(async (file) => {
    const document = await vscode.workspace.openTextDocument(file);
    const content = document.getText();
    const source = parse('c', content);

    const declarations = source.root().findAll(declarationsPattern);
    for (const declaration of declarations) {
      const declarationNode = getFirstParentWithKind(declaration, 'declaration');
      if (!declarationNode) {
        console.warn(`Skipping declaration in "${file.fsPath}" due to missing declaration node`);
        continue;
      }

      if (declaration.text() === targetAssemblyName) {
        result.asmDeclaration = declarationNode.text();
      } else {
        result.calledFunctionsDeclarations[declaration.text()] = declarationNode.text();
      }
    }

    const calls = source.root().findAll(callsPattern);
    for (const call of calls) {
      const functionDefinitionNode = getFirstParentWithKind(call, 'function_definition');
      if (!functionDefinitionNode) {
        console.warn(`Skipping call in "${file.fsPath}" due to missing function definition`);
        continue;
      }

      const returnType = functionDefinitionNode
        .find({ rule: { kind: 'function_declarator' } })
        ?.prevAll()
        .at(0)
        ?.text();
      const name = functionDefinitionNode.find({ rule: { kind: 'identifier' } })?.text();

      const content = functionDefinitionNode.text();

      if (!returnType || !name) {
        console.warn(`Skipping call in "${file.fsPath}" due to missing data`);
        continue;
      }

      const location = new vscode.Location(
        file,
        new vscode.Range(
          call.range().start.line,
          call.range().start.column,
          call.range().end.line,
          call.range().end.column,
        ),
      );

      result.cFunctionsSamplings.push({
        returnType,
        name,
        content,
        location,
        callsTarget: call.text() === targetAssemblyName,
      });
    }
  });

  const promisesResult = await Promise.allSettled(promises);
  for (const promise of promisesResult) {
    if (promise.status === 'rejected') {
      console.error('Error processing file:', promise.reason);
    }
  }

  return result;
}
