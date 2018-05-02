const { parseRulesOrQuery, INPUT_VAL_KEY } = require('../lib/main/parser');
const { parse, Source } = require('graphql');

/* global test expect */
test('Parse query - validate rules tree', () => {
  //prepare test
  const query = `
    query {
      books(
        id: 1
        author: "Daniel"
        data1: [0]
        data2: [{id: 2}]
      ) {
        id
        author(input: {
          id: 123
        })
      }
    }
  `;
  const AST = parse(new Source(query));
  const parsedRules = parseRulesOrQuery({ AST });

  // test values
  expect(parsedRules).not.toBe(null);
  expect(parsedRules).not.toBe(undefined);
  expect(parsedRules).toBeInstanceOf(Object);

  // validate tree values
  const _in = parsedRules.query.$out.books.$in;
  expect(_in.id[INPUT_VAL_KEY]).toEqual(1);
  expect(_in.author[INPUT_VAL_KEY]).toEqual('Daniel');
  expect(_in.data1['0'].$in[INPUT_VAL_KEY]).toEqual(0);
  expect(_in.data2['0'].$in.id[INPUT_VAL_KEY]).toEqual(2);

  const _out = parsedRules.query.$out.books.$out;
  expect(_out.author.$in.input.$in.id[INPUT_VAL_KEY]).toEqual(123);
  expect(_out.id).toBeInstanceOf(Object);
});
