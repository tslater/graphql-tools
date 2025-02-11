import { memoize1 } from '../jsutils/memoize1.js';
import { OperationTypeNode } from '../language/index.js';
import { GraphQLSchema, GraphQLObjectType } from '../type/index.js';

export const getRootTypeMap = memoize1(function getRootTypeMap(
  schema: GraphQLSchema
): Map<OperationTypeNode, GraphQLObjectType> {
  const rootTypeMap: Map<OperationTypeNode, GraphQLObjectType> = new Map();

  const queryType = schema.getQueryType();
  if (queryType) {
    rootTypeMap.set('query' as OperationTypeNode, queryType);
  }

  const mutationType = schema.getMutationType();
  if (mutationType) {
    rootTypeMap.set('mutation' as OperationTypeNode, mutationType);
  }

  const subscriptionType = schema.getSubscriptionType();
  if (subscriptionType) {
    rootTypeMap.set('subscription' as OperationTypeNode, subscriptionType);
  }

  return rootTypeMap;
});
