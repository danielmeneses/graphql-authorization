import { parse, Source } from 'graphql';
import { parseRulesOrQuery } from './parser';
import { validatePolicies, DEFAULT_POLICIES } from './policies-manager';

function NotValidStringException(msg) {
  this.name = 'NotValidStringException';
  this.message = msg;
}

export function InvalidAuthValidationParams(msg) {
  this.name = 'InvalidAuthValidationParams';
  this.message = msg;
}

export class Authorization {
  constructor(rulesAsGraphqlQuery) {
    this.rawRulesQuery = null;
    this.parsedRulesQuery = null;
    this.policies = DEFAULT_POLICIES;
    this.defaultPolicy = 'DROP';
    this.debugMode = false;
    this.userFunction = null;
    this.setRules(rulesAsGraphqlQuery);
  }

  /**
   * Set default policy. All fields not described in the rules
   * will be accepted or dropped based on this policy
   * @param {object} policy policies: defaults to "DROP"
   */
  setPolicy(policy) {
    if (typeof policy !== 'string')
      throw new InvalidAuthValidationParams(
        `Invalid policy provided. You should either pass "DROP" or "ACCEPT"`
      );

    this.defaultPolicy = policy;
    this.policies = { [policy]: ['*'] };
  }

  setCustomValidation(func) {
    if (typeof func === 'function') this.userFunction = func;
  }

  /**
   * Set rules
   * @param {string} rulesAsGraphqlQuery graphql language string with authorization rules
   */
  setRules(rulesAsGraphqlQuery) {
    if (!rulesAsGraphqlQuery) return;
    if (typeof rulesAsGraphqlQuery !== 'string')
      throw new NotValidStringException(
        'No valid string provided as graphql query rules!'
      );

    this.rawRulesQuery = rulesAsGraphqlQuery;
    this.parsedRulesQuery = parse(new Source(rulesAsGraphqlQuery));

    // parse authorization rules - set in memory
    // console.time('parse');
    this.rules = parseRulesOrQuery({
      AST: this.parsedRulesQuery,
      parseConfigs: true,
      policies: this.policies
    });
    // console.timeEnd('parse');
  }

  /**
   * Validate an incoming query/mutation based on the setted rules.
   * @param {any} gplStrOrAST string query or graphql AST
   * @param {object} params required props are { userClaims: { roles: [] } }
   * @returns object { isAllowed: {true|false}, message: '' }
   */
  validate(gplStrOrAST, params) {
    if (
      !gplStrOrAST ||
      !params ||
      !params.userClaims ||
      !params.userClaims.roles
    )
      throw new InvalidAuthValidationParams(
        `Invalid arguments passed to validate function.`
      );

    let ASTquery = gplStrOrAST;
    if (typeof gplStrOrAST === 'string')
      ASTquery = parse(new Source(gplStrOrAST));
    // console.time('validate');
    const variables =
      typeof gplStrOrAST === 'object' ? gplStrOrAST.variableValues : {};
    const errors = validatePolicies(
      this.rules,
      ASTquery,
      params,
      this.parsedRulesQuery,
      this.defaultPolicy,
      variables,
      this.userFunction
    );
    // console.timeEnd('validate');
    if (this.debugMode === false && !errors.isAllowed)
      errors.message = 'Not authorized!';
    return errors;
  }
}

Authorization.policy = {
  DROP: 'DROP',
  ACCEPT: 'ACCEPT'
};
