import objectPath from 'object-path';
import { INPUT_VAL_KEY } from './parser';
import {
  parseRulesOrQuery,
  AST_PATH_KEY,
  FIELD_KEY,
  INPUT_KEY,
  PARAMS_KEY,
  POLICIES_KEY,
  ACTION_KEY
} from './parser';

const { get: _get } = objectPath;

export const POLICY_ALL = '*';
export const POLICY_OWN = 'OWN';
export const DEFAULT_POLICIES = { DROP: [POLICY_ALL] };

const hasPolicy = (name, value, policies) => {
  let val = value;
  if (typeof value === 'string') val = { roles: val };
  let has =
    policies &&
    policies.hasOwnProperty(name) &&
    policies[name].indexOf(val.roles) > -1;
  return has;
};

const executeFunctions = (
  params,
  path,
  userParams,
  queryTree
  // ownValidationFn
) => {
  const errors = [];
  let { userClaims } = userParams;
  const userRoles =
    typeof userClaims.roles === 'string'
      ? [userClaims.roles]
      : userClaims.roles;

  // const supportedFunctions = ['$dropIf'];

  // capture functions
  const fnNames = Object.keys(params);
  for (let i = 0; i < fnNames.length; i++) {
    // functions
    const fnName = fnNames[i];
    for (let ii = 0; ii < params[fnName].length; ii++) {
      // validate if applies to current user
      const roles =
        typeof params[fnName][ii].roles === 'string'
          ? [params[fnName][ii].roles]
          : params[fnName][ii].roles;

      const notAppliedRoles = userRoles.filter(role => {
        for (let i = 0; i < roles.length; i++)
          if (roles[i] === role) return false;

        return true;
      });
      if (notAppliedRoles.length > 0) continue;

      // per function check sub-function
      const keys = Object.keys(params[fnName][ii]);
      for (let iii = 0; iii < keys.length; iii++) {
        const key = keys[iii];

        // get relative path
        if (key === 'roles') continue;
        const paths = Object.keys(params[fnName][ii][key]);
        for (let iiii = 0; iiii < paths.length; iiii++) {
          const relativePath = paths[iiii];
          const valueToMatch = params[fnName][ii][key][relativePath];
          const treePath = path + '.' + relativePath;
          const astValue = _get(
            queryTree,
            treePath + '.' + INPUT_VAL_KEY,
            null
          );
          let operationResult = null;
          let _valToMatch = _get(userParams, valueToMatch, null);
          switch (key) {
            case '$eq':
              operationResult = _valToMatch === astValue;
              if (operationResult === true && fnName === '$dropIf')
                errors.push(
                  `Input type "${treePath}" value can't match value "${_valToMatch}"`
                );
              break;
            case '$neq':
              operationResult = _valToMatch !== astValue;
              if (operationResult === true && fnName === '$dropIf')
                errors.push(
                  `Input type ${treePath} value doesn't match expected value ${_valToMatch}`
                );
              break;
            case '$gt':
              operationResult = astValue > _valToMatch;
              if (operationResult === true && fnName === '$dropIf')
                errors.push(
                  `Input type ${treePath} value can't be > ${_valToMatch}`
                );
              break;
            case '$gte':
              operationResult = astValue >= _valToMatch;
              if (operationResult === true && fnName === '$dropIf')
                errors.push(
                  `Input type "${treePath}" value can't be >= "${_valToMatch}"`
                );
              break;
            case '$lt':
              operationResult = astValue < _valToMatch;
              if (operationResult === true && fnName === '$dropIf')
                errors.push(
                  `Input type "${treePath}" value can't be < "${_valToMatch}"`
                );
              break;
            case '$lte':
              operationResult = astValue <= _valToMatch;
              if (operationResult === true && fnName === '$dropIf')
                errors.push(
                  `Input type "${treePath}" value can't be <= "${_valToMatch}"`
                );
              break;
            default:
          }
        }
      }
    }
  }
  return errors;
};

export const canAccessResource = (nodePolicies, params) => {
  const { userClaims } = params;
  const roles =
    typeof userClaims.roles === 'string'
      ? [userClaims.roles]
      : userClaims.roles;

  const dropAll = hasPolicy('DROP', POLICY_ALL, nodePolicies);
  const acceptAll = hasPolicy('ACCEPT', POLICY_ALL, nodePolicies);

  // DROPs - check drops first
  // if it isn't to drop ALL, verify if there's a drop for specific all roles
  // the user has
  if (!dropAll) {
    for (let i = 0; i < roles.length; i++)
      if (!hasPolicy('DROP', roles[i], nodePolicies, params)) return true;
    return false;
  }
  // ACCEPTs
  if (acceptAll) return true;
  else
    for (let i = 0; i < roles.length; i++)
      if (hasPolicy('ACCEPT', roles[i], nodePolicies, params)) return true;

  return false;
};

const parsePolicies = (newPolicies, finalPolicies, type) => {
  if (newPolicies && newPolicies[type])
    for (let i = 0; i < newPolicies[type].length; i++) {
      const pol = newPolicies[type][i];
      if (
        !hasPolicy(type, pol, finalPolicies) &&
        !hasPolicy(type, POLICY_ALL, finalPolicies)
      )
        finalPolicies[type].push(pol);

      const reversePolicy = type === 'DROP' ? 'ACCEPT' : 'DROP';
      if (hasPolicy(reversePolicy, pol, finalPolicies)) {
        // has reversePolicy policy - remove ACCEPT policies with the same name
        const polIndex = finalPolicies[reversePolicy].indexOf(pol);
        if (polIndex > -1) finalPolicies[reversePolicy].splice(polIndex, 1);
      }
    }
};

export const mergePolicies = (currentPolicies, newPolicies) => {
  if (!currentPolicies && newPolicies)
    return {
      DROP: newPolicies.DROP ? [...newPolicies.DROP] : [],
      ACCEPT: newPolicies.ACCEPT ? [...newPolicies.ACCEPT] : []
    };

  const finalPolicies = {
    DROP: currentPolicies.DROP ? [...currentPolicies.DROP] : [],
    ACCEPT: currentPolicies.ACCEPT ? [...currentPolicies.ACCEPT] : []
  };

  // all in a policy so just leave that one policy
  if (newPolicies.DROP && newPolicies.DROP.indexOf(POLICY_ALL) > -1) {
    finalPolicies.DROP = [POLICY_ALL];
    finalPolicies.ACCEPT = [];
  }
  parsePolicies(newPolicies, finalPolicies, 'DROP');

  if (newPolicies.ACCEPT && newPolicies.ACCEPT.indexOf(POLICY_ALL) > -1) {
    finalPolicies.ACCEPT = [POLICY_ALL];
    finalPolicies.DROP = [];
  }
  parsePolicies(newPolicies, finalPolicies, 'ACCEPT');

  return finalPolicies;
};

export const validatePolicies = (
  rules,
  ASTquery,
  params,
  ASTRules,
  defaultPolicy,
  variables = {}
) => {
  const errors = [];
  const fnErrors = [];
  if (!rules) return true;

  const { userClaims } = params;

  const parsed = parseRulesOrQuery({
    AST: ASTquery,
    parseConfigs: false,
    policies: null,
    variables
  });
  const recurse = (obj, path, fakePath) => {
    if (!obj) return;

    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      let pathPrefix = `${path ? path + '.' : ''}`;
      let _fakePath = `${fakePath ? fakePath + '.' : ''}`;
      let policies = null;
      let functions = null;
      let canAccess = null;
      let functionsResults = null;
      let hasPolicies = false;
      // let fakePath = null;
      switch (key) {
        case AST_PATH_KEY:
        case INPUT_VAL_KEY:
        case ACTION_KEY:
          break;
        case INPUT_KEY:
        case FIELD_KEY:
          // validate in path
          recurse(obj[key], `${pathPrefix}${key}`, `${_fakePath}${key}`);
          break;
        default:
          _fakePath = `${_fakePath}${
            obj[key][ACTION_KEY] ? obj[key][ACTION_KEY] : key
          }`.replace(/\.\d+\./, '.');
          functions = _get(rules, `${_fakePath}.${PARAMS_KEY}`, null);

          // validate access only over leafs
          if (!obj[key][INPUT_KEY] && !obj[key][FIELD_KEY]) {
            policies = _get(rules, `${_fakePath}.${POLICIES_KEY}`, null);
            hasPolicies = policies !== null;
            if (!hasPolicies) {
              // doesn't have policies, so the field is not described in rules
              if (defaultPolicy === 'DROP') errors.push(`${pathPrefix}${key}`);
              break;
            }
            canAccess = policies !== null;
            if (canAccess) canAccess = canAccessResource(policies, params);
            if (!canAccess) errors.push(`${pathPrefix}${key}`);
          }
          if (functions && Object.keys(functions).length) {
            functionsResults = executeFunctions(
              functions,
              `${pathPrefix}${key}`,
              params,
              parsed
            );
            if (functionsResults.length) fnErrors.push(...functionsResults);
          }

          recurse(obj[key], `${pathPrefix}${key}`, `${_fakePath}`);
      }
    }
  };
  recurse(parsed, '', '');
  let message = '';
  if (errors.length)
    message = `User with roles [${
      userClaims.roles
    }] are not authorized to access resources: ${errors.join('; ')}.`;

  if (fnErrors.length) message += ' ' + fnErrors.join('; ');
  return {
    isAllowed: errors.length || fnErrors.length ? false : true,
    message
  };
};
