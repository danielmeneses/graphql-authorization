import express from 'express';
import { graphqlExpress, graphiqlExpress } from 'apollo-server-express';
import { makeExecutableSchema } from 'graphql-tools';
import bodyParser from 'body-parser';
import rules from './rules.gql';
import { Authorization } from '../index';

const typeDefs = `
    enum FieldName {
      name
      date
    }
    input Filter {
        id: [ID]
        author: ID
        enum: [FieldName]
    }
    type Author {
        name: String!
        age: Int!
    }
    type Book {
        id: ID!
        releaseDate: String
        author(id: [Int]): Author
    }
    type Query {
        books(filter: Filter): [Book]
    }
`;

const auth = new Authorization(rules);
auth.setCustomValidation((path, policies, userParams, value) => {
  // if (path.match(/query\.\$out\.books\.\$in\.filter\.\$in\.id.\d+/))
  //   return [`USER FUNCTION: User can't access ${path}`];
  console.log(value, path, policies);
});
auth.debugMode = true;

const resolvers = {
  Query: {
    books(_, args, context, info) {
      auth.setPolicy(Authorization.policy.DROP);
      const results = auth.validate(info, {
        userClaims: {
          roles: ['customer'],
          uid: 1234
        }
      });
      if (!results.isAllowed) return new Error(results.message);

      return [
        {
          id: 1,
          releaseDate: 'date',
          author: {
            name: 'daniel',
            age: 35
          }
        }
      ];
    }
  }
};

const schema = makeExecutableSchema({ typeDefs, resolvers });

const server = express();
server.listen(3000, '0.0.0.0', () => {
  console.log('Server running on port 3000');
});

server.use(
  '/graphql',
  bodyParser.json(),
  graphqlExpress({
    schema
  })
);
server.get('/graphiql', graphiqlExpress({ endpointURL: '/graphql' }));
