import * as vscode from 'vscode';
import * as path from 'path';
import { SgNode } from '@ast-grep/napi';
import { extractAssemblyFunction, extractFunctionCallsFromAssembly, extractFunctionName } from '../utils/asm-utils';
import { getFirstParentWithKind, searchCodebase, Searcher } from '../utils/ast-grep-utils';
import { getFileChangesFromCommit, getRepositoryForFile } from '../utils/git-utils';

export type AsmContext = {
  asmName: string;
  asmDeclaration?: string; // Declaration of the target assembly function
  calledFunctionsDeclarations: { [functionName: string]: string };
  sampling: SamplingCFunction[];
  typeDefinitions: string[]; // Type definitions used by the declarations
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
    typeDefinitions: context.typeDefinitions,
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
  typeDefinitions: string[]; // Type definitions used by the declarations
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
    typeDefinitions: [],
  };

  const codebaseFiles = await vscode.workspace.findFiles('**/*.{c,h}', 'tools/**');

  let declarationsNode: SgNode[] = [];

  // Searcher for finding relevant function declarations (e.g., the target assembly function and functions called in the assembly)
  const declarationsMatcher = {
    rule: {
      kind: 'identifier',
      regex: allFunctionsName.map((funcName) => `^(${funcName})$`).join('|'),
      inside: {
        kind: 'function_declarator',
      },
    },
  };
  const declarationsSearcher: Searcher = {
    matcher: declarationsMatcher,
    handlerEach(file, declaration) {
      const declarationNode = getFirstParentWithKind(declaration, 'declaration');
      if (!declarationNode) {
        console.warn(`Skipping declaration in "${file.fsPath}" due to missing declaration node`);
        return;
      }

      declarationsNode.push(declarationNode);

      if (declaration.text() === targetAssemblyName) {
        result.asmDeclaration = declarationNode.text();
      } else {
        result.calledFunctionsDeclarations[declaration.text()] = declarationNode.text();
      }
    },
  };

  // Searcher for finding function calls for the functions called in the assembly
  const callsMatcher = {
    rule: {
      kind: 'identifier',
      regex: allFunctionsName.map((funcName) => `^(${funcName})$`).join('|'),
      inside: {
        kind: 'call_expression',
      },
    },
  };

  const callsSearcher: Searcher = {
    matcher: callsMatcher,
    handlerEach(file, call) {
      const functionDefinitionNode = getFirstParentWithKind(call, 'function_definition');
      if (!functionDefinitionNode) {
        console.warn(`Skipping call in "${file.fsPath}" due to missing function definition`);
        return;
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
        return;
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
    },
  };

  await searchCodebase(codebaseFiles, [declarationsSearcher, callsSearcher]);

  if (declarationsNode.length) {
    // TODO: Allow to configure which types to ignore
    const ignoreTypes = new Set(['u8', 'u16', 'u32', 'u64', 's8', 's16', 's32', 's64']);

    const typesFromDeclarations = new Set<string>();
    for (const declaration of declarationsNode) {
      declaration.findAll({ rule: { kind: 'type_identifier' } }).forEach((typeNode) => {
        const typeName = typeNode.text();

        if (ignoreTypes.has(typeName)) {
          return;
        }

        typesFromDeclarations.add(typeName);
      });
    }

    // Searcher for the type definitions used by the declarations
    const typeIdentifierMatcher = {
      rule: {
        kind: 'type_identifier',
        regex: [...typesFromDeclarations].map((funcName) => `^(${funcName})$`).join('|'),
        inside: {
          kind: 'type_definition',
        },
      },
    };

    const typeIdentifierSearcher: Searcher = {
      matcher: typeIdentifierMatcher,
      handlerEach(file, typeIdentifier) {
        const typeDefinitionNode = getFirstParentWithKind(typeIdentifier, 'type_definition');
        if (!typeDefinitionNode) {
          console.warn(`Skipping type identifier in "${file.fsPath}" due to missing type definition`);
          return;
        }

        result.typeDefinitions.push(typeDefinitionNode.text());
      },
    };

    await searchCodebase(codebaseFiles, [typeIdentifierSearcher]);
  }

  return result;
}
