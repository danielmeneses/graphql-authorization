# graphql-authorization

[![npm version](https://img.shields.io/npm/v/graphql-authorization.svg)](https://npm.im/graphql-authorization) ![Licence](https://img.shields.io/npm/l/graphql-authorization.svg) [![Github issues](https://img.shields.io/github/issues/danielmeneses/graphql-authorization.svg)](https://github.com/danielmeneses/graphql-authorization/issues) [![Github stars](https://img.shields.io/github/stars/danielmeneses/graphql-authorization.svg)](https://github.com/danielmeneses/graphql-authorization/stargazers)

Graphql authorization system that allows you to describe the rules on a graphql query.

## What's the goal?

Create a solid authorization system for Graphql, capable of handling complex authorization logic. Due to the nature of Graphql is very hard to come up with an approach that handles authorization smoothly. Normally all authorization validation is implemented per resolver, but that might get very hard to maintain and definitely complex to implement.

So in this project I take a very different approach to the authorization/permissions topic in the Graphql ecosystem.

### Install

```bash
npm i graphql-authorization --save-prod
```

### Example - validation in a resolver

Quick usage example in a resolver. Just pass the `info` arg to `Authorization.validate` function.
[Complete example](https://github.com/danielmeneses/graphql-authorization/blob/master/src/examples/index.js)

```js
import { Authorization } from 'graphql-authorization';

// Authorization rules
const rules = `
  #{"DROP": ["*"], "ACCEPT": ["admin"]}
  query {
    #{"ACCEPT": ["customer"]}
    books (
      #{"DROP": ["customer"]}
      id: null
      title: null
    ){
      #{"DROP": ["customer"]}
      id
      releaseDate
      title
      volume
    }
  }
`;

const auth = new Authorization(rules);
// set debug mode - should be on for DEV only
auth.debugMode = true;
// set default policy
auth.setPolicy(Authorization.policy.DROP);

const resolvers = {
  Query: {
    books(_, args, context, info) {
      auth.setPolicy(Authorization.policy.DROP);
      const results = auth.validate(info, {
        userClaims: {
          roles: ['customer']
        }
      });
      if (!results.isAllowed) return new Error(results.message);

      return myImportantData;
    }
  }
};

// ........
```

### Example: Rules / Roles / Resources definitions

```js
import { Authorization } from 'graphql-authorization';

const rules = `
  #{"DROP": ["*"], "ACCEPT": ["admin"]}
  query {
    #{"ACCEPT": ["customer"]}
    books (
      #{"DROP": ["customer"]}
      id: null
      title: null
    ){
      #{"DROP": ["customer"]}
      id
      releaseDate
      title
      volume
    }
  }
`;

const auth = new Authorization(rules);
// set debug mode - should be on for DEV only
auth.debugMode = true;
// set default policy
auth.setPolicy(Authorization.policy.DROP);

// Example of an incomming query to authorize
const incommingQuery = `
  query {
    books(id: 123){
      id
      releaseDate
      title
      volume
    }
  }
`;

// validate incomming query
const results = auth.validate(incommingQuery, {
  userClaims: { // userClaims (required)
    roles: ['customer'] // user roles (required)
  }
});

/* Output:
{
  isAllowed: false,
  message: 'User with roles [customer] is not authorized to access resources: query.$out.books.$in.id; query.$out.books.$out.id.'
}
*/
```

So in the example above the query is not authorize because the role `customer` is not authorized to access 2 of the fields.

####  Example breakdown

In the example the rules are set by adding comments to an ***example query***. Defining rules in an example query might seem weird, but it's also very powerful. This way you know exactly where to look for and you can easily identify the actions, resources, rules, and roles of your authorization system. Basically, you describe how the authorization should work instead of decoupling every existing instance in an authorization system.

First of all, the values provided to any field in the rules don't really matter, but we've to set some value so that it is a valid graphql query. In the example I've set `id` and `title` as `null` but it could be a string or a number. The first rule I've set is `{"DROP": ["*"], "ACCEPT": ["admin"]}`. This means that all child nodes will inherit this rules until some other rule overwrites them. To be clear `"DROP": ["*"]` drops access to any field and to all users. `"ACCEPT": ["admin"]` allows the role `admin` to access any field inside the `query` node. The second rule is in the example is `{"ACCEPT": ["customer"]}` and it's applicable to `books` node, so all child nodes will be affected and inherit these rules, meaning that the role `customer`, at this point, has access to all fields inside `books` node. The last 2 remaining rules are `{"DROP": ["customer"]}` and basically they will ensure that the role `customer` won't be able to access both fields `id` (input and output). As you might already guess, ultimately, all permissions validations will only be performed on the leaf level.


**Notes:** It's important to note that all rules must be placed immediately before (previous line) the node/field we intend to target, this is mandatory. Also, **all rules must be valid JSON** otherwise it will result in a parse error.
Last note, **the rules query must be a valid Graphql query** because the library will parse it into an AST and used by the lib from there to produce a rules tree. The rules tree is what this lib uses to validate permissions based on the set rules.

### $dropIf function

This lib also provides a function called `$dropIf`, the name is very self-explanatory, the intention when using this function is to drop access, to the specified roles, if some condition is met. So it you can enforce the user to pass specific values in order to obtain a certain resource and this can certainly help when you need to filter the content that a user is allowed to retrieve. In the following example We only allow the user to access the `books` resource if he is the author.

```js
const dropIf = JSON.stringify({
  $dropIf: [
    {
      roles: ["customer"],
      $neq: {"$out.author.$in.id": "userClaims.uid"}
    }
  ]
});
const rules = `
  #{"DROP": ["*"], "ACCEPT": ["customer"]}
  query {
    #${dropIf}
    books {
      id
      releaseDate
      author(id: null){
        name
        age
      }
    }
  }
`;

const auth = new Authorization(rules);
auth.debugMode = true;
auth.setPolicy(Authorization.policy.DROP);

// Example of an incomming query to authorize
const incommingQuery = `
  query {
    books{
      id
      releaseDate
      author(id: 123) {
        name
        age
      }
    }
  }
`;

// validate incomming query
const results = auth.validate(incommingQuery, {
  userClaims: { // userClaims (required)
    roles: ['customer'] // user roles (required)
    uid: 1234
  }
});
/* Output:
{
  isAllowed: false,
  message: 'Input type query.$out.books.$out.author.$in.id value doesn\'t match expected value 1234'
}
*/
```

The `$dropIf` function performs a previous validation over a node, i.e., let's say that, the incoming value for field `author.id` is different than the expected value, in this case, the user `customer` will not have permission.

For the given example the `$dropIf` function validation is only applicable to the role `customer` and it's to evaluate the expression `$neq: {"$out.author.$in.id": "userClaims.uid"}`. `$neq` is an operation and it stands for `not equal`, so if the field value with the relative path (relative to `books`, where the rule is set) `$out.author.$in.id` doesn't match `userClaims.uid`, the authorization will be dropped. As you might already guess `userClaims.uid` is the path to the value of the prop `uid`. In the example the value is `1234`.


### User custom function

You can define your own function to perform validations, use `Authorization.setCustomValidation` function to achieve that. Keep in mind that this function will be invoked per each node in the rules tree, so for performance reasons make sure you're targeting only the path(s) you want to target.

```js
...

const auth = new Authorization(rules);
auth.setCustomValidation((path, policies, userParams, value) => {

  // Drop access if user is pasing an array of ids
  if (path === 'query.$out.books.$in.filter.$in.id.0')
    return [`USER FUNCTION: User can't access ${path}`];
});
```

When the function is executed 4 arguments are passed to it, `path`, `policies`, `userParams` and `value`.

***Notes:*** The `value` argument only has a value if the element is a leaf otherwise it will be `null`.
The function must return an array of strings (error messages) if you wish to flag errors otherwise you should not return any value.


### Authorization object specifications

* `new Authorization(rulesString)`
String with all the rules. The constructor will call `Authorization.setRules` that parses the string into AST and the rules tree is generated. `new Authorization` **should be executed only once at server start and the resulting object used across requests**.

* Function `Authorization.setPolicy(Authorization.policy.DROP|Authorization.policy.ACCEPT)`
The `setPolicy` function sets the default policy for the fields that are not described in the rules query. So if this policy is set to `DROP` any field not described in the rules query will be denied access. It will be accepted in case `ACCEPT` policy is selected.

* Function `Authorization.validate(queryASTorString, userParams)`
`queryASTorString` Can be either a string or the query AST so you can pass it the `info` param from the resolver. It's definitely better to pass the AST for performance reasons, in case you pass it a string validate method will first parse it into an AST and then proceed to the validation. `userParams` most at least define a `role` for the logged user, example of the minimal requirements: `const userParams = { userClaims: { roles: ["customer"] } }`

* Property `Authorization.debugMode` If set to `true` will show all the fields that the roles don't have access to, if is set to `false` the message displayed is `Not authorized!`

### Implemented rules

* `{"DROP": ["role1", "role2", ...]}` Drop access to a resource and all child nodes for all listed roles.

* `{"ACCEPT": ["role1", "role2", ...]}` Grant access to a resource and all child nodes for all listed roles..

* Drop permissions to all listed roles if a certain condition is met. If one of the user's roles is not listed, then this rule doesn't apply.
```js
{
  "$dropIf": [
    {
      "roles": ["role1", "role2", ...],
      "$operation": {"relative_path_to_the_value": "userClaims.uid"}
    }
  ]
}
```
The path to the value to be matched must be relative to the node where the rule is attached and it follows the pattern `$out.outputFieldName.$in.inputFieldName...`. `$out` means that the next field is output type and `$in` means that the next field is input type. The path definition has to be this way because it's possible to have a field with the same name for `input` and `output`.

The $peration can be either `$eq` (equal to), `$neq` (not equal to), `$gt` (greater than), `$gte` (greater than or equal to), `$lt` (less than) and `$lte` (less than or equal to).

***Note:*** The value to match must either a `string`, `number` or `boolean`, objects/arrays will not be matched.



### Next steps

* Build a middleware. I've found one that works ok ([graphql-middleware](https://github.com/graphcool/graphql-middleware)), but remember the middleware cannot be applied to all resolvers, that said apply it only to top level resolvers otherwise you end up validating the same conditions multiple times.

* Support custom user functions. ✔️

* More real world examples and implementations


## Contributions

Contributions are very welcome. There's a lot of room for improvements and new features so feel free to fork the repo and get into it. Also, let me know of any bugs you come across, any help on bug fixing is also a plus!
