import type { ObjMap } from '../jsutils/ObjMap.js';

import type { DocumentNode, OperationDefinitionNode, SelectionSetNode } from '../language/ast.js';
import { Kind } from '../language/kinds.js';
import { visit } from '../language/visitor.js';

/**
 * separateOperations accepts a single AST document which may contain many
 * operations and fragments and returns a collection of AST documents each of
 * which contains a single operation as well the fragment definitions it
 * refers to.
 */
export function separateOperations(documentAST: DocumentNode): ObjMap<DocumentNode> {
  const operations: Array<OperationDefinitionNode> = [];
  const depGraph: DepGraph = Object.create(null);

  // Populate metadata and build a dependency graph.
  for (const definitionNode of documentAST.definitions) {
    switch (definitionNode.kind) {
      case Kind.OPERATION_DEFINITION:
        operations.push(definitionNode);
        break;
      case Kind.FRAGMENT_DEFINITION:
        depGraph[definitionNode.name.value] = collectDependencies(definitionNode.selectionSet);
        break;
      default:
      // ignore non-executable definitions
    }
  }

  // For each operation, produce a new synthesized AST which includes only what
  // is necessary for completing that operation.
  const separatedDocumentASTs = Object.create(null);
  for (const operation of operations) {
    const dependencies = new Set<string>();

    for (const fragmentName of collectDependencies(operation.selectionSet)) {
      collectTransitiveDependencies(dependencies, depGraph, fragmentName);
    }

    // Provides the empty string for anonymous operations.
    const operationName = operation.name ? operation.name.value : '';

    // The list of definition nodes to be included for this operation, sorted
    // to retain the same order as the original document.
    separatedDocumentASTs[operationName] = {
      kind: Kind.DOCUMENT,
      definitions: documentAST.definitions.filter(
        node => node === operation || (node.kind === Kind.FRAGMENT_DEFINITION && dependencies.has(node.name.value))
      ),
    };
  }

  return separatedDocumentASTs;
}

type DepGraph = ObjMap<ReadonlyArray<string>>;

// From a dependency graph, collects a list of transitive dependencies by
// recursing through a dependency graph.
function collectTransitiveDependencies(collected: Set<string>, depGraph: DepGraph, fromName: string): void {
  if (!collected.has(fromName)) {
    collected.add(fromName);

    const immediateDeps = depGraph[fromName];
    if (immediateDeps !== undefined) {
      for (const toName of immediateDeps) {
        collectTransitiveDependencies(collected, depGraph, toName);
      }
    }
  }
}

function collectDependencies(selectionSet: SelectionSetNode): Array<string> {
  const dependencies: Array<string> = [];

  visit(selectionSet, {
    FragmentSpread(node) {
      dependencies.push(node.name.value);
    },
  });
  return dependencies;
}
