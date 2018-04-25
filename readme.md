# graphql-authorization

[![npm version](https://img.shields.io/npm/v/graphql-authorization.svg)](https://npm.im/graphql-authorization) ![Licence](https://img.shields.io/npm/l/graphql-authorization.svg) [![Github issues](https://img.shields.io/github/issues/danielmeneses/graphql-authorization.svg)](https://github.com/danielmeneses/graphql-authorization/issues) [![Github stars](https://img.shields.io/github/stars/danielmeneses/graphql-authorization.svg)](https://github.com/danielmeneses/graphql-authorization/stargazers)

Graphql authorization system that allows you to describe the rules on a graphql query.

## What's the goal?

Create a solid authorization system for Graphql, capable of handling complex authorization logic. Due to the nature of Graphql is very hard to come up with an approach that handles authorization smoothly. Normally all authorization validation is implemented per resolver, but that might get very hard to maintain and definitely complex to implement.

So in this project, I take a very different approach to the authorization topic in the Graphql ecosystem. It's, in fact, a crazy/weird solution that I present here, but more on that in the next sections.
This might not be suitable to all use-cases, but give it a try and then take your own conclusions.

### Install

```bash
npm i graphql-authorization --save-prod
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
  message: 'User with roles [customer] are not authorized to access resources: query.$out.books.$in.id; query.$out.books.$out.id.'
}
*/
```

So in the example above the query is not authorize because the role `customer` is not authorized to access 2 of the fields.

####  Example breakdown

In the example the rules are set by adding comments to an ***example query***. Defining rules in an example query might seem weird, but it is indeed very powerful. This way you know exactly where to look for and you can easily identify the actions, resources, rules, and roles of your authorization system. Basically, you describe how the authorization should work instead of decoupling every existing instance in a authorization system.

First of all, the values provided to any field in the rules don't really matter, but we've to set some value so that it is a valid graphql query. In the example I've set `id` and `title` as `null` but it could be a string or a number.
Now, if you followed the example the first rule is `{"DROP": ["*"], "ACCEPT": ["admin"]}`. This means that all child nodes will inherit this rules until some other rule overwrites one of these 2. To be clear `"DROP": ["*"]` drops access to any field to all users and `"ACCEPT": ["admin"]` will allow role `admin` to access any field inside `query` node. The second rule is `{"ACCEPT": ["customer"]}` and it applies to `books` node, so all child nodes will be affected and have this rule as well, so role `customer`, at this point, has access to all props inside `books`. The last 2 remaining rules `{"DROP": ["customer"]}` basically drop the access to both fields `id`, input and output. As you might already guess, ultimately, the validation is only performed on the leaf level.


**Notes:** It's important to note that all rules must be right before (previous line) the node we intend to affect, this is mandatory. Also, **all rules must be valid JSON** otherwise it will result in a parse error.
Last note, **the rules query must be a valid Graphql query** because it will be parsed into an AST and used from the lib from there.

### $dropIf function

This lib also has a function called `$dropIf` and as the name tells it will drop access to the specified roles if some condition is met. This function allows you to enforce the user to pass specific values in order to obtain a certain resource and this can certainly help when you need to filter just the content that user is allowed to get back. So in this example will only allow the user to access the `books` resource if he is the author.

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

The `$dropIf` function allows you to make a previous validation over a node, i.e., let's say, for or example that the incoming value for field `author.id` is different than an expected value, in this case, the access will be dropped.

For the given example the `$dropIf` validation only applies to role `customer` and the verification `$neq: {"$out.author.$in.id": "userClaims.uid"}`. `$neq` is an operation and it means `not equal`, so if the field value with the relative path (relative to `books`, where the rule is set) `$out.author.$in.id` doesn't match `userClaims.uid`, the authorization will be dropped. As you might already guest `userClaims.uid` is a path to the value of the prop `uid`, in the example the value is `1234`. This way you can interact with your rules from outside since `userParams` can have different values on each `Authorization.validate` call.

### User custom function

You can define your own function to perform validations per node. Use `Authorization.setCustomValidation` to achieve that.

```js
...

const auth = new Authorization(rules);
auth.setCustomValidation((path, policies, userParams, value) => {

  // Drop access based on a specific field access
  if (path.match(/query\.\$out\.books\.\$in\.filter\.\$in\.id.\d+/))
    return [`USER FUNCTION: User can't access ${path}`];
});
```

When the function is executed 4 arguments are passed to it, `path`, `policies`, `userParams`, `value`. `policies` will be `null` if the element is an array position.  `value` only has value if the element is a leaf otherwise `null`is passed.

The function must return an array of strings (error messages).


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
