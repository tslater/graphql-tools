import { dedent } from '../../__testUtils__/dedent.js';

import { Kind } from '../../language/kinds.js';
import { parse } from '../../language/parser.js';
import { Source } from '../../language/source.js';

import { formatError, GraphQLError } from '../GraphQLError.js';

const source = new Source(dedent`
  {
    field
  }
`);
const ast = parse(source);
const operationNode = ast.definitions[0];
expect(operationNode.kind === Kind.OPERATION_DEFINITION).toBeTruthy();
// @ts-expect-error
const fieldNode = operationNode.selectionSet.selections[0];
expect(fieldNode != null).toBeTruthy();

describe('GraphQLError', () => {
  it('is a class and is a subclass of Error', () => {
    expect(new GraphQLError('str')).toBeInstanceOf(Error);
    expect(new GraphQLError('str')).toBeInstanceOf(GraphQLError);
  });

  it('has a name, message, extensions, and stack trace', () => {
    const e = new GraphQLError('msg');

    expect(e).toMatchObject({
      name: 'GraphQLError',
      message: 'msg',
      extensions: {},
    });
    expect(typeof e.stack === 'string').toBeTruthy();
  });

  it('enumerate only properties prescribed by the spec', () => {
    const e = new GraphQLError('msg' /* message */, {
      nodes: [fieldNode],
      source,
      positions: [1, 2, 3],
      path: ['a', 'b', 'c'],
      originalError: new Error('test'),
      extensions: { foo: 'bar' },
    });

    expect(Object.keys(e)).toEqual(['message', 'locations', 'path', 'extensions']);
  });

  it('uses the stack of an original error', () => {
    const original = new Error('original');
    const e = new GraphQLError('msg', {
      originalError: original,
    });

    expect(e).toMatchObject({
      name: 'GraphQLError',
      message: 'msg',
      stack: original.stack,
      originalError: original,
    });
  });

  it('creates new stack if original error has no stack', () => {
    const original = new Error('original');
    const e = new GraphQLError('msg', { originalError: original });

    expect(e).toMatchObject({
      name: 'GraphQLError',
      message: 'msg',
      originalError: original,
    });
    expect(typeof e.stack === 'string').toBeTruthy();
  });

  it('converts nodes to positions and locations', () => {
    const e = new GraphQLError('msg', { nodes: [fieldNode] });
    expect(e).toMatchObject({
      source,
      nodes: [fieldNode],
      positions: [4],
      locations: [{ line: 2, column: 3 }],
    });
  });

  it('converts single node to positions and locations', () => {
    const e = new GraphQLError('msg', { nodes: fieldNode }); // Non-array value.
    expect(e).toMatchObject({
      source,
      nodes: [fieldNode],
      positions: [4],
      locations: [{ line: 2, column: 3 }],
    });
  });

  it('converts node with loc.start === 0 to positions and locations', () => {
    const e = new GraphQLError('msg', { nodes: operationNode });
    expect(e).toMatchObject({
      source,
      nodes: [operationNode],
      positions: [0],
      locations: [{ line: 1, column: 1 }],
    });
  });

  it('converts node without location to undefined source, positions and locations', () => {
    const fieldNodeNoLocation = {
      ...fieldNode,
      loc: undefined,
    };

    const e = new GraphQLError('msg', { nodes: fieldNodeNoLocation });
    expect(e).toMatchObject({
      nodes: [fieldNodeNoLocation],
      source: undefined,
      positions: undefined,
      locations: undefined,
    });
  });

  it('converts source and positions to locations', () => {
    const e = new GraphQLError('msg', { source, positions: [6] });
    expect(e).toMatchObject({
      source,
      nodes: undefined,
      positions: [6],
      locations: [{ line: 2, column: 5 }],
    });
  });

  it('defaults to original error extension only if extensions argument is not passed', () => {
    class ErrorWithExtensions extends Error {
      extensions: unknown;

      constructor(message: string) {
        super(message);
        this.extensions = { original: 'extensions' };
      }
    }

    const original = new ErrorWithExtensions('original');
    const inheritedExtensions = new GraphQLError('InheritedExtensions', {
      originalError: original,
    });

    expect(inheritedExtensions).toMatchObject({
      message: 'InheritedExtensions',
      originalError: original,
      extensions: { original: 'extensions' },
    });

    const ownExtensions = new GraphQLError('OwnExtensions', {
      originalError: original,
      extensions: { own: 'extensions' },
    });

    expect(ownExtensions).toMatchObject({
      message: 'OwnExtensions',
      originalError: original,
      extensions: { own: 'extensions' },
    });

    const ownEmptyExtensions = new GraphQLError('OwnEmptyExtensions', {
      originalError: original,
      extensions: {},
    });

    expect(ownEmptyExtensions).toMatchObject({
      message: 'OwnEmptyExtensions',
      originalError: original,
      extensions: {},
    });
  });

  it('serializes to include all standard fields', () => {
    const eShort = new GraphQLError('msg');
    expect(JSON.stringify(eShort, null, 2)).toEqual(dedent`
      {
        "message": "msg"
      }
    `);

    const path = ['path', 2, 'field'];
    const extensions = { foo: 'bar' };
    const eFull = new GraphQLError('msg', {
      nodes: fieldNode,
      path,
      extensions,
    });

    // We should try to keep order of fields stable
    // Changing it wouldn't be breaking change but will fail some tests in other libraries.
    expect(JSON.stringify(eFull, null, 2)).toEqual(dedent`
      {
        "message": "msg",
        "locations": [
          {
            "line": 2,
            "column": 3
          }
        ],
        "path": [
          "path",
          2,
          "field"
        ],
        "extensions": {
          "foo": "bar"
        }
      }
    `);
  });
});

describe('toString', () => {
  it('prints an error without location', () => {
    const error = new GraphQLError('Error without location');
    expect(error.toString()).toEqual('Error without location');
  });

  it('prints an error using node without location', () => {
    const error = new GraphQLError('Error attached to node without location', {
      nodes: parse('{ foo }', { noLocation: true }),
    });
    expect(error.toString()).toEqual('Error attached to node without location');
  });

  it('prints an error with nodes from different sources', () => {
    const docA = parse(
      new Source(
        dedent`
          type Foo {
            field: String
          }
        `,
        'SourceA'
      )
    );
    const opA = docA.definitions[0];
    expect(opA.kind === Kind.OBJECT_TYPE_DEFINITION && opA.fields != null).toBeTruthy();
    // @ts-expect-error
    const fieldA = opA.fields[0];

    const docB = parse(
      new Source(
        dedent`
          type Foo {
            field: Int
          }
        `,
        'SourceB'
      )
    );
    const opB = docB.definitions[0];
    expect(opB.kind === Kind.OBJECT_TYPE_DEFINITION && opB.fields != null).toBeTruthy();
    // @ts-expect-error
    const fieldB = opB.fields[0];

    const error = new GraphQLError('Example error with two nodes', {
      nodes: [fieldA.type, fieldB.type],
    });

    expect(error.toString()).toEqual(dedent`
      Example error with two nodes

      SourceA:2:10
      1 | type Foo {
      2 |   field: String
        |          ^
      3 | }

      SourceB:2:10
      1 | type Foo {
      2 |   field: Int
        |          ^
      3 | }
    `);
  });
});

describe('toJSON', () => {
  it('Deprecated: format an error using formatError', () => {
    const error = new GraphQLError('Example Error');
    expect(formatError(error)).toMatchObject({
      message: 'Example Error',
    });
  });

  it('includes path', () => {
    const error = new GraphQLError('msg', { path: ['path', 3, 'to', 'field'] });

    expect(error.toJSON()).toMatchObject({
      message: 'msg',
      path: ['path', 3, 'to', 'field'],
    });
  });

  it('includes extension fields', () => {
    const error = new GraphQLError('msg', {
      extensions: { foo: 'bar' },
    });

    expect(error.toJSON()).toMatchObject({
      message: 'msg',
      extensions: { foo: 'bar' },
    });
  });

  it('can be created with the legacy argument list', () => {
    const error = new GraphQLError('msg', [operationNode], source, [6], ['path', 2, 'a'], new Error('I like turtles'), {
      hee: 'I like turtles',
    });

    expect(error.toJSON()).toMatchObject({
      message: 'msg',
      locations: [{ column: 5, line: 2 }],
      path: ['path', 2, 'a'],
      extensions: { hee: 'I like turtles' },
    });
  });
});
